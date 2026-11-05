import React from 'react';
import { SimulationTelemetry, PilotMode } from '../core/engine/Simulation';
import { Gauge, Navigation, Compass, Cpu, User, Bot, AlertTriangle, Zap, Sparkles, ShieldAlert, Swords } from 'lucide-react';

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

        <button
          onClick={() => onSetPilotMode('DUEL')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            telemetry.pilotMode === 'DUEL'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/25 ring-1 ring-rose-400 animate-pulse'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Grand Prix Tri-Duel: Deep RL vs. NeuroBot GA vs. Stanley Robot"
        >
          <Swords className="w-3.5 h-3.5 text-rose-300" />
          <span>Tri-Duel GP</span>
        </button>
      </div>

      {/* Primary Telemetry Readouts */}
      <div className="flex items-center gap-5 text-slate-200 font-mono text-sm">
        {/* Speedometer & Legal Speed Limit Sign */}
        <div className="flex items-center gap-3">
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

          {/* Roadside Speed Limit Sign HUD Indicator */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
            <div
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-[11px] shadow-md transition-all ${
                telemetry.speedCompliance === 'SPEEDING'
                  ? 'border-red-500 bg-red-950/60 text-red-200 animate-pulse ring-2 ring-red-500/50'
                  : telemetry.speedCompliance === 'WARNING'
                  ? 'border-amber-500 bg-amber-950/40 text-amber-200'
                  : 'border-red-500/80 bg-slate-950 text-white'
              }`}
              title={`Active Track Sector Speed Limit: ${telemetry.activeSpeedLimit || 90} km/h`}
            >
              {telemetry.activeSpeedLimit || 90}
            </div>
            <div className="hidden md:block">
              <div className="text-[9px] uppercase tracking-wider text-slate-500">Limit</div>
              <div
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  telemetry.speedCompliance === 'SPEEDING'
                    ? 'text-red-400'
                    : telemetry.speedCompliance === 'WARNING'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {telemetry.speedCompliance === 'SPEEDING'
                  ? 'Overspeed'
                  : telemetry.speedCompliance === 'WARNING'
                  ? 'At Limit'
                  : 'Legal'}
              </div>
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

        {/* Tire Thermal Model HUD Gauge */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-slate-800" title="Tire Compound Thermodynamic Surface Temperature">
          <div
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center text-[10px] sm:text-xs font-bold ${
              telemetry.tireStatus === 'OVERHEATED'
                ? 'bg-rose-950/70 border-rose-500 text-rose-300 animate-pulse ring-1 ring-rose-500/50'
                : telemetry.tireStatus === 'OPTIMAL'
                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                : 'bg-cyan-950/50 border-cyan-600/60 text-cyan-300'
            }`}
          >
            {Math.round(telemetry.tireTemp || 30)}°
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Tire Temp</div>
            <div
              className={`text-[10px] font-bold uppercase tracking-wider ${
                telemetry.tireStatus === 'OVERHEATED'
                  ? 'text-rose-400'
                  : telemetry.tireStatus === 'OPTIMAL'
                  ? 'text-emerald-400'
                  : 'text-cyan-400'
              }`}
            >
              {telemetry.tireStatus || 'COLD'}
            </div>
          </div>
        </div>

        {/* Blind Spot Detection (BSD) Wing Mirror Indicators */}
        {telemetry.blindSpot && (
          <div className="flex items-center gap-1 sm:gap-1.5 pl-2 border-l border-slate-800" title="Blind Spot Detection (BSD) Radar Monitors">
            <div
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold tracking-wider uppercase border transition-all ${
                telemetry.blindSpot.leftCritical
                  ? 'border-red-500 bg-red-950/80 text-red-200 animate-bounce ring-2 ring-red-500'
                  : telemetry.blindSpot.leftOccupied
                  ? 'border-amber-500 bg-amber-950/50 text-amber-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-600'
              }`}
            >
              ◀ BSD-L {telemetry.blindSpot.leftOccupied ? `${telemetry.blindSpot.closestLeftDistance}m` : 'OK'}
            </div>
            <div
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold tracking-wider uppercase border transition-all ${
                telemetry.blindSpot.rightCritical
                  ? 'border-red-500 bg-red-950/80 text-red-200 animate-bounce ring-2 ring-red-500'
                  : telemetry.blindSpot.rightOccupied
                  ? 'border-amber-500 bg-amber-950/50 text-amber-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-600'
              }`}
            >
              BSD-R {telemetry.blindSpot.rightOccupied ? `${telemetry.blindSpot.closestRightDistance}m` : 'OK'} ▶
            </div>
          </div>
        )}

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

      {/* Manual Driver Instructions Banner & Level 2+ Co-Pilot Active Interventions */}
      {telemetry.pilotMode === 'HUMAN_DRIVER' && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded text-xs text-amber-300 font-mono">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Drive: [W] Throttle · [S] Brake · [A/D] Steer</span>
          </div>

          {telemetry.coPilotIntervention?.isIntervening && (
            <div className="flex items-center gap-2 bg-rose-500/20 border border-rose-500 px-3 py-1 rounded text-xs text-rose-200 font-mono animate-pulse ring-2 ring-rose-500/50 shadow-lg">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span className="font-bold">{telemetry.coPilotIntervention.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
