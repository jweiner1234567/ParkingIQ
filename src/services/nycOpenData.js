import axios from 'axios';
import { generateMockMeters } from '../utils/helpers';

const socrata = axios.create({
  baseURL: 'https://data.cityofnewyork.us/resource',
  timeout: 12000,
});

const boundingBox = (lat, lon, radiusM) => {
  const d = 1 / 111000;
  const latD = radiusM * d;
  const lonD = radiusM * d / Math.cos(lat * Math.PI / 180);
  return { latMin: lat - latD, latMax: lat + latD, lonMin: lon - lonD, lonMax: lon + lonD };
};

export const fetchParkingMeters = async (lat, lon, radiusM = 500) => {
  const { latMin, latMax, lonMin, lonMax } = boundingBox(lat, lon, radiusM);
  // Try numeric comparison first, then string-quoted (dataset-dependent)
  const queries = [
    `latitude between ${latMin} and ${latMax} AND longitude between ${lonMin} and ${lonMax}`,
    `latitude between '${latMin}' and '${latMax}' AND longitude between '${lonMin}' and '${lonMax}'`,
  ];
  for (const $where of queries) {
    try {
      const { data } = await socrata.get('/mvib-nh9w.json', {
        params: { $limit: 200, $where },
      });
      if (data.length > 0) {
        console.log(`NYC API: ${data.length} meters from real data`);
        return data;
      }
    } catch (e) {
      console.warn('NYC API attempt failed:', e.message);
    }
  }
  console.warn('NYC API returned no data — using mock');
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

export const fetchViolationHotspots = async (lat, lon) => {
  try {
    const { latMin, latMax } = boundingBox(lat, lon, 500);
    const { data } = await socrata.get('/pvqr-7yc4.json', {
      params: {
        $select: 'violation_code,violation_description',
        $where: `violation_location_latitude between '${latMin}' and '${latMax}'`,
        $limit: 100, $order: 'issue_date DESC',
      },
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
