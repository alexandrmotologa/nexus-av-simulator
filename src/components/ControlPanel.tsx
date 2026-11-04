import React from 'react';
import { TRACK_PRESETS } from '../core/world/TrackPresets';
import { Play, Pause, FastForward, RotateCcw, Eye, EyeOff, Layers, Zap } from 'lucide-react';

interface ControlPanelProps {
  timeScale: number;
  onSetTimeScale: (scale: number) => void;
  selectedTrackId: string;
  onSelectTrack: (trackId: string) => void;
  trafficDensity: number;
  onSetTrafficDensity: (count: number) => void;
  showLidar: boolean;
  onToggleLidar: () => void;
  showDividers: boolean;
  onToggleDividers: () => void;
  onReset: () => void;
  onFastTrain: (gens: number) => void;
  isTraining: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  timeScale,
  onSetTimeScale,
  selectedTrackId,
  onSelectTrack,
  trafficDensity,
  onSetTrafficDensity,
  showLidar,
  onToggleLidar,
  showDividers,
  onToggleDividers,
  onReset,
  onFastTrain,
  isTraining,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 shadow-2xl backdrop-blur-md">
      {/* Time Control Bar */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => onSetTimeScale(timeScale === 0 ? 1 : 0)}
          title={timeScale === 0 ? 'Resume' : 'Pause'}
          className={`p-1.5 rounded text-xs font-semibold transition-all ${
            timeScale === 0 ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          {timeScale === 0 ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        {[1, 2, 5, 10].map((speed) => (
          <button
            key={speed}
            onClick={() => onSetTimeScale(speed)}
            className={`px-2 py-1 rounded text-xs font-mono font-semibold transition-all ${
              timeScale === speed
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {speed}x
          </button>
        ))}

        {/* Headless Fast Training Button */}
        <button
          onClick={() => onFastTrain(25)}
          disabled={isTraining}
          title="Simulate 25 generations immediately via pure CPU loop"
          className="flex items-center gap-1 ml-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded text-xs font-semibold transition-all disabled:opacity-50"
        >
          <Zap className="w-3 h-3 text-emerald-400" />
          <span>{isTraining ? 'Training...' : '+25 Gens (Fast)'}</span>
        </button>
      </div>

      {/* Track Preset Chooser */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400 font-mono hidden sm:inline">Track:</span>
        <select
          value={selectedTrackId}
          onChange={(e) => onSelectTrack(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-medium text-xs focus:outline-none focus:border-sky-500"
        >
          {TRACK_PRESETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.laneCount} lanes)
            </option>
          ))}
        </select>
      </div>

      {/* Traffic Density Control */}
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="text-slate-400 font-mono hidden md:inline">NPCs:</span>
        <input
          type="range"
          min={0}
          max={65}
          value={trafficDensity}
          onChange={(e) => onSetTrafficDensity(parseInt(e.target.value))}
          className="w-24 accent-sky-500 cursor-pointer"
        />
        <span className="font-mono text-sky-400 min-w-[22px] font-semibold">{trafficDensity}</span>
      </div>

      {/* Sensor / Display Toggles */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleLidar}
          title="Toggle LiDAR Beams"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            showLidar
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          {showLidar ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>LiDAR</span>
        </button>

        <button
          onClick={onToggleDividers}
          title="Toggle Lane Dividers"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            showDividers
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Lanes</span>
        </button>

        <button
          onClick={onReset}
          title="Reset Current Simulation"
          className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-400 hover:border-rose-900 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
