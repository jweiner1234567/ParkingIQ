import axios from 'axios';
import { generateMockMeters } from '../utils/helpers';

const socrata = axios.create({
  baseURL: 'https://data.cityofnewyork.us/resource',
  timeout: 12000,
});

// 693u-uax6 = Parking Meters Locations and Status (36k rows, active lat/long)
const METERS_DS = '693u-uax6.json';

const boundingBox = (lat, lon, radiusM) => {
  const d = 1 / 111000;
  const latD = radiusM * d;
  const lonD = radiusM * d / Math.cos(lat * Math.PI / 180);
  return { latMin: lat - latD, latMax: lat + latD, lonMin: lon - lonD, lonMax: lon + lonD };
};

const normalize = (m) => ({
  meter_id: m.meter_number || m.objectid || String(Math.random()),
  street_address: [m.on_street, m.from_street ? `(${m.from_street}\u2013${m.to_street})` : '']
    .filter(Boolean).join(' '),
  latitude: m.lat,
  longitude: m.long,
  meter_rate: '4.00',
  last_transaction_time: null,
  status_raw: m.status,
  meter_hours: m.meter_hours || '',
  pay_by_cell: m.pay_by_cell_number || '',
  borough: m.borough || '',
  side_of_street: m.side_of_street || '',
});

export const fetchParkingMeters = async (lat, lon, radiusM = 500) => {
  const { latMin, latMax, lonMin, lonMax } = boundingBox(lat, lon, radiusM);
  try {
    const { data } = await socrata.get(`/${METERS_DS}`, {
      params: {
        $limit: 200,
        $where: `lat between ${latMin} and ${latMax} AND long between ${lonMin} and ${lonMax} AND status='Active'`,
      },
    });
    if (data.length > 0) {
      console.log(`[ParkingIQ] Real meters: ${data.length}`);
      return data.map(normalize);
    }
  } catch (e) {
    console.warn('[ParkingIQ] NYC API failed:', e.message);
  }
  console.warn('[ParkingIQ] NYC API no results — using mock');
  return generateMockMeters(lat, lon);
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
    return {
      precipitation: data.hourly.precipitation[hour],
      isRainy: data.hourly.precipitation[hour] > 0.5,
    };
  } catch { return { precipitation: 0, isRainy: false }; }
};
