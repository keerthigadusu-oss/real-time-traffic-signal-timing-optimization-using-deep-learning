import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import {
  Activity, AlertTriangle, Camera, Settings,
  Play, Square, RefreshCw, Upload, Cpu, Wifi, WifiOff
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────
const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const SIGNAL_COLORS = {
  green:  { bg: '#00ff88', glow: '0 0 20px #00ff88, 0 0 40px #00ff8855' },
  yellow: { bg: '#ffd700', glow: '0 0 20px #ffd700, 0 0 40px #ffd70055' },
  red:    { bg: '#ff3366', glow: '0 0 20px #ff3366, 0 0 40px #ff336655' },
};

const LANES = ['north', 'south', 'east', 'west'];

// ─── CSS ─────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #0a0e1a;
    --panel:    #111827;
    --border:   #1e2d4a;
    --accent:   #00d4ff;
    --accent2:  #00ff88;
    --accent3:  #ff6b35;
    --text:     #e2e8f0;
    --muted:    #64748b;
    --danger:   #ff3366;
    --font:     'Rajdhani', sans-serif;
    --mono:     'Share Tech Mono', monospace;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font); }

  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Header */
  .header {
    background: linear-gradient(90deg, #0d1525 0%, #0f1f3a 50%, #0d1525 100%);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .header-title {
    font-size: 1.5rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .header-status { display: flex; gap: 12px; align-items: center; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; animation: pulse 2s infinite; }
  .status-dot.online  { background: var(--accent2); box-shadow: 0 0 8px var(--accent2); }
  .status-dot.offline { background: var(--danger); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  /* Layout */
  .main { flex: 1; display: grid; grid-template-columns: 280px 1fr 280px; gap: 16px; padding: 16px; }

  /* Panels */
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    position: relative;
    overflow: hidden;
  }
  .panel::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
  }
  .panel-title {
    font-size: 0.75rem; font-weight: 700; letter-spacing: 3px;
    text-transform: uppercase; color: var(--accent); margin-bottom: 14px;
    display: flex; align-items: center; gap: 8px;
  }

  /* Intersection canvas */
  .intersection-panel { grid-column: 2; }
  .intersection-canvas {
    position: relative; width: 100%; aspect-ratio: 1;
    max-width: 460px; margin: 0 auto;
    background:
      radial-gradient(circle at 50% 50%, #1a2540 0%, #0d1525 70%);
    border-radius: 12px; overflow: hidden;
  }

  /* Road grid */
  .road-h, .road-v {
    position: absolute; background: #1e2d40;
  }
  .road-h { top: 38%; left: 0; right: 0; height: 24%; }
  .road-v { left: 38%; top: 0; bottom: 0; width: 24%; }

  /* Lane center lines */
  .lane-line {
    position: absolute; background: repeating-linear-gradient(
      to right, #ffd700 0px, #ffd700 20px, transparent 20px, transparent 40px
    );
    height: 2px; top: 50%; left: 0; right: 0;
  }
  .lane-line-v {
    position: absolute; background: repeating-linear-gradient(
      to bottom, #ffd700 0px, #ffd700 20px, transparent 20px, transparent 40px
    );
    width: 2px; left: 50%; top: 0; bottom: 0;
  }

  /* Signal heads */
  .signal-head {
    position: absolute; display: flex; flex-direction: column;
    align-items: center; gap: 4px;
    background: #0d1525; border: 1px solid var(--border);
    border-radius: 8px; padding: 6px; width: 52px;
    transition: all .3s ease;
  }
  .signal-head.north { top: 4%; left: 50%; transform: translateX(-50%); }
  .signal-head.south { bottom: 4%; left: 50%; transform: translateX(-50%); }
  .signal-head.east  { right: 4%; top: 50%; transform: translateY(-50%); }
  .signal-head.west  { left: 4%; top: 50%; transform: translateY(-50%); flex-direction: row; width: auto; }
  .signal-head.west  { flex-direction: row; }
  .signal-head.east  { flex-direction: row; }

  .signal-light {
    width: 14px; height: 14px; border-radius: 50%;
    background: #1a1a2e; border: 1px solid #333;
    transition: all .4s ease;
  }
  .signal-light.active {
    box-shadow: var(--glow);
    background: var(--clr);
  }

  .lane-label {
    position: absolute; font-size: 10px; font-family: var(--mono);
    color: var(--muted); letter-spacing: 2px; text-transform: uppercase;
  }
  .lane-label.north { top: 18%; left: 50%; transform: translateX(-50%); }
  .lane-label.south { bottom: 18%; left: 50%; transform: translateX(-50%); }
  .lane-label.east  { right: 14%; top: 50%; transform: translateY(-50%); }
  .lane-label.west  { left: 14%; top: 50%; transform: translateY(-50%); }

  /* Vehicle dots */
  .vehicle-dot {
    position: absolute; width: 8px; height: 5px;
    border-radius: 2px; background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: drive linear infinite;
  }
  @keyframes drive {
    0%   { opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { opacity: 0; }
  }

  /* Metrics */
  .metric { margin-bottom: 12px; }
  .metric-label { font-size: 10px; letter-spacing: 2px; color: var(--muted); text-transform: uppercase; }
  .metric-value {
    font-size: 2rem; font-weight: 700; font-family: var(--mono);
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .metric-unit { font-size: 0.7rem; color: var(--muted); margin-left: 4px; }

  /* Lane cards */
  .lane-card {
    background: #0d1525; border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 12px; margin-bottom: 8px; display: flex;
    align-items: center; gap: 10px;
    transition: border-color .3s;
  }
  .lane-card.active { border-color: var(--accent2); }
  .lane-card-signal {
    width: 12px; height: 12px; border-radius: 50%;
    flex-shrink: 0; transition: all .4s;
  }
  .lane-card-info { flex: 1; }
  .lane-card-name { font-size: 11px; letter-spacing: 2px; color: var(--muted); text-transform: uppercase; }
  .lane-card-count { font-size: 1.1rem; font-weight: 700; font-family: var(--mono); }
  .lane-card-timer { font-size: 11px; font-family: var(--mono); color: var(--accent); }

  /* Buttons */
  .btn {
    border: 1px solid var(--border); background: var(--panel);
    color: var(--text); font-family: var(--font); font-size: 0.85rem;
    font-weight: 600; letter-spacing: 1px; padding: 8px 16px;
    border-radius: 6px; cursor: pointer; display: flex; align-items: center;
    gap: 6px; transition: all .2s; text-transform: uppercase;
  }
  .btn:hover { border-color: var(--accent); color: var(--accent); }
  .btn.primary {
    background: linear-gradient(135deg, #006644, #00995c);
    border-color: var(--accent2); color: #fff;
  }
  .btn.danger {
    background: linear-gradient(135deg, #660022, #cc0044);
    border-color: var(--danger); color: #fff;
  }
  .btn-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }

  /* Chart area */
  .chart-wrap { height: 160px; margin-top: 8px; }

  /* Upload zone */
  .upload-zone {
    border: 2px dashed var(--border); border-radius: 8px;
    padding: 20px; text-align: center; cursor: pointer;
    transition: border-color .2s; color: var(--muted); font-size: 0.85rem;
  }
  .upload-zone:hover { border-color: var(--accent); color: var(--accent); }

  /* Tabs */
  .tabs { display: flex; gap: 4px; margin-bottom: 14px; }
  .tab {
    padding: 5px 12px; border-radius: 4px; font-size: 0.75rem;
    font-weight: 600; letter-spacing: 1px; cursor: pointer;
    text-transform: uppercase; border: 1px solid transparent;
    color: var(--muted); transition: all .2s;
  }
  .tab.active { background: var(--border); color: var(--accent); border-color: var(--accent); }

  /* Table */
  .data-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; font-family: var(--mono); }
  .data-table th { color: var(--muted); font-size: 0.65rem; letter-spacing: 2px;
    text-transform: uppercase; padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border); }
  .data-table td { padding: 5px 8px; border-bottom: 1px solid #1a2233; }
  .data-table tr:hover td { background: #0d1525; }

  /* Efficiency bar */
  .eff-bar-bg { height: 6px; background: #1e2d40; border-radius: 3px; overflow: hidden; margin-top: 4px; }
  .eff-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent2), var(--accent)); transition: width 1s ease; }

  /* Algorithm selector */
  .select {
    background: #0d1525; border: 1px solid var(--border); color: var(--text);
    font-family: var(--mono); font-size: 0.8rem; padding: 6px 10px;
    border-radius: 6px; width: 100%; margin-bottom: 8px;
  }

  /* Ticker */
  .ticker {
    background: #060b15; border-top: 1px solid var(--border);
    padding: 6px 24px; font-family: var(--mono); font-size: 0.72rem;
    color: var(--muted); display: flex; gap: 24px; overflow: hidden;
    white-space: nowrap;
  }
  .ticker span { color: var(--accent2); margin-right: 6px; }

  /* Notification toast */
  .toast {
    position: fixed; bottom: 20px; right: 20px; padding: 10px 18px;
    background: var(--panel); border: 1px solid var(--accent2);
    border-radius: 8px; font-size: 0.85rem; z-index: 999;
    animation: fadeInUp .3s ease;
  }
  @keyframes fadeInUp { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }

  /* Responsive */
  @media(max-width:1100px) {
    .main { grid-template-columns: 1fr 1fr; }
    .intersection-panel { grid-column: 1 / -1; }
  }
  @media(max-width:700px) {
    .main { grid-template-columns: 1fr; }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────
function SignalHead({ lane, signal }) {
  const lights = ['red','yellow','green'];
  const isHoriz = lane === 'east' || lane === 'west';
  return (
    <div className={`signal-head ${lane}`}>
      {lights.map(l => (
        <div
          key={l}
          className={`signal-light ${signal === l ? 'active' : ''}`}
          style={signal === l ? {
            '--clr': SIGNAL_COLORS[l].bg,
            '--glow': SIGNAL_COLORS[l].glow,
          } : {}}
        />
      ))}
    </div>
  );
}

function LaneCard({ lane, data, onManual }) {
  const sc = SIGNAL_COLORS[data.signal];
  return (
    <div className={`lane-card ${data.signal === 'green' ? 'active' : ''}`}>
      <div
        className="lane-card-signal"
        style={{ background: sc.bg, boxShadow: sc.glow }}
      />
      <div className="lane-card-info">
        <div className="lane-card-name">{lane}</div>
        <div className="lane-card-count">{data.vehicle_count} vehicles</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="lane-card-timer">{data.timer}s</div>
        <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--mono)' }}>
          Q:{data.queue_length}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [connected, setConnected] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [tab, setTab] = useState('overview');
  const [toast, setToast] = useState(null);
  const [uploadImg, setUploadImg] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [algorithm, setAlgorithm] = useState('density_based');
  const socketRef = useRef(null);
  const fileRef = useRef();

  // Connect socket
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('state_update', (data) => {
      setState(data);
      setHistory(prev => {
        const next = [...prev, {
          time: new Date(data.timestamp).toLocaleTimeString(),
          north: data.lanes.north.vehicle_count,
          south: data.lanes.south.vehicle_count,
          east:  data.lanes.east.vehicle_count,
          west:  data.lanes.west.vehicle_count,
          efficiency: data.efficiency,
          wait: data.avg_wait_time,
        }].slice(-30);
        return next;
      });
    });
    return () => socket.disconnect();
  }, []);

  // Fetch analytics periodically
  useEffect(() => {
    const load = () => axios.get(`${API}/analytics/summary`).then(r => setAnalytics(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleStart = async () => {
    await axios.post(`${API}/simulation/start`);
    setSimRunning(true);
    showToast('✅ Simulation started');
  };

  const handleStop = async () => {
    await axios.post(`${API}/simulation/stop`);
    setSimRunning(false);
    showToast('⏹ Simulation stopped');
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post(`${API}/upload/video`, fd);
      setUploadResult(res.data);
      setUploadImg(`data:image/jpeg;base64,${res.data.annotated_image}`);
      showToast(`🚗 Detected ${res.data.vehicle_count} vehicles`);
    } catch {
      showToast('❌ Detection failed — ensure backend is running');
    }
  };

  const handleAlgoChange = async (val) => {
    setAlgorithm(val);
    try {
      const cfg = await axios.get(`${API}/config`);
      await axios.post(`${API}/config`, { ...cfg.data, optimization_algorithm: val });
      showToast(`🤖 Algorithm: ${val}`);
    } catch {}
  };

  const lanes = state?.lanes || {};

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* Header */}
        <header className="header">
          <div>
            <div className="header-title">⬡ TrafficAI — YOLO Signal Optimizer</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: 2 }}>
              Real-Time Deep Learning Traffic Control System
            </div>
          </div>
          <div className="header-status">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontFamily: 'var(--mono)' }}>
              {connected ? <Wifi size={14} color="#00ff88" /> : <WifiOff size={14} color="#ff3366" />}
              <div className={`status-dot ${connected ? 'online' : 'offline'}`} />
              {connected ? 'CONNECTED' : 'OFFLINE'}
            </div>
            {simRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontFamily: 'var(--mono)', color: '#ffd700' }}>
                <Activity size={14} />
                LIVE
              </div>
            )}
          </div>
        </header>

        {/* Main */}
        <div className="main">
          {/* Left: Lane status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="panel">
              <div className="panel-title"><Activity size={14} /> Lane Status</div>
              {LANES.map(lane => (
                <LaneCard
                  key={lane}
                  lane={lane}
                  data={lanes[lane] || { vehicle_count: 0, queue_length: 0, signal: 'red', timer: 0 }}
                />
              ))}
            </div>

            <div className="panel">
              <div className="panel-title"><Cpu size={14} /> Algorithm</div>
              <select className="select" value={algorithm} onChange={e => handleAlgoChange(e.target.value)}>
                <option value="density_based">Density-Based</option>
                <option value="q_learning">Q-Learning RL</option>
                <option value="webster">Webster's Method</option>
              </select>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                {algorithm === 'density_based' && 'Allocates green time proportional to vehicle density per lane.'}
                {algorithm === 'q_learning'   && 'Reinforcement learning agent learns optimal timing policy.'}
                {algorithm === 'webster'      && 'Classic Webster\'s formula for optimal cycle length.'}
              </div>
            </div>
          </div>

          {/* Center: Intersection */}
          <div className="intersection-panel">
            <div className="panel">
              {/* Controls */}
              <div className="btn-row">
                <button className={`btn ${simRunning ? '' : 'primary'}`} onClick={handleStart} disabled={simRunning}>
                  <Play size={14} /> Start
                </button>
                <button className={`btn ${simRunning ? 'danger' : ''}`} onClick={handleStop} disabled={!simRunning}>
                  <Square size={14} /> Stop
                </button>
                <button className="btn" onClick={() => window.location.reload()}>
                  <RefreshCw size={14} /> Reset
                </button>
              </div>

              {/* Tabs */}
              <div className="tabs">
                {['overview','charts','detection','history'].map(t => (
                  <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <>
                  {/* Intersection visual */}
                  <div className="intersection-canvas">
                    <div className="road-h" />
                    <div className="road-v" />
                    <div className="lane-line" />
                    <div className="lane-line-v" />

                    {LANES.map(lane => (
                      <SignalHead key={lane} lane={lane}
                        signal={lanes[lane]?.signal || 'red'}
                      />
                    ))}

                    <div className="lane-label north">N</div>
                    <div className="lane-label south">S</div>
                    <div className="lane-label east">E</div>
                    <div className="lane-label west">W</div>

                    {/* Center info */}
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%,-50%)',
                      background: '#0d1525dd', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '6px 10px', textAlign: 'center',
                      zIndex: 10
                    }}>
                      <div style={{ fontSize: '0.6rem', letterSpacing: 2, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>PHASE</div>
                      <div style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                        {state?.current_phase?.toUpperCase() || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 16 }}>
                    {[
                      { label: 'Efficiency', value: `${state?.efficiency ?? '—'}`, unit: '%' },
                      { label: 'Processed', value: state?.total_vehicles_processed ?? '—', unit: 'veh' },
                      { label: 'Avg Wait', value: state?.avg_wait_time ?? '—', unit: 's' },
                    ].map(m => (
                      <div key={m.label} className="panel" style={{ padding: 12 }}>
                        <div className="metric-label">{m.label}</div>
                        <div className="metric-value">{m.value}<span className="metric-unit">{m.unit}</span></div>
                        {m.label === 'Efficiency' && (
                          <div className="eff-bar-bg">
                            <div className="eff-bar-fill" style={{ width: `${state?.efficiency ?? 0}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'charts' && (
                <>
                  <div className="panel-title" style={{ marginBottom: 8 }}>Vehicle Count — All Lanes</div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" />
                        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1e2d4a', borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="north" stroke="#00d4ff" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="south" stroke="#00ff88" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="east"  stroke="#ffd700" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="west"  stroke="#ff6b35" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="panel-title" style={{ marginTop: 16, marginBottom: 8 }}>Efficiency & Wait Time</div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={history.slice(-15)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" />
                        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1e2d4a', borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="efficiency" fill="#00d4ff" radius={[3,3,0,0]} />
                        <Bar dataKey="wait"        fill="#ff6b35" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {tab === 'detection' && (
                <div>
                  <div
                    className="upload-zone"
                    onClick={() => fileRef.current.click()}
                  >
                    <Camera size={24} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--accent)' }} />
                    Upload traffic image for YOLO detection<br/>
                    <span style={{ fontSize: '0.7rem' }}>JPG, PNG, BMP supported</span>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />

                  {uploadImg && (
                    <div style={{ marginTop: 12 }}>
                      <img src={uploadImg} alt="Detection" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                      {uploadResult && (
                        <div style={{ marginTop: 8, padding: 10, background: '#0d1525', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>
                          <div style={{ color: 'var(--accent2)' }}>Detected: <strong>{uploadResult.vehicle_count}</strong> vehicles</div>
                          {Object.entries(uploadResult.detections?.reduce((a,d) => {
                            a[d.class] = (a[d.class]||0)+1; return a;
                          }, {}) || {}).map(([cls, cnt]) => (
                            <div key={cls} style={{ color: 'var(--muted)' }}>{cls}: {cnt}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab === 'history' && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>N</th><th>S</th><th>E</th><th>W</th>
                        <th>Eff%</th>
                        <th>Wait</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...history].reverse().slice(0, 20).map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--muted)' }}>{r.time}</td>
                          <td style={{ color: '#00d4ff' }}>{r.north}</td>
                          <td style={{ color: '#00ff88' }}>{r.south}</td>
                          <td style={{ color: '#ffd700' }}>{r.east}</td>
                          <td style={{ color: '#ff6b35' }}>{r.west}</td>
                          <td style={{ color: 'var(--accent2)' }}>{r.efficiency?.toFixed(1)}</td>
                          <td style={{ color: 'var(--accent)' }}>{r.wait}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right: Analytics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="panel">
              <div className="panel-title"><Activity size={14} /> Analytics</div>
              {analytics && (
                <>
                  {[
                    { l: 'Avg Vehicles/Cycle', v: analytics.avg_vehicles_per_cycle },
                    { l: 'Avg Efficiency',     v: `${analytics.avg_efficiency}%` },
                    { l: 'Avg Wait Time',      v: `${analytics.avg_wait_time}s` },
                    { l: 'Records',            v: analytics.total_records },
                  ].map(m => (
                    <div key={m.l} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.7rem', letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase' }}>{m.l}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent2)' }}>{m.v}</div>
                    </div>
                  ))}
                </>
              )}
              {!analytics && (
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Start simulation to collect data…</div>
              )}
            </div>

            <div className="panel">
              <div className="panel-title"><AlertTriangle size={14} /> System Info</div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', lineHeight: 2, color: 'var(--muted)' }}>
                <div>MODEL <span style={{ color: 'var(--accent)' }}>YOLOv8n</span></div>
                <div>ALGO  <span style={{ color: 'var(--accent)' }}>{algorithm.toUpperCase()}</span></div>
                <div>SOCKET<span style={{ color: connected ? 'var(--accent2)' : 'var(--danger)', marginLeft: 4 }}>
                  {connected ? '● LIVE' : '○ OFFLINE'}
                </span></div>
                <div>LANES <span style={{ color: 'var(--accent)' }}>4 (N/S/E/W)</span></div>
                <div>PHASES<span style={{ color: 'var(--accent)' }}>2</span></div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title"><Settings size={14} /> Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {LANES.map(lane => (
                  <div key={lane} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', width: 40, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{lane.toUpperCase()}</span>
                    {['red', 'yellow', 'green'].map(sig => (
                      <button
                        key={sig}
                        className="btn"
                        style={{ padding: '3px 8px', fontSize: '0.65rem', borderColor: SIGNAL_COLORS[sig].bg }}
                        onClick={async () => {
                          await axios.post(`${API}/intersection/manual`, { lane, signal: sig });
                          showToast(`${lane} → ${sig}`);
                        }}
                      >{sig[0].toUpperCase()}</button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="ticker">
          <div><span>▶</span>YOLO v8 Real-Time Object Detection</div>
          <div><span>▶</span>Deep Learning Signal Optimization</div>
          <div><span>▶</span>4-Way Intersection Control</div>
          <div><span>▶</span>WebSocket Live Updates</div>
          <div><span>▶</span>Q-Learning Reinforcement Agent</div>
          <div><span>▶</span>{new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
