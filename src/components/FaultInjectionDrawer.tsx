import React, { useState } from 'react';
import { FaultInjectionEngine } from '../core/faults/FaultInjectionEngine';
import { AlertTriangle, ShieldAlert, X, RotateCcw, EyeOff, Sun, Radio, Activity } from 'lucide-react';

interface FaultInjectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FaultInjectionDrawer: React.FC<FaultInjectionDrawerProps> = ({ isOpen, onClose }) => {
  const engine = FaultInjectionEngine.getInstance();
  const [, setRefresh] = useState(0);

  if (!isOpen) return null;

  const toggle = (fn: () => void) => {
    fn();
    setRefresh((k) => k + 1);
  };

  const handleReset = () => {
    engine.resetAll();
    setRefresh((k) => k + 1);
  };

  const activeCount = engine.getActiveFaultCount();

  return (
    <div className="absolute top-20 right-4 z-40 w-84 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-4 font-mono text-xs text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>ISO 26262 Fault Injection</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mb-3">
        Stress-test AV perception and fail-safe safety shields with real-time sensor & actuator degradation.
      </p>

      {/* Fault Toggles */}
      <div className="space-y-2.5">
        {/* Camera Faults */}
        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <EyeOff className="w-3 h-3 text-sky-400" />
            <span>Optical Camera Degeneracy</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggle(() => (engine.config.cameraLensDirt = !engine.config.cameraLensDirt))}
              className={`flex-1 py-1 px-2 rounded text-[11px] font-semibold border transition-all ${
                engine.config.cameraLensDirt
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              Mud Splatter
            </button>
            <button
              onClick={() => toggle(() => (engine.config.cameraSunGlare = !engine.config.cameraSunGlare))}
              className={`flex-1 py-1 px-2 rounded text-[11px] font-semibold border transition-all ${
                engine.config.cameraSunGlare
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              Direct Solar Glare
            </button>
          </div>
        </div>

        {/* LiDAR Faults */}
        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span>LiDAR Perception Degradation</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => toggle(() => (engine.config.lidarBlindSector = !engine.config.lidarBlindSector))}
              className={`flex-1 py-1 px-2 rounded text-[11px] font-semibold border transition-all ${
                engine.config.lidarBlindSector
                  ? 'bg-red-500/20 text-red-300 border-red-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              90° Blind Sector
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Range Jitter / Noise:</span>
            <span className="text-slate-200 font-bold">{engine.config.lidarGaussianNoise}m</span>
          </div>
          <input
            type="range"
            min={0}
            max={2.5}
            step={0.5}
            value={engine.config.lidarGaussianNoise}
            onChange={(e) => toggle(() => (engine.config.lidarGaussianNoise = parseFloat(e.target.value)))}
            className="w-full accent-emerald-500 mt-1 cursor-pointer"
          />
        </div>

        {/* Actuator Latency & Brake Fade */}
        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Activity className="w-3 h-3 text-purple-400" />
            <span>Chassis Actuator Lag</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Steering CAN Latency:</span>
            <span className="text-slate-200 font-bold">{Math.round(engine.config.steeringLagSeconds * 1000)}ms</span>
          </div>
          <input
            type="range"
            min={0}
            max={0.25}
            step={0.05}
            value={engine.config.steeringLagSeconds}
            onChange={(e) => toggle(() => (engine.config.steeringLagSeconds = parseFloat(e.target.value)))}
            className="w-full accent-purple-500 mt-1 mb-2 cursor-pointer"
          />

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Thermal Brake Fade:</span>
            <span className="text-slate-200 font-bold">{Math.round((1 - engine.config.brakeFadeMultiplier) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.0}
            step={0.1}
            value={engine.config.brakeFadeMultiplier}
            onChange={(e) => toggle(() => (engine.config.brakeFadeMultiplier = parseFloat(e.target.value)))}
            className="w-full accent-purple-500 mt-1 cursor-pointer"
          />
        </div>
      </div>

      {/* Footer Status & Reset */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3 mt-3">
        <div className="text-[10px]">
          Status:{' '}
          <span className={`font-bold ${activeCount > 0 ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
            {activeCount > 0 ? `${activeCount} FAULTS INJECTED` : 'NOMINAL ASIL-D'}
          </span>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-all"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};
