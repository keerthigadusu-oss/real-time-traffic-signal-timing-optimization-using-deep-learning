# 🚦 Real-Time Traffic Signal Optimization — YOLO Deep Learning

A complete full-stack system for intelligent traffic signal control using YOLOv8 object detection and adaptive optimization algorithms.

---

## 📁 Project Structure

```
traffic_signal_optimization/
├── backend/
│   ├── app.py                 # Flask + SocketIO server (main entry)
│   ├── traffic_detector.py    # YOLOv8 vehicle detection engine
│   ├── signal_optimizer.py    # Density-based + Q-Learning optimizer
│   ├── database.py            # SQLite analytics storage
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── public/index.html
│   └── src/
│       ├── index.js
│       └── App.js             # Full React dashboard
├── config/
│   └── settings.json          # System configuration
├── data/                      # SQLite DB auto-created here
├── models/                    # Place custom YOLO weights here
└── README.md
```

---

## ⚡ Quick Start

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
python app.py
```
Server starts at **http://localhost:5000**

> On first run, YOLOv8n weights (~6 MB) download automatically from Ultralytics.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```
Dashboard opens at **http://localhost:3000**

---

## 🔧 Features

| Feature | Description |
|---|---|
| YOLO Detection | YOLOv8n detects cars, buses, trucks, motorcycles |
| Density Optimizer | Webster-inspired green-time allocation |
| Q-Learning Agent | RL-based adaptive timing policy |
| Live Dashboard | React + Recharts real-time visualization |
| WebSocket | Socket.IO for <100ms state updates |
| Manual Control | Per-lane signal override |
| Image Upload | Upload traffic images for instant detection |
| Analytics | SQLite-backed history with charts |

---

## 🌐 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server health check |
| `/api/intersection/state` | GET | Current signal state |
| `/api/intersection/manual` | POST | Override a signal |
| `/api/simulation/start` | POST | Start simulation loop |
| `/api/simulation/stop` | POST | Stop simulation |
| `/api/upload/video` | POST | Detect vehicles in image |
| `/api/analytics/summary` | GET | Aggregated stats |
| `/api/analytics/history` | GET | Historical records |
| `/api/config` | GET/POST | Read/write settings |

**WebSocket events:**
- `state_update` — emitted every second with full intersection state
- `request_state` — client-initiated state pull

---

## 🤖 Using a Custom YOLO Model

Place your `.pt` weights in the `models/` folder, then edit `backend/traffic_detector.py`:

```python
detector = TrafficDetector(model_path='../models/your_model.pt')
```

---

## ⚙️ Configuration (`config/settings.json`)

```json
{
  "min_green_time": 10,
  "max_green_time": 60,
  "yellow_time": 3,
  "detection_confidence": 0.5,
  "optimization_algorithm": "density_based",
  "emergency_preemption": true
}
```

---

## 🛠 Requirements

- Python 3.9+
- Node.js 18+
- pip packages: flask, flask-socketio, flask-cors, ultralytics, opencv-python, numpy
