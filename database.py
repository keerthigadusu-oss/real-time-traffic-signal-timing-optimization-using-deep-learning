"""
SQLite Database layer for storing traffic analytics records.
"""

import sqlite3
import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'traffic.db')


class Database:
    def __init__(self, path: str = DB_PATH):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS traffic_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    total_vehicles INTEGER,
                    efficiency REAL,
                    avg_wait_time REAL,
                    phase TEXT,
                    extra TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS incidents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    type TEXT,
                    lane TEXT,
                    description TEXT
                )
            """)
            conn.commit()
        logger.info("Database initialised.")

    def save_record(self, record: Dict) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO traffic_records (timestamp, total_vehicles, efficiency, avg_wait_time, phase, extra) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    record.get('timestamp', datetime.now().isoformat()),
                    record.get('total_vehicles', 0),
                    record.get('efficiency', 0.0),
                    record.get('avg_wait_time', 0.0),
                    record.get('phase', ''),
                    json.dumps(record.get('extra', {}))
                )
            )
            conn.commit()
            return cur.lastrowid

    def get_recent_records(self, limit: int = 100) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM traffic_records ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in reversed(rows)]

    def save_incident(self, incident: Dict) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO incidents (timestamp, type, lane, description) VALUES (?, ?, ?, ?)",
                (
                    incident.get('timestamp', datetime.now().isoformat()),
                    incident.get('type', 'unknown'),
                    incident.get('lane', ''),
                    incident.get('description', '')
                )
            )
            conn.commit()
            return cur.lastrowid

    def get_incidents(self, limit: int = 50) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM incidents ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def clear_records(self):
        with self._connect() as conn:
            conn.execute("DELETE FROM traffic_records")
            conn.commit()
