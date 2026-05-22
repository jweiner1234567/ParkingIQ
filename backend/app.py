from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import datetime

from data_ingestion import DataIngestion
from prediction import ParkingPredictor

app = FastAPI(title='ParkingIQ API', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

ingestion = DataIngestion()
predictor = ParkingPredictor()

class PredictReq(BaseModel):
    latitude: float
    longitude: float
    arrival_time: str
    duration_minutes: int = 60

@app.on_event('startup')
async def startup():
    ingestion.initialize_db()

@app.get('/health')
def health():
    return {'status': 'ok', 'timestamp': datetime.datetime.utcnow().isoformat()}

@app.get('/meters/nearby')
def nearby(lat: float, lon: float, radius: float = 500):
    meters = ingestion.get_nearby_meters(lat, lon, radius)
    if not meters:
        ingestion.fetch_and_store_meters(lat, lon, radius)
        meters = ingestion.get_nearby_meters(lat, lon, radius)
    return {'meters': meters, 'count': len(meters)}

@app.post('/predict')
def predict(req: PredictReq):
    try:
        arrival = datetime.datetime.fromisoformat(req.arrival_time.replace('Z', '+00:00'))
        return predictor.predict(req.latitude, req.longitude, arrival, req.duration_minutes)
    except Exception:
        return predictor.fallback(req.arrival_time)

@app.post('/ingest')
def ingest(lat: float, lon: float, radius: float = 500):
    count = ingestion.fetch_and_store_meters(lat, lon, radius)
    return {'stored': count}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000, reload=True)
