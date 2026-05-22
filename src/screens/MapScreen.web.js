import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Map, Marker } from 'pigeon-maps';
import { useParkingContext } from '../context/ParkingContext';
import { predictAvailability } from '../services/api';
import { fetchParkingMeters } from '../services/nycOpenData';
import { haversineDistance, calcParkingCost, formatCurrency, getEnforcementRisk } from '../utils/helpers';
import { MAP_CONFIG } from '../utils/constants';

const COLOR = {
  available:       '#34A853',
  likely_available:'#FBBC04',
  occupied:        '#EA4335',
  unknown:         '#9E9E9E',
  unavailable:     '#607D8B',
};
const ICON  = { available: '✓', likely_available: '~', occupied: '✗', unknown: '?', unavailable: '○' };
const LABEL = { available: 'Open', likely_available: 'Likely Open', occupied: 'Occupied', unknown: 'Unknown', unavailable: 'Unavailable' };

const walkMin = (m, ref) => {
  if (!ref) return null;
  const d = haversineDistance(m.lat, m.lon, ref.latitude, ref.longitude);
  return Math.max(1, Math.round(d / 84));
};

export default function MapScreen({ navigation }) {
  const { state, loadMeters, initLocation, dispatch } = useParkingContext();
  const timer       = useRef(null);
  const scopeRef    = useRef('nearby');
  const mapCenterRef = useRef([MAP_CONFIG.DEFAULT_LATITUDE, MAP_CONFIG.DEFAULT_LONGITUDE]);
  const [selected,    setSelected]    = useState(null);
  const [prediction,  setPrediction]  = useState(null);
  const [loadingPred, setLoadingPred] = useState(false);
  const [searchText,  setSearchText]  = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMaxRate, setFilterMaxRate] = useState(null);
  const [sortBy,  setSortBy]  = useState(null);
  const [mapCenter, setMapCenter] = useState([MAP_CONFIG.DEFAULT_LATITUDE, MAP_CONFIG.DEFAULT_LONGITUDE]);
  const [mapZoom,   setMapZoom]   = useState(15);
  const [scope, setScope] = useState('nearby'); // 'nearby' | 'citywide'
  // Keep refs current so stale closures in setInterval read the latest values
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  useEffect(() => { mapCenterRef.current = mapCenter; }, [mapCenter]);

  // On mount: load default area immediately, then get real location
  useEffect(() => {
    loadMeters(MAP_CONFIG.DEFAULT_LATITUDE, MAP_CONFIG.DEFAULT_LONGITUDE);
    initLocation();
    timer.current = setInterval(() => {
      if (scopeRef.current === 'citywide') return; // don't clobber citywide view
      loadMeters(mapCenterRef.current[0], mapCenterRef.current[1]);
    }, MAP_CONFIG.UPDATE_INTERVAL);
    return () => clearInterval(timer.current);
  }, []);

  // When user location arrives, recenter + reload (skip if user switched to citywide)
  useEffect(() => {
    if (!state.userLocation || scopeRef.current === 'citywide') return;
    setMapCenter([state.userLocation.latitude, state.userLocation.longitude]);
    loadMeters(state.userLocation.latitude, state.userLocation.longitude);
  }, [state.userLocation?.latitude]);

  // Per-meter prediction when selected
  useEffect(() => {
    if (!selected) { setPrediction(null); return; }
    setLoadingPred(true);
    const arrival = new Date(Date.now() + 15 * 60000).toISOString();
    predictAvailability(selected.lat, selected.lon, arrival, state.duration)
      .then(p => { setPrediction(p); setLoadingPred(false); })
      .catch(() => setLoadingPred(false));
  }, [selected?.meter_id]);

  const searchArea = async () => {
    if (!searchText.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchText + ' New York')}&format=json&limit=1`,
        { headers: { 'User-Agent': 'ParkingIQ/1.0' } }
      );
      const data = await res.json();
      if (!data[0]) return;
      const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
      setMapCenter([lat, lon]);
      dispatch({ type: 'SET_DESTINATION', payload: { latitude: lat, longitude: lon, address: searchText } });
      loadMeters(lat, lon);
    } catch {}
  };

  const goToMyLocation = () => {
    if (!state.userLocation) return;
    const { latitude, longitude } = state.userLocation;
    setMapCenter([latitude, longitude]);
    loadMeters(latitude, longitude);
  };

  const loadCitywide = async () => {
    setScope('citywide');
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      // Query each borough directly — NO bounding box, no radius.
      // Fetch at 3 different offsets per borough so the dataset's internal
      // ordering doesn't cluster everything in one neighborhood.
      const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
      const OFFSETS  = [0, 800, 3000];  // spread across the borough's meter pool
      const PER_FETCH = 80;             // 80 × 3 offsets × 5 boroughs = 1200 meters max

      const fetches = BOROUGHS.flatMap(borough =>
        OFFSETS.map(offset =>
          fetch(
            'https://data.cityofnewyork.us/resource/693u-uax6.json' +
            `?$limit=${PER_FETCH}&$offset=${offset}` +
            `&$where=${encodeURIComponent("status='Active' AND borough='" + borough + "'")}`,
            { headers: { Accept: 'application/json' } }
          ).then(r => r.json()).catch(() => [])
        )
      );
      const batches = await Promise.all(fetches);
      const raw = batches.flat().filter(m => m.lat && m.long);

      const hour = new Date().getHours();
      const dow  = new Date().getDay();
      const normRaw = m => {
        const mid  = m.meter_number || m.objectid || '';
        const hash = mid.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
        const p    = (Math.abs(hash) * 17 + hour * 13) % 100;
        const mh   = (m.meter_hours || '').toUpperCase();
        const isWeekend = dow === 0 || dow === 6;
        const afterHours = hour < 7 || hour >= 19;
        let status;
        if (afterHours ||
            (dow === 0 && (mh.includes('MON-SAT') || mh.includes('MON-FRI'))) ||
            (isWeekend  &&  mh.includes('MON-FRI'))) {
          status = 'available';
        } else {
          status = p < 38 ? 'available' : p < 68 ? 'likely_available' : 'occupied';
        }
        return {
          meter_id: mid || String(Math.random()),
          street_address: [m.on_street,
            m.from_street ? '(' + m.from_street + '–' + m.to_street + ')' : ''
          ].filter(Boolean).join(' '),
          latitude: m.lat, longitude: m.long,
          lat: parseFloat(m.lat), lon: parseFloat(m.long),
          meter_rate: '4.00', rate: 4.0,
          meter_hours: m.meter_hours || '',
          status, status_raw: m.status,
          borough: m.borough || '',
          pay_by_cell: m.pay_by_cell_number || '',
          side_of_street: m.side_of_street || '',
          last_transaction_time: null,
        };
      };

      const citywide = raw.map(normRaw).filter(m => !isNaN(m.lat) && !isNaN(m.lon));
      // Always keep Near Me meters — merge and deduplicate
      const merged = [...state.meters, ...citywide];
      const unique = Object.values(Object.fromEntries(merged.map(m => [m.meter_id, m])));
      dispatch({ type: 'SET_METERS', payload: unique });
    } catch(e) { console.warn('citywide fetch failed', e); }
    finally { dispatch({ type: 'SET_LOADING', payload: false }); }
  };

  // Filtering + sorting
  const userRef = state.userLocation ?? { latitude: mapCenter[0], longitude: mapCenter[1] };
  let display = state.meters;
  if (filterStatus !== 'all') display = display.filter(m => m.status === filterStatus);
  if (filterMaxRate !== null)  display = display.filter(m => m.rate <= filterMaxRate);

  const ORDER = { available: 0, likely_available: 1, occupied: 2, unknown: 3, unavailable: 4 };
  const sorted = sortBy === null ? [...display] : [...display].sort((a, b) => {
    if (sortBy === 'rate')   return a.rate - b.rate;
    if (sortBy === 'status') return (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3);
    return haversineDistance(a.lat, a.lon, userRef.latitude, userRef.longitude) -
           haversineDistance(b.lat, b.lon, userRef.latitude, userRef.longitude);
  });

  const openCount    = state.meters.filter(m => m.status === 'available').length;
  const likelyCount  = state.meters.filter(m => m.status === 'likely_available').length;
  const occupiedCount= state.meters.filter(m => m.status === 'occupied').length;
  const now  = new Date();
  const risk = getEnforcementRisk(now.getDay(), now.getHours());

  const openGoogleMaps = m => window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}&travelmode=walking`, '_blank');
  const openWaze = m => window.open(
    `https://waze.com/ul?ll=${m.lat},${m.lon}&navigate=yes`, '_blank');

  return (
    <View style={s.root}>

      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <View style={s.logo}>
          <Text style={s.logoTxt}>P</Text>
        </View>
        <TextInput
          style={s.searchInput}
          placeholder="Search NYC area, address, or landmark..."
          placeholderTextColor="#aaa"
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={searchArea}
          returnKeyType="search"
        />
        <TouchableOpacity style={s.iconBtn} onPress={searchArea}>
          <Text style={s.iconBtnTxt}>🔍</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={goToMyLocation} title="My Location">
          <Text style={s.iconBtnTxt}>📍</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => loadMeters(mapCenter[0], mapCenter[1])}>
          <Text style={s.iconBtnTxt}>⟳</Text>
        </TouchableOpacity>
        {state.isLoading && <ActivityIndicator color="#fff" />}
      </View>

      {/* ── Filter bar ── */}
      <View style={s.filterBar}>
        {[
          ['all',              'All'],
          ['available',        '✓ Open'],
          ['likely_available', '~ Likely'],
          ['occupied',         '✗ Occupied'],
        ].map(([f, lbl]) => (
          <TouchableOpacity key={f}
            style={[s.chip, filterStatus === f && s.chipOn]}
            onPress={() => setFilterStatus(f)}>
            <Text style={[s.chipTxt, filterStatus === f && s.chipTxtOn]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
        <View style={s.sep} />
        {[[null,'Any $'],[2,'≤$2'],[4,'≤$4']].map(([r, lbl]) => (
          <TouchableOpacity key={String(r)}
            style={[s.chip, filterMaxRate === r && s.chipOn]}
            onPress={() => setFilterMaxRate(r)}>
            <Text style={[s.chipTxt, filterMaxRate === r && s.chipTxtOn]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
        <View style={s.sep} />
        {[['rate','$ Low'],['status','✓ First'],[null,'Unsorted']].map(([v, lbl]) => (
          <TouchableOpacity key={String(v)}
            style={[s.chip, sortBy === v && s.chipOn]}
            onPress={() => setSortBy(v)}>
            <Text style={[s.chipTxt, sortBy === v && s.chipTxtOn]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
        <View style={s.sep} />
        <TouchableOpacity
          style={[s.chip, scope === 'nearby' && s.chipOn]}
          onPress={() => {
            setScope('nearby');
            const loc = state.userLocation;
            if (loc) {
              setMapCenter([loc.latitude, loc.longitude]);
              loadMeters(loc.latitude, loc.longitude);
            }
          }}>
          <Text style={[s.chipTxt, scope === 'nearby' && s.chipTxtOn]}>📍 Near Me</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.chip, scope === 'citywide' && s.chipOn]}
          onPress={() => loadCitywide()}>
          <Text style={[s.chipTxt, scope === 'citywide' && s.chipTxtOn]}>🗽 All NYC</Text>
        </TouchableOpacity>
        <Text style={s.filterCount}>{display.length} of {state.meters.length}</Text>
      </View>

      {/* ── Body ── */}
      <View style={s.body}>

        {/* Map */}
        <View style={s.mapWrap}>
          <Map
            height="100%"
            center={mapCenter}
            zoom={mapZoom}
            onBoundsChanged={({ center: c, zoom: z }) => { setMapCenter(c); setMapZoom(z); }}
            attribution={false}
          >
            {/* Blue user dot */}
            {state.userLocation && (
              <Marker anchor={[state.userLocation.latitude, state.userLocation.longitude]}>
                <View style={s.userDot} />
              </Marker>
            )}
            {/* Red destination pin */}
            {state.destination && (
              <Marker anchor={[state.destination.latitude, state.destination.longitude]}>
                <View style={s.destPin}><Text style={s.destPinTxt}>D</Text></View>
              </Marker>
            )}
            {/* Meter dots */}
            {state.meters.map(m => (
              <Marker key={m.meter_id} anchor={[m.lat, m.lon]} onClick={() => setSelected(m)}>
                <View style={[s.dot, { backgroundColor: COLOR[m.status] ?? '#9E9E9E' },
                  selected?.meter_id === m.meter_id && s.dotSelected]}>
                  <Text style={s.dotIcon}>{ICON[m.status] ?? '?'}</Text>
                </View>
              </Marker>
            ))}
          </Map>

          {/* Legend */}
          <View style={s.legend}>
            {[['#34A853','✓','Open'],['#FBBC04','~','Likely'],['#EA4335','✗','Taken']].map(([c,i,l]) => (
              <View key={l} style={s.legRow}>
                <View style={[s.legDot, { backgroundColor: c }]}>
                  <Text style={s.legIcon}>{i}</Text>
                </View>
                <Text style={s.legLbl}>{l}</Text>
              </View>
            ))}
          </View>

          {/* Stats badge */}
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{openCount} open · {state.meters.length} total</Text>
          </View>
        </View>

        {/* Side panel */}
        <View style={s.side}>

          {selected ? (
            /* ── METER DETAIL ── */
            <View style={s.detail}>
              <View style={s.detailHd}>
                <View style={[s.statusPill, { backgroundColor: COLOR[selected.status] }]}>
                  <Text style={s.statusPillTxt}>{ICON[selected.status]} {LABEL[selected.status]}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={s.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.detailAddr}>{selected.street_address}</Text>
              {selected.borough ? <Text style={s.detailMeta}>{selected.borough}</Text> : null}
              {selected.meter_hours ? <Text style={s.detailHours}>{selected.meter_hours}</Text> : null}
              {selected.side_of_street ? <Text style={s.detailMeta}>{selected.side_of_street} side of street</Text> : null}

              <View style={s.infoGrid}>
                <View style={s.infoCell}>
                  <Text style={s.infoCellLbl}>Rate</Text>
                  <Text style={s.infoCellVal}>${selected.rate}/hr</Text>
                </View>
                <View style={s.infoCell}>
                  <Text style={s.infoCellLbl}>Walk from you</Text>
                  <Text style={[s.infoCellVal, { color: '#1a73e8' }]}>
                    {walkMin(selected, state.userLocation) ?? '—'} min
                  </Text>
                </View>
                {state.duration ? (
                  <View style={s.infoCell}>
                    <Text style={s.infoCellLbl}>Est. cost</Text>
                    <Text style={s.infoCellVal}>{formatCurrency(calcParkingCost(selected.rate, state.duration))}</Text>
                  </View>
                ) : null}
                {selected.pay_by_cell ? (
                  <View style={s.infoCell}>
                    <Text style={s.infoCellLbl}>Pay by cell</Text>
                    <Text style={s.infoCellVal}>#{selected.pay_by_cell}</Text>
                  </View>
                ) : null}
              </View>

              {/* ML Prediction */}
              {loadingPred ? (
                <View style={s.predBox}>
                  <ActivityIndicator color="#1a73e8" />
                  <Text style={s.predLoading}>Getting prediction...</Text>
                </View>
              ) : prediction ? (
                <View style={s.predBox}>
                  <Text style={s.predTitle}>Arrives in 15 min</Text>
                  <Text style={s.predPct}>
                    {Math.round(prediction.availability_probability * 100)}% chance open
                  </Text>
                  <Text style={s.predConf}>
                    Confidence: {Math.round((prediction.confidence ?? 0.5) * 100)}%
                  </Text>
                  <Text style={s.predModel}>⚡ Gradient Boosting</Text>
                </View>
              ) : null}

              {/* Directions */}
              <View style={s.dirRow}>
                <TouchableOpacity style={s.dirBtnG} onPress={() => openGoogleMaps(selected)}>
                  <Text style={s.dirBtnTxt}>🗺 Google Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.dirBtnW} onPress={() => openWaze(selected)}>
                  <Text style={s.dirBtnTxt}>🚗 Waze</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* ── SUMMARY ── */
            <View style={s.summary}>
              <Text style={s.summTitle}>
                {state.isLoading ? 'Loading meters…' : `${state.meters.length} Meters Nearby`}
              </Text>
              <Text style={s.summHint}>Tap a dot or row to see details + directions</Text>
              <View style={s.summStats}>
                {[[openCount,'✓','Open','#34A853'],[likelyCount,'~','Likely','#FBBC04'],[occupiedCount,'✗','Taken','#EA4335']].map(([n,i,l,c]) => (
                  <View key={l} style={s.summStat}>
                    <Text style={[s.summN, { color: c }]}>{n}</Text>
                    <Text style={s.summL}>{i} {l}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Meter list */}
          <Text style={s.listHd}>
            {sorted.length} meters{scope === 'citywide' ? ' · All NYC' : ' · Near Me'}{sortBy === 'rate' ? ' · cheapest first' : sortBy === 'status' ? ' · available first' : ''}
          </Text>
          <ScrollView style={s.list}>
            {sorted.map(m => {
              const wm = walkMin(m, state.userLocation);
              return (
                <TouchableOpacity
                  key={m.meter_id}
                  style={[s.row, selected?.meter_id === m.meter_id && s.rowActive]}
                  onPress={() => setSelected(m)}
                >
                  <View style={[s.rowIcon, { backgroundColor: COLOR[m.status] ?? '#9E9E9E' }]}>
                    <Text style={s.rowIconTxt}>{ICON[m.status] ?? '?'}</Text>
                  </View>
                  <View style={s.rowInfo}>
                    <Text style={s.rowAddr} numberOfLines={1}>{m.street_address}</Text>
                    <Text style={s.rowMeta} numberOfLines={1}>
                      ${m.rate}/hr
                      {wm ? ` · ${wm} min walk` : ''}
                      {m.meter_hours ? ` · ${m.meter_hours.slice(0,22)}` : ''}
                    </Text>
                  </View>
                  <Text style={[s.rowStatus, { color: COLOR[m.status] }]}>
                    {ICON[m.status] ?? '?'}
                  </Text>
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
    paddingHorizontal: 10, paddingVertical: 8, gap: 8,
  },
  logo: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  logoTxt: { color: '#1a73e8', fontWeight: '900', fontSize: 16 },
  searchInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, fontSize: 14, color: '#222',
  },
  iconBtn: { padding: 4 },
  iconBtnTxt: { fontSize: 20 },

  filterBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: '#eef', gap: 5,
  },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#dde', backgroundColor: '#f8f9ff' },
  chipOn: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  chipTxt: { fontSize: 12, color: '#555', fontWeight: '600' },
  chipTxtOn: { color: '#fff' },
  sep: { width: 1, height: 18, backgroundColor: '#eee', marginHorizontal: 2 },
  filterCount: { marginLeft: 'auto', fontSize: 11, color: '#999', fontWeight: '600' },

  body: { flex: 1, flexDirection: 'row' },

  mapWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  userDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#1a73e8', borderWidth: 3, borderColor: '#fff' },
  destPin: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EA4335', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  destPinTxt: { color: '#fff', fontWeight: '900', fontSize: 11 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dotSelected: { width: 28, height: 28, borderRadius: 14, borderWidth: 3 },
  dotIcon: { fontSize: 10, color: '#fff', fontWeight: '900' },
  legend: { position: 'absolute', bottom: 14, left: 10, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 8, gap: 4 },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  legIcon: { fontSize: 9, color: '#fff', fontWeight: '900' },
  legLbl: { fontSize: 12, color: '#333', fontWeight: '500' },
  badge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },

  side: { width: 340, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#eef', flexDirection: 'column' },

  detail: { padding: 14, borderBottomWidth: 1, borderColor: '#eef' },
  detailHd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  closeBtn: { fontSize: 18, color: '#aaa', paddingHorizontal: 4 },
  detailAddr: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 2 },
  detailMeta: { fontSize: 12, color: '#888', marginBottom: 1 },
  detailHours: { fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 8 },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  infoCell: { backgroundColor: '#f8f9ff', borderRadius: 8, padding: 8, minWidth: 100, flex: 1 },
  infoCellLbl: { fontSize: 10, color: '#999', marginBottom: 2 },
  infoCellVal: { fontSize: 14, fontWeight: '700', color: '#222' },

  predBox: { backgroundColor: '#e8f0fe', borderRadius: 10, padding: 10, marginTop: 8 },
  predLoading: { fontSize: 12, color: '#1a73e8', marginLeft: 8 },
  predTitle: { fontSize: 11, color: '#1a73e8', fontWeight: '600' },
  predPct: { fontSize: 22, fontWeight: '800', color: '#1a73e8', marginTop: 2 },
  predConf: { fontSize: 12, color: '#555', marginTop: 2 },
  predModel: { fontSize: 11, color: '#1a73e8', fontWeight: '700', marginTop: 2 },

  dirRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  dirBtnG: { flex: 1, backgroundColor: '#1a73e8', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  dirBtnW: { flex: 1, backgroundColor: '#00BCD4', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  dirBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },

  summary: { padding: 14, borderBottomWidth: 1, borderColor: '#eef' },
  summTitle: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 4 },
  summHint: { fontSize: 12, color: '#aaa', marginBottom: 10 },
  summStats: { flexDirection: 'row', justifyContent: 'space-around' },
  summStat: { alignItems: 'center' },
  summN: { fontSize: 24, fontWeight: '800' },
  summL: { fontSize: 11, color: '#888', marginTop: 1 },

  listHd: { fontSize: 11, fontWeight: '700', color: '#999', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fafbff', borderBottomWidth: 1, borderColor: '#eef' },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0', gap: 10 },
  rowActive: { backgroundColor: '#e8f0fe' },
  rowIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowIconTxt: { fontSize: 12, color: '#fff', fontWeight: '900' },
  rowInfo: { flex: 1 },
  rowAddr: { fontSize: 13, fontWeight: '600', color: '#111' },
  rowMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  rowStatus: { fontSize: 18, fontWeight: '900', flexShrink: 0 },
});
