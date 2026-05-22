import requests, json, math
from database import conn, init

METERS_URL = 'https://data.cityofnewyork.us/resource/693u-uax6.json'
VIOLAT_URL = 'https://data.cityofnewyork.us/resource/pvqr-7yc4.json'
CLEAN_URL  = 'https://data.cityofnewyork.us/resource/qnmj-269j.json'

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin(math.radians(lat2-lat1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(math.radians(lon2-lon1)/2)**2
    return 2*R*math.asin(math.sqrt(a))

class DataIngestion:
    def initialize_db(self): init()

    def fetch_and_store_meters(self, lat, lon, radius=500):
        try:
            d = 1/111000
            lat_d = radius * d
            lon_d = radius * d / abs(math.cos(math.radians(lat)))
            r = requests.get(METERS_URL, params={
                '$limit': 200,
                '$where': (
                    f'lat between {lat-lat_d} and {lat+lat_d} '
                    f'AND long between {lon-lon_d} and {lon+lon_d} '
                    "AND status='Active'"
                ),
            }, timeout=12)
            r.raise_for_status()
            meters = r.json()
            if not isinstance(meters, list):
                print(f'Unexpected response: {meters}'); return 0
        except Exception as e:
            print(f'Fetch error: {e}'); return 0

        c = conn(); cur = c.cursor(); count = 0
        for m in meters:
            try:
                mid = m.get('meter_number') or m.get('objectid', '')
                la = float(m.get('lat') or 0)
                lo = float(m.get('long') or 0)
                if not mid or la == 0: continue
                street = ' '.join(filter(None, [m.get('on_street',''), m.get('from_street','')]))
                cur.execute(
                    'INSERT INTO meters(meter_id,street_address,latitude,longitude,meter_rate,last_transaction_time,raw)'
                    ' VALUES(?,?,?,?,?,?,?)'
                    ' ON CONFLICT(meter_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP',
                    (mid, street, la, lo, 4.0, None, json.dumps(m)))
                count += 1
            except (ValueError, TypeError): continue
        c.commit(); c.close(); return count

    def get_nearby_meters(self, lat, lon, radius=500):
        c = conn(); d = 1/111000
        la_d = radius*d
        lo_d = radius*d/abs(math.cos(math.radians(lat)))
        rows = c.execute(
            'SELECT * FROM meters WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?',
            (lat-la_d, lat+la_d, lon-lo_d, lon+lo_d)
        ).fetchall()
        c.close()
        result = []
        for row in rows:
            r = dict(row)
            dist = haversine(lat, lon, r['latitude'], r['longitude'])
            if dist <= radius:
                r['distance_meters'] = round(dist)
                result.append(r)
        return sorted(result, key=lambda x: x['distance_meters'])

    def get_violation_hotspots(self, lat, lon, delta=0.005):
        try:
            r = requests.get(VIOLAT_URL, params={
                '$select': 'violation_code,violation_county',
                '$where': f"violation_location_latitude between '{lat-delta}' and '{lat+delta}'",
                '$limit': 100, '$order': 'issue_date DESC'
            }, timeout=8)
            return r.json()
        except: return []

    def get_street_cleaning(self, street_name):
        try:
            r = requests.get(CLEAN_URL, params={
                '$where': f"street like '%{street_name.upper()}%'", '$limit': 5
            }, timeout=5)
            return r.json()
        except: return []
