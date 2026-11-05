import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { DeepQLearningAgent } from '../ai/DeepQLearning';
import { GeneticEngine } from '../ai/GeneticAlgorithm';
import { ClassicController } from '../ai/ClassicController';
import { RadarSensor } from '../sensors/RadarSensor';
import { LidarSensor } from '../sensors/LidarSensor';
import { RoadObstacle } from '../world/Obstacle';
import { Collision } from '../math/Collision';

export interface DuelContender {
  id: string;
  name: string;
  color: string;
  type: 'RL' | 'GA' | 'STANLEY';
  vehicle: VehicleModel;
  radar: RadarSensor;
  lidar: LidarSensor;
  lapsCompleted: number;
  distance: number;
  lastS: number;
  currentSpeedKmH: number;
  gapSeconds: number;
  rank: number;
  isFinished: boolean;
}

export class DuelManager {
  public contenders: DuelContender[] = [];
  public targetLaps: number = 2;
  public isRacing: boolean = false;
  public raceTime: number = 0;

  public setupDuel(
    track: Track,
    rlAgent: DeepQLearningAgent,
    geneticEngine: GeneticEngine,
    classicController: ClassicController
  ): void {
    this.raceTime = 0;
    this.isRacing = true;
    this.contenders = [];

    const laneCount = track.laneCount;
    const laneStart = track.isBidirectional ? track.oncomingLaneCount : 0;
    const forwardLanes = Math.max(1, laneCount - laneStart);

    // Contender 1: Deep RL Agent (Cyan)
    const laneRL = laneStart + (0 % forwardLanes);
    const startRL = track.frenet.frenetToCartesian(14.0, track.getLaneCenterD(laneRL));
    const vRL = new VehicleModel(
      { id: 'duel-rl', name: 'Deep RL Agent', color: '#06b6d4', maxSpeed: 42.0 },
      startRL.position,
      startRL.heading
    );
    vRL.state.speed = 10.0;

    // Contender 2: GA Champion (Emerald)
    const laneGA = laneStart + (1 % forwardLanes);
    const startGA = track.frenet.frenetToCartesian(14.0, track.getLaneCenterD(laneGA));
    const vGA = new VehicleModel(
      { id: 'duel-ga', name: 'NeuroBot (GA)', color: '#10b981', maxSpeed: 42.0 },
      startGA.position,
      startGA.heading
    );
    vGA.state.speed = 10.0;

    // Contender 3: Stanley Bot (Purple)
    const laneStanley = laneStart + (2 % forwardLanes);
    const startStanley = track.frenet.frenetToCartesian(14.0, track.getLaneCenterD(laneStanley));
    const vStanley = new VehicleModel(
      { id: 'duel-stanley', name: 'Stanley Robot', color: '#8b5cf6', maxSpeed: 42.0 },
      startStanley.position,
      startStanley.heading
    );
    vStanley.state.speed = 10.0;

    this.contenders = [
      {
        id: 'duel-rl',
        name: 'Deep RL Agent',
        color: '#06b6d4',
        type: 'RL',
        vehicle: vRL,
        radar: new RadarSensor(60.0),
        lidar: new LidarSensor({ rayCount: 20 }),
        lapsCompleted: 0,
        distance: 0,
        lastS: 14.0,
        currentSpeedKmH: 36,
        gapSeconds: 0,
        rank: 1,
        isFinished: false,
      },
      {
        id: 'duel-ga',
        name: 'NeuroBot (GA)',
        color: '#10b981',
        type: 'GA',
        vehicle: vGA,
        radar: new RadarSensor(60.0),
        lidar: new LidarSensor({ rayCount: 20 }),
        lapsCompleted: 0,
        distance: 0,
        lastS: 14.0,
        currentSpeedKmH: 36,
        gapSeconds: 0,
        rank: 2,
        isFinished: false,
      },
      {
        id: 'duel-stanley',
        name: 'Stanley Robot',
        color: '#8b5cf6',
        type: 'STANLEY',
        vehicle: vStanley,
        radar: new RadarSensor(60.0),
        lidar: new LidarSensor({ rayCount: 20 }),
        lapsCompleted: 0,
        distance: 0,
        lastS: 14.0,
        currentSpeedKmH: 36,
        gapSeconds: 0,
        rank: 3,
        isFinished: false,
      },
    ];
  }

  /**
   * Updates all 3 racing contenders concurrently
   */
  public update(
    dt: number,
    track: Track,
    trafficVehicles: VehicleModel[],
    obstacles: RoadObstacle[],
    rlAgent: DeepQLearningAgent,
    geneticEngine: GeneticEngine,
    classicController: ClassicController
  ): void {
    if (!this.isRacing) return;
    this.raceTime += dt;

    const allRacingVehicles = this.contenders.map((c) => c.vehicle);
    const combinedSurrounding = [...trafficVehicles, ...allRacingVehicles];

    for (const c of this.contenders) {
      if (c.vehicle.state.isDamaged) continue;

      const v = c.vehicle;
      const otherCompetitors = allRacingVehicles.filter((other) => other !== v);
      const obstacleSurrounding = [...trafficVehicles, ...otherCompetitors];

      c.lidar.update(v, track, obstacleSurrounding, obstacles);
      c.radar.update(v, track, obstacleSurrounding);

      if (c.type === 'RL') {
        rlAgent.vehicle = v;
        rlAgent.lidar = c.lidar;
        rlAgent.radar = c.radar;
        rlAgent.step(dt, track, obstacleSurrounding, obstacles);
      } else if (c.type === 'GA') {
        const brain = geneticEngine.bestBrainEver || geneticEngine.population[0]?.brain;
        if (brain) {
          const frenet = track.frenet.cartesianToFrenet(v.state.position, v.state.heading, v.state.speed);
          const readings = c.lidar.getReadings();
          const inputs = new Float32Array(24);
          for (let i = 0; i < 20; i++) inputs[i] = readings[i] ?? 1.0;
          inputs[20] = v.state.speed / v.config.maxSpeed;
          inputs[21] = v.state.steerAngle / v.config.maxSteerAngle;
          inputs[22] = frenet.d / (track.totalWidth * 0.5);
          inputs[23] = c.radar.rearThreatLevel;

          const outputs = brain.feedForward(inputs);
          const rawThrottle = outputs[0] > 0 ? outputs[0] : 0;
          const rawBrake = outputs[0] < 0 ? -outputs[0] : outputs[1] > 0.5 ? outputs[1] : 0;
          const rawSteer = outputs[2];

          const control = geneticEngine['governor'].applySafetyShield(
            v,
            track,
            c.lidar,
            c.radar,
            obstacleSurrounding,
            obstacles,
            { throttle: rawThrottle, brake: rawBrake, steer: rawSteer },
            dt,
            1
          );
          v.step(control, dt);
        }
      } else if (c.type === 'STANLEY') {
        const control = classicController.compute(v, track, c.radar);
        v.step(control, dt);
      }

      v.enforceTrackBoundary(track);

      // Distance & lap tracking
      const frenet = track.frenet.cartesianToFrenet(v.state.position, v.state.heading, v.state.speed);
      let deltaS = frenet.s - c.lastS;
      if (track.closed && deltaS < -track.spline.totalLength * 0.5) {
        deltaS += track.spline.totalLength;
        c.lapsCompleted++;
      }
      c.lastS = frenet.s;
      if (deltaS > 0) c.distance += deltaS;
      c.currentSpeedKmH = Math.round(v.state.speed * 3.6);
    }

    // Dynamic ranking and time delta calculation
    this.contenders.sort((a, b) => b.distance - a.distance);
    const leaderDist = this.contenders[0]?.distance || 1;
    for (let i = 0; i < this.contenders.length; i++) {
      const c = this.contenders[i];
      c.rank = i + 1;
      const gapMeters = leaderDist - c.distance;
      const speed = Math.max(8.0, c.vehicle.state.speed);
      c.gapSeconds = parseFloat((gapMeters / speed).toFixed(2));
    }
  }

  public getVehicles(): VehicleModel[] {
    return this.contenders.map((c) => c.vehicle);
  }
}
