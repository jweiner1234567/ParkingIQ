import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { fetchParkingMeters } from '../services/nycOpenData';
import { requestLocationPermission, getCurrentLocation, NYC_DEFAULT } from '../services/location';

const Ctx = createContext();

const init = {
  userLocation: null, destination: null,
  meters: [], isLoading: false, error: null,
  duration: 60, searchRadius: 500,
};

function reducer(state, { type, payload }) {
  const map = {
    SET_USER_LOCATION: { ...state, userLocation: payload },
    SET_DESTINATION:   { ...state, destination: payload },
    SET_METERS:        { ...state, meters: payload },
    SET_LOADING:       { ...state, isLoading: payload },
    SET_ERROR:         { ...state, error: payload },
    SET_DURATION:      { ...state, duration: payload },
  };
  return map[type] ?? state;
}

export function ParkingProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);

  const initLocation = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const ok = await requestLocationPermission();
      const coords = ok ? await getCurrentLocation() : NYC_DEFAULT;
      dispatch({ type: 'SET_USER_LOCATION', payload: coords });
    } catch {
      dispatch({ type: 'SET_USER_LOCATION', payload: NYC_DEFAULT });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const loadMeters = useCallback(async (lat, lon) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const raw = await fetchParkingMeters(lat, lon, state.searchRadius);
      const processed = raw
        .map(m => ({
          ...m,
          lat: parseFloat(m.latitude || m.lat),
          lon: parseFloat(m.longitude || m.long),
          rate: parseFloat(m.meter_rate) || 4.0,
          status: m.status_raw === 'Inactive' ? 'unavailable' : (m.predicted_status || 'unknown'),
        }))
        .filter(m => !isNaN(m.lat) && !isNaN(m.lon));
      dispatch({ type: 'SET_METERS', payload: processed });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load parking data' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.searchRadius]);

  return (
    <Ctx.Provider value={{ state, dispatch, initLocation, loadMeters }}>
      {children}
    </Ctx.Provider>
  );
}

export const useParkingContext = () => useContext(Ctx);
