import axios from 'axios';

// Fetched from GitHub at app startup so Colab URL changes are picked up on refresh
const REMOTE_CONFIG =
  'https://raw.githubusercontent.com/jweiner1234567/ParkingIQ/main/src/config/backendUrl.js';

let _backendUrl = 'http://localhost:8000';

export const initBackendUrl = async () => {
  try {
    const res = await fetch(`${REMOTE_CONFIG}?t=${Date.now()}`);
    const txt = await res.text();
    const m = txt.match(/BACKEND_URL\s*=\s*'([^']+)'/);
    if (m?.[1]) {
      _backendUrl = m[1];
      console.log('[ParkingIQ] Backend URL:', _backendUrl);
    }
  } catch (e) {
    console.warn('[ParkingIQ] Could not fetch backend URL, using fallback:', e.message);
  }
};

const getClient = () => axios.create({ baseURL: _backendUrl, timeout: 15000 });

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
    const { data } = await getClient().post('/predict', {
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
    const { data } = await getClient().get('/meters/nearby', { params: { lat, lon, radius } });
    return data.meters;
  } catch { return null; }
};
