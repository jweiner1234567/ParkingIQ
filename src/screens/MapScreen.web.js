import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Map, Marker } from 'pigeon-maps';
import { useParkingContext } from '../context/ParkingContext';
import { predictAvailability } from '../services/api';
import {
  haversineDistance, metersToBlocks, formatCurrency,
  getEnforcementRisk, calcParkingCost,
} from '../utils/helpers';
import { MAP_CONFIG, METER_COLORS } from '../utils/constants';

const STATUS_LABELS = {
  available: '✓ Available',
  likely_available: '~ Likely Open',
  occupied: '✗ Occupied',
  unknown: '? Unknown',
};
const RISK_COLORS = { high: '#F44336', medium: '#FF9800', low: '#4CAF50' };

export default function MapScreen({ navigation }) {
  const { state, loadMeters, initLocation } = useParkingContext();
  const timer = useRef(null);
  const [selected, setSelected] = useState(null);
  const [prediction, setPrediction] = useState(null);

  const center = state.destination ?? state.userLocation ?? {
    latitude: MAP_CONFIG.DEFAULT_LATITUDE,
    longitude: MAP_CONFIG.DEFAULT_LONGITUDE,
  };

  useEffect(() => {
    initLocation();
    loadMeters(center.latitude, center.longitude);
    timer.current = setInterval(
      () => loadMeters(center.latitude, center.longitude),
      MAP_CONFIG.UPDATE_INTERVAL,
    );
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (!state.destination) return;
    const arrivalISO = new Date(Date.now() + 15 * 60000).toISOString();
    predictAvailability(
      state.destination.latitude, state.destination.longitude,
      arrivalISO, state.duration,
    ).then(setPrediction);
  }, [state.destination, state.duration]);

  const colorOf = m => METER_COLORS[m.status] ?? METER_COLORS.UNKNOWN;
  const now = new Date();
  const risk = getEnforcementRisk(now.getDay(), now.getHours());
  const available = state.meters.filter(m => m.status === 'available').length;

  const sortedMeters = state.destination
    ? [...state.meters].sort((a, b) =>
        haversineDistance(a.lat, a.lon, state.destination.latitude, state.destination.longitude) -
        haversineDistance(b.lat, b.lon, state.destination.latitude, state.destination.longitude),
      )
    : state.meters;

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>
          {state.destination ? state.destination.address : 'ParkingIQ'}
        </Text>
        {state.isLoading && <ActivityIndicator color="#1a73e8" style={{ marginLeft: 12 }} />}
        <Text style={s.topMeta}>
          Live · refreshes 30s
        </Text>
      </View>

      {/* Body */}
      <View style={s.body}>
        {/* Left: map */}
        <View style={s.mapPanel}>
          <Map
            height="100%"
            center={[center.latitude, center.longitude]}
            zoom={15}
            attribution={false}
          >
            {/* Destination */}
            {state.destination && (
              <Marker anchor={[state.destination.latitude, state.destination.longitude]}>
                <View style={s.destPin}>
                  <Text style={s.destPinText}>P</Text>
                </View>
              </Marker>
            )}

            {/* Meters */}
            {state.meters.map(m => (
              <Marker
                key={m.meter_id}
                anchor={[m.lat, m.lon]}
                onClick={() => setSelected(m)}
              >
                <View style={[
                  s.mDot,
                  { backgroundColor: colorOf(m) },
                  selected?.meter_id === m.meter_id && s.mDotSelected,
                ]} />
              </Marker>
            ))}
          </Map>

          {/* Legend overlay */}
          <View style={s.legend}>
            {[
              ['#4CAF50', 'Open'],
              ['#FFC107', 'Likely'],
              ['#F44336', 'Taken'],
            ].map(([c, l]) => (
              <View key={l} style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: c }]} />
                <Text style={s.legendLbl}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Right: info panel */}
        <View style={s.sidePanel}>
          {/* Prediction */}
          {prediction && (
            <View style={s.predBox}>
              <Text style={s.predLabel}>Arrives in 15 min →</Text>
              <Text style={s.predVal}>
                {Math.round(prediction.availability_probability * 100)}% chance open
              </Text>
              <Text style={s.predConf}>
                Confidence {Math.round((prediction.confidence ?? 0.5) * 100)}%
                · {prediction.prediction_method}
              </Text>
            </View>
          )}

          {/* Stats */}
          <View style={s.statsRow}>
            {[
              [available, 'Open Now', null],
              [`${state.duration}m`, 'Duration', null],
              [risk.toUpperCase(), 'Risk', RISK_COLORS[risk]],
            ].map(([val, lbl, color]) => (
              <View key={lbl} style={s.stat}>
                <Text style={[s.statVal, color && { color }]}>{val}</Text>
                <Text style={s.statLbl}>{lbl}</Text>
              </View>
            ))}
          </View>

          {/* Selected meter detail */}
          {selected && (
            <View style={s.selectedCard}>
              <Text style={s.selAddr}>{selected.street_address}</Text>
              <Text style={[s.selStatus, { color: colorOf(selected) }]}>
                {STATUS_LABELS[selected.status]}
              </Text>
              <Text style={s.selCost}>
                {formatCurrency(calcParkingCost(selected.rate, state.duration))} for {state.duration} min
                · ${selected.rate}/hr
              </Text>
              {state.destination && (
                <Text style={s.selWalk}>
                  {metersToBlocks(haversineDistance(
                    selected.lat, selected.lon,
                    state.destination.latitude, state.destination.longitude,
                  ))} blocks to destination
                </Text>
              )}
            </View>
          )}

          {/* Meter list */}
          <Text style={s.listTitle}>{state.meters.length} Meters Nearby</Text>
          <ScrollView style={s.list}>
            {sortedMeters.map(m => {
              const dist = state.destination
                ? metersToBlocks(haversineDistance(
                    m.lat, m.lon,
                    state.destination.latitude, state.destination.longitude,
                  ))
                : null;
              return (
                <TouchableOpacity
                  key={m.meter_id}
                  style={[s.meterRow, selected?.meter_id === m.meter_id && s.meterRowActive]}
                  onPress={() => setSelected(m)}
                >
                  <View style={[s.meterDot, { backgroundColor: colorOf(m) }]} />
                  <View style={s.meterInfo}>
                    <Text style={s.meterAddr} numberOfLines={1}>{m.street_address}</Text>
                    <Text style={s.meterMeta}>
                      {STATUS_LABELS[m.status]}
                      {dist != null ? ` · ${dist} blocks` : ''}
                      {' · '}{formatCurrency(calcParkingCost(m.rate, state.duration))}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4ff' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a73e8',
    paddingHorizontal: 20, paddingVertical: 14, gap: 12,
  },
  backBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  backTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  topTitle: { flex: 1, color: '#fff', fontWeight: '600', fontSize: 15 },
  topMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  body: { flex: 1, flexDirection: 'row' },
  mapPanel: { flex: 1, position: 'relative' },
  destPin: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a73e8',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  destPinText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  mDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  mDotSelected: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  legend: {
    position: 'absolute', bottom: 16, left: 16, backgroundColor: '#fff',
    borderRadius: 10, padding: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendLbl: { fontSize: 12, color: '#444' },
  sidePanel: { width: 340, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#eef' },
  predBox: { backgroundColor: '#e8f0fe', padding: 14, margin: 12, borderRadius: 12 },
  predLabel: { fontSize: 11, color: '#1a73e8', fontWeight: '600' },
  predVal: { fontSize: 18, fontWeight: '700', color: '#1a73e8', marginTop: 2 },
  predConf: { fontSize: 11, color: '#555', marginTop: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eef' },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '700', color: '#222' },
  statLbl: { fontSize: 11, color: '#999', marginTop: 2 },
  selectedCard: {
    margin: 12, padding: 12, backgroundColor: '#f8f9ff',
    borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#1a73e8',
  },
  selAddr: { fontSize: 13, fontWeight: '700', color: '#222' },
  selStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  selCost: { fontSize: 12, color: '#555', marginTop: 4 },
  selWalk: { fontSize: 11, color: '#999', marginTop: 2 },
  listTitle: { fontSize: 12, fontWeight: '700', color: '#999', paddingHorizontal: 12, paddingVertical: 8 },
  list: { flex: 1 },
  meterRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f0f0f0', gap: 10,
  },
  meterRowActive: { backgroundColor: '#e8f0fe' },
  meterDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  meterInfo: { flex: 1 },
  meterAddr: { fontSize: 13, fontWeight: '600', color: '#222' },
  meterMeta: { fontSize: 11, color: '#888', marginTop: 2 },
});
