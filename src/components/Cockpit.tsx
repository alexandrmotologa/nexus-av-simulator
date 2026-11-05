import React from 'react';
import { SimulationTelemetry, PilotMode } from '../core/engine/Simulation';
import { Gauge, Navigation, Compass, Cpu, User, Bot, AlertTriangle, Zap, Sparkles, ShieldAlert, Swords } from 'lucide-react';

interface CockpitProps {
  telemetry: SimulationTelemetry;
  onSetPilotMode: (mode: PilotMode) => void;
}

export const Cockpit: React.FC<CockpitProps> = ({ telemetry, onSetPilotMode }) => {
  return (
    <div className="flex flex-nowrap items-center justify-between gap-2.5 bg-slate-900/95 border border-slate-800 rounded-xl px-3.5 h-[52px] shadow-2xl backdrop-blur-md overflow-x-auto no-scrollbar select-none">
      {/* Pilot Mode Switcher */}
      <div className="flex-shrink-0 flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
        <button
          onClick={() => onSetPilotMode('DEEP_RL_AGENT')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
            telemetry.pilotMode === 'DEEP_RL_AGENT'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-500/25 ring-1 ring-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          <span className="hidden sm:inline">Self-Learning RL</span>
          <span className="sm:hidden">RL</span>
        </button>

        <button
          onClick={() => onSetPilotMode('NEUROEVOLUTION')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
            telemetry.pilotMode === 'NEUROEVOLUTION'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Neuro AI (GA)</span>
          <span className="sm:hidden">GA</span>
        </button>

        <button
          onClick={() => onSetPilotMode('CLASSIC_ROBOTICS')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
            telemetry.pilotMode === 'CLASSIC_ROBOTICS'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Stanley Robot</span>
          <span className="sm:hidden">Stanley</span>
        </button>

        <button
          onClick={() => onSetPilotMode('HUMAN_DRIVER')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
            telemetry.pilotMode === 'HUMAN_DRIVER'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Manual (WASD)</span>
          <span className="sm:hidden">Manual</span>
        </button>

        <button
          onClick={() => onSetPilotMode('DUEL')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
            telemetry.pilotMode === 'DUEL'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-500/25 ring-1 ring-rose-400 animate-pulse'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Grand Prix Tri-Duel: Deep RL vs. NeuroBot GA vs. Stanley Robot"
        >
          <Swords className="w-3.5 h-3.5 text-rose-300" />
          <span className="hidden sm:inline">Tri-Duel GP</span>
          <span className="sm:hidden">Duel</span>
        </button>
      </div>

      {/* Primary Telemetry Readouts */}
      <div className="flex-shrink-0 flex items-center gap-3.5 text-slate-200 font-mono text-sm">
        {/* Speedometer & Legal Speed Limit Sign */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-sky-400 flex-shrink-0">
              <Gauge className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="hidden xl:block text-[9px] uppercase tracking-wider text-slate-400 leading-none">Velocity</div>
              <div className="text-base font-bold tabular-nums leading-tight min-w-[56px]">
                {telemetry.currentBestSpeed}{' '}
                <span className="text-[10px] font-normal text-slate-500">km/h</span>
              </div>
            </div>
          </div>

          {/* Roadside Speed Limit Sign HUD Indicator */}
          <div className="flex items-center gap-1 pl-1.5 border-l border-slate-800 flex-shrink-0">
            <div
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-[11px] shadow-md transition-all flex-shrink-0 ${
                telemetry.speedCompliance === 'SPEEDING'
                  ? 'border-red-500 bg-red-950/60 text-red-200 animate-pulse ring-1 ring-red-500/50'
                  : telemetry.speedCompliance === 'WARNING'
                  ? 'border-amber-500 bg-amber-950/40 text-amber-200'
                  : 'border-red-500/80 bg-slate-950 text-white'
              }`}
              title={`Active Track Sector Speed Limit: ${telemetry.activeSpeedLimit || 90} km/h`}
            >
              {telemetry.activeSpeedLimit || 90}
            </div>
            <div className="hidden md:block">
              <div className="hidden xl:block text-[9px] uppercase tracking-wider text-slate-500 leading-none">Limit</div>
              <div
                className={`text-[9px] font-bold uppercase tracking-wider min-w-[48px] ${
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

          {/* Smart Infrastructure V2I Signal Phase & Green Wave Advisory */}
          {telemetry.v2iPacket &&
            telemetry.v2iPacket.distanceToStopLine > 0 &&
            telemetry.v2iPacket.distanceToStopLine < 100 && (
              <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-slate-800 flex-shrink-0" title="V2I Signal Phase & Timing with Green Wave Speed Advisory">
                <div
                  className={`w-3.5 h-3.5 rounded-full transition-all flex-shrink-0 ${
                    telemetry.v2iPacket.phase === 'GREEN'
                      ? 'bg-emerald-500 shadow-[0_0_8px_#22c55e]'
                      : telemetry.v2iPacket.phase === 'YELLOW'
                      ? 'bg-amber-400 shadow-[0_0_8px_#eab308]'
                      : 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                  }`}
                />
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 leading-none">
                    V2I {telemetry.v2iPacket.phase} {telemetry.v2iPacket.remainingTime}s
                  </div>
                  <div className="text-[10px] font-bold text-sky-400">
                    {telemetry.v2iPacket.recommendedSpeed
                      ? `Wave: ${telemetry.v2iPacket.recommendedSpeed} km/h`
                      : `${Math.round(telemetry.v2iPacket.distanceToStopLine)}m stop`}
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Steer Angle */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-indigo-400 flex-shrink-0">
            <Navigation
              className="w-3.5 h-3.5 transition-transform duration-75"
              style={{ transform: `rotate(${telemetry.steerAngleDeg}deg)` }}
            />
          </div>
          <div>
            <div className="hidden xl:block text-[9px] uppercase tracking-wider text-slate-400 leading-none">Steer Angle</div>
            <div className="text-base font-bold tabular-nums min-w-[50px] leading-tight">
              {telemetry.steerAngleDeg > 0 ? `+${telemetry.steerAngleDeg}` : telemetry.steerAngleDeg}°
            </div>
          </div>
        </div>

        {/* Lateral G-Force */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-rose-400 flex-shrink-0">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="hidden xl:block text-[9px] uppercase tracking-wider text-slate-400 leading-none">Lateral Force</div>
            <div className="text-base font-bold tabular-nums min-w-[48px] leading-tight">
              {telemetry.lateralG}{' '}
              <span className="text-[10px] font-normal text-slate-500">G</span>
            </div>
          </div>
        </div>

        {/* Tire Thermal Model HUD Gauge */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800 flex-shrink-0" title="Tire Compound Thermodynamic Surface Temperature">
          <div
            className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold tabular-nums flex-shrink-0 ${
              telemetry.tireStatus === 'OVERHEATED'
                ? 'bg-rose-950/70 border-rose-500 text-rose-300 animate-pulse ring-1 ring-rose-500/50'
                : telemetry.tireStatus === 'OPTIMAL'
                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                : 'bg-cyan-950/50 border-cyan-600/60 text-cyan-300'
            }`}
          >
            {Math.round(telemetry.tireTemp || 30)}°
          </div>
          <div className="hidden xl:block min-w-[62px]">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">Tire Temp</div>
            <div
              className={`text-[9px] font-bold uppercase tracking-wider truncate ${
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
          <div className="hidden lg:flex items-center gap-1 pl-2 border-l border-slate-800 flex-shrink-0" title="Blind Spot Detection (BSD) Radar Monitors">
            <div
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border transition-all ${
                telemetry.blindSpot.leftCritical
                  ? 'border-red-500 bg-red-950/80 text-red-200 animate-bounce ring-1 ring-red-500'
                  : telemetry.blindSpot.leftOccupied
                  ? 'border-amber-500 bg-amber-950/50 text-amber-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-600'
              }`}
            >
              ◀ BSD-L {telemetry.blindSpot.leftOccupied ? `${telemetry.blindSpot.closestLeftDistance}m` : 'OK'}
            </div>
            <div
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border transition-all ${
                telemetry.blindSpot.rightCritical
                  ? 'border-red-500 bg-red-950/80 text-red-200 animate-bounce ring-1 ring-red-500'
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
          <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-800 flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">Gen {telemetry.generation}</div>
              <div className="text-base font-bold tabular-nums leading-tight text-emerald-400 min-w-[42px]">
                {telemetry.aliveCount}
                <span className="text-[10px] text-slate-500 font-normal">/{telemetry.totalAgents}</span>
              </div>
            </div>
          </div>
        )}

        {/* ISO 2631 Passenger Comfort Index */}
        {telemetry.comfortScore !== undefined && (
          <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-slate-800 flex-shrink-0" title="ISO 2631 Passenger Ride Comfort (Jerk RMS Rate)">
            <div
              className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold tabular-nums flex-shrink-0 ${
                telemetry.comfortScore >= 85
                  ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
                  : telemetry.comfortScore >= 65
                  ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                  : 'bg-rose-950/70 border-rose-500 text-rose-300 animate-pulse'
              }`}
            >
              {telemetry.comfortScore}%
            </div>
            <div className="hidden lg:block min-w-[64px]">
              <div className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">Comfort</div>
              <div className="text-[9px] font-bold text-slate-300 truncate">{telemetry.comfortRating || 'SMOOTH'}</div>
            </div>
          </div>
        )}

        {/* EV Energy Efficiency (kWh/100km & Regen kW) */}
        {telemetry.energyKwhPer100Km !== undefined && (
          <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-slate-800 flex-shrink-0" title="Virtual EV Electric Economy & Regenerative Braking">
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">EV Economy</div>
              <div className="text-[11px] font-bold tabular-nums text-emerald-400">
                {telemetry.energyKwhPer100Km}{' '}
                <span className="text-[9px] font-normal text-slate-500">kWh/100km</span>
              </div>
            </div>
            {telemetry.regenPowerKw && telemetry.regenPowerKw > 0 ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse flex-shrink-0">
                +{telemetry.regenPowerKw}kW REGEN
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Manual Driver Instructions Banner & Level 2+ Co-Pilot Active Interventions */}
      {telemetry.pilotMode === 'HUMAN_DRIVER' && (
        <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded text-xs text-amber-300 font-mono flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Drive: [W] Throttle · [S] Brake · [A/D] Steer</span>
          </div>

          {telemetry.coPilotIntervention?.isIntervening && (
            <div className="flex items-center gap-1.5 bg-rose-500/20 border border-rose-500 px-2.5 py-1 rounded text-xs text-rose-200 font-mono animate-pulse ring-1 ring-rose-500/50 shadow-lg flex-shrink-0">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-bold">{telemetry.coPilotIntervention.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
