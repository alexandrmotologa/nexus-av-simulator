import { Track } from '../world/Track';
import { TRACK_PRESETS } from '../world/TrackPresets';
import { TrafficManager } from '../traffic/TrafficManager';
import { GeneticEngine } from '../ai/GeneticAlgorithm';
import { ClassicController } from '../ai/ClassicController';
import { DeepQLearningAgent, QLearningStats } from '../ai/DeepQLearning';
import { VehicleModel } from '../physics/VehicleModel';
import { RadarSensor } from '../sensors/RadarSensor';
import { LidarSensor } from '../sensors/LidarSensor';

export type PilotMode = 'NEUROEVOLUTION' | 'DEEP_RL_AGENT' | 'CLASSIC_ROBOTICS' | 'HUMAN_DRIVER';

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
}

export class SimulationEngine {
  public track: Track;
  public trafficManager: TrafficManager;
  public geneticEngine: GeneticEngine;
  public rlAgent: DeepQLearningAgent;
  public classicController: ClassicController;
  public classicVehicle: VehicleModel;
  public classicRadar: RadarSensor;
  public humanVehicle: VehicleModel;
  public humanLidar: LidarSensor;

  public pilotMode: PilotMode = 'NEUROEVOLUTION';
  public timeScale: number = 1.0; // 0 = pause, 1 = normal, 5 = fast
  public trafficCount: number = 8;
  public keysPressed: Set<string> = new Set();

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
  }

  public setTrackPreset(presetId: string): void {
    const preset = TRACK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    this.track = preset.createTrack();
    this.trafficManager.setTrack(this.track);
    this.trafficManager.spawnFleet(this.trafficCount);
    this.geneticEngine.setTrack(this.track);
    this.rlAgent.resetEpisode(this.track);

    const start = this.geneticEngine.getStartPosition();
    this.classicVehicle.reset(start.pos, start.heading);
    this.humanVehicle.reset(start.pos, start.heading);
  }

  public setTrafficDensity(count: number): void {
    this.trafficCount = count;
    this.trafficManager.spawnFleet(count);
  }

  public setPilotMode(mode: PilotMode): void {
    this.pilotMode = mode;
    const start = this.geneticEngine.getStartPosition();
    if (mode === 'CLASSIC_ROBOTICS') {
      this.classicVehicle.reset(start.pos, start.heading);
    } else if (mode === 'HUMAN_DRIVER') {
      this.humanVehicle.reset(start.pos, start.heading);
    } else if (mode === 'DEEP_RL_AGENT') {
      this.rlAgent.resetEpisode(this.track);
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
  }

  private stepPhysics(dt: number): void {
    const trafficVehicles = this.trafficManager.getVehicles();

    // 1. Update Traffic NPCs with knowledge of active ego car
    let activeEgo: VehicleModel | undefined = undefined;
    if (this.pilotMode === 'NEUROEVOLUTION') {
      activeEgo = this.geneticEngine.bestAgent?.vehicle;
    } else if (this.pilotMode === 'DEEP_RL_AGENT') {
      activeEgo = this.rlAgent.vehicle;
    } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
      activeEgo = this.classicVehicle;
    } else {
      activeEgo = this.humanVehicle;
    }

    this.trafficManager.update(dt, activeEgo);

    // 2. Update Active Mode
    if (this.pilotMode === 'NEUROEVOLUTION') {
      this.geneticEngine.update(dt, trafficVehicles);
    } else if (this.pilotMode === 'DEEP_RL_AGENT') {
      this.rlAgent.step(dt, this.track, trafficVehicles);
    } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
      this.classicRadar.update(this.classicVehicle, this.track, trafficVehicles);
      const control = this.classicController.compute(
        this.classicVehicle,
        this.track,
        this.classicRadar
      );
      this.classicVehicle.step(control, dt);

      // Check collision with track boundary
      if (!this.track.isPointOnRoad(this.classicVehicle.state.position)) {
        this.classicVehicle.state.isDamaged = true;
      }
    } else if (this.pilotMode === 'HUMAN_DRIVER') {
      // Manual Keyboard Input: W = Accelerate, S = Brake / Reverse, A/D = Steer, R = Reset
      if (this.keysPressed.has('KeyR')) {
        const start = this.geneticEngine.getStartPosition();
        this.humanVehicle.reset(start.pos, start.heading);
      }

      const throttle = this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp') ? 1.0 : 0.0;
      const brake = this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown') ? 1.0 : 0.0;
      let steer = 0;
      if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) steer -= 1.0;
      if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) steer += 1.0;

      this.humanVehicle.step({ throttle, brake, steer }, dt);
      this.humanLidar.update(this.humanVehicle, this.track, trafficVehicles);

      // Enforce physical barrier collisions (guardrail keeps car on track and allows reversing out)
      this.humanVehicle.enforceTrackBoundary(this.track);
    }
  }

  /** Headless hyper-speed batch training (evaluates N generations in pure CPU loop) */
  public runHeadlessGenerations(generationsToRun: number): void {
    const dt = 0.033; // 30Hz simulation steps
    const maxFramesPerGen = 1200;

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
        this.geneticEngine.evolveNextGeneration();
      }
    }
  }

  public getTelemetry(): SimulationTelemetry {
    let bestSpeed = 0;
    let bestDist = 0;
    let steerAngle = 0;
    let latG = 0;
    let alive = 0;

    if (this.pilotMode === 'NEUROEVOLUTION') {
      alive = this.geneticEngine.population.filter((a) => a.isAlive).length;
      if (this.geneticEngine.bestAgent) {
        const v = this.geneticEngine.bestAgent.vehicle.state;
        bestSpeed = v.speed * 3.6; // km/h
        bestDist = v.totalDistance;
        steerAngle = (v.steerAngle * 180) / Math.PI;
        latG = v.lateralAcc / 9.81;
      }
    } else if (this.pilotMode === 'DEEP_RL_AGENT') {
      const v = this.rlAgent.vehicle.state;
      alive = v.isDamaged ? 0 : 1;
      bestSpeed = v.speed * 3.6;
      bestDist = v.totalDistance;
      steerAngle = (v.steerAngle * 180) / Math.PI;
      latG = v.lateralAcc / 9.81;
    } else if (this.pilotMode === 'CLASSIC_ROBOTICS') {
      const v = this.classicVehicle.state;
      alive = v.isDamaged ? 0 : 1;
      bestSpeed = v.speed * 3.6;
      bestDist = v.totalDistance;
      steerAngle = (v.steerAngle * 180) / Math.PI;
      latG = v.lateralAcc / 9.81;
    } else {
      const v = this.humanVehicle.state;
      alive = v.isDamaged ? 0 : 1;
      bestSpeed = v.speed * 3.6;
      bestDist = v.totalDistance;
      steerAngle = (v.steerAngle * 180) / Math.PI;
      latG = v.lateralAcc / 9.81;
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
    };
  }
}
