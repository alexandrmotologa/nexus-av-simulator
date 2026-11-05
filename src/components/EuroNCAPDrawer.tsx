import React from 'react';
import { EuroNCAPScenarioType, EuroNCAPVerdict } from '../core/scenarios/EuroNCAPEngine';
import { ShieldCheck, AlertOctagon, X, RotateCcw, Play, Star, Gauge, Activity, Footprints, Snowflake } from 'lucide-react';

interface EuroNCAPDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onStartScenario: (type: EuroNCAPScenarioType) => void;
  onReset: () => void;
  verdict?: EuroNCAPVerdict | null;
  isRunning?: boolean;
  activeScenario?: EuroNCAPScenarioType;
  decelHistory?: { time: number; decelG: number }[];
}

export const EuroNCAPDrawer: React.FC<EuroNCAPDrawerProps> = ({
  isOpen,
  onClose,
  onStartScenario,
  onReset,
  verdict,
  isRunning = false,
  activeScenario = 'NONE',
  decelHistory = [],
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-20 right-4 z-40 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-4 font-mono text-xs text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Euro NCAP Safety Benchmark</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mb-3">
        Standardized active safety protocols certifying AEB collision avoidance and dynamic electronic stability control.
      </p>

      {/* Active Running Banner & Live Deceleration Telemetry Graph */}
      {isRunning && (
        <div className="mb-3 space-y-2">
          <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-500/50 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-[11px]">
              <Activity className="w-3.5 h-3.5 text-rose-400 animate-spin" />
              <span>TEST PROTOCOL IN PROGRESS...</span>
            </div>
            <span className="text-[10px] text-rose-400 font-semibold">{activeScenario}</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-rose-500/40 shadow-inner">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 font-bold">
              <span className="flex items-center gap-1.5 text-rose-400">
                <Gauge className="w-3.5 h-3.5 text-rose-400" /> DECELERATION TELEMETRY (G)
              </span>
              <span className="text-slate-200 font-mono">
                PEAK: {decelHistory.length > 0 ? Math.max(...decelHistory.map((d) => d.decelG)).toFixed(2) : '0.00'} G
              </span>
            </div>
            <div className="relative w-full h-14 bg-slate-900/80 rounded border border-slate-800 overflow-hidden flex items-end px-1 pb-1">
              <svg className="w-full h-full" viewBox="0 0 340 60" preserveAspectRatio="none">
                <line x1="0" y1="30" x2="340" y2="30" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                <polyline
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={
                    decelHistory.length > 1
                      ? decelHistory.map((d, i) => `${(i / (decelHistory.length - 1)) * 340},${Math.max(4, 56 - (d.decelG / 1.4) * 52)}`).join(' ')
                      : '0,56 340,56'
                  }
                />
              </svg>
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1 font-mono">
              <span>0.0s (Initiation)</span>
              <span className="text-rose-400 font-semibold">1.4G Threshold</span>
              <span>Live: {decelHistory.length > 0 ? decelHistory[decelHistory.length - 1].decelG.toFixed(2) : '0.00'} G</span>
            </div>
          </div>
        </div>
      )}

      {/* Scenarios Grid */}
      <div className="space-y-2.5 mb-4">
        {/* Scenario 1: Cut-In */}
        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-sky-400 text-xs">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              <span>1. Emergency Cut-In Maneuver</span>
            </div>
            <button
              disabled={isRunning}
              onClick={() => onStartScenario('CUT_IN_EMERGENCY')}
              className="flex items-center gap-1 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded text-[11px] font-semibold shadow transition-all"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Launch</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Target sedan in adjacent lane abruptly swerves directly into ego headway with &lt;6.5m gap. Tests AEB reaction time and clearance.
          </p>
        </div>

        {/* Scenario 2: Occluded VRU Pedestrian */}
        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-400 text-xs">
              <Footprints className="w-3.5 h-3.5 text-amber-400" />
              <span>2. Occluded Ghost Pedestrian</span>
            </div>
            <button
              disabled={isRunning}
              onClick={() => onStartScenario('OCCLUDED_PEDESTRIAN')}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded text-[11px] font-semibold shadow transition-all"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Launch</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            A pedestrian steps off from behind an occluding delivery van directly into ego trajectory at 24m headway. Tests sensor unmasking.
          </p>
        </div>

        {/* Scenario 3: Black Ice Friction Drop */}
        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-cyan-400 text-xs">
              <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
              <span>3. Black Ice Friction Drop (μ = 0.18)</span>
            </div>
            <button
              disabled={isRunning}
              onClick={() => onStartScenario('BLACK_ICE_LOW_GRIP')}
              className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded text-[11px] font-semibold shadow transition-all"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Launch</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Surface adhesion drops to 0.18 over a 35m corner sector. Tests electronic stability control (ESC) counter-steering and spinout avoidance.
          </p>
        </div>
      </div>

      {/* Latest Verdict Card */}
      {verdict && (
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 shadow-inner mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Euro NCAP Official Rating
            </span>
            {/* Stars */}
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= verdict.stars
                      ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                      : 'text-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <div
            className={`text-xs font-bold px-2 py-1 rounded mb-2 text-center tracking-wide ${
              verdict.stars >= 4
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                : verdict.stars >= 2
                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
            }`}
          >
            {verdict.ratingLabel}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10px] mb-2 font-mono">
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
              <div className="text-slate-400 text-[9px]">MIN CLEARANCE</div>
              <div className="font-bold text-slate-200">
                {verdict.minClearance > 50 ? 'N/A' : `+${verdict.minClearance}m`}
              </div>
            </div>
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
              <div className="text-slate-400 text-[9px]">MIN TTC</div>
              <div className="font-bold text-slate-200">
                {verdict.minTTC > 10 ? 'SAFE' : `${verdict.minTTC}s`}
              </div>
            </div>
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
              <div className="text-slate-400 text-[9px]">MAX DECEL</div>
              <div className="font-bold text-slate-200">{verdict.maxDecelG} G</div>
            </div>
          </div>

          <p className="text-[10px] text-slate-300 leading-normal bg-slate-900/60 p-2 rounded border border-slate-800/80 italic">
            "{verdict.notes}"
          </p>
        </div>
      )}

      {/* Footer Reset */}
      <div className="pt-2 border-t border-slate-800 flex justify-end">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Safety Test</span>
        </button>
      </div>
    </div>
  );
};
