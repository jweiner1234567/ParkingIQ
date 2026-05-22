export const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const metersToBlocks = m => Math.round(m / 80);
export const formatCurrency = n => `$${n.toFixed(2)}`;

export const getMeterStatus = lastTxTime => {
  if (!lastTxTime) return 'unknown';
  const minsAgo = (Date.now() - new Date(lastTxTime)) / 60000;
  if (minsAgo < 5) return 'occupied';
  if (minsAgo < 30) return 'likely_available';
  return 'available';
};

export const getEnforcementRisk = (dow, hour) => {
  if (dow === 0 || dow === 6) return 'low';
  if (hour >= 8 && hour < 18) return 'high';
  if ((hour >= 7 && hour < 8) || (hour >= 18 && hour < 20)) return 'medium';
  return 'low';
};

export const calcParkingCost = (ratePerHour, durationMins) =>
  (ratePerHour / 60) * durationMins;

export const generateMockMeters = (centerLat, centerLon, count = 20) =>
  Array.from({ length: count }, (_, i) => {
    const minsAgo = Math.random() * 120;
    return {
      meter_id: `MOCK-${i}`,
      street_address: `${100 + i * 10} Sample St`,
      latitude: (centerLat + (Math.random() - 0.5) * 0.01).toString(),
      longitude: (centerLon + (Math.random() - 0.5) * 0.01).toString(),
      last_transaction_time: new Date(Date.now() - minsAgo * 60000).toISOString(),
      meter_rate: (Math.random() > 0.5 ? '4.00' : '3.00'),
      is_mock: true,
    };
  });
