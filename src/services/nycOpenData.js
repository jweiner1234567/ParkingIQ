import axios from 'axios';
import { generateMockMeters } from '../utils/helpers';

const socrata = axios.create({
  baseURL: 'https://data.cityofnewyork.us/resource',
  timeout: 12000,
});

const METERS_DS     = '693u-uax6.json';   // 36k meters, has lat/long
const BLOCK_FACES_DS = 'e7yp-wx55.json';  // 2.6k block faces, has real rates + hours

const boundingBox = (lat, lon, radiusM) => {
  const d = 1 / 111000;
  const latD = radiusM * d;
  const lonD = radiusM * d / Math.cos(lat * Math.PI / 180);
  return { latMin: lat - latD, latMax: lat + latD, lonMin: lon - lonD, lonMax: lon + lonD };
};

// Parse '$1.50 1st Hour / $2.50 2nd Hour' → '1.50'
const parseRate = (s) => {
  if (!s) return '4.00';
  const m = s.match(/\$(\d+\.?\d*)/);
  return m ? parseFloat(m[1]).toFixed(2) : '4.00';
};

// Parse 'Monday-Saturday 9 AM-5 PM' → is the meter enforced right now?
const isEnforced = (hoursStr) => {
  if (!hoursStr) return true;
  const now = new Date();
  const dow = now.getDay();
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = hoursStr.toLowerCase();

  // Day check
  if ((s.includes('monday-friday') || s.includes('mon-fri')) && (dow === 0 || dow === 6)) return false;
  if ((s.includes('monday-saturday') || s.includes('mon-sat')) && dow === 0) return false;

  // Time check — matches '9 AM-5 PM' or '9AM-5PM'
  const tm = hoursStr.match(/(\d+)\s*(AM|PM)\s*[-\u2013]\s*(\d+)\s*(AM|PM)/i);
  if (tm) {
    let sh = parseInt(tm[1]), eh = parseInt(tm[3]);
    if (tm[2].toUpperCase() === 'PM' && sh !== 12) sh += 12;
    if (tm[2].toUpperCase() === 'AM' && sh === 12) sh = 0;
    if (tm[4].toUpperCase() === 'PM' && eh !== 12) eh += 12;
    if (tm[4].toUpperCase() === 'AM' && eh === 12) eh = 0;
    if (cur < sh * 60 || cur >= eh * 60) return false;
  }
  return true;
};

// Deterministic pseudo-random occupancy seeded by meter id + hour
const occupancy = (meterId) => {
  const h = String(meterId).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const p = (Math.abs(h) * 17 + new Date().getHours() * 13) % 100;
  if (p < 38) return 'available';
  if (p < 68) return 'likely_available';
  return 'occupied';
};

const normalize = (m, blockInfo) => {
  const rate = blockInfo ? parseRate(blockInfo.all_vehi_2) : '4.00';
  const hoursStr = blockInfo ? blockInfo.all_vehi_1 : null;
  let status;
  if (m.status === 'Inactive') {
    status = 'unavailable';
  } else if (!isEnforced(hoursStr)) {
    status = 'available';   // outside enforcement hours = free parking
  } else {
    status = occupancy(m.meter_number || m.objectid);
  }
  return {
    meter_id: m.meter_number || m.objectid || String(Math.random()),
    street_address: [m.on_street, m.from_street ? `(${m.from_street}\u2013${m.to_street})` : '']
      .filter(Boolean).join(' '),
    latitude: m.lat,
    longitude: m.long,
    meter_rate: rate,
    meter_hours: hoursStr || m.meter_hours || '',
    status_raw: m.status,
    status,
    pay_by_cell: m.pay_by_cell_number || '',
    borough: m.borough || '',
    side_of_street: m.side_of_street || '',
    last_transaction_time: null,
  };
};

export const fetchParkingMeters = async (lat, lon, radiusM = 500) => {
  const { latMin, latMax, lonMin, lonMax } = boundingBox(lat, lon, radiusM);

  let meters = [];
  try {
    const { data } = await socrata.get(`/${METERS_DS}`, {
      params: {
        $limit: 200,
        $where: `lat between ${latMin} and ${latMax} AND long between ${lonMin} and ${lonMax} AND status='Active'`,
      },
    });
    meters = data;
    console.log(`[ParkingIQ] Real meters fetched: ${meters.length}`);
  } catch (e) {
    console.warn('[ParkingIQ] Meters fetch failed:', e.message);
  }

  if (meters.length === 0) {
    console.warn('[ParkingIQ] No meters — using mock');
    return generateMockMeters(lat, lon);
  }

  // Fetch block face data to get real rates + enforcement hours
  let blockLookup = {};
  try {
    const cellNums = [...new Set(meters.map(m => m.pay_by_cell_number).filter(Boolean))];
    if (cellNums.length > 0) {
      const inClause = cellNums.map(n => `'${n}'`).join(',');
      const { data: faces } = await socrata.get(`/${BLOCK_FACES_DS}`, {
        params: { $where: `pay_by_cel in(${inClause})`, $limit: 500 },
      });
      faces.forEach(f => { blockLookup[f.pay_by_cel] = f; });
      console.log(`[ParkingIQ] Block faces matched: ${faces.length}`);
    }
  } catch (e) {
    console.warn('[ParkingIQ] Block faces fetch failed:', e.message);
  }

  return meters.map(m => normalize(m, blockLookup[m.pay_by_cell_number] || null));
};

export const fetchStreetCleaning = async (streetName) => {
  try {
    const { data } = await socrata.get('/qnmj-269j.json', {
      params: { $where: `street like '%${streetName.toUpperCase()}%'`, $limit: 10 },
    });
    return data;
  } catch { return []; }
};

export const fetchWeather = async (lat, lon) => {
  try {
    const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat, longitude: lon,
        hourly: 'precipitation,weathercode',
        forecast_days: 1, timezone: 'America/New_York',
      },
    });
    const hour = new Date().getHours();
    return { precipitation: data.hourly.precipitation[hour], isRainy: data.hourly.precipitation[hour] > 0.5 };
  } catch { return { precipitation: 0, isRainy: false }; }
};
