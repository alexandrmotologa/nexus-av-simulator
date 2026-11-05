import React, { useEffect, useRef, useState } from 'react';
import { SimulationEngine, PilotMode, SimulationTelemetry, WeatherMode } from './core/engine/Simulation';
import { CanvasRenderer } from './renderer/CanvasRenderer';
import { Cockpit } from './components/Cockpit';
import { ControlPanel } from './components/ControlPanel';
import { BrainVisualizer } from './components/BrainVisualizer';
import { MistakeLearningHUD } from './components/MistakeLearningHUD';
import { MiniMap } from './components/MiniMap';
import { AnalyticsDrawer } from './components/AnalyticsDrawer';
import { GGFrictionCircle } from './components/GGFrictionCircle';
import { TRACK_PRESETS } from './core/world/TrackPresets';
import { Vector2D } from './core/math/Vector2D';
import { VehicleModel } from './core/physics/VehicleModel';
import { SoundEngine } from './core/audio/SoundEngine';
import { BlackBoxModal } from './components/BlackBoxModal';
import { BlackBoxRecorder, IncidentReport } from './core/telemetry/BlackBoxRecorder';
import { SensorFusionEngine } from './core/sensors/SensorFusion';
import { DuelLeaderboard } from './components/DuelLeaderboard';
import { TelemetryExporter } from './core/telemetry/TelemetryExporter';
import { TrackEditor } from './core/world/TrackEditor';
import { TrackEditorDrawer } from './components/TrackEditorDrawer';
import { CameraFeedHUD } from './components/CameraFeedHUD';
import { FaultInjectionDrawer } from './components/FaultInjectionDrawer';
import { TelemetryBridge } from './core/telemetry/TelemetryBridge';
import { AlertOctagon } from 'lucide-react';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const followedVehicleRef = useRef<VehicleModel | null>(null);

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
    weather: 'DRY',
    obstacleCount: 0,
    fitnessHistory: [],
    leaderboard: [],
    activeSpeedLimit: 90,
    speedCompliance: 'OPTIMAL',
    longitudinalG: 0,
    isSkidding: false,
    tireTemp: 30.0,
    tireStatus: 'COLD',
    blindSpot: {
      leftOccupied: false,
      rightOccupied: false,
      leftCritical: false,
      rightCritical: false,
      closestLeftDistance: 0,
      closestRightDistance: 0,
    },
  });

  const [timeScale, setTimeScale] = useState<number>(1.0);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(TRACK_PRESETS[0].id);
  const [trafficDensity, setTrafficDensity] = useState<number>(8);
  const [showLidar, setShowLidar] = useState<boolean>(true);
  const [showDividers, setShowDividers] = useState<boolean>(true);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const fusionEngineRef = useRef<SensorFusionEngine>(new SensorFusionEngine());
  const [hudView, setHudView] = useState<'auto' | 'synapse' | 'rl' | 'both'>('auto');

  // New interactive states
  const [weather, setWeather] = useState<WeatherMode>('DRY');
  const [sandboxActive, setSandboxActive] = useState<boolean>(false);
  const [obstacleCount, setObstacleCount] = useState<number>(0);
  const [isCameraLocked, setIsCameraLocked] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true); // Audio engine initialized on user click
  const [activeIncident, setActiveIncident] = useState<IncidentReport | null>(null);
  const [showBlackBoxModal, setShowBlackBoxModal] = useState<boolean>(false);
  const [isTrackEditorOpen, setIsTrackEditorOpen] = useState<boolean>(false);
  const [isFaultDrawerOpen, setIsFaultDrawerOpen] = useState<boolean>(false);
  const trackEditorRef = useRef<TrackEditor>(new TrackEditor());
  const draggingWaypointRef = useRef<number>(-1);

  const handleToggleMute = () => {
    const nextMuted = SoundEngine.getInstance().toggleMute();
    setIsMuted(nextMuted);
  };

  // Mouse drag tracking refs
  const isMouseDownRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);

  // Touch gesture tracking for mobile pinch-to-zoom and pan
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(4.5);

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

    // Mouse wheel zoom with expanded range
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
      renderer.camera.zoomBy(zoomFactor);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Main Simulation & Render Loop
    let animId: number;
    let lastUiUpdate = 0;
    let lastFrameTime = performance.now();

    const loop = (timestamp: number) => {
      const realDt = Math.min(0.05, Math.max(0.001, (timestamp - lastFrameTime) / 1000));
      lastFrameTime = timestamp;

      engine.update(timestamp);

      // Determine default leader vehicle
      let defaultLeadVehicle: VehicleModel | null = null;
      let egoVehicles: VehicleModel[] = [];
      let lidarSensors = [];

      if (engine.pilotMode === 'NEUROEVOLUTION') {
        defaultLeadVehicle = engine.geneticEngine.bestAgent?.vehicle || null;
        egoVehicles = engine.geneticEngine.population.map((a) => a.vehicle);
        lidarSensors = engine.geneticEngine.population.map((a) => a.sensor);
      } else if (engine.pilotMode === 'DEEP_RL_AGENT') {
        defaultLeadVehicle = engine.rlAgent.vehicle;
        egoVehicles = [engine.rlAgent.vehicle];
        lidarSensors = [engine.rlAgent.lidar];
      } else if (engine.pilotMode === 'CLASSIC_ROBOTICS') {
        defaultLeadVehicle = engine.classicVehicle;
        egoVehicles = [engine.classicVehicle];
        lidarSensors = [null];
      } else if (engine.pilotMode === 'DUEL') {
        defaultLeadVehicle = engine.duelManager.contenders[0]?.vehicle || null;
        egoVehicles = engine.duelManager.getVehicles();
        lidarSensors = engine.duelManager.contenders.map((c) => c.lidar);
      } else {
        defaultLeadVehicle = engine.humanVehicle;
        egoVehicles = [engine.humanVehicle];
        lidarSensors = [engine.humanLidar];
      }

      // Check if selected followed vehicle is still valid
      let activeFollow = followedVehicleRef.current || defaultLeadVehicle;
      if (activeFollow && activeFollow.state.isDamaged && defaultLeadVehicle) {
        activeFollow = defaultLeadVehicle;
      }

      if (activeFollow) {
        renderer.camera.follow(activeFollow.state.position, realDt);
      }

      // 360-degree Sensor Fusion Object Tracking
      const trackedEntities = fusionEngineRef.current.trackSurroundingEntities(
        activeFollow || engine.humanVehicle,
        engine.trafficManager.getVehicles(),
        engine.obstacleManager.obstacles
      );

      renderer.render(
        engine.track,
        egoVehicles,
        engine.trafficManager.getVehicles(),
        lidarSensors,
        {
          showLidar,
          showDividers,
          showWaypoints: isTrackEditorOpen,
          showTrails: true,
          activeFollowVehicle: activeFollow,
          obstacles: engine.obstacleManager.obstacles,
          weather: engine.weather,
          showBoundingBoxes,
          trackedEntities,
          trafficLights: engine.intersectionManager.lights,
          crosswalks: engine.pedestrianManager.crosswalks,
          vrus: engine.pedestrianManager.vrus,
          trajectoryBest: engine.latestBestTrajectory,
          trajectoryCandidates: engine.latestCandidateTrajectories,
        }
      );

      // Throttle UI React state updates to 15 Hz for peak 60fps canvas performance
      if (timestamp - lastUiUpdate > 66) {
        const nextTelemetry = engine.getTelemetry();
        setTelemetry(nextTelemetry);
        setObstacleCount(engine.obstacleManager.obstacles.length);

        const activeEgo = activeFollow || engine.humanVehicle;
        TelemetryBridge.getInstance().broadcast(
          nextTelemetry,
          activeEgo.state.position,
          activeEgo.state.heading
        );

        const incident = BlackBoxRecorder.getInstance().activeIncident;
        if (incident && !activeIncident) {
          setActiveIncident(incident);
        }

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

  // Canvas Mouse Event Handlers for Drag Pan and Click to Follow / Add Obstacle / Edit Waypoints
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isMouseDownRef.current = true;
    isDraggingRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isTrackEditorOpen && rendererRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const screenPos = new Vector2D(e.clientX - rect.left, e.clientY - rect.top);
      const worldPos = rendererRef.current.camera.screenToWorld(screenPos);
      const nearWp = trackEditorRef.current.findNearestWaypoint(worldPos, 6.0);
      if (nearWp !== -1) {
        trackEditorRef.current.selectedIndex = nearWp;
        draggingWaypointRef.current = nearWp;
        setIsCameraLocked(false);
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDownRef.current || !rendererRef.current) return;

    if (isTrackEditorOpen && draggingWaypointRef.current !== -1 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const screenPos = new Vector2D(e.clientX - rect.left, e.clientY - rect.top);
      const worldPos = rendererRef.current.camera.screenToWorld(screenPos);
      trackEditorRef.current.moveWaypoint(draggingWaypointRef.current, worldPos);
      return;
    }

    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    const totalDrag = Math.hypot(e.clientX - dragStartPosRef.current.x, e.clientY - dragStartPosRef.current.y);
    if (totalDrag > 4) {
      isDraggingRef.current = true;
      rendererRef.current.camera.panBy(dx, dy);
      setIsCameraLocked(false);
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDownRef.current) return;
    isMouseDownRef.current = false;

    if (isTrackEditorOpen) {
      if (draggingWaypointRef.current !== -1) {
        draggingWaypointRef.current = -1;
        return;
      }
      if (!isDraggingRef.current && rendererRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenPos = new Vector2D(e.clientX - rect.left, e.clientY - rect.top);
        const worldPos = rendererRef.current.camera.screenToWorld(screenPos);
        trackEditorRef.current.addWaypoint(worldPos);
        return;
      }
    }

    // If it was a click without significant drag
    if (!isDraggingRef.current && rendererRef.current && engineRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const screenPos = new Vector2D(e.clientX - rect.left, e.clientY - rect.top);
      const worldPos = rendererRef.current.camera.screenToWorld(screenPos);

      if (sandboxActive) {
        // Drop traffic cone at click position
        engineRef.current.obstacleManager.addCone(worldPos);
        setObstacleCount(engineRef.current.obstacleManager.obstacles.length);
      } else {
        // Click to follow: find nearest vehicle
        const allCandidates: VehicleModel[] = [];
        if (engineRef.current.pilotMode === 'NEUROEVOLUTION') {
          allCandidates.push(...engineRef.current.geneticEngine.population.filter((a) => a.isAlive).map((a) => a.vehicle));
        } else if (engineRef.current.pilotMode === 'DEEP_RL_AGENT') {
          allCandidates.push(engineRef.current.rlAgent.vehicle);
        } else if (engineRef.current.pilotMode === 'CLASSIC_ROBOTICS') {
          allCandidates.push(engineRef.current.classicVehicle);
        } else {
          allCandidates.push(engineRef.current.humanVehicle);
        }
        allCandidates.push(...engineRef.current.trafficManager.getVehicles());

        let targetVehicle: VehicleModel | null = null;
        let minDistance = 5.0; // 5 meters tolerance

        for (const candidate of allCandidates) {
          const d = worldPos.distance(candidate.state.position);
          if (d < minDistance) {
            minDistance = d;
            targetVehicle = candidate;
          }
        }

        if (targetVehicle) {
          followedVehicleRef.current = targetVehicle;
          rendererRef.current.camera.lockTo(targetVehicle.state.position);
          setIsCameraLocked(true);
        }
      }
    }
  };

  const handleApplyCustomTrack = () => {
    if (!engineRef.current) return;
    const customTrack = trackEditorRef.current.buildTrack(`custom-${Date.now()}`, 'Custom Circuit');
    engineRef.current.setCustomTrack(customTrack);
    setSelectedTrackId('custom-circuit');
  };

  const handleZoomIn = () => {
    rendererRef.current?.camera.zoomIn();
  };

  const handleZoomOut = () => {
    rendererRef.current?.camera.zoomOut();
  };

  const handleResetZoom = () => {
    rendererRef.current?.camera.resetZoom();
  };

  // Touch event handlers for mobile responsiveness
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      isMouseDownRef.current = true;
      isDraggingRef.current = false;
      dragStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && rendererRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = rendererRef.current.camera.targetZoom;
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && isMouseDownRef.current && rendererRef.current) {
      const dx = e.touches[0].clientX - lastMousePosRef.current.x;
      const dy = e.touches[0].clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      const totalDrag = Math.hypot(
        e.touches[0].clientX - dragStartPosRef.current.x,
        e.touches[0].clientY - dragStartPosRef.current.y
      );
      if (totalDrag > 6) {
        isDraggingRef.current = true;
        rendererRef.current.camera.panBy(dx, dy);
        setIsCameraLocked(false);
      }
    } else if (e.touches.length === 2 && touchStartDistRef.current && rendererRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchStartDistRef.current;
      rendererRef.current.camera.targetZoom = Math.max(
        0.4,
        Math.min(28.0, touchStartZoomRef.current * factor)
      );
    }
  };

  const handleCanvasTouchEnd = () => {
    isMouseDownRef.current = false;
    touchStartDistRef.current = null;
  };

  const handleSnapCamera = () => {
    if (rendererRef.current && engineRef.current) {
      followedVehicleRef.current = null;
      let pos = engineRef.current.track.centerLine[0];
      if (engineRef.current.pilotMode === 'NEUROEVOLUTION') {
        pos = engineRef.current.geneticEngine.bestAgent?.vehicle.state.position || pos;
      } else if (engineRef.current.pilotMode === 'DEEP_RL_AGENT') {
        pos = engineRef.current.rlAgent.vehicle.state.position;
      } else if (engineRef.current.pilotMode === 'CLASSIC_ROBOTICS') {
        pos = engineRef.current.classicVehicle.state.position;
      } else {
        pos = engineRef.current.humanVehicle.state.position;
      }
      rendererRef.current.camera.lockTo(pos);
      setIsCameraLocked(true);
    }
  };

  const handleSetPilotMode = (mode: PilotMode) => {
    if (engineRef.current) {
      engineRef.current.setPilotMode(mode);
      followedVehicleRef.current = null;
      setIsCameraLocked(true);
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
      followedVehicleRef.current = null;
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
      followedVehicleRef.current = null;
      setIsCameraLocked(true);
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

  const handleSetWeather = (mode: WeatherMode) => {
    setWeather(mode);
    if (engineRef.current) {
      engineRef.current.setWeather(mode);
    }
  };

  const handleClearObstacles = () => {
    if (engineRef.current) {
      engineRef.current.obstacleManager.clear();
      setObstacleCount(0);
    }
  };

  const handleExportBrain = () => {
    if (!engineRef.current) return;
    const model = engineRef.current.exportBrain();
    if (!model) {
      alert('No neural network weights available to export.');
      return;
    }
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_av_${(model.type || 'model').toLowerCase()}_weights.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBrain = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const success = engineRef.current?.importBrain(data);
        if (success) {
          alert(`Neural brain loaded successfully! (${data.type || 'Model Weights'})`);
          setTelemetry(engineRef.current!.getTelemetry());
        } else {
          alert('Incompatible or invalid neural model format.');
        }
      } catch (err) {
        alert('Failed to parse neural JSON file.');
      }
    };
    reader.readAsText(file);
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
      <canvas
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onTouchStart={handleCanvasTouchStart}
        onTouchMove={handleCanvasTouchMove}
        onTouchEnd={handleCanvasTouchEnd}
        className={`absolute inset-0 block touch-none ${
          sandboxActive ? 'cursor-crosshair' : isCameraLocked ? 'cursor-grab' : 'cursor-move'
        }`}
      />

      {/* Top Cockpit HUD */}
      <header className="absolute top-4 left-4 right-4 z-20 pointer-events-auto">
        <Cockpit telemetry={telemetry} onSetPilotMode={handleSetPilotMode} />
      </header>

      {/* Floating Dynamic HUD: Brain Synapses and/or Deep RL Mistake Learning */}
      <aside className="absolute right-4 top-28 z-20 pointer-events-auto flex flex-col items-end gap-2 max-h-[calc(100vh-170px)] overflow-y-auto no-scrollbar">
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

      {/* Top-Left Live Circuit Radar & Race Analytics HUD */}
      <aside className="absolute top-28 left-4 z-20 pointer-events-auto flex flex-col items-start gap-2 max-h-[calc(100vh-170px)] overflow-y-auto no-scrollbar">
        {engineRef.current && (
          <MiniMap
            track={engineRef.current.track}
            egoVehicle={
              followedVehicleRef.current ||
              (engineRef.current.pilotMode === 'NEUROEVOLUTION'
                ? engineRef.current.geneticEngine.bestAgent?.vehicle || null
                : engineRef.current.pilotMode === 'DEEP_RL_AGENT'
                ? engineRef.current.rlAgent.vehicle
                : engineRef.current.pilotMode === 'CLASSIC_ROBOTICS'
                ? engineRef.current.classicVehicle
                : engineRef.current.humanVehicle)
            }
            trafficVehicles={engineRef.current.trafficManager.getVehicles()}
            onSelectPosition={(pos) => {
              if (rendererRef.current) {
                rendererRef.current.camera.panBy(0, 0);
                rendererRef.current.camera.target = pos.clone();
                rendererRef.current.camera.position = pos.clone();
                rendererRef.current.camera.isLockedToVehicle = false;
                setIsCameraLocked(false);
              }
            }}
          />
        )}

        <GGFrictionCircle
          lateralG={telemetry.lateralG}
          longitudinalG={telemetry.longitudinalG}
          isSkidding={telemetry.isSkidding}
        />

        <AnalyticsDrawer
          fitnessHistory={telemetry.fitnessHistory || []}
          leaderboard={telemetry.leaderboard || []}
          pilotMode={telemetry.pilotMode}
        />
      </aside>

      {/* Floating Black Box Incident Banner */}
      {activeIncident && !showBlackBoxModal && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            onClick={() => setShowBlackBoxModal(true)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-600/95 hover:bg-red-500 text-white font-mono text-xs font-bold shadow-2xl shadow-red-950/60 border border-red-400 animate-pulse transition-all"
          >
            <AlertOctagon className="w-4 h-4 text-white" />
            <span>INCIDENT LOGGED · VIEW BLACK BOX REPLAY</span>
          </button>
        </div>
      )}

      {/* Grand Prix Tri-Duel Championship Standings */}
      {telemetry.pilotMode === 'DUEL' && telemetry.duelContenders && (
        <DuelLeaderboard
          contenders={telemetry.duelContenders}
          raceTime={engineRef.current?.duelManager.raceTime || 0}
          selectedId={followedVehicleRef.current?.config.id}
          onSelectVehicle={(id) => {
            const match = engineRef.current?.duelManager.contenders.find(
              (c) => c.vehicle.config.id === id
            );
            if (match) {
              followedVehicleRef.current = match.vehicle;
              setIsCameraLocked(true);
            }
          }}
        />
      )}

      {/* Flight Recorder Incident Diagnostic Modal */}
      {showBlackBoxModal && activeIncident && (
        <BlackBoxModal
          incident={activeIncident}
          onClose={() => {
            setShowBlackBoxModal(false);
            setActiveIncident(null);
            BlackBoxRecorder.getInstance().clear();
          }}
        />
      )}

      {/* Interactive Spline Track Builder Drawer */}
      <TrackEditorDrawer
        editor={trackEditorRef.current}
        isOpen={isTrackEditorOpen}
        onClose={() => setIsTrackEditorOpen(false)}
        onApplyTrack={handleApplyCustomTrack}
      />

      {/* ISO 26262 ASIL-D Fault Injection Diagnostic Suite Drawer */}
      <FaultInjectionDrawer
        isOpen={isFaultDrawerOpen}
        onClose={() => setIsFaultDrawerOpen(false)}
      />

      {/* Picture-in-Picture Virtual Front Camera & Real-Time Computer Vision HUD */}
      <CameraFeedHUD
        cameraCanvas={engineRef.current?.virtualCamera.getCanvas() || null}
        visionResult={telemetry.visionResult || null}
      />

      {/* Bottom Mission Control Panel */}
      <footer className="absolute bottom-4 left-4 right-4 z-20 pointer-events-auto">
        <ControlPanel
          timeScale={timeScale}
          onSetTimeScale={handleSetTimeScale}
          selectedTrackId={selectedTrackId}
          onSelectTrack={handleSelectTrack}
          isTrackEditorOpen={isTrackEditorOpen}
          onToggleTrackEditor={() => setIsTrackEditorOpen(!isTrackEditorOpen)}
          isFaultDrawerOpen={isFaultDrawerOpen}
          onToggleFaultDrawer={() => setIsFaultDrawerOpen(!isFaultDrawerOpen)}
          trafficDensity={trafficDensity}
          onSetTrafficDensity={handleSetTrafficDensity}
          showLidar={showLidar}
          onToggleLidar={() => setShowLidar(!showLidar)}
          showDividers={showDividers}
          onToggleDividers={() => setShowDividers(!showDividers)}
          showBoundingBoxes={showBoundingBoxes}
          onToggleBoundingBoxes={() => setShowBoundingBoxes(!showBoundingBoxes)}
          onReset={handleReset}
          onFastTrain={handleFastTrain}
          isTraining={isTraining}
          weather={weather}
          onSetWeather={handleSetWeather}
          sandboxActive={sandboxActive}
          onToggleSandbox={() => setSandboxActive(!sandboxActive)}
          obstacleCount={obstacleCount}
          onClearObstacles={handleClearObstacles}
          onExportBrain={handleExportBrain}
          onImportBrain={handleImportBrain}
          onDownloadCSV={TelemetryExporter.downloadCSV}
          onDownloadJSON={TelemetryExporter.downloadJSON}
          isCameraLocked={isCameraLocked}
          onSnapCamera={handleSnapCamera}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      </footer>
    </div>
  );
}

export default App;
