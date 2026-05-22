import numpy as np
from datetime import datetime
import pickle, os

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.preprocessing import StandardScaler
    SKLEARN = True
except ImportError:
    SKLEARN = False

MODEL_PATH = 'model.pkl'

class ParkingPredictor:
    def __init__(self):
        self.model = None
        self.scaler = None
        if SKLEARN:
            self._load_or_train()

    def _train(self):
        np.random.seed(42)
        n = 8000
        hours = np.random.randint(0, 24, n)
        days  = np.random.randint(0, 7, n)
        mins_since = np.random.exponential(35, n)
        month = np.random.randint(1, 13, n)
        is_rain = np.random.randint(0, 2, n)

        avail = np.zeros(n)
        for i in range(n):
            base = 0.5
            if days[i] in (0, 6): base = 0.65
            elif 9 <= hours[i] <= 17: base = 0.25
            elif hours[i] >= 19 or hours[i] <= 7: base = 0.75
            if mins_since[i] > 60: base += 0.15
            if is_rain[i]: base -= 0.10
            avail[i] = np.clip(base + np.random.normal(0, 0.08), 0, 1)

        X = np.column_stack([hours, days, mins_since, month, is_rain])
        y = (avail > 0.5).astype(int)

        self.scaler = StandardScaler()
        Xs = self.scaler.fit_transform(X)
        self.model = GradientBoostingClassifier(n_estimators=150, max_depth=4, random_state=42)
        self.model.fit(Xs, y)

        with open(MODEL_PATH, 'wb') as f:
            pickle.dump((self.model, self.scaler), f)

    def _load_or_train(self):
        if os.path.exists(MODEL_PATH):
            with open(MODEL_PATH, 'rb') as f:
                self.model, self.scaler = pickle.load(f)
        else:
            self._train()

    def predict(self, lat, lon, arrival_time: datetime, duration_minutes: int):
        if not SKLEARN or self.model is None:
            return self._heuristic(arrival_time)
        h, d, month = arrival_time.hour, arrival_time.weekday(), arrival_time.month
        X = np.array([[h, d, 30, month, 0]])
        Xs = self.scaler.transform(X)
        prob = float(self.model.predict_proba(Xs)[0][1])
        return {
            'availability_probability': prob,
            'confidence': 0.74,
            'prediction_method': 'gradient_boosting',
            'predicted_available_count': max(1, int(prob * 15)),
            'hour': h, 'day_of_week': d,
        }

    def _heuristic(self, arrival_time):
        h, dow = arrival_time.hour, arrival_time.weekday()
        if dow >= 5: p = 0.65
        elif 9 <= h <= 17: p = 0.28
        elif h >= 19 or h <= 7: p = 0.75
        else: p = 0.50
        return {'availability_probability': p, 'confidence': 0.45, 'prediction_method': 'time_heuristic',
                'predicted_available_count': max(1, int(p * 15))}

    def fallback(self, arrival_iso):
        try: return self._heuristic(datetime.fromisoformat(arrival_iso.replace('Z', '+00:00')))
        except: return self._heuristic(datetime.utcnow())
