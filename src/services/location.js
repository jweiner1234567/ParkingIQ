import * as Location from 'expo-location';
import { MAP_CONFIG } from '../utils/constants';

export const requestLocationPermission = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
};

export const getCurrentLocation = async () => {
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return loc.coords;
};

export const NYC_DEFAULT = {
  latitude: MAP_CONFIG.DEFAULT_LATITUDE,
  longitude: MAP_CONFIG.DEFAULT_LONGITUDE,
};
