import React, { useState } from 'react';
import { LeaderboardEntry } from '../core/engine/Simulation';
import { Trophy, TrendingUp, ChevronUp, ChevronDown, Award } from 'lucide-react';

interface AnalyticsDrawerProps {
  fitnessHistory: { gen: number; fitness: number; speed: number }[];
  leaderboard: LeaderboardEntry[];
  pilotMode: string;
}

export const AnalyticsDrawer: React.FC<AnalyticsDrawerProps> = ({
  fitnessHistory,
  leaderboard,
  pilotMode,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Compute SVG chart points
  const maxFitness = Math.max(10, ...fitnessHistory.map((h) => h.fitness));
  const chartW = 280;
  const chartH = 75;

  let sparklinePoints = '';
  if (fitnessHistory.length > 1) {
    sparklinePoints = fitnessHistory
      .map((h, i) => {
        const x = (i / (fitnessHistory.length - 1)) * chartW;
        const y = chartH - (Math.max(0, h.fitness) / maxFitness) * (chartH - 10) - 5;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden font-mono text-xs text-slate-200 transition-all">
      {/* Header bar toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-950/80 hover:bg-slate-900 text-sky-400 font-semibold text-xs border-b border-slate-800 transition-all"
      >
        <div className="flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>RACE ANALYTICS & LEADERBOARD</span>
          {leaderboard.length > 0 && (
            <span className="text-[10px] text-slate-400 font-normal">
              ({leaderboard.length} cars ranked)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <span>{isOpen ? 'Hide' : 'Show'}</span>
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 flex flex-col gap-3 max-w-sm">
          {/* Evolution Fitness Sparkline */}
          {fitnessHistory.length > 1 ? (
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between text-[11px] mb-1.5 text-slate-400">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span>Evolution Fitness Curve</span>
                </div>
                <span>Peak: {maxFitness} pts</span>
              </div>
              <svg width={chartW} height={chartH} className="w-full overflow-visible">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Horizontal baseline */}
                <line x1="0" y1={chartH - 5} x2={chartW} y2={chartH - 5} stroke="#334155" strokeDasharray="2,3" />
                {/* Sparkline polyline */}
                {sparklinePoints && (
                  <>
                    <polygon
                      points={`0,${chartH} ${sparklinePoints} ${chartW},${chartH}`}
                      fill="url(#chartGrad)"
                    />
                    <polyline
                      points={sparklinePoints}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}
              </svg>
            </div>
          ) : (
            <div className="p-2 text-[11px] text-slate-500 italic bg-slate-950/40 rounded border border-slate-800/60">
              Evolution curve records automatically as generations advance.
            </div>
          )}

          {/* Top 5 Racing Champions */}
          {leaderboard.length > 0 ? (
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Award className="w-3 h-3 text-amber-400" />
                <span>Top Active Racers</span>
              </div>
              <div className="flex flex-col gap-1">
                {leaderboard.map((car) => (
                  <div
                    key={car.name}
                    className="flex items-center justify-between px-2 py-1.5 bg-slate-950/70 border border-slate-800/80 rounded text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] ${
                          car.rank === 1
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : car.rank === 2
                            ? 'bg-slate-300 text-slate-950'
                            : car.rank === 3
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {car.rank}
                      </span>
                      <span className="font-semibold text-slate-200">{car.name}</span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-slate-400 text-[10px]">
                      <span className="text-sky-300">{car.speed} km/h</span>
                      <span className="text-emerald-300">+{car.distance}m</span>
                      <span className="text-amber-300 font-bold">{car.fitness} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 italic">
              Switch to Neuro AI (GA) to observe live fleet leaderboard rankings.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
