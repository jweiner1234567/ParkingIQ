import axios from 'axios';
import { NYC_DATA } from '../utils/constants';
import { generateMockMeters } from '../utils/helpers';

const socrata = axios.create({ baseURL: 'https://data.cityofnewyork.us/resource', timeout: 10000 });

export const fetchParkingMeters = async (lat, lon, radiusM = 500) => {
  try {
    const { data } = await socrata.get('/mvib-nh9w.json', {
      params: {
        $limit: 200,
        $where: `within_circle(geocoded_column, ${lat}, ${lon}, ${radiusM})`,
      },
    });
    return data.length ? data : generateMockMeters(lat, lon);
  } catch {
    return generateMockMeters(lat, lon);
  }
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
    const delta = 0.005;
    const { data } = await socrata.get('/pvqr-7yc4.json', {
      params: {
        $select: 'violation_code,violation_description,violation_location',
        $where: `violation_location_latitude between '${lat - delta}' and '${lat + delta}'`,
        $limit: 100,
        $order: 'issue_date DESC',
      },
    });
    return data;
  } catch { return []; }
};

export const fetchWeather = async (lat, lon) => {
  try {
    const { data } = await axios.get(NYC_DATA.WEATHER_ENDPOINT, {
      params: {
        latitude: lat, longitude: lon,
        hourly: 'precipitation,weathercode',
        forecast_days: 1,
        timezone: 'America/New_York',
      },
    });
    const hour = new Date().getHours();
    return {
      precipitation: data.hourly.precipitation[hour],
      code: data.hourly.weathercode[hour],
      isRainy: data.hourly.precipitation[hour] > 0.5,
    };
  } catch { return { precipitation: 0, isRainy: false }; }
};
