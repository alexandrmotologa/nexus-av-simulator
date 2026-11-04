import React from 'react';
import { SimulationTelemetry, PilotMode } from '../core/engine/Simulation';
import { Gauge, Navigation, Compass, Cpu, User, Bot, AlertTriangle, Zap, Sparkles } from 'lucide-react';

interface CockpitProps {
  telemetry: SimulationTelemetry;
  onSetPilotMode: (mode: PilotMode) => void;
}

export const Cockpit: React.FC<CockpitProps> = ({ telemetry, onSetPilotMode }) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 shadow-2xl backdrop-blur-md">
      {/* Pilot Mode Switcher */}
      <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => onSetPilotMode('DEEP_RL_AGENT')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            telemetry.pilotMode === 'DEEP_RL_AGENT'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/25 ring-1 ring-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          <span>Self-Learning RL</span>
        </button>

        <button
          onClick={() => onSetPilotMode('NEUROEVOLUTION')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            telemetry.pilotMode === 'NEUROEVOLUTION'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Neuro AI (GA)</span>
        </button>

        <button
          onClick={() => onSetPilotMode('CLASSIC_ROBOTICS')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            telemetry.pilotMode === 'CLASSIC_ROBOTICS'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Stanley Robot</span>
        </button>

        <button
          onClick={() => onSetPilotMode('HUMAN_DRIVER')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            telemetry.pilotMode === 'HUMAN_DRIVER'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Manual (WASD)</span>
        </button>
      </div>

      {/* Primary Telemetry Readouts */}
      <div className="flex items-center gap-5 text-slate-200 font-mono text-sm">
        {/* Speedometer */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-sky-400">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Velocity</div>
            <div className="text-lg font-bold leading-tight">
              {telemetry.currentBestSpeed}{' '}
              <span className="text-xs font-normal text-slate-500">km/h</span>
            </div>
          </div>
        </div>

        {/* Steer Angle */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-indigo-400">
            <Navigation
              className="w-4 h-4 transition-transform duration-75"
              style={{ transform: `rotate(${telemetry.steerAngleDeg}deg)` }}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Steer Angle</div>
            <div className="text-lg font-bold leading-tight">
              {telemetry.steerAngleDeg > 0 ? `+${telemetry.steerAngleDeg}` : telemetry.steerAngleDeg}°
            </div>
          </div>
        </div>

        {/* Lateral G-Force */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-rose-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Lateral Force</div>
            <div className="text-lg font-bold leading-tight">
              {telemetry.lateralG}{' '}
              <span className="text-xs font-normal text-slate-500">G</span>
            </div>
          </div>
        </div>

        {/* Fleet / Alive Counter */}
        {telemetry.pilotMode === 'NEUROEVOLUTION' && (
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Gen {telemetry.generation}</div>
              <div className="text-lg font-bold leading-tight text-emerald-400">
                {telemetry.aliveCount}
                <span className="text-xs text-slate-500 font-normal">/{telemetry.totalAgents}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Driver Instructions Banner */}
      {telemetry.pilotMode === 'HUMAN_DRIVER' && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded text-xs text-amber-300 font-mono">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Drive: [W] Throttle · [S] Brake · [A/D] Steer</span>
        </div>
      )}
    </div>
  );
};
