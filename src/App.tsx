import React, { useEffect, useRef, useState } from 'react';
import { SimulationEngine, PilotMode, SimulationTelemetry } from './core/engine/Simulation';
import { CanvasRenderer } from './renderer/CanvasRenderer';
import { Cockpit } from './components/Cockpit';
import { ControlPanel } from './components/ControlPanel';
import { BrainVisualizer } from './components/BrainVisualizer';
import { MistakeLearningHUD } from './components/MistakeLearningHUD';
import { TRACK_PRESETS } from './core/world/TrackPresets';
import { BrainCircuit, Maximize2, Minimize2 } from 'lucide-react';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  const [telemetry, setTelemetry] = useState<SimulationTelemetry>({
    pilotMode: 'NEUROEVOLUTION',
    trackName: TRACK_PRESETS[0].name,
    generation: 1,
    aliveCount: 35,
    totalAgents: 35,
    bestFitness: 0,
    currentBestSpeed: 0,
    currentBestDistance: 0,
    steerAngleDeg: 0,
    lateralG: 0,
    fps: 60,
    timeScale: 1,
  });

  const [timeScale, setTimeScale] = useState<number>(1.0);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(TRACK_PRESETS[0].id);
  const [trafficDensity, setTrafficDensity] = useState<number>(8);
  const [showLidar, setShowLidar] = useState<boolean>(true);
  const [showDividers, setShowDividers] = useState<boolean>(true);
  const [showBrainVis, setShowBrainVis] = useState<boolean>(true);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [hudView, setHudView] = useState<'auto' | 'synapse' | 'rl' | 'both'>('auto');

  // Initialize Engine and Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new SimulationEngine();
    const renderer = new CanvasRenderer(canvas);
    engineRef.current = engine;
    rendererRef.current = renderer;

    const handleResize = () => {
      renderer.resize(window.innerWidth, window.innerHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Keyboard handlers for manual driver & hotkeys
    const onKeyDown = (e: KeyboardEvent) => {
      engine.keysPressed.add(e.code);
      if (e.code === 'Space') {
        engine.timeScale = engine.timeScale === 0 ? 1 : 0;
        setTimeScale(engine.timeScale);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      engine.keysPressed.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Mouse wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      renderer.camera.targetZoom = Math.max(0.6, Math.min(6.0, renderer.camera.targetZoom * zoomFactor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Main Simulation & Render Loop
    let animId: number;
    let lastUiUpdate = 0;

    const loop = (timestamp: number) => {
      engine.update(timestamp);

      // Determine vehicle to follow
      let targetVehicle = null;
      let egoVehicles = [];
      let lidarSensors = [];

      if (engine.pilotMode === 'NEUROEVOLUTION') {
        targetVehicle = engine.geneticEngine.bestAgent?.vehicle || null;
        egoVehicles = engine.geneticEngine.population.map((a) => a.vehicle);
        lidarSensors = engine.geneticEngine.population.map((a) => a.sensor);
      } else if (engine.pilotMode === 'DEEP_RL_AGENT') {
        targetVehicle = engine.rlAgent.vehicle;
        egoVehicles = [engine.rlAgent.vehicle];
        lidarSensors = [engine.rlAgent.lidar];
      } else if (engine.pilotMode === 'CLASSIC_ROBOTICS') {
        targetVehicle = engine.classicVehicle;
        egoVehicles = [engine.classicVehicle];
        lidarSensors = [null];
      } else {
        targetVehicle = engine.humanVehicle;
        egoVehicles = [engine.humanVehicle];
        lidarSensors = [engine.humanLidar];
      }

      if (targetVehicle) {
        renderer.camera.follow(targetVehicle.state.position, 0.016);
      }

      renderer.render(
        engine.track,
        egoVehicles,
        engine.trafficManager.getVehicles(),
        lidarSensors,
        {
          showLidar,
          showDividers,
          showWaypoints: false,
          showTrails: true,
          activeFollowVehicle: targetVehicle,
        }
      );

      // Throttle UI React state updates to 15 Hz for peak 60fps canvas performance
      if (timestamp - lastUiUpdate > 66) {
        setTelemetry(engine.getTelemetry());
        lastUiUpdate = timestamp;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [showLidar, showDividers]);

  const handleSetPilotMode = (mode: PilotMode) => {
    if (engineRef.current) {
      engineRef.current.setPilotMode(mode);
    }
  };

  const handleSetTimeScale = (scale: number) => {
    setTimeScale(scale);
    if (engineRef.current) {
      engineRef.current.timeScale = scale;
    }
  };

  const handleSelectTrack = (trackId: string) => {
    setSelectedTrackId(trackId);
    if (engineRef.current) {
      engineRef.current.setTrackPreset(trackId);
    }
  };

  const handleSetTrafficDensity = (count: number) => {
    setTrafficDensity(count);
    if (engineRef.current) {
      engineRef.current.setTrafficDensity(count);
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.setTrackPreset(selectedTrackId);
    }
  };

  const handleFastTrain = (gens: number) => {
    if (!engineRef.current || isTraining) return;
    setIsTraining(true);
    setTimeout(() => {
      engineRef.current?.runHeadlessGenerations(gens);
      setIsTraining(false);
    }, 20);
  };

  const handleResetRLMemory = () => {
    if (engineRef.current) {
      engineRef.current.rlAgent.resetMemory();
      setTelemetry(engineRef.current.getTelemetry());
    }
  };

  const showSynapse =
    hudView === 'synapse' ||
    hudView === 'both' ||
    (hudView === 'auto' && telemetry.pilotMode === 'NEUROEVOLUTION');

  const showRL =
    hudView === 'rl' ||
    hudView === 'both' ||
    (hudView === 'auto' && telemetry.pilotMode === 'DEEP_RL_AGENT');

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* 2D High-DPI Simulation Viewport */}
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-grab active:cursor-grabbing" />

      {/* Top Cockpit HUD */}
      <header className="absolute top-4 left-4 right-4 z-20 pointer-events-auto">
        <Cockpit telemetry={telemetry} onSetPilotMode={handleSetPilotMode} />
      </header>

      {/* Floating Dynamic HUD: Brain Synapses and/or Deep RL Mistake Learning */}
      <aside className="absolute right-4 top-20 z-20 pointer-events-auto flex flex-col items-end gap-2 max-h-[calc(100vh-120px)] overflow-y-auto no-scrollbar">
        {/* HUD Switcher Toolbar */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1 backdrop-blur-md shadow-xl text-xs font-medium">
          <button
            onClick={() => setHudView('auto')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
              hudView === 'auto' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
            title="Auto-switch based on active driving mode"
          >
            Auto
          </button>
          <button
            onClick={() => setHudView('synapse')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
              hudView === 'synapse' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
            title="Show Neural Synapse Monitor"
          >
            Synapse
          </button>
          <button
            onClick={() => setHudView('rl')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
              hudView === 'rl' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
            title="Show Mistake-Learning RL HUD"
          >
            Mistakes
          </button>
          <button
            onClick={() => setHudView('both')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
              hudView === 'both' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
            title="Show Both Inspector HUDs simultaneously"
          >
            Dual
          </button>
        </div>

        {/* Deep RL Mistake Learning HUD */}
        {showRL && (
          <div className="relative">
            <MistakeLearningHUD stats={telemetry.rlStats} onResetMemory={handleResetRLMemory} />
          </div>
        )}

        {/* Real-Time Neural Synapse Inspector */}
        {showSynapse && (
          <div className="relative">
            <BrainVisualizer brain={engineRef.current?.geneticEngine.bestAgent?.brain || null} />
          </div>
        )}
      </aside>

      {/* Bottom Mission Control Panel */}
      <footer className="absolute bottom-4 left-4 right-4 z-20 pointer-events-auto">
        <ControlPanel
          timeScale={timeScale}
          onSetTimeScale={handleSetTimeScale}
          selectedTrackId={selectedTrackId}
          onSelectTrack={handleSelectTrack}
          trafficDensity={trafficDensity}
          onSetTrafficDensity={handleSetTrafficDensity}
          showLidar={showLidar}
          onToggleLidar={() => setShowLidar(!showLidar)}
          showDividers={showDividers}
          onToggleDividers={() => setShowDividers(!showDividers)}
          onReset={handleReset}
          onFastTrain={handleFastTrain}
          isTraining={isTraining}
        />
      </footer>
    </div>
  );
}

export default App;
