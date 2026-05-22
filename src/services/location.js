import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { MAP_CONFIG } from '../utils/constants';

export const requestLocationPermission = async () => {
  if (Platform.OS === 'ios') {
    const auth = await Geolocation.requestAuthorization('whenInUse');
    return auth === 'granted';
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    { title: 'ParkingIQ needs your location', buttonPositive: 'Allow' },
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

export const getCurrentLocation = () =>
  new Promise((resolve, reject) =>
    Geolocation.getCurrentPosition(
      ({ coords }) => resolve(coords),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    )
  );

export const NYC_DEFAULT = {
  latitude: MAP_CONFIG.DEFAULT_LATITUDE,
  longitude: MAP_CONFIG.DEFAULT_LONGITUDE,
};
