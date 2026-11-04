import React from 'react';
import { QLearningStats, ACTION_NAMES } from '../core/ai/DeepQLearning';
import { AlertCircle, ShieldCheck, Flame, TrendingDown, Target, Save, RotateCcw } from 'lucide-react';

interface MistakeLearningHUDProps {
  stats: QLearningStats | undefined;
  className?: string;
  onResetMemory?: () => void;
}

export const MistakeLearningHUD: React.FC<MistakeLearningHUDProps> = ({ stats, className = '', onResetMemory }) => {
  if (!stats) return null;

  return (
    <div className={`flex flex-col bg-slate-900/95 border border-cyan-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-xs text-slate-200 max-w-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[13px]">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span>MISTAKE-LEARNING RL AGENT</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
            stats.learningPhase === 'Exploring'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : stats.learningPhase === 'Correcting Mistakes'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          }`}
        >
          {stats.learningPhase}
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        {/* Mistakes Analyzed */}
        <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Mistakes Studied</div>
            <div className="text-sm font-bold text-rose-400">{stats.totalMistakes}</div>
          </div>
        </div>

        {/* Mistakes Avoided */}
        <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Mistakes Avoided</div>
            <div className="text-sm font-bold text-emerald-400">{stats.mistakesAvoided}</div>
          </div>
        </div>

        {/* TD Loss */}
        <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
            <TrendingDown className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Bellman Loss</div>
            <div className="text-sm font-bold text-indigo-300">{stats.currentLoss}</div>
          </div>
        </div>

        {/* Epsilon */}
        <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-sky-950/80 border border-sky-800/80 flex items-center justify-center text-sky-400">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Exploration (ε)</div>
            <div className="text-sm font-bold text-sky-300">{(stats.epsilon * 100).toFixed(1)}%</div>
          </div>
        </div>
      </div>

      {/* Last Mistake Feedback Banner */}
      <div className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] mb-2.5">
        <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
        <div>
          <span className="text-slate-400">Last Correction: </span>
          <span className="text-rose-300 font-semibold">{stats.lastMistakeReason}</span>
        </div>
      </div>

      {/* Q-Value Action Distribution */}
      <div>
        <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1 flex items-center justify-between">
          <span>Q-Value Action Evaluation</span>
          <span className="text-cyan-400 text-[10px]">Active: {stats.chosenActionName}</span>
        </div>
        <div className="space-y-1 bg-slate-950/70 p-1.5 rounded-lg border border-slate-800/80">
          {ACTION_NAMES.map((action, idx) => {
            const q = stats.qValues[idx] || 0;
            const isChosen = stats.chosenActionName === action;
            // Normalize q for visual bar
            const barWidth = Math.max(4, Math.min(100, (q + 30) * 1.4));

            return (
              <div key={action} className="flex items-center text-[10px] gap-1.5">
                <span className={`w-28 truncate ${isChosen ? 'text-cyan-300 font-bold' : 'text-slate-400'}`}>
                  {action}
                </span>
                <div className="flex-1 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      isChosen
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                        : q < 0
                        ? 'bg-rose-500/50'
                        : 'bg-slate-700'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className={`w-10 text-right ${isChosen ? 'text-cyan-300 font-bold' : 'text-slate-500'}`}>
                  {q > 0 ? `+${q}` : q}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Memory Persistence Footer */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800 text-[10px] text-slate-500">
        <div className="flex items-center gap-1 text-emerald-400">
          <Save className="w-3 h-3 text-emerald-400" />
          <span>Local Memory: Active & Auto-Saved</span>
        </div>
        {onResetMemory && (
          <button
            onClick={onResetMemory}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800 rounded transition-all"
            title="Wipe LocalStorage Brain Checkpoint & Restart Learning"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  );
};
