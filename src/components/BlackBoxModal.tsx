import React, { useState, useEffect, useRef } from 'react';
import { IncidentReport, BlackBoxFrame } from '../core/telemetry/BlackBoxRecorder';
import {
  AlertOctagon,
  X,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  Navigation,
  Compass,
  Zap,
} from 'lucide-react';

interface BlackBoxModalProps {
  incident: IncidentReport | null;
  onClose: () => void;
}

export const BlackBoxModal: React.FC<BlackBoxModalProps> = ({ incident, onClose }) => {
  if (!incident) return null;

  const [currentIndex, setCurrentIndex] = useState<number>(incident.frames.length - 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const frame: BlackBoxFrame = incident.frames[currentIndex] || incident.frames[0];

  // Playback timer (runs at 0.5x slow motion for diagnostic clarity)
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= incident.frames.length - 1) {
          setIsPlaying(false);
          return incident.frames.length - 1;
        }
        return prev + 1;
      });
    }, 33); // ~30 fps slow scrub

    return () => clearInterval(interval);
  }, [isPlaying, incident.frames.length]);

  // Mini trajectory render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Bounding box of trajectory
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of incident.frames) {
      if (f.position.x < minX) minX = f.position.x;
      if (f.position.x > maxX) maxX = f.position.x;
      if (f.position.y < minY) minY = f.position.y;
      if (f.position.y > maxY) maxY = f.position.y;
    }

    const padding = 20;
    const rangeX = Math.max(10, maxX - minX);
    const rangeY = Math.max(10, maxY - minY);
    const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);

    const toScreen = (pos: { x: number; y: number }) => ({
      x: padding + (pos.x - minX) * scale,
      y: height - (padding + (pos.y - minY) * scale),
    });

    // Draw trajectory path
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    incident.frames.forEach((f, i) => {
      const p = toScreen(f.position);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Draw path up to current scrub index
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= currentIndex; i++) {
      const p = toScreen(incident.frames[i].position);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Impact marker
    const impactP = toScreen(incident.frames[incident.frames.length - 1].position);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(impactP.x, impactP.y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Active scrub vehicle marker
    const curP = toScreen(frame.position);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(curP.x, curP.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [currentIndex, incident.frames, frame.position]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl shadow-red-950/40 overflow-hidden font-mono text-slate-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-red-950/30 border-b border-red-500/30">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-5 h-5 text-red-400 animate-pulse" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-red-300">
                Black Box Telemetry Flight Recorder
              </div>
              <div className="text-[11px] text-slate-400">
                Cause: <span className="text-white font-semibold">{incident.rootCause}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diagnostic Key Numbers */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950/50 border-b border-slate-800 text-center text-xs">
          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Impact Speed</div>
            <div className="text-xl font-bold text-red-400">
              {incident.impactSpeedKmH} <span className="text-xs font-normal text-slate-400">km/h</span>
            </div>
          </div>
          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Peak G-Force</div>
            <div className="text-xl font-bold text-amber-400">
              {incident.maxDecelG} <span className="text-xs font-normal text-slate-400">G</span>
            </div>
          </div>
          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Timeline Offset</div>
            <div className="text-xl font-bold text-sky-400">
              {frame.timeSec >= 0 ? `+${frame.timeSec.toFixed(2)}` : `${frame.timeSec.toFixed(2)}`}s
            </div>
          </div>
        </div>

        {/* 2D Trajectory Viewport & Scrub Telemetry */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Mini Trajectory Canvas */}
          <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-2 flex flex-col items-center justify-center">
            <div className="text-[10px] text-slate-500 uppercase self-start mb-1">
              Flight Path (Yellow = Scrub, Red = Impact)
            </div>
            <canvas ref={canvasRef} width={260} height={150} className="rounded" />
          </div>

          {/* Scrub Telemetry Dials */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Gauge className="w-3.5 h-3.5 text-sky-400" /> Velocity
              </span>
              <span className="text-sm font-bold text-white">{frame.speedKmH} km/h</span>
            </div>

            <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Navigation className="w-3.5 h-3.5 text-indigo-400" /> Steer Angle
              </span>
              <span className="text-sm font-bold text-white">{frame.steerAngleDeg > 0 ? `+${frame.steerAngleDeg}` : frame.steerAngleDeg}°</span>
            </div>

            <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Compass className="w-3.5 h-3.5 text-rose-400" /> Lateral / Decel
              </span>
              <span className="text-sm font-bold text-white">
                {frame.lateralG}G / {frame.longitudinalG}G
              </span>
            </div>

            {/* Inputs: Throttle & Brake */}
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-emerald-400">Throttle: {Math.round(frame.throttle * 100)}%</span>
                <span className="text-rose-400">Brake: {Math.round(frame.brake * 100)}%</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${frame.throttle * 100}%` }} />
                </div>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500" style={{ width: `${frame.brake * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Playback Controls & Timeline Scrubber */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>-4.0s (Pre-incident)</span>
            <span className="text-sky-300 font-semibold">{frame.timeSec.toFixed(2)}s</span>
            <span className="text-red-400">0.0s (Impact)</span>
          </div>

          <input
            type="range"
            min={0}
            max={incident.frames.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(parseInt(e.target.value, 10));
            }}
            className="w-full accent-red-500 cursor-pointer"
          />

          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex(0);
              }}
              title="Rewind to start"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg transition-all"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause' : 'Play 0.5x Slow-Mo'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
