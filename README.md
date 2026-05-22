# ParkingIQ

AI-powered NYC street parking finder — real-time meter status, ML predictions, enforcement risk scoring.

## Features
- Live parking meter status pulled from NYC Open Data every 30 seconds
- Color-coded map: green (open), yellow (likely open), red (taken)
- ML availability prediction for your arrival time (GradientBoosting)
- Enforcement risk score based on time-of-day / day-of-week heuristics
- Walking distance from each meter to your destination
- Cost estimate for your parking duration

## Data Sources

| Source | Dataset ID | Used For |
|--------|-----------|----------|
| NYC Parking Meters | `mvib-nh9w` | Real-time occupancy |
| Parking Violations | `pvqr-7yc4` | Enforcement hot-spots |
| Street Cleaning | `qnmj-269j` | Alternate-side rules |
| Open-Meteo | free API | Weather demand factor |
| Nominatim | free API | Address geocoding |

## Setup

### 1. Clone
```bash
git clone https://github.com/jweiner1234567/ParkingIQ.git
cd ParkingIQ
```

### 2. React Native App
```bash
npm install
# iOS
cd ios && pod install && cd ..
npx react-native run-ios
# Android
npx react-native run-android
```

### 3. Python Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

## Architecture
```
ParkingIQ/
├── App.js                    # Root navigation
├── src/
│   ├── context/ParkingContext.js   # Global state (useReducer)
│   ├── screens/
│   │   ├── HomeScreen.js           # Search + destination entry
│   │   └── MapScreen.js            # Live map + meter list
│   ├── services/
│   │   ├── nycOpenData.js          # Socrata API calls
│   │   ├── api.js                  # Backend ML API calls
│   │   └── location.js             # Device GPS
│   └── utils/
│       ├── constants.js
│       └── helpers.js
└── backend/
    ├── app.py                # FastAPI server
    ├── data_ingestion.py     # NYC Open Data → SQLite
    ├── prediction.py         # scikit-learn model
    └── database.py           # SQLite schema
```

## iOS App Store Prep
1. Open `ios/ParkingIQ.xcworkspace` in Xcode
2. Set Bundle ID and signing team
3. Add Google Maps API key to `AppDelegate.m`
4. Archive → Distribute → App Store Connect

## Android Play Store Prep
1. Generate keystore: `keytool -genkey -v -keystore parkingiq.keystore ...`
2. Configure `android/app/build.gradle` with keystore details
3. `cd android && ./gradlew bundleRelease`
