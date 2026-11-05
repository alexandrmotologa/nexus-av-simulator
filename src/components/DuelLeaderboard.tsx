import React from 'react';
import { DuelContender } from '../core/engine/DuelManager';
import { Trophy, Zap, Flag, Timer } from 'lucide-react';

interface DuelLeaderboardProps {
  contenders: DuelContender[];
  raceTime: number;
  onSelectVehicle?: (id: string) => void;
  selectedId?: string;
}

export const DuelLeaderboard: React.FC<DuelLeaderboardProps> = ({
  contenders,
  raceTime,
  onSelectVehicle,
  selectedId,
}) => {
  return (
    <div className="absolute top-20 right-4 z-20 w-80 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-4 font-mono">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
          <Trophy className="w-4 h-4" />
          <span>Tri-Duel Championship</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <Timer className="w-3.5 h-3.5 text-sky-400" />
          <span>{raceTime.toFixed(1)}s</span>
        </div>
      </div>

      <div className="space-y-2">
        {contenders.map((c, idx) => {
          const isSelected = c.vehicle.config.id === selectedId;
          const isLeader = idx === 0;

          return (
            <div
              key={c.id}
              onClick={() => onSelectVehicle && onSelectVehicle(c.vehicle.config.id)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                isSelected
                  ? 'border-sky-500 bg-sky-950/40 ring-1 ring-sky-500/50'
                  : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {/* Position Badge */}
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${
                    idx === 0
                      ? 'bg-amber-500 text-slate-950'
                      : idx === 1
                      ? 'bg-slate-300 text-slate-950'
                      : 'bg-amber-800/80 text-amber-100'
                  }`}
                >
                  P{c.rank}
                </div>

                {/* Contender Meta */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="text-xs font-bold text-slate-200">{c.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {c.currentSpeedKmH} km/h · {Math.round(c.distance)}m
                  </div>
                </div>
              </div>

              {/* Gap to Leader */}
              <div className="text-right">
                <div
                  className={`text-[11px] font-bold ${
                    isLeader ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  {isLeader ? 'LEADER' : `+${c.gapSeconds}s`}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center justify-end gap-0.5">
                  <Flag className="w-2.5 h-2.5" />
                  <span>Lap {c.lapsCompleted + 1}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1 text-slate-400">
          <Zap className="w-3 h-3 text-emerald-400" /> Click competitor to lock camera
        </span>
      </div>
    </div>
  );
};
