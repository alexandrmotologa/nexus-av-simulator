import React, { useRef } from 'react';
import { TRACK_PRESETS } from '../core/world/TrackPresets';
import { WeatherMode } from '../core/engine/Simulation';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  Layers,
  Zap,
  Sun,
  CloudRain,
  Moon,
  CloudFog,
  Construction,
  Trash2,
  Download,
  Upload,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Box,
  FileSpreadsheet,
  FileJson,
  PenTool,
} from 'lucide-react';

interface ControlPanelProps {
  timeScale: number;
  onSetTimeScale: (scale: number) => void;
  selectedTrackId: string;
  onSelectTrack: (trackId: string) => void;
  isTrackEditorOpen?: boolean;
  onToggleTrackEditor?: () => void;
  trafficDensity: number;
  onSetTrafficDensity: (count: number) => void;
  showLidar: boolean;
  onToggleLidar: () => void;
  showDividers: boolean;
  onToggleDividers: () => void;
  showBoundingBoxes: boolean;
  onToggleBoundingBoxes: () => void;
  onReset: () => void;
  onFastTrain: (gens: number) => void;
  isTraining: boolean;
  weather: WeatherMode;
  onSetWeather: (mode: WeatherMode) => void;
  sandboxActive: boolean;
  onToggleSandbox: () => void;
  obstacleCount: number;
  onClearObstacles: () => void;
  onExportBrain: () => void;
  onImportBrain: (file: File) => void;
  onDownloadCSV: () => void;
  onDownloadJSON: () => void;
  isCameraLocked: boolean;
  onSnapCamera: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  timeScale,
  onSetTimeScale,
  selectedTrackId,
  onSelectTrack,
  isTrackEditorOpen,
  onToggleTrackEditor,
  trafficDensity,
  onSetTrafficDensity,
  showLidar,
  onToggleLidar,
  showDividers,
  onToggleDividers,
  showBoundingBoxes,
  onToggleBoundingBoxes,
  onReset,
  onFastTrain,
  isTraining,
  weather,
  onSetWeather,
  sandboxActive,
  onToggleSandbox,
  obstacleCount,
  onClearObstacles,
  onExportBrain,
  onImportBrain,
  onDownloadCSV,
  onDownloadJSON,
  isCameraLocked,
  onSnapCamera,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isMuted,
  onToggleMute,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportBrain(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/95 border border-slate-800 rounded-xl px-3.5 py-2 shadow-2xl backdrop-blur-md">
      {/* 1. Time Control Bar */}
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
          <span className="hidden sm:inline">{isTraining ? 'Training...' : '+25 Gens'}</span>
        </button>
      </div>

      {/* 2. Track Preset Selector */}
      <div className="flex items-center gap-1.5 text-xs">
        <select
          value={selectedTrackId}
          onChange={(e) => onSelectTrack(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-medium text-xs focus:outline-none focus:border-sky-500"
        >
          {TRACK_PRESETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {onToggleTrackEditor && (
          <button
            onClick={onToggleTrackEditor}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              isTrackEditorOpen
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Interactive Spline Track Builder & Road Network Editor"
          >
            <PenTool className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xl:inline">{isTrackEditorOpen ? 'Close Builder' : 'Track Builder'}</span>
          </button>
        )}
      </div>

      {/* 3. Weather Atmosphere Modes */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => onSetWeather('DRY')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
            weather === 'DRY'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Sunny & Dry: 100% Tire Grip"
        >
          <Sun className="w-3 h-3 text-amber-400" />
          <span className="hidden md:inline">Dry</span>
        </button>

        <button
          onClick={() => onSetWeather('WET')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
            weather === 'WET'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Rain & Wet: Reduced Grip & High Lateral Drift"
        >
          <CloudRain className="w-3 h-3 text-blue-400" />
          <span className="hidden md:inline">Wet</span>
        </button>

        <button
          onClick={() => onSetWeather('NIGHT')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
            weather === 'NIGHT'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Cyberpunk Night: Dynamic Headlights & Neon Track Glow"
        >
          <Moon className="w-3 h-3 text-purple-400" />
          <span className="hidden md:inline">Night</span>
        </button>

        <button
          onClick={() => onSetWeather('FOG')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
            weather === 'FOG'
              ? 'bg-slate-500/30 text-slate-200 border border-slate-400/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Atmospheric Fog: Severely Truncated Headlight Range (11m) & LiDAR Scattering"
        >
          <CloudFog className="w-3 h-3 text-slate-300" />
          <span className="hidden md:inline">Fog</span>
        </button>
      </div>

      {/* 4. Sandbox Road Hazard Tools */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
        <button
          onClick={onToggleSandbox}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
            sandboxActive
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 ring-1 ring-orange-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Click anywhere on the road to place a traffic cone"
        >
          <Construction className="w-3 h-3 text-orange-400" />
          <span>{sandboxActive ? 'Drop: ON' : 'Cones'}</span>
          {obstacleCount > 0 && (
            <span className="ml-0.5 px-1 bg-orange-950 text-orange-400 rounded-full text-[10px] font-bold">
              {obstacleCount}
            </span>
          )}
        </button>

        {obstacleCount > 0 && (
          <button
            onClick={onClearObstacles}
            className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
            title="Clear All Cones"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 5. Traffic Density Control */}
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="text-slate-400 font-mono hidden xl:inline">NPCs:</span>
        <input
          type="range"
          min={0}
          max={65}
          value={trafficDensity}
          onChange={(e) => onSetTrafficDensity(parseInt(e.target.value))}
          className="w-20 accent-sky-500 cursor-pointer"
        />
        <span className="font-mono text-sky-400 min-w-[20px] font-semibold">{trafficDensity}</span>
      </div>

      {/* 6. AI Brain Hub: Export & Import */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
        <button
          onClick={onExportBrain}
          className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-sky-300 transition-colors text-xs font-medium"
          title="Download Current Champion Neural Brain (JSON)"
        >
          <Download className="w-3 h-3 text-sky-400" />
          <span className="hidden lg:inline">Export</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-emerald-300 transition-colors text-xs font-medium"
          title="Upload Saved Neural Brain Model (JSON)"
        >
          <Upload className="w-3 h-3 text-emerald-400" />
          <span className="hidden lg:inline">Import</span>
        </button>

        <button
          onClick={onDownloadCSV}
          className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-amber-300 transition-colors text-xs font-medium"
          title="Download Flight Recorder Telemetry Log (CSV)"
        >
          <FileSpreadsheet className="w-3 h-3 text-amber-400" />
          <span className="hidden sm:inline">CSV</span>
        </button>

        <button
          onClick={onDownloadJSON}
          className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-cyan-300 transition-colors text-xs font-medium"
          title="Download Full Diagnostic Incident Packet (JSON)"
        >
          <FileJson className="w-3 h-3 text-cyan-400" />
          <span className="hidden sm:inline">JSON</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* 7. Sensor & Camera Toggles */}
      <div className="flex items-center gap-1">
        {!isCameraLocked && (
          <button
            onClick={onSnapCamera}
            className="flex items-center gap-1 px-2 py-1.5 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-semibold animate-pulse"
            title="Recenter Camera on Lead Vehicle"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Recenter</span>
          </button>
        )}

        <button
          onClick={onToggleLidar}
          title="Toggle LiDAR Beams"
          className={`p-1.5 rounded-lg border text-xs font-medium transition-all ${
            showLidar
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          {showLidar ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onToggleDividers}
          title="Toggle Lane Dividers"
          className={`p-1.5 rounded-lg border text-xs font-medium transition-all ${
            showDividers
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleBoundingBoxes}
          title="Toggle Sensor Fusion 2D Bounding Boxes & Velocity Vectors"
          className={`p-1.5 rounded-lg border text-xs font-medium transition-all ${
            showBoundingBoxes
              ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={onZoomOut}
            title="Zoom Out (-)"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            title="Reset Zoom (Default Close-up)"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-all"
          >
            1x
          </button>
          <button
            onClick={onZoomIn}
            title="Zoom In (+)"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Procedural Audio Engine Toggle */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Audio (Synthesized EV Motor & ADAS)' : 'Mute Audio'}
          className={`p-1.5 rounded-lg border text-xs font-medium transition-all ${
            !isMuted
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onReset}
          title="Reset Simulation"
          className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-400 hover:border-rose-900 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
