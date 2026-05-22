import axios from 'axios';
import { BACKEND_URL } from '../config/backendUrl';

const client = axios.create({ baseURL: BACKEND_URL, timeout: 15000 });

const timeFallback = (arrivalISO) => {
  const d = new Date(arrivalISO);
  const h = d.getHours(), dow = d.getDay();
  let p = 0.5;
  if (dow === 0 || dow === 6) p = 0.65;
  else if (h >= 9 && h <= 17) p = 0.25;
  else if (h >= 19 || h <= 7) p = 0.75;
  return { availability_probability: p, confidence: 0.45, prediction_method: 'time_heuristic' };
};

export const predictAvailability = async (lat, lon, arrivalISO, durationMins) => {
  try {
    const { data } = await client.post('/predict', {
      latitude: lat, longitude: lon,
      arrival_time: arrivalISO, duration_minutes: durationMins,
    });
    return data;
  } catch {
    return timeFallback(arrivalISO);
  }
};

export const fetchNearbyMeters = async (lat, lon, radius = 500) => {
  try {
    const { data } = await client.get('/meters/nearby', { params: { lat, lon, radius } });
    return data.meters;
  } catch { return null; }
};
