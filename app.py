"""
Real-Time Traffic Signal Optimization using YOLO Deep Learning
Main Flask Backend Application
"""

import os
import cv2
import time
import json
import base64
import threading
import numpy as np
from flask import Flask, jsonify, request, Response
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from datetime import datetime
import logging

from traffic_detector import TrafficDetector
from signal_optimizer import SignalOptimizer
from database import Database

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'traffic_signal_secret_key'
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Initialize core components
detector = TrafficDetector()
optimizer = SignalOptimizer()
db = Database()

# Global state
intersection_state = {
    "lanes": {
        "north": {"vehicle_count": 0, "queue_length": 0, "signal": "red", "timer": 30},
        "south": {"vehicle_count": 0, "queue_length": 0, "signal": "red", "timer": 30},
        "east":  {"vehicle_count": 0, "queue_length": 0, "signal": "red", "timer": 30},
        "west":  {"vehicle_count": 0, "queue_length": 0, "signal": "green", "timer": 30},
    },
    "current_phase": "west_east",
    "cycle_time": 120,
    "efficiency": 85.0,
    "total_vehicles_processed": 0,
    "avg_wait_time": 0.0,
    "timestamp": datetime.now().isoformat()
}

simulation_active = False
simulation_thread = None


# ─────────────────────────────────────────────────────────────
# REST API Routes
# ─────────────────────────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "running", "timestamp": datetime.now().isoformat()})


@app.route('/api/intersection/state', methods=['GET'])
def get_intersection_state():
    return jsonify(intersection_state)


@app.route('/api/intersection/manual', methods=['POST'])
def manual_control():
    """Manually override signal for a lane."""
    data = request.get_json()
    lane = data.get('lane')
    signal = data.get('signal')
    if lane in intersection_state['lanes'] and signal in ['red', 'green', 'yellow']:
        intersection_state['lanes'][lane]['signal'] = signal
        socketio.emit('state_update', intersection_state)
        return jsonify({"success": True, "message": f"Lane {lane} set to {signal}"})
    return jsonify({"success": False, "message": "Invalid lane or signal"}), 400


@app.route('/api/simulation/start', methods=['POST'])
def start_simulation():
    global simulation_active, simulation_thread
    if not simulation_active:
        simulation_active = True
        simulation_thread = threading.Thread(target=run_simulation, daemon=True)
        simulation_thread.start()
        return jsonify({"success": True, "message": "Simulation started"})
    return jsonify({"success": False, "message": "Simulation already running"})


@app.route('/api/simulation/stop', methods=['POST'])
def stop_simulation():
    global simulation_active
    simulation_active = False
    return jsonify({"success": True, "message": "Simulation stopped"})


@app.route('/api/analytics/summary', methods=['GET'])
def get_analytics():
    records = db.get_recent_records(100)
    if not records:
        return jsonify({"message": "No data yet"})
    
    avg_vehicles = np.mean([r['total_vehicles'] for r in records])
    avg_efficiency = np.mean([r['efficiency'] for r in records])
    avg_wait = np.mean([r['avg_wait_time'] for r in records])
    peak = max(records, key=lambda x: x['total_vehicles'])

    return jsonify({
        "avg_vehicles_per_cycle": round(avg_vehicles, 1),
        "avg_efficiency": round(avg_efficiency, 1),
        "avg_wait_time": round(avg_wait, 2),
        "peak_hour": peak['timestamp'],
        "total_records": len(records)
    })


@app.route('/api/analytics/history', methods=['GET'])
def get_history():
    limit = request.args.get('limit', 50, type=int)
    records = db.get_recent_records(limit)
    return jsonify(records)


@app.route('/api/upload/video', methods=['POST'])
def upload_video():
    """Process an uploaded video frame for detection."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    file_bytes = np.frombuffer(file.read(), np.uint8)
    frame = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    
    if frame is None:
        return jsonify({"error": "Invalid image"}), 400
    
    results = detector.detect(frame)
    annotated = detector.draw_detections(frame, results)
    
    _, buffer = cv2.imencode('.jpg', annotated)
    img_b64 = base64.b64encode(buffer).decode('utf-8')
    
    return jsonify({
        "vehicle_count": results['total_count'],
        "detections": results['detections'],
        "annotated_image": img_b64
    })


@app.route('/api/config', methods=['GET', 'POST'])
def config():
    config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'settings.json')
    if request.method == 'GET':
        try:
            with open(config_path) as f:
                return jsonify(json.load(f))
        except FileNotFoundError:
            return jsonify(default_config())
    else:
        data = request.get_json()
        with open(config_path, 'w') as f:
            json.dump(data, f, indent=2)
        return jsonify({"success": True})


def default_config():
    return {
        "min_green_time": 10,
        "max_green_time": 60,
        "yellow_time": 3,
        "detection_confidence": 0.5,
        "optimization_algorithm": "density_based",
        "emergency_preemption": True
    }


# ─────────────────────────────────────────────────────────────
# Simulation Engine
# ─────────────────────────────────────────────────────────────

def run_simulation():
    """Continuous simulation loop — emits state updates via WebSocket."""
    global intersection_state, simulation_active

    lanes = ["north", "south", "east", "west"]
    phase_idx = 0
    phases = [("north", "south"), ("east", "west")]
    timer = 30
    total_processed = 0
    wait_times = []

    logger.info("Simulation started")

    while simulation_active:
        # Generate synthetic vehicle counts
        for lane in lanes:
            hour = datetime.now().hour
            base = 8 if 7 <= hour <= 9 or 17 <= hour <= 19 else 4
            count = max(0, int(np.random.poisson(base) + np.random.randint(-2, 3)))
            intersection_state['lanes'][lane]['vehicle_count'] = count
            intersection_state['lanes'][lane]['queue_length'] = max(0, count - 2)

        # Optimize signal timing
        counts = {l: intersection_state['lanes'][l]['vehicle_count'] for l in lanes}
        optimized = optimizer.optimize(counts, phases[phase_idx])

        active_lanes = phases[phase_idx]
        for lane in lanes:
            if lane in active_lanes:
                intersection_state['lanes'][lane]['signal'] = 'green'
                intersection_state['lanes'][lane]['timer'] = optimized['green_time']
            else:
                intersection_state['lanes'][lane]['signal'] = 'red'
                intersection_state['lanes'][lane]['timer'] = optimized['red_time']

        # Compute metrics
        processed = sum(counts[l] for l in active_lanes)
        total_processed += processed
        wait_time = optimizer.estimate_wait(counts, phases[phase_idx])
        wait_times.append(wait_time)

        efficiency = min(100, 60 + processed * 5 + np.random.uniform(-3, 3))
        intersection_state['efficiency'] = round(efficiency, 1)
        intersection_state['total_vehicles_processed'] = total_processed
        intersection_state['avg_wait_time'] = round(np.mean(wait_times[-20:]), 2)
        intersection_state['current_phase'] = '_'.join(active_lanes)
        intersection_state['timestamp'] = datetime.now().isoformat()

        # Emit to frontend
        socketio.emit('state_update', intersection_state)

        # Save to DB periodically
        if int(time.time()) % 10 == 0:
            db.save_record({
                "timestamp": intersection_state['timestamp'],
                "total_vehicles": sum(counts.values()),
                "efficiency": intersection_state['efficiency'],
                "avg_wait_time": intersection_state['avg_wait_time'],
                "phase": intersection_state['current_phase']
            })

        # Advance phase
        timer -= 1
        if timer <= 0:
            phase_idx = (phase_idx + 1) % len(phases)
            timer = optimized['green_time']

        time.sleep(1)

    logger.info("Simulation stopped")


# ─────────────────────────────────────────────────────────────
# WebSocket Events
# ─────────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    logger.info(f"Client connected: {request.sid}")
    emit('state_update', intersection_state)


@socketio.on('disconnect')
def on_disconnect():
    logger.info(f"Client disconnected: {request.sid}")


@socketio.on('request_state')
def on_request_state():
    emit('state_update', intersection_state)


if __name__ == '__main__':
    logger.info("Starting Traffic Signal Optimization Server on http://localhost:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
