import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Platform, Alert,
} from 'react-native';
import { useParkingContext } from '../context/ParkingContext';

const DURATION_OPTS = [
  { label: '30m', value: '30' },
  { label: '1 hr', value: '60' },
  { label: '2 hr', value: '120' },
  { label: '3 hr', value: '180' },
];

export default function HomeScreen({ navigation }) {
  const { dispatch } = useParkingContext();
  const [address, setAddress] = useState('');
  const [duration, setDuration] = useState('60');
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!address.trim()) { Alert.alert('Enter a destination'); return; }
    setSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ' New York City')}&format=json&limit=1`,
        { headers: { 'User-Agent': 'ParkingIQ/1.0' } },
      );
      const results = await resp.json();
      const loc = results[0]
        ? { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon), address }
        : { latitude: 40.7549, longitude: -73.984, address: 'Midtown Manhattan' };
      dispatch({ type: 'SET_DESTINATION', payload: loc });
      dispatch({ type: 'SET_DURATION', payload: parseInt(duration, 10) });
      navigation.navigate('Map');
    } catch {
      dispatch({ type: 'SET_DESTINATION', payload: { latitude: 40.7549, longitude: -73.984, address } });
      dispatch({ type: 'SET_DURATION', payload: parseInt(duration, 10) });
      navigation.navigate('Map');
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.logo}>P</Text>
        <View>
          <Text style={s.title}>ParkingIQ</Text>
          <Text style={s.sub}>AI-Powered NYC Parking</Text>
        </View>
      </View>

      <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Where are you going?</Text>
        <TextInput
          style={s.input}
          placeholder="Enter NYC address or landmark"
          placeholderTextColor="#aaa"
          value={address}
          onChangeText={setAddress}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />

        <Text style={s.label}>How long do you need?</Text>
        <View style={s.durationRow}>
          {DURATION_OPTS.map(o => (
            <TouchableOpacity
              key={o.value}
              style={[s.durBtn, duration === o.value && s.durBtnActive]}
              onPress={() => setDuration(o.value)}
            >
              <Text style={[s.durText, duration === o.value && s.durTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[s.findBtn, searching && s.findBtnDisabled]} onPress={handleSearch} disabled={searching}>
          <Text style={s.findBtnText}>{searching ? 'Searching…' : 'Find Parking'}</Text>
        </TouchableOpacity>

        <View style={s.card}>
          <Text style={s.cardTitle}>Live Data Sources</Text>
          {[
            ['🔴', 'NYC Parking Meters', 'Real-time status, updated 30s'],
            ['📋', 'Violation Patterns', 'Enforcement hot-spot scoring'],
            ['🧹', 'Street Cleaning', 'Alternate-side rules'],
            ['🌧️', 'Weather (Open-Meteo)', 'Demand adjustment'],
            ['🤖', 'ML Predictions', 'Gradient Boosting availability model'],
          ].map(([icon, name, desc]) => (
            <View key={name} style={s.sourceRow}>
              <Text style={s.sourceIcon}>{icon}</Text>
              <View>
                <Text style={s.sourceName}>{name}</Text>
                <Text style={s.sourceDesc}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  header: {
    backgroundColor: '#1a73e8', flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 24, paddingHorizontal: 20, gap: 14,
  },
  logo: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#fff',
    textAlign: 'center', lineHeight: 48, fontSize: 24, fontWeight: '900', color: '#1a73e8',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  body: { padding: 20 },
  label: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#dde', color: '#222',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  durationRow: { flexDirection: 'row', gap: 10 },
  durBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
    borderColor: '#dde', alignItems: 'center', backgroundColor: '#fff',
  },
  durBtnActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  durText: { fontWeight: '600', color: '#555' },
  durTextActive: { color: '#fff' },
  findBtn: {
    backgroundColor: '#1a73e8', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#1a73e8', shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  findBtnDisabled: { opacity: 0.6 },
  findBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 24,
    borderWidth: 1, borderColor: '#eef', marginBottom: 40,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 12 },
  sourceRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  sourceIcon: { fontSize: 18 },
  sourceName: { fontSize: 13, fontWeight: '600', color: '#333' },
  sourceDesc: { fontSize: 12, color: '#888' },
});
