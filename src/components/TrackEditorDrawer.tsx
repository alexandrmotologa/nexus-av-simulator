import React, { useState } from 'react';
import { TrackEditor } from '../core/world/TrackEditor';
import { TrackStorage } from '../core/world/TrackStorage';
import {
  PenTool,
  Check,
  X,
  Trash2,
  Plus,
  RotateCcw,
  Download,
  Upload,
  Split,
  Maximize2,
  Gauge,
} from 'lucide-react';

interface TrackEditorDrawerProps {
  editor: TrackEditor;
  isOpen: boolean;
  onClose: () => void;
  onApplyTrack: () => void;
}

export const TrackEditorDrawer: React.FC<TrackEditorDrawerProps> = ({
  editor,
  isOpen,
  onClose,
  onApplyTrack,
}) => {
  const [trackName, setTrackName] = useState('My Custom Circuit');
  const [laneCount, setLaneCount] = useState(editor.laneCount);
  const [isBidirectional, setIsBidirectional] = useState(editor.isBidirectional);
  const [speedLimit, setSpeedLimit] = useState(editor.defaultSpeedLimit);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isOpen) return null;

  const handleLaneChange = (count: number) => {
    setLaneCount(count);
    editor.laneCount = count;
    setRefreshKey((k) => k + 1);
  };

  const handleBidirectionalToggle = () => {
    const nextVal = !isBidirectional;
    setIsBidirectional(nextVal);
    editor.isBidirectional = nextVal;
    editor.oncomingLaneCount = nextVal ? 1 : 0;
    setRefreshKey((k) => k + 1);
  };

  const handleSpeedLimitChange = (limit: number) => {
    setSpeedLimit(limit);
    editor.defaultSpeedLimit = limit;
  };

  const handleSaveAndApply = () => {
    const serialized = editor.serialize(`track-${Date.now()}`, trackName);
    TrackStorage.saveTrack(serialized);
    onApplyTrack();
  };

  const handleExport = () => {
    const serialized = editor.serialize(`track-${Date.now()}`, trackName);
    TrackStorage.exportJSON(serialized);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const imported = TrackStorage.importJSON(text);
        if (imported) {
          editor.deserialize(imported);
          setTrackName(imported.name);
          setLaneCount(imported.laneCount);
          setIsBidirectional(imported.isBidirectional);
          setSpeedLimit(imported.speedLimit);
          setRefreshKey((k) => k + 1);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="absolute top-20 left-4 z-40 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-4 font-mono text-xs text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2 text-sky-400 font-bold uppercase tracking-wider">
          <PenTool className="w-4 h-4 text-sky-400" />
          <span>Interactive Track Builder</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3.5">
        {/* Track Name */}
        <div>
          <label className="text-[10px] uppercase text-slate-400 block mb-1">Circuit Name</label>
          <input
            type="text"
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          />
        </div>

        {/* Waypoint Stats & Actions */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Waypoints:</span>
            <span className="font-bold text-sky-400">{editor.waypoints.length} nodes</span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed mb-2.5">
            • <b>Click on canvas</b> to place or insert a new waypoint.<br />
            • <b>Drag a node</b> to adjust curve curvature.<br />
            • <b>Select + Delete</b> to remove a node.
          </p>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                editor.resetToDefaultLoop();
                setRefreshKey((k) => k + 1);
              }}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
              title="Reset to smooth standard loop"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>

            {editor.selectedIndex >= 0 && (
              <button
                onClick={() => {
                  editor.removeWaypoint(editor.selectedIndex);
                  setRefreshKey((k) => k + 1);
                }}
                className="flex items-center justify-center gap-1 px-3 py-1 rounded bg-rose-950/70 border border-rose-800/60 hover:bg-rose-900 text-rose-300 text-[11px]"
                title="Delete Selected Node"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Node</span>
              </button>
            )}
          </div>
        </div>

        {/* Road Configuration */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase text-slate-400 block mb-1">Lanes</label>
            <div className="flex items-center gap-1">
              {[2, 3, 4, 6].map((num) => (
                <button
                  key={num}
                  onClick={() => handleLaneChange(num)}
                  className={`flex-1 py-1 rounded border text-[11px] font-bold ${
                    laneCount === num
                      ? 'bg-sky-600 border-sky-400 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-slate-400 block mb-1">Speed Limit</label>
            <div className="flex items-center gap-1">
              {[60, 90, 120].map((lim) => (
                <button
                  key={lim}
                  onClick={() => handleSpeedLimitChange(lim)}
                  className={`flex-1 py-1 rounded border text-[11px] font-bold ${
                    speedLimit === lim
                      ? 'bg-amber-600 border-amber-400 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {lim}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bidirectional Mode Toggle */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
          <div className="flex items-center gap-1.5">
            <Split className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px]">Two-Way Traffic:</span>
          </div>
          <button
            onClick={handleBidirectionalToggle}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
              isBidirectional
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {isBidirectional ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* JSON Import/Export */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
          <button
            onClick={handleExport}
            className="flex-1 flex items-center justify-center gap-1 py-1 text-slate-400 hover:text-sky-300 transition-colors text-[11px]"
          >
            <Download className="w-3 h-3" />
            <span>Export JSON</span>
          </button>

          <label className="flex-1 flex items-center justify-center gap-1 py-1 text-slate-400 hover:text-emerald-300 transition-colors text-[11px] cursor-pointer">
            <Upload className="w-3 h-3" />
            <span>Import JSON</span>
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>

        {/* Build & Test Simulator Circuit Button */}
        <button
          onClick={handleSaveAndApply}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/60 transition-all"
        >
          <Check className="w-4 h-4" />
          <span>BUILD & DRIVE CUSTOM CIRCUIT</span>
        </button>
      </div>
    </div>
  );
};
