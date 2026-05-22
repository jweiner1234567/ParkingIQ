import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';
import { useParkingContext } from '../context/ParkingContext';
import { predictAvailability } from '../services/api';
import { haversineDistance, metersToBlocks, formatCurrency, getEnforcementRisk, calcParkingCost } from '../utils/helpers';
import { MAP_CONFIG, METER_COLORS } from '../utils/constants';

const STATUS_LABELS = { available: 'Available ✓', likely_available: 'Likely Open', occupied: 'Occupied', unknown: '?' };
const RISK_COLORS = { high: '#F44336', medium: '#FF9800', low: '#4CAF50' };

export default function MapScreen({ navigation }) {
  const { state, loadMeters, initLocation } = useParkingContext();
  const mapRef = useRef(null);
  const timer = useRef(null);
  const [selected, setSelected] = useState(null);
  const [prediction, setPrediction] = useState(null);

  const center = state.destination ?? state.userLocation ?? {
    latitude: MAP_CONFIG.DEFAULT_LATITUDE, longitude: MAP_CONFIG.DEFAULT_LONGITUDE,
  };

  useEffect(() => {
    initLocation();
    loadMeters(center.latitude, center.longitude);
    timer.current = setInterval(() => loadMeters(center.latitude, center.longitude), MAP_CONFIG.UPDATE_INTERVAL);
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (!state.destination) return;
    const arrivalISO = new Date(Date.now() + 15 * 60000).toISOString();
    predictAvailability(state.destination.latitude, state.destination.longitude, arrivalISO, state.duration)
      .then(setPrediction);
  }, [state.destination, state.duration]);

  const colorOf = m => METER_COLORS[m.status] ?? METER_COLORS.UNKNOWN;
  const now = new Date();
  const risk = getEnforcementRisk(now.getDay(), now.getHours());
  const availableCount = state.meters.filter(m => m.status === 'available').length;

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        initialRegion={{ ...center, latitudeDelta: MAP_CONFIG.DEFAULT_DELTA, longitudeDelta: MAP_CONFIG.DEFAULT_DELTA }}
        showsUserLocation showsMyLocationButton
      >
        {state.destination && (
          <Marker coordinate={{ latitude: state.destination.latitude, longitude: state.destination.longitude }}
            pinColor="#1a73e8" title="Destination" description={state.destination.address} />
        )}
        {state.destination && MAP_CONFIG.WALKING_RADIUS_BLOCKS.map(b => (
          <Circle key={b}
            center={{ latitude: state.destination.latitude, longitude: state.destination.longitude }}
            radius={b * MAP_CONFIG.BLOCK_METERS}
            fillColor="rgba(26,115,232,0.04)" strokeColor="rgba(26,115,232,0.25)" strokeWidth={1} />
        ))}
        {state.meters.map(m => (
          <Marker key={m.meter_id} coordinate={{ latitude: m.lat, longitude: m.lon }} onPress={() => setSelected(m)}>
            <View style={[s.dot, { backgroundColor: colorOf(m) }]} />
            <Callout tooltip>
              <View style={s.callout}>
                <Text style={s.calloutAddr}>{m.street_address}</Text>
                <Text style={[s.calloutStatus, { color: colorOf(m) }]}>{STATUS_LABELS[m.status]}</Text>
                <Text style={s.calloutRate}>${m.rate}/hr</Text>
                {state.destination && (
                  <Text style={s.calloutWalk}>
                    {metersToBlocks(haversineDistance(m.lat, m.lon, state.destination.latitude, state.destination.longitude))} blocks
                  </Text>
                )}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>‹ Back</Text>
        </TouchableOpacity>
        {state.destination && (
          <Text style={s.destPill} numberOfLines={1}>{state.destination.address}</Text>
        )}
        {state.isLoading && <ActivityIndicator color="#1a73e8" />}
      </View>

      {/* Legend */}
      <View style={s.legend}>
        {[['#4CAF50','Open'],['#FFC107','Likely'],['#F44336','Taken']].map(([c,l]) => (
          <View key={l} style={s.legendRow}><View style={[s.legendDot,{backgroundColor:c}]}/><Text style={s.legendLbl}>{l}</Text></View>
        ))}
      </View>

      {/* Bottom sheet */}
      <View style={s.bottom}>
        {prediction && (
          <View style={s.predBox}>
            <Text style={s.predLabel}>Arrives in 15 min →</Text>
            <Text style={s.predVal}>{Math.round(prediction.availability_probability * 100)}% chance of open spot</Text>
            <Text style={s.predConf}>Confidence {Math.round((prediction.confidence ?? 0.5) * 100)}% · {prediction.prediction_method}</Text>
          </View>
        )}

        <View style={s.statsRow}>
          {[
            [availableCount, 'Open Now'],
            [`${state.duration}m`, 'Duration'],
            [risk.toUpperCase(), 'Enforcement', RISK_COLORS[risk]],
          ].map(([val, lbl, color]) => (
            <View key={lbl} style={s.stat}>
              <Text style={[s.statVal, color && { color }]}>{val}</Text>
              <Text style={s.statLbl}>{lbl}</Text>
            </View>
          ))}
        </View>

        {selected && (
          <View style={s.selectedCard}>
            <Text style={s.selAddr}>{selected.street_address}</Text>
            <Text style={[s.selStatus, { color: colorOf(selected) }]}>{STATUS_LABELS[selected.status]}</Text>
            <Text style={s.selCost}>Cost: {formatCurrency(calcParkingCost(selected.rate, state.duration))} for {state.duration} min</Text>
            {state.destination && (
              <Text style={s.selWalk}>
                {metersToBlocks(haversineDistance(selected.lat, selected.lon, state.destination.latitude, state.destination.longitude))} blocks to destination
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  callout: { backgroundColor: '#fff', borderRadius: 10, padding: 10, minWidth: 160, elevation: 4 },
  calloutAddr: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  calloutStatus: { fontSize: 12, fontWeight: '700' },
  calloutRate: { fontSize: 12, color: '#666', marginTop: 2 },
  calloutWalk: { fontSize: 11, color: '#999', marginTop: 2 },
  topBar: {
    position: 'absolute', top: Platform.OS === 'ios' ? 52 : 20,
    left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  backBtn: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, elevation: 3 },
  backTxt: { fontWeight: '700', color: '#1a73e8', fontSize: 15 },
  destPill: {
    flex: 1, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 22, fontSize: 13, fontWeight: '500', elevation: 3,
  },
  legend: {
    position: 'absolute', top: Platform.OS === 'ios' ? 104 : 72,
    right: 12, backgroundColor: '#fff', borderRadius: 12, padding: 10, elevation: 3,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendLbl: { fontSize: 11, color: '#444' },
  bottom: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, elevation: 8,
  },
  predBox: { backgroundColor: '#e8f0fe', borderRadius: 12, padding: 12, marginBottom: 12 },
  predLabel: { fontSize: 11, color: '#1a73e8', fontWeight: '600' },
  predVal: { fontSize: 17, fontWeight: '700', color: '#1a73e8', marginTop: 2 },
  predConf: { fontSize: 11, color: '#555', marginTop: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '700', color: '#222' },
  statLbl: { fontSize: 11, color: '#999', marginTop: 2 },
  selectedCard: {
    backgroundColor: '#f8f9ff', borderRadius: 12, padding: 12,
    borderLeftWidth: 4, borderLeftColor: '#1a73e8',
  },
  selAddr: { fontSize: 14, fontWeight: '700', color: '#222' },
  selStatus: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  selCost: { fontSize: 13, color: '#555', marginTop: 4 },
  selWalk: { fontSize: 12, color: '#999', marginTop: 2 },
});
