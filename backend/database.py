import sqlite3, json
DB = 'parkingiq.db'

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init():
    c = conn()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS meters (
            meter_id TEXT PRIMARY KEY,
            street_address TEXT, latitude REAL, longitude REAL,
            meter_rate REAL, last_transaction_time TEXT,
            raw TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meter_id TEXT, transaction_time TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_loc ON meters(latitude, longitude);
    """)
    c.commit(); c.close()
