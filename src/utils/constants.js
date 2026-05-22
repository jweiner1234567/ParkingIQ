export const NYC_DATA = {
  PARKING_METERS_ENDPOINT: 'https://data.cityofnewyork.us/resource/693u-uax6.json',
  PARKING_VIOLATIONS_ENDPOINT: 'https://data.cityofnewyork.us/resource/pvqr-7yc4.json',
  STREET_CLEANING_ENDPOINT: 'https://data.cityofnewyork.us/resource/qnmj-269j.json',
  WEATHER_ENDPOINT: 'https://api.open-meteo.com/v1/forecast',
};

export const MAP_CONFIG = {
  DEFAULT_LATITUDE: 40.7128,
  DEFAULT_LONGITUDE: -74.0060,
  DEFAULT_DELTA: 0.01,
  WALKING_RADIUS_BLOCKS: [2, 4, 6],
  BLOCK_METERS: 80,
  UPDATE_INTERVAL: 30000,
};

export const METER_COLORS = {
  AVAILABLE: '#4CAF50',
  LIKELY_AVAILABLE: '#FFC107',
  OCCUPIED: '#F44336',
  UNKNOWN: '#9E9E9E',
  UNAVAILABLE: '#607D8B',
};
