import React from 'react';
import { PlatoonTelemetry } from '../core/v2v/V2VPlatoonManager';
import {
  Radio,
  X,
  Play,
  Square,
  Wind,
  Zap,
  ArrowLeftRight,
  Gauge,
  Clock,
  Layers,
  Activity,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';

interface PlatoonDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry?: PlatoonTelemetry;
  onTogglePlatoon: (active: boolean) => void;
  onSetSpeed: (speedKmh: number) => void;
  onSetHeadway: (headwaySec: number) => void;
  onTriggerManeuver: (direction: 'LEFT' | 'RIGHT') => void;
}

export const PlatoonDrawer: React.FC<PlatoonDrawerProps> = ({
  isOpen,
  onClose,
  telemetry,
  onTogglePlatoon,
  onSetSpeed,
  onSetHeadway,
  onTriggerManeuver,
}) => {
  if (!isOpen) return null;

  const isActive = telemetry?.isActive || false;
  const targetSpeed = telemetry?.targetSpeedKmh || 90;
  const headway = telemetry?.timeHeadwaySec || 0.65;

  return (
    <div className="absolute top-20 right-4 z-40 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-4 font-mono text-xs text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider">
          <Radio className={`w-4 h-4 ${isActive ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
          <span>V2V Cooperative Platoon</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mb-3">
        Simulated 5.9 GHz C-V2X mesh wireless communication enabling string-stable Cooperative Adaptive Cruise Control (CACC) and slipstream drafting.
      </p>

      {/* Main Activation Toggle */}
      <div className="mb-3.5">
        <button
          onClick={() => onTogglePlatoon(!isActive)}
          className={`w-full py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
            isActive
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/25 ring-1 ring-cyan-400'
          }`}
        >
          {isActive ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Disengage Connected Platoon</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Engage 4-Car V2V Platoon (CACC)</span>
            </>
          )}
        </button>
      </div>

      {/* Status & Aerodynamic Efficiency Card */}
      {isActive && (
        <>
          <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase">Platoon Status:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {telemetry?.currentManeuver || 'CONNECTED CACC CRUISE'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 text-center">
              <div>
                <div className="text-[9px] uppercase text-slate-400">Headway</div>
                <div className="text-sm font-bold text-cyan-300">{headway}s</div>
                <div className="text-[9px] text-slate-500">~{telemetry?.averageGapMeters || 8.5}m gap</div>
              </div>
              <div>
                <div className="text-[9px] uppercase text-slate-400">Drag Cut</div>
                <div className="text-sm font-bold text-emerald-400">
                  +{telemetry?.averageDraftSavingsPct || 18.5}%
                </div>
                <div className="text-[9px] text-slate-500">Slipstream</div>
              </div>
              <div>
                <div className="text-[9px] uppercase text-slate-400">V2V Mesh</div>
                <div className="text-sm font-bold text-sky-400">
                  {telemetry?.latencyMs || 14}ms
                </div>
                <div className="text-[9px] text-slate-500">@ 20 Hz C-V2X</div>
              </div>
            </div>
          </div>

          {/* Interactive Tuning Sliders */}
          <div className="space-y-2.5 mb-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
            {/* Speed slider */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-sky-400" /> Cruising Speed:
                </span>
                <span className="text-sky-300 font-bold">{targetSpeed} km/h</span>
              </div>
              <input
                type="range"
                min={30}
                max={120}
                step={5}
                value={targetSpeed}
                onChange={(e) => onSetSpeed(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>

            {/* Headway slider */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" /> Time-Headway Gap:
                </span>
                <span className="text-cyan-300 font-bold">{headway}s</span>
              </div>
              <input
                type="range"
                min={0.45}
                max={1.4}
                step={0.05}
                value={headway}
                onChange={(e) => onSetHeadway(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          </div>

          {/* Coordinated Maneuver Actions */}
          <div className="mb-3">
            <div className="text-[10px] uppercase text-slate-400 mb-1.5 flex items-center gap-1">
              <ArrowLeftRight className="w-3 h-3 text-emerald-400" /> Coordinated Platoon Overtake
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTriggerManeuver('LEFT')}
                disabled={telemetry?.isManeuverActive}
                className="py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 text-center transition-all disabled:opacity-40"
              >
                ◀ Pass Left
              </button>
              <button
                onClick={() => onTriggerManeuver('RIGHT')}
                disabled={telemetry?.isManeuverActive}
                className="py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 text-center transition-all disabled:opacity-40"
              >
                Pass Right ▶
              </button>
            </div>
          </div>

          {/* Member Fleet Table */}
          {telemetry?.members && telemetry.members.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-slate-400 mb-1">Convoy Formation</div>
              <div className="space-y-1">
                {telemetry.members.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-2 py-1 bg-slate-950/70 rounded border border-slate-800/80 text-[10px]"
                  >
                    <span className="font-semibold text-slate-300">
                      {idx === 0 ? '👑 Leader' : `🚗 Follower #${idx}`}
                    </span>
                    <span className="text-sky-300">{m.speedKmh} km/h</span>
                    {idx > 0 && <span className="text-slate-400">{m.gapMeters}m gap</span>}
                    <span className={idx === 0 ? 'text-slate-500' : 'text-emerald-400 font-bold'}>
                      {idx === 0 ? 'Lead Wind' : `-${m.draftPct}% Drag`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
