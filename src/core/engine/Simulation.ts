import { Track } from '../world/Track';
import { Vector2D } from '../math/Vector2D';
import { TRACK_PRESETS } from '../world/TrackPresets';
import { TrafficManager } from '../traffic/TrafficManager';
import { GeneticEngine } from '../ai/GeneticAlgorithm';
import { ClassicController } from '../ai/ClassicController';
import { DeepQLearningAgent, QLearningStats } from '../ai/DeepQLearning';
import { VehicleModel } from '../physics/VehicleModel';
import { RadarSensor } from '../sensors/RadarSensor';
import { LidarSensor } from '../sensors/LidarSensor';
import { ObstacleManager, RoadObstacle } from '../world/Obstacle';
import { SoundEngine } from '../audio/SoundEngine';
import { BlackBoxRecorder, IncidentReport } from '../telemetry/BlackBoxRecorder';
import { BlindSpotDetector, BlindSpotStatus } from '../sensors/BlindSpotDetector';
import { DuelManager, DuelContender } from './DuelManager';
import { CoPilotAdvisor, CoPilotIntervention } from '../control/CoPilotAdvisor';
import { GamepadController } from '../control/GamepadController';
import { IntersectionManager } from '../traffic/IntersectionManager';
import { TrafficLight, V2ISignalingPacket } from '../world/TrafficLight';
import { VirtualCamera } from '../sensors/VirtualCamera';
import { VisionProcessor, VisionDetectionResult } from '../sensors/VisionProcessor';
import { ContinuousActorCritic } from '../ai/ContinuousActorCritic';
import { ImitationRecorder } from '../ai/ImitationRecorder';
import { PedestrianManager } from '../traffic/PedestrianManager';
import { FrenetTrajectoryPlanner, FrenetTrajectory } from '../planning/FrenetTrajectoryPlanner';
import { FaultInjectionEngine } from '../faults/FaultInjectionEngine';
import { TelemetryBridge } from '../telemetry/TelemetryBridge';
import { SafetyGovernor } from '../control/SafetyGovernor';
import { EuroNCAPEngine, EuroNCAPScenarioType, EuroNCAPVerdict } from '../scenarios/EuroNCAPEngine';
import { GhostLapManager } from '../telemetry/GhostLapManager';
import { TelemetryHeatmap } from '../telemetry/TelemetryHeatmap';
import { ComfortEnergyMetrics, ComfortEnergyStatus } from '../physics/ComfortEnergyMetrics';
import { V2VPlatoonManager, PlatoonTelemetry } from '../v2v/V2VPlatoonManager';

export type PilotMode = 'NEUROEVOLUTION' | 'DEEP_RL_AGENT' | 'CLASSIC_ROBOTICS' | 'HUMAN_DRIVER' | 'DUEL';
export type WeatherMode = 'DRY' | 'WET' | 'NIGHT' | 'FOG';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  speed: number;
  distance: number;
  fitness: number;
  overtakes: number;
  color: string;
}

export interface SimulationTelemetry {
  pilotMode: PilotMode;
  trackName: string;
  generation: number;
  aliveCount: number;
  totalAgents: number;
  bestFitness: number;
  currentBestSpeed: number; // km/h
  currentBestDistance: number;
  steerAngleDeg: number;
  lateralG: number;
  fps: number;
  timeScale: number;
  rlStats?: QLearningStats;
  weather: WeatherMode;
  obstacleCount: number;
  fitnessHistory: { gen: number; fitness: number; speed: number }[];
  leaderboard: LeaderboardEntry[];
  activeSpeedLimit: number;
  speedCompliance: 'OPTIMAL' | 'WARNING' | 'SPEEDING';
  longitudinalG: number;
  isSkidding: boolean;
  tireTemp: number;
  tireStatus: 'COLD' | 'OPTIMAL' | 'OVERHEATED';
  blindSpot: BlindSpotStatus;
  coPilotIntervention?: CoPilotIntervention;
  duelContenders?: DuelContender[];
  v2iPacket?: V2ISignalingPacket;
  visionResult?: VisionDetectionResult;
  gamepadConnected?: boolean;
  isRecordingDemo?: boolean;
  demoSamples?: number;
  comfortScore?: number;
  comfortRating?: string;
  jerkTotal?: number;
  energyKwhPer100Km?: number;
  regenPowerKw?: number;
  ncapVerdict?: EuroNCAPVerdict | null;
  ncapRunning?: boolean;
  ncapScenario?: EuroNCAPScenarioType;
  ncapDecelHistory?: { time: number; decelG: number }[];
  ghostBestLapTime?: number;
  platoon?: PlatoonTelemetry;
}

export class SimulationEngine {
  public track: Track;
  public trafficManager: TrafficManager;
  public geneticEngine: GeneticEngine;
  public rlAgent: DeepQLearningAgent;
  public classicController: ClassicController;
  public classicVehicle: VehicleModel;
  public classicRadar: RadarSensor;
  public classicLidar: LidarSensor = new LidarSensor({ rayCount: 20, maxRange: 50.0 });
  public safetyGovernor: SafetyGovernor = new SafetyGovernor();
  public humanVehicle: VehicleModel;
  public humanLidar: LidarSensor;
  public humanRadar: RadarSensor = new RadarSensor(60.0);
  public bsd: BlindSpotDetector = new BlindSpotDetector();
  public duelManager: DuelManager = new DuelManager();
  public coPilot: CoPilotAdvisor = new CoPilotAdvisor();
  public intersectionManager: IntersectionManager;
  public pedestrianManager: PedestrianManager;
  public virtualCamera: VirtualCamera;
  public visionProcessor: VisionProcessor;
  public continuousActorCritic: ContinuousActorCritic;
  public trajectoryPlanner: FrenetTrajectoryPlanner = new FrenetTrajectoryPlanner();
  public latestBestTrajectory: FrenetTrajectory | null = null;
  public latestCandidateTrajectories: FrenetTrajectory[] = [];
  public latestVisionResult: VisionDetectionResult | null = null;
  public latestV2IPacket: V2ISignalingPacket | null = null;
  public euroNCAP: EuroNCAPEngine = new EuroNCAPEngine();
  public ghostLapManager: GhostLapManager = new GhostLapManager();
  public telemetryHeatmap: TelemetryHeatmap = new TelemetryHeatmap();
  public comfortMetrics: ComfortEnergyMetrics = new ComfortEnergyMetrics();
  public platoonManager: V2VPlatoonManager = new V2VPlatoonManager();
  public latestComfortStatus: ComfortEnergyStatus = {
    jerkTotal: 0,
    comfortScore: 98,
    comfortRating: 'ULTRA LUXURY',
    energyKwhPer100Km: 17.5,
    regenPowerKw: 0,
  };
  private cameraFrameCounter: number = 0;
  private lastActiveEgoId: string = '';

  public pilotMode: PilotMode = 'NEUROEVOLUTION';
  public timeScale: number = 1.0; // 0 = pause, 1 = normal, 5 = fast
  public trafficCount: number = 8;
  public keysPressed: Set<string> = new Set();
  public obstacleManager: ObstacleManager = new ObstacleManager();
  public weather: WeatherMode = 'DRY';
  public cameraViewMode: 'FRONT' | 'REAR' | 'BEV' = 'FRONT';
  public fitnessHistory: { gen: number; fitness: number; speed: number }[] = [];
  private lastRecordedGen: number = 1;

  private lastTime: number = 0;
  private fpsCounter: number = 60;
  private frameCount: number = 0;
  private fpsTimer: number = 0;

  constructor() {
    this.track = TRACK_PRESETS[0].createTrack();
    this.trafficManager = new TrafficManager(this.track);
    this.trafficManager.spawnFleet(this.trafficCount);

    this.geneticEngine = new GeneticEngine(this.track, 35);
    this.rlAgent = new DeepQLearningAgent(this.track);
    this.classicController = new ClassicController();
    this.classicRadar = new RadarSensor();

    const start = this.geneticEngine.getStartPosition();
    this.classicVehicle = new VehicleModel(
      { id: 'classic-robot', name: 'Stanley Bot', color: '#8b5cf6', maxSpeed: 38.0 },
      start.pos,
      start.heading
    );

    this.humanVehicle = new VehicleModel(
      { id: 'human-driver', name: 'Human Ego', color: '#f59e0b', maxSpeed: 45.0, maxReverseSpeed: 14.0 },
      start.pos,
      start.heading
    );
    this.humanLidar = new LidarSensor();
    this.intersectionManager = new IntersectionManager(this.track);
    this.pedestrianManager = new PedestrianManager(this.track);
    this.track.configureSignage(this.pedestrianManager.crosswalks, this.intersectionManager.lights);
    this.virtualCamera = new VirtualCamera(160, 80);
    this.visionProcessor = new VisionProcessor(160, 80);
    this.continuousActorCritic = new ContinuousActorCritic(14, 48);
  }

  public setTrackPreset(presetId: string): void {
    const preset = TRACK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    this.telemetryHeatmap.clear();
    this.track = preset.createTrack();
    this.intersectionManager.setTrack(this.track);
    this.pedestrianManager.setTrack(this.track);
    this.track.configureSignage(this.pedestrianManager.crosswalks, this.intersectionManager.lights);
    this.trafficManager.setTrack(this.track);
    this.trafficManager.spawnFleet(this.trafficCount);
    this.geneticEngine.setTrack(this.track);
    this.rlAgent.resetEpisode(this.track);

    const start = this.geneticEngine.getStartPosition();
    this.classicVehicle.reset(start.pos, start.heading);
    this.humanVehicle.reset(start.pos, start.heading);

    if (this.platoonManager.isActive) {
      this.platoonManager.activatePlatoon(this.track, null, this.platoonManager.members.length || 4);
    }
  }

  public setCustomTrack(track: Track): void {
    this.telemetryHeatmap.clear();
    this.track = track;
    this.intersectionManager.setTrack(track);
    this.pedestrianManager.setTrack(this.track);
    this.track.configureSignage(this.pedestrianManager.crosswalks, this.intersectionManager.lights);
    this.trafficManager.setTrack(this.track);
    this.trafficManager.spawnFleet(this.trafficCount);
    this.geneticEngine.setTrack(this.track);
    this.rlAgent.resetEpisode(this.track);

    const start = this.geneticEngine.getStartPosition();
    this.classicVehicle.reset(start.pos, start.heading);
    this.humanVehicle.reset(start.pos, start.heading);

    if (this.platoonManager.isActive) {
      this.platoonManager.activatePlatoon(this.track, null, this.platoonManager.members.length || 4);
    }
  }

  public setWeather(mode: WeatherMode): void {
    this.weather = mode;
    const grip = mode === 'WET' ? 4.5 : mode === 'FOG' ? 5.2 : 8.5;
    const brake = mode === 'WET' ? 6.0 : mode === 'FOG' ? 6.8 : 9.5;

    this.classicVehicle.config.tireGripCoeff = grip;
    this.classicVehicle.config.brakeDecel = brake;
    this.humanVehicle.config.tireGripCoeff = grip;
    this.humanVehicle.config.brakeDecel = brake;
    this.rlAgent.vehicle.config.tireGripCoeff = grip;
    this.rlAgent.vehicle.config.brakeDecel = brake;

    for (const a of this.geneticEngine.population) {
      a.vehicle.config.tireGripCoeff = grip;
      a.vehicle.config.brakeDecel = brake;
      a.sensor.setWeather(mode);
    }
    for (const t of this.trafficManager.agents) {
      t.vehicle.config.tireGripCoeff = grip;
      t.vehicle.config.brakeDecel = brake;

      // Traffic rules for adverse weather: slower speeds & larger following distance
      if (mode === 'WET' || mode === 'FOG') {
        t.idm.params.desiredSpeed = Math.min(18.0, t.idm.params.desiredSpeed);
        t.idm.params.timeHeadway = 2.2;
      } else {
        t.idm.params.desiredSpeed = 24.0;
        t.idm.params.timeHeadway = 1.4;
      }
    }

    this.humanLidar.setWeather(mode);
    this.rlAgent.lidar.setWeather(mode);
  }

  public setTrafficDensity(count: number): void {
    this.trafficCount = count;
    this.trafficManager.spawnFleet(count);
  }

  public setPilotMode(mode: PilotMode): void {
    this.pilotMode = mode;
    this.telemetryHeatmap.clear();
    const start = this.geneticEngine.getStartPosition();
    if (mode === 'CLASSIC_ROBOTICS') {
      this.classicVehicle.reset(start.pos, start.heading);
    } else if (mode === 'HUMAN_DRIVER') {
      this.humanVehicle.reset(start.pos, start.heading);
    } else if (mode === 'DEEP_RL_AGENT') {
      this.rlAgent.resetEpisode(this.track);
    } else if (mode === 'DUEL') {
      this.duelManager.setupDuel(this.track, this.rlAgent, this.geneticEngine, this.classicController);
    }
  }

  public update(timestamp: number): void {
    if (this.lastTime === 0) {
      this.lastTime = timestamp;
      return;
    }

    const rawDt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    // FPS calculation
    this.frameCount++;
    this.fpsTimer += rawDt;
    if (this.fpsTimer >= 1.0) {
      this.fpsCounter = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    if (this.timeScale === 0) return; // Paused

    // Physics sub-stepping for numerical stability
    const subSteps = Math.ceil(this.timeScale);
    const dt = (rawDt * this.timeScale) / subSteps;

    for (let step = 0; step < subSteps; step++) {
      this.stepPhysics(dt);
    }

    // Process V2I intersections and virtual camera for active lead vehicle
    const activeEgo = this.getActiveEgoVehicle();
    this.latestV2IPacket = this.intersectionManager.getClosestV2IPacket(activeEgo);

    this.cameraFrameCounter++;
    if (this.cameraFrameCounter % 2 === 0) {
      let lidarHits: Vector2D[] = [];
      if (this.pilotMode === 'HUMAN_DRIVER') {
        lidarHits = this.humanLidar.hits.filter((h) => h.hitType !== 'none').map((h) => h.point);
      } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
        lidarHits = this.classicLidar.hits.filter((h) => h.hitType !== 'none').map((h) => h.point);
      } else if (this.pilotMode === 'NEUROEVOLUTION') {
        const best = this.geneticEngine.bestAgent;
        if (best) lidarHits = best.sensor.hits.filter((h) => h.hitType !== 'none').map((h) => h.point);
      } else if (this.pilotMode === 'DEEP_RL_AGENT') {
        lidarHits = this.rlAgent.lidar.hits.filter((h) => h.hitType !== 'none').map((h) => h.point);
      }

      let frame;
      if (this.cameraViewMode === 'REAR') {
        frame = this.virtualCamera.renderRear(
          activeEgo,
          this.track,
          this.obstacleManager.obstacles,
          this.trafficManager.getVehicles(),
          this.weather
        );
        this.latestVisionResult = null;
      } else if (this.cameraViewMode === 'BEV') {
        frame = this.virtualCamera.renderBEV(
          activeEgo,
          this.track,
          this.obstacleManager.obstacles,
          this.trafficManager.getVehicles(),
          lidarHits
        );
        this.latestVisionResult = null;
      } else {
        frame = this.virtualCamera.render(
          activeEgo,
          this.track,
          this.obstacleManager.obstacles,
          this.trafficManager.getVehicles(),
          this.weather
        );
        // Apply optical fault injections (lens dirt / direct solar glare)
        FaultInjectionEngine.getInstance().applyToCamera(
          this.virtualCamera.getContext(),
          frame.width,
          frame.height
        );
        this.latestVisionResult = this.visionProcessor.process(frame.imageData);
      }
    }

    // Plan Frenet optimal trajectory lattice periodically
    if (this.cameraFrameCounter % 3 === 0) {
      const frenet = this.track.frenet.cartesianToFrenet(
        activeEgo.state.position,
        activeEgo.state.heading,
        activeEgo.state.speed
      );
      // Determine nearest forward legal lane center
      let bestLane = 0;
      let minLaneDist = Infinity;
      for (let l = 0; l < this.track.laneCount; l++) {
        const laneD = this.track.getLaneCenterD(l);
        const dist = Math.abs(frenet.d - laneD);
        if (dist < minLaneDist) {
          minLaneDist = dist;
          bestLane = l;
        }
      }
      const targetLaneD = this.track.getLaneCenterD(bestLane);

      const planRes = this.trajectoryPlanner.plan(
        frenet.s,
        Math.max(1.0, activeEgo.state.speed),
        activeEgo.state.longitudinalAcc,
        frenet.d,
        frenet.d_d,
        0,
        Math.max(8.0, this.track.getSpeedLimitAtDistance(frenet.s) / 3.6),
        this.track,
        this.obstacleManager.obstacles,
        this.trafficManager.getVehicles(),
        targetLaneD
      );
      this.latestBestTrajectory = planRes.best;
      this.latestCandidateTrajectories = planRes.candidates;
    }

    // Broadcast live telemetry packet over WebSocket bridge
    TelemetryBridge.getInstance().broadcast(this.getTelemetry(), activeEgo.state.position, activeEgo.state.heading);
  }

  public getActiveEgoVehicle(): VehicleModel {
    if (this.pilotMode === 'NEUROEVOLUTION') {
      return this.geneticEngine.bestAgent?.vehicle || this.geneticEngine.population[0]?.vehicle || this.humanVehicle;
    } else if (this.pilotMode === 'DEEP_RL_AGENT') {
      return this.rlAgent.vehicle;
    } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
      return this.classicVehicle;
    } else if (this.pilotMode === 'DUEL') {
      return this.duelManager.contenders[0]?.vehicle || this.rlAgent.vehicle;
    } else {
      return this.humanVehicle;
    }
  }

  private stepPhysics(dt: number): void {
    const trafficVehicles = this.trafficManager.getVehicles();
    const obstacles = this.obstacleManager.obstacles;

    // 1. Update Smart Infrastructure (Signalized Intersections)
    this.intersectionManager.update(dt);

    // 2. Update Vulnerable Road Users (Pedestrians & Cyclists)
    this.pedestrianManager.update(dt, trafficVehicles);

    // 3. Update Traffic NPCs with knowledge of active ego car, obstacles & pedestrian crossings
    const activeEgo = this.getActiveEgoVehicle();
    this.trafficManager.update(dt, activeEgo, obstacles, this.pedestrianManager);

    // VRU-AEB Active Safety: Stop smoothly before occupied crosswalk stop line
    const egoFrenet = this.track.frenet.cartesianToFrenet(activeEgo.state.position, activeEgo.state.heading, activeEgo.state.speed);
    const upcomingCw = this.pedestrianManager.getUpcomingCrosswalk(egoFrenet.s, 35.0);
    if (upcomingCw && upcomingCw.isOccupied) {
      const stopLineDist = upcomingCw.distance - 3.5;
      if (stopLineDist > 0 && stopLineDist < 25.0) {
        const targetSpeed = Math.max(0, (stopLineDist / 20.0) * 6.0);
        if (activeEgo.state.speed > targetSpeed) {
          activeEgo.state.speed = Math.max(targetSpeed, activeEgo.state.speed - 6.0 * dt);
          activeEgo.state.isBraking = true;
        }
      } else if (stopLineDist <= 0.8 && stopLineDist >= -4.0) {
        activeEgo.state.speed = 0;
        activeEgo.state.isBraking = true;
      }
    }

    const vruRisk = this.pedestrianManager.checkVRUCollisionRisk(
      activeEgo.state.position,
      activeEgo.state.heading,
      activeEgo.state.speed
    );
    if (vruRisk.mustStop && vruRisk.distance < 14.0) {
      activeEgo.state.speed = Math.max(0, activeEgo.state.speed - 8.5 * dt);
      activeEgo.state.isBraking = true;
    }

    // 2. Update Active Mode
    if (this.pilotMode === 'NEUROEVOLUTION') {
      this.geneticEngine.update(dt, trafficVehicles, obstacles, this.pedestrianManager);

      // Record fitness history when new generation starts
      if (this.geneticEngine.generation > this.lastRecordedGen) {
        this.lastRecordedGen = this.geneticEngine.generation;
        this.telemetryHeatmap.clear();
        const bestSpeed = this.geneticEngine.bestAgent ? this.geneticEngine.bestAgent.vehicle.state.speed * 3.6 : 0;
        this.fitnessHistory.push({
          gen: this.geneticEngine.generation - 1,
          fitness: Math.round(this.geneticEngine.bestFitness),
          speed: Math.round(bestSpeed),
        });
        if (this.fitnessHistory.length > 50) this.fitnessHistory.shift();
      }
    } else if (this.pilotMode === 'DEEP_RL_AGENT') {
      this.rlAgent.step(dt, this.track, trafficVehicles, obstacles, this.pedestrianManager);
    } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
      this.classicRadar.update(this.classicVehicle, this.track, trafficVehicles);
      this.classicLidar.update(this.classicVehicle, this.track, trafficVehicles, obstacles);
      const rawControl = this.classicController.compute(
        this.classicVehicle,
        this.track,
        this.classicRadar
      );
      const safeControl = this.safetyGovernor.applySafetyShield(
        this.classicVehicle,
        this.track,
        this.classicLidar,
        this.classicRadar,
        trafficVehicles,
        obstacles,
        rawControl,
        dt,
        this.classicController.config.targetLaneIndex
      );
      this.classicVehicle.step(safeControl, dt);

      // Check collision with track boundary & obstacles
      if (!this.track.isPointOnRoad(this.classicVehicle.state.position)) {
        this.classicVehicle.state.isDamaged = true;
      }
      for (const obs of obstacles) {
        if (this.classicVehicle.state.position.distance(obs.position) < obs.radius + 1.8) {
          this.classicVehicle.state.isDamaged = true;
        }
      }
    } else if (this.pilotMode === 'DUEL') {
      this.duelManager.update(
        dt,
        this.track,
        trafficVehicles,
        obstacles,
        this.rlAgent,
        this.geneticEngine,
        this.classicController
      );
    } else if (this.pilotMode === 'HUMAN_DRIVER') {
      // Manual Keyboard or Gamepad Input: W/S/A/D, Arrows, or Gamepad Triggers & Stick
      const pad = GamepadController.getInstance().poll();
      if (this.keysPressed.has('KeyR') || (pad && pad.reset)) {
        const start = this.geneticEngine.getStartPosition();
        this.humanVehicle.reset(start.pos, start.heading);
      }

      let rawThrottle = this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp') ? 1.0 : 0.0;
      let rawBrake = this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown') ? 1.0 : 0.0;
      let rawSteer = 0;
      if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) rawSteer -= 1.0;
      if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) rawSteer += 1.0;

      if (pad) {
        if (pad.input.throttle > 0.01) rawThrottle = Math.max(rawThrottle, pad.input.throttle);
        if (pad.input.brake > 0.01) rawBrake = Math.max(rawBrake, pad.input.brake);
        if (Math.abs(pad.input.steer) > 0.01) rawSteer = pad.input.steer;
        if (pad.handbrake) rawBrake = 1.0;
      }

      // Automotive Turn Signal Blinker Discipline (Intentional Driver Toggle via Keys Q/E)
      if (this.keysPressed.has('KeyQ')) {
        this.humanVehicle.state.isBlinkingLeft = !this.humanVehicle.state.isBlinkingLeft;
        this.humanVehicle.state.isBlinkingRight = false;
        this.keysPressed.delete('KeyQ');
      } else if (this.keysPressed.has('KeyE')) {
        this.humanVehicle.state.isBlinkingRight = !this.humanVehicle.state.isBlinkingRight;
        this.humanVehicle.state.isBlinkingLeft = false;
        this.keysPressed.delete('KeyE');
      }

      this.humanRadar.update(this.humanVehicle, this.track, trafficVehicles);
      this.humanLidar.update(this.humanVehicle, this.track, trafficVehicles, obstacles);

      // Level 2+ Shared Autonomy Co-Pilot Active Safety Intervention
      const safeControl = this.coPilot.supervise(
        this.humanVehicle,
        this.track,
        this.humanLidar,
        this.humanRadar,
        trafficVehicles,
        obstacles,
        { throttle: rawThrottle, brake: rawBrake, steer: rawSteer },
        dt
      );

      if (this.coPilot.lastIntervention.isIntervening) {
        SoundEngine.getInstance().playCollisionWarningChime();
      }

      this.humanVehicle.step(safeControl, dt);

      // Record high-fidelity human demonstration dataset for Behavioral Cloning
      if (ImitationRecorder.getInstance().isRecording) {
        const frenet = this.track.frenet.cartesianToFrenet(
          this.humanVehicle.state.position,
          this.humanVehicle.state.heading,
          this.humanVehicle.state.speed
        );
        const splineState = this.track.spline.evaluateAtDistance(frenet.s);
        const refHeading = Math.atan2(splineState.tangent.y, splineState.tangent.x);
        let headingErr = this.humanVehicle.state.heading - refHeading;
        while (headingErr > Math.PI) headingErr -= 2 * Math.PI;
        while (headingErr < -Math.PI) headingErr += 2 * Math.PI;

        const stateVec = [
          ...this.humanLidar.getReadings(),
          this.humanVehicle.state.speed / 45.0,
          this.humanVehicle.state.steerAngle,
          this.humanVehicle.state.yawRate,
          frenet.d / (this.track.totalWidth * 0.5),
          headingErr,
        ];
        ImitationRecorder.getInstance().record(stateVec, [safeControl.steer, safeControl.throttle - safeControl.brake]);
      }

      // Enforce physical barrier collisions
      this.humanVehicle.enforceTrackBoundary(this.track);

      for (const obs of obstacles) {
        if (this.humanVehicle.state.position.distance(obs.position) < obs.radius + 1.8) {
          this.humanVehicle.state.isDamaged = true;
        }
      }
    }

    // Universal Rigid-Body SAT Overlap Resolution across all fleets (prevents any vehicle clipping!)
    const allActiveCars: VehicleModel[] = [activeEgo, ...trafficVehicles];
    if (this.platoonManager.isActive) {
      allActiveCars.push(...this.platoonManager.getVehicles());
    }
    if (this.pilotMode === 'NEUROEVOLUTION') {
      for (const a of this.geneticEngine.population) {
        if (a.isAlive && a.vehicle !== activeEgo) {
          allActiveCars.push(a.vehicle);
        }
      }
    } else if (this.pilotMode === 'DUEL') {
      for (const v of this.duelManager.getVehicles()) {
        if (v !== activeEgo) allActiveCars.push(v);
      }
    }
    this.trafficManager.resolvePhysicalOverlaps(allActiveCars);

    // 3. Procedural Audio Engine Update
    if (activeEgo) {
      if (this.lastActiveEgoId !== activeEgo.config.id) {
        this.lastActiveEgoId = activeEgo.config.id;
        this.telemetryHeatmap.clear();
      }
      const v = activeEgo.state;
      let closestDistance = 25.0;
      let closingSpeed = 0;
      if (this.pilotMode === 'HUMAN_DRIVER') {
        if (this.humanRadar.targetDetected) {
          closestDistance = this.humanRadar.targetDistance;
          closingSpeed = this.humanRadar.closingSpeed;
        }
      } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
        if (this.classicRadar.targetDetected) {
          closestDistance = this.classicRadar.targetDistance;
          closingSpeed = this.classicRadar.closingSpeed;
        }
      } else if (this.pilotMode === 'NEUROEVOLUTION') {
        const best = this.geneticEngine.bestAgent;
        if (best && best.radar.targetDetected) {
          closestDistance = best.radar.targetDistance;
          closingSpeed = best.radar.closingSpeed;
        }
      } else if (this.pilotMode === 'DEEP_RL_AGENT') {
        if (this.rlAgent.radar.targetDetected) {
          closestDistance = this.rlAgent.radar.targetDistance;
          closingSpeed = this.rlAgent.radar.closingSpeed;
        }
      }

      const isBlinking = v.isBlinkingLeft || v.isBlinkingRight;
      const blinkPhase = Math.floor(v.blinkTimer * 3.5) % 2 === 0;
      const isAEBWarning = v.isBraking && v.speed > 5.0;
      const isOnRumble = this.track.checkRumbleContact(v.position, activeEgo.config.width, isBlinking);
      SoundEngine.getInstance().update(
        v.speed,
        v.speed > 0.5 ? 0.7 : 0,
        isBlinking,
        blinkPhase,
        isAEBWarning,
        isOnRumble,
        v.isSkidding,
        closestDistance
      );
      if (isOnRumble) {
        GamepadController.getInstance().vibrate(0.45, 0.2, 60);
      }

      // 4. Black Box Flight Recorder Telemetry Capture
      BlackBoxRecorder.getInstance().recordFrame({
        timestamp: performance.now(),
        position: { x: v.position.x, y: v.position.y },
        heading: v.heading,
        speedKmH: Math.round(v.speed * 3.6),
        steerAngleDeg: parseFloat(((v.steerAngle * 180) / Math.PI).toFixed(1)),
        lateralG: parseFloat((v.lateralAcc / 9.81).toFixed(2)),
        longitudinalG: parseFloat((v.longitudinalAcc / 9.81).toFixed(2)),
        throttle: v.speed > 0.5 ? 0.8 : 0,
        brake: v.isBraking ? 1.0 : 0,
        isDamaged: v.isDamaged,
        closestDistance: parseFloat(closestDistance.toFixed(1)),
        closingSpeed: parseFloat(closingSpeed.toFixed(1)),
      });

      if (v.isDamaged) {
        BlackBoxRecorder.getInstance().triggerIncident('Kinematic Boundary or Vehicle Impact');
        GamepadController.getInstance().vibrate(0.85, 1.0, 250);
      }

      // 5. Telemetry Heatmap, Ghost Lap Replay & Euro NCAP Safety Validation
      this.ghostLapManager.updateReplay(dt);
      this.euroNCAP.update(dt, activeEgo, this.track);
      this.telemetryHeatmap.addSample(
        v.position,
        v.heading,
        v.longitudinalAcc,
        v.speed
      );
      this.latestComfortStatus = this.comfortMetrics.update(
        dt,
        v.speed,
        v.longitudinalAcc,
        v.lateralAcc,
        v.isBraking,
        activeEgo.config.mass || 1500
      );
    }

    // 6. Connected Vehicle-to-Vehicle (V2V) Cooperative Platoon
    if (this.platoonManager.isActive) {
      this.platoonManager.update(dt, this.track, this.trafficManager.getVehicles(), obstacles);
    }
  }

  /** Headless hyper-speed batch training (evaluates N generations in pure CPU loop) */
  public runHeadlessGenerations(generationsToRun: number): void {
    const dt = 0.05; // 20Hz simulation steps for fast evaluation
    const maxFramesPerGen = 220;

    for (let g = 0; g < generationsToRun; g++) {
      let frames = 0;
      while (frames < maxFramesPerGen) {
        const traffic = this.trafficManager.getVehicles();
        if (this.pilotMode === 'DEEP_RL_AGENT') {
          this.trafficManager.update(dt, this.rlAgent.vehicle);
          this.rlAgent.step(dt, this.track, traffic);
        } else {
          this.trafficManager.update(dt, this.geneticEngine.bestAgent?.vehicle);
          this.geneticEngine.update(dt, traffic);
          const anyAlive = this.geneticEngine.population.some((a) => a.isAlive);
          if (!anyAlive) break;
        }
        frames++;
      }
      if (this.pilotMode === 'NEUROEVOLUTION') {
        const bestSpeed = this.geneticEngine.bestAgent ? this.geneticEngine.bestAgent.vehicle.state.speed * 3.6 : 0;
        this.fitnessHistory.push({
          gen: this.geneticEngine.generation,
          fitness: Math.round(this.geneticEngine.bestFitness),
          speed: Math.round(bestSpeed),
        });
        if (this.fitnessHistory.length > 50) this.fitnessHistory.shift();
        this.geneticEngine.evolveNextGeneration();
        this.lastRecordedGen = this.geneticEngine.generation;
      }
    }
  }

  public getTelemetry(): SimulationTelemetry {
    let bestSpeed = 0;
    let bestDist = 0;
    let steerAngle = 0;
    let latG = 0;
    let longG = 0;
    let isSkid = false;
    let alive = 0;
    let tireTemp = 30.0;
    let tireStatus: 'COLD' | 'OPTIMAL' | 'OVERHEATED' = 'COLD';

    if (this.pilotMode === 'NEUROEVOLUTION') {
      alive = this.geneticEngine.population.filter((a) => a.isAlive).length;
      if (this.geneticEngine.bestAgent) {
        const v = this.geneticEngine.bestAgent.vehicle.state;
        bestSpeed = v.speed * 3.6; // km/h
        bestDist = v.totalDistance;
        steerAngle = (v.steerAngle * 180) / Math.PI;
        latG = v.lateralAcc / 9.81;
        longG = v.longitudinalAcc / 9.81;
        isSkid = v.isSkidding;
        tireTemp = v.tireTemp ?? 30.0;
        tireStatus = v.tireStatus ?? 'COLD';
      }
    } else if (this.pilotMode === 'DEEP_RL_AGENT') {
      const v = this.rlAgent.vehicle.state;
      alive = v.isDamaged ? 0 : 1;
      bestSpeed = v.speed * 3.6;
      bestDist = v.totalDistance;
      steerAngle = (v.steerAngle * 180) / Math.PI;
      latG = v.lateralAcc / 9.81;
      longG = v.longitudinalAcc / 9.81;
      isSkid = v.isSkidding;
      tireTemp = v.tireTemp ?? 30.0;
      tireStatus = v.tireStatus ?? 'COLD';
    } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
      const v = this.classicVehicle.state;
      alive = v.isDamaged ? 0 : 1;
      bestSpeed = v.speed * 3.6;
      bestDist = v.totalDistance;
      steerAngle = (v.steerAngle * 180) / Math.PI;
      latG = v.lateralAcc / 9.81;
      longG = v.longitudinalAcc / 9.81;
      isSkid = v.isSkidding;
      tireTemp = v.tireTemp ?? 30.0;
      tireStatus = v.tireStatus ?? 'COLD';
    } else if (this.pilotMode === 'DUEL') {
      const leader = this.duelManager.contenders[0];
      alive = this.duelManager.contenders.filter((c) => !c.vehicle.state.isDamaged).length;
      if (leader) {
        const v = leader.vehicle.state;
        bestSpeed = v.speed * 3.6;
        bestDist = leader.distance;
        steerAngle = (v.steerAngle * 180) / Math.PI;
        latG = v.lateralAcc / 9.81;
        longG = v.longitudinalAcc / 9.81;
        isSkid = v.isSkidding;
        tireTemp = v.tireTemp ?? 30.0;
        tireStatus = v.tireStatus ?? 'COLD';
      }
    } else {
      const v = this.humanVehicle.state;
      alive = v.isDamaged ? 0 : 1;
      bestSpeed = v.speed * 3.6;
      bestDist = v.totalDistance;
      steerAngle = (v.steerAngle * 180) / Math.PI;
      latG = v.lateralAcc / 9.81;
      longG = v.longitudinalAcc / 9.81;
      isSkid = v.isSkidding;
      tireTemp = v.tireTemp ?? 30.0;
      tireStatus = v.tireStatus ?? 'COLD';
    }

    const leaderboard: LeaderboardEntry[] = [];
    if (this.pilotMode === 'NEUROEVOLUTION') {
      const sorted = [...this.geneticEngine.population].sort((a, b) => b.fitness - a.fitness);
      for (let i = 0; i < Math.min(5, sorted.length); i++) {
        const agent = sorted[i];
        leaderboard.push({
          rank: i + 1,
          name: agent.vehicle.config.name,
          speed: Math.round(agent.vehicle.state.speed * 3.6),
          distance: Math.round(agent.stats.distance),
          fitness: Math.round(agent.fitness),
          overtakes: agent.stats.overtakes,
          color: agent.vehicle.config.color,
        });
      }
    }

    // Evaluate active sector speed limit and legal compliance
    let activeVehicle = this.humanVehicle;
    if (this.pilotMode === 'NEUROEVOLUTION' && this.geneticEngine.bestAgent) {
      activeVehicle = this.geneticEngine.bestAgent.vehicle;
    } else if (this.pilotMode === 'DEEP_RL_AGENT') {
      activeVehicle = this.rlAgent.vehicle;
    } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
      activeVehicle = this.classicVehicle;
    } else if (this.pilotMode === 'DUEL') {
      activeVehicle = this.duelManager.contenders[0]?.vehicle || this.rlAgent.vehicle;
    }
    const egoPos = activeVehicle.state.position;

    const frenet = this.track.frenet.cartesianToFrenet(egoPos, 0, 0);
    const activeSpeedLimit = this.track.getSpeedLimitAtDistance(frenet.s);
    let speedCompliance: 'OPTIMAL' | 'WARNING' | 'SPEEDING' = 'OPTIMAL';
    if (bestSpeed > activeSpeedLimit + 10) {
      speedCompliance = 'SPEEDING';
    } else if (bestSpeed > activeSpeedLimit) {
      speedCompliance = 'WARNING';
    }

    // 360-degree Blind Spot Detection evaluation
    const blindSpot = this.bsd.evaluate(activeVehicle, this.trafficManager.getVehicles());
    if (blindSpot.leftCritical || blindSpot.rightCritical) {
      SoundEngine.getInstance().playCollisionWarningChime();
    }

    return {
      pilotMode: this.pilotMode,
      trackName: this.track.name,
      generation: this.geneticEngine.generation,
      aliveCount: alive,
      totalAgents: this.geneticEngine.populationSize,
      bestFitness: this.geneticEngine.bestFitness,
      currentBestSpeed: Math.round(bestSpeed),
      currentBestDistance: Math.round(bestDist),
      steerAngleDeg: parseFloat(steerAngle.toFixed(1)),
      lateralG: parseFloat(latG.toFixed(2)),
      fps: this.fpsCounter,
      timeScale: this.timeScale,
      rlStats: this.rlAgent.getStats(),
      weather: this.weather,
      obstacleCount: this.obstacleManager.obstacles.length,
      fitnessHistory: this.fitnessHistory,
      leaderboard,
      activeSpeedLimit,
      speedCompliance,
      longitudinalG: parseFloat(longG.toFixed(2)),
      isSkidding: isSkid,
      tireTemp,
      tireStatus,
      blindSpot,
      coPilotIntervention: this.pilotMode === 'HUMAN_DRIVER' ? this.coPilot.lastIntervention : undefined,
      duelContenders: this.pilotMode === 'DUEL' ? [...this.duelManager.contenders] : undefined,
      v2iPacket: this.latestV2IPacket || undefined,
      visionResult: this.latestVisionResult || undefined,
      gamepadConnected: GamepadController.getInstance().isConnected,
      isRecordingDemo: ImitationRecorder.getInstance().isRecording,
      demoSamples: ImitationRecorder.getInstance().dataset.length,
      comfortScore: this.latestComfortStatus?.comfortScore,
      comfortRating: this.latestComfortStatus?.comfortRating,
      jerkTotal: this.latestComfortStatus?.jerkTotal,
      energyKwhPer100Km: this.latestComfortStatus?.energyKwhPer100Km,
      regenPowerKw: this.latestComfortStatus?.regenPowerKw,
      ncapVerdict: this.euroNCAP.latestVerdict,
      ncapRunning: this.euroNCAP.isRunning,
      ncapScenario: this.euroNCAP.activeScenario,
      ncapDecelHistory: [...this.euroNCAP.decelHistory],
      ghostBestLapTime: isFinite(this.ghostLapManager.bestLapTime) ? this.ghostLapManager.bestLapTime : undefined,
      platoon: this.platoonManager.getTelemetry(),
    };
  }

  public exportBrain(): any {
    if (this.pilotMode === 'DEEP_RL_AGENT') {
      return {
        type: 'DEEP_RL_AGENT',
        version: 1,
        weights: this.rlAgent.policyNet.serialize(),
        totalSteps: this.rlAgent.totalSteps,
        totalMistakes: this.rlAgent.totalMistakes,
        mistakesAvoided: this.rlAgent.mistakesAvoided,
        timestamp: Date.now(),
      };
    }
    return this.geneticEngine.exportBestBrain();
  }

  public importBrain(data: any): boolean {
    if (!data) return false;
    if (data.type === 'DEEP_RL_AGENT' || data.weights) {
      if (data.weights) {
        this.rlAgent.policyNet.deserialize(data.weights);
        this.rlAgent.targetNet.copyFrom(this.rlAgent.policyNet);
        if (data.totalSteps) this.rlAgent.totalSteps = data.totalSteps;
        if (data.totalMistakes) this.rlAgent.totalMistakes = data.totalMistakes;
        if (data.mistakesAvoided) this.rlAgent.mistakesAvoided = data.mistakesAvoided;
        this.rlAgent.saveToStorage();
        if (this.pilotMode !== 'DEEP_RL_AGENT') {
          this.setPilotMode('DEEP_RL_AGENT');
        }
        return true;
      }
    } else if (data.type === 'NEUROEVOLUTION' || data.brain) {
      const res = this.geneticEngine.importBrain(data);
      if (res && this.pilotMode !== 'NEUROEVOLUTION') {
        this.setPilotMode('NEUROEVOLUTION');
      }
      return res;
    }
    return false;
  }
}
