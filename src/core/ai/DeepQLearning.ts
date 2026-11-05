import { BackpropNetwork } from './BackpropNetwork';
import { VehicleModel } from '../physics/VehicleModel';
import { LidarSensor } from '../sensors/LidarSensor';
import { RadarSensor } from '../sensors/RadarSensor';
import { Track } from '../world/Track';
import { ControlInput } from '../physics/VehicleState';
import { Collision } from '../math/Collision';
import { RoadObstacle } from '../world/Obstacle';
import { SafetyGovernor } from '../control/SafetyGovernor';

export interface Transition {
  state: Float32Array;
  action: number;
  reward: number;
  nextState: Float32Array;
  done: boolean;
  isMistake: boolean;
  mistakeReason?: string;
}

export interface QLearningStats {
  episode: number;
  totalSteps: number;
  epsilon: number;
  currentLoss: number;
  totalMistakes: number;
  mistakesAvoided: number;
  lastMistakeReason: string;
  qValues: number[];
  chosenActionName: string;
  learningPhase: 'Exploring' | 'Correcting Mistakes' | 'Fine-Tuning';
  averageEpisodeReward: number;
}

export const ACTION_NAMES = [
  'Cruise',
  'Accelerate',
  'Brake',
  'Steer Left (Soft)',
  'Steer Left (Hard)',
  'Steer Right (Soft)',
  'Steer Right (Hard)',
];

export class DeepQLearningAgent {
  public policyNet: BackpropNetwork;
  public targetNet: BackpropNetwork;
  public vehicle: VehicleModel;
  public lidar: LidarSensor;
  public radar: RadarSensor;

  // Experience Replay & Prioritized Mistake Memory
  private generalMemory: Transition[] = [];
  private mistakeMemory: Transition[] = [];
  private maxMemory: number = 8000;
  private maxMistakes: number = 3000;

  // Hyperparameters
  public gamma: number = 0.95;         // Discount factor
  public epsilon: number = 1.0;        // Exploration rate
  public epsilonMin: number = 0.05;
  public epsilonDecay: number = 0.9985;
  public learningRate: number = 0.0015;
  public batchSize: number = 32;

  // Training state
  public totalSteps: number = 0;
  public episode: number = 1;
  public currentEpisodeReward: number = 0;
  public rollingLoss: number = 0;
  public totalMistakes: number = 0;
  public mistakesAvoided: number = 0;
  public lastMistakeReason: string = 'None yet - Clean run';
  public lastQValues: number[] = new Array(7).fill(0);
  public lastActionIndex: number = 0;

  private prevState: Float32Array | null = null;
  private prevAction: number = 0;
  private stepsSinceTargetUpdate: number = 0;
  private targetUpdateFrequency: number = 180;
  private idleSteps: number = 0;
  private governor: SafetyGovernor = new SafetyGovernor();

  constructor(track: Track) {
    // 26 inputs (LiDAR + Speed + Steer + Lane + Threat + SpeedLimitRatio + CurvatureAhead) -> 36 hidden -> 24 hidden -> 7 actions
    const topology = [26, 36, 24, 7];
    this.policyNet = new BackpropNetwork(topology);
    this.targetNet = new BackpropNetwork(topology);
    this.targetNet.copyFrom(this.policyNet);

    const start = track.frenet.frenetToCartesian(10.0, track.getLaneCenterD(1));
    this.vehicle = new VehicleModel(
      {
        id: 'deep-rl-ego',
        name: 'MistakeLearner RL',
        color: '#06b6d4', // Cyan
        maxSpeed: 42.0,
      },
      start.position,
      start.heading
    );

    this.lidar = new LidarSensor({ rayCount: 20, maxRange: 50.0 });
    this.radar = new RadarSensor(70.0);

    // Restore persistent neural weights and mistake memory from localStorage
    this.loadFromStorage();
  }

  public saveToStorage(): void {
    try {
      const payload = {
        weights: this.policyNet.serialize(),
        topology: [26, 36, 24, 7],
        totalSteps: this.totalSteps,
        totalMistakes: this.totalMistakes,
        mistakesAvoided: this.mistakesAvoided,
        epsilon: this.epsilon,
        timestamp: Date.now(),
      };
      localStorage.setItem('nexus_av_rl_checkpoint_v3', JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save RL checkpoint to localStorage', e);
    }
  }

  public loadFromStorage(): boolean {
    try {
      const raw = localStorage.getItem('nexus_av_rl_checkpoint_v3');
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && data.weights && Array.isArray(data.topology) && data.topology[0] === 26) {
        this.policyNet.deserialize(data.weights);
        this.targetNet.copyFrom(this.policyNet);
        this.totalSteps = data.totalSteps || 0;
        this.totalMistakes = data.totalMistakes || 0;
        this.mistakesAvoided = data.mistakesAvoided || 0;
        this.epsilon = Math.max(this.epsilonMin, data.epsilon ?? 0.1);
        return true;
      }
    } catch (e) {
      console.warn('Failed to load RL checkpoint', e);
    }
    return false;
  }

  public resetMemory(): void {
    try {
      localStorage.removeItem('nexus_av_rl_checkpoint_v3');
      localStorage.removeItem('nexus_av_rl_checkpoint');
    } catch {}
    this.totalSteps = 0;
    this.totalMistakes = 0;
    this.mistakesAvoided = 0;
    this.epsilon = 1.0;
    this.generalMemory = [];
    this.mistakeMemory = [];
    const topology = [26, 36, 24, 7];
    this.policyNet = new BackpropNetwork(topology);
    this.targetNet = new BackpropNetwork(topology);
    this.targetNet.copyFrom(this.policyNet);
  }

  /** Encodes 26 sensory features (360° LiDAR + Speed + Steer + Lane Offset + Rear Threat + SpeedLimitRatio + CurvatureAhead) */
  public getFeatureVector(track: Track): Float32Array {
    const v = this.vehicle.state;
    const lidarReadings = this.lidar.getReadings();
    const frenet = track.frenet.cartesianToFrenet(v.position, v.heading, v.speed);

    const state = new Float32Array(26);
    // 0-19: 360° LiDAR rays
    for (let i = 0; i < 20; i++) {
      state[i] = lidarReadings[i] ?? 1.0;
    }

    // 20: Normalized Speed
    state[20] = Math.max(0, Math.min(1.0, v.speed / this.vehicle.config.maxSpeed));

    // 21: Steer Angle
    state[21] = v.steerAngle / this.vehicle.config.maxSteerAngle;

    // 22: Normalized Lateral Deviation From Lane Center (-1.0 to +1.0)
    const currentLane = track.getLaneIndex(frenet.d);
    const laneCenterD = track.getLaneCenterD(currentLane);
    const laneHalfWidth = track.laneWidth * 0.5;
    state[22] = Math.max(-1.0, Math.min(1.0, (frenet.d - laneCenterD) / laneHalfWidth));

    // 23: Rear Threat Sensor (detects fast closing vehicles behind)
    state[23] = this.radar.rearThreatLevel;

    // 24: Legal Speed Limit Ratio (current speed vs posted legal speed limit)
    const legalLimitKmh = track.getSpeedLimitAtDistance(frenet.s);
    const legalLimitMps = Math.max(5.0, legalLimitKmh / 3.6);
    state[24] = Math.max(0, Math.min(2.0, v.speed / legalLimitMps));

    // 25: Lookahead Road Curvature (anticipates curves 25m ahead)
    const aheadState = track.spline.evaluateAtDistance(frenet.s + 25.0);
    state[25] = Math.min(1.0, Math.abs(aheadState.curvature) * 45.0);

    return state;
  }

  /** Chooses an action via Epsilon-Greedy with Q-value exploitation */
  public selectAction(state: Float32Array): number {
    const qOutputs = this.policyNet.forward(state);
    this.lastQValues = Array.from(qOutputs);

    if (Math.random() < this.epsilon) {
      this.lastActionIndex = Math.floor(Math.random() * 7);
    } else {
      let bestIdx = 0;
      let maxQ = -Infinity;
      for (let i = 0; i < qOutputs.length; i++) {
        if (qOutputs[i] > maxQ) {
          maxQ = qOutputs[i];
          bestIdx = i;
        }
      }
      this.lastActionIndex = bestIdx;
    }

    return this.lastActionIndex;
  }

  /** Translates discrete action (0 to 6) to continuous Vehicle control inputs */
  public actionToControl(action: number): ControlInput {
    switch (action) {
      case 0: // Cruise
        return { throttle: 0.4, brake: 0, steer: 0 };
      case 1: // Accelerate
        return { throttle: 1.0, brake: 0, steer: 0 };
      case 2: // Brake
        return { throttle: 0, brake: 0.9, steer: 0 };
      case 3: // Soft Left
        return { throttle: 0.55, brake: 0, steer: -0.45 };
      case 4: // Hard Left
        return { throttle: 0.3, brake: 0.1, steer: -1.0 };
      case 5: // Soft Right
        return { throttle: 0.55, brake: 0, steer: 0.45 };
      case 6: // Hard Right
        return { throttle: 0.3, brake: 0.1, steer: 1.0 };
      default:
        return { throttle: 0.35, brake: 0, steer: 0 };
    }
  }

  /**
   * Main step of the Online Learning Loop with anti-cheat checks and barrier physics.
   */
  public step(dt: number, track: Track, traffic: VehicleModel[], obstacles: RoadObstacle[] = []): void {
    const v = this.vehicle;

    // 1. 360° Perception
    this.lidar.update(v, track, traffic, obstacles);
    this.radar.update(v, track, traffic);
    const currentState = this.getFeatureVector(track);

    // 2. Evaluate reward and mistake feedback
    if (this.prevState !== null) {
      const { reward, isMistake, reason, done } = this.calculateReward(track, traffic, obstacles);

      const transition: Transition = {
        state: this.prevState,
        action: this.prevAction,
        reward,
        nextState: currentState,
        done,
        isMistake,
        mistakeReason: reason,
      };

      if (isMistake) {
        this.mistakeMemory.push(transition);
        if (this.mistakeMemory.length > this.maxMistakes) this.mistakeMemory.shift();
        this.totalMistakes++;
        this.lastMistakeReason = reason;
      } else {
        this.generalMemory.push(transition);
        if (this.generalMemory.length > this.maxMemory) this.generalMemory.shift();
      }

      this.currentEpisodeReward += reward;

      // 3. Train on Prioritized Mistake Batch
      this.replayTrain();

      if (done) {
        this.saveToStorage();
        this.resetEpisode(track);
        return;
      }
    }

    // 4. Select next action and execute safe physics
    const action = this.selectAction(currentState);
    const rawControl = this.actionToControl(action);
    const safeControl = this.governor.applySafetyShield(
      v,
      track,
      this.lidar,
      this.radar,
      traffic,
      obstacles,
      rawControl,
      dt
    );
    v.step(safeControl, dt);

    // Hard barrier check: keep inside road
    v.enforceTrackBoundary(track);

    this.prevState = currentState;
    this.prevAction = action;
    this.totalSteps++;

    // Periodically save neural weights to browser localStorage
    if (this.totalSteps % 300 === 0) {
      this.saveToStorage();
    }

    if (this.epsilon > this.epsilonMin) {
      this.epsilon *= this.epsilonDecay;
    }

    this.stepsSinceTargetUpdate++;
    if (this.stepsSinceTargetUpdate >= this.targetUpdateFrequency) {
      this.targetNet.copyFrom(this.policyNet);
      this.stepsSinceTargetUpdate = 0;
    }
  }

  private calculateReward(
    track: Track,
    traffic: VehicleModel[],
    obstacles: RoadObstacle[] = []
  ): { reward: number; isMistake: boolean; reason: string; done: boolean } {
    const v = this.vehicle.state;
    const frenet = track.frenet.cartesianToFrenet(v.position, v.heading, v.speed);

    // ANTI-CHEAT: Check if car is driving backwards or flipped wrong-way!
    const roadState = track.spline.evaluateAtDistance(frenet.s);
    const roadHeading = Math.atan2(roadState.tangent.y, roadState.tangent.x);
    const forwardCosine = Math.cos(v.heading - roadHeading);

    if (forwardCosine < 0.1 || v.speed < -0.3) {
      v.isDamaged = true;
      return {
        reward: -100.0,
        isMistake: true,
        reason: 'Wrong-Way / Reverse Driving Disqualified',
        done: true,
      };
    }

    // 0. Collision with Sandbox Obstacles (Cones & Roadblocks)
    for (const obs of obstacles) {
      if (v.position.distance(obs.position) < obs.radius + 1.8) {
        v.isDamaged = true;
        return {
          reward: -100.0,
          isMistake: true,
          reason: `Collided with Road Hazard (${obs.type})`,
          done: true,
        };
      }
    }

    // 1. Critical Mistake: Collided with Track Barrier / Guardrail
    if (!track.isPointOnRoad(v.position) || v.isDamaged) {
      v.isDamaged = true;
      return {
        reward: -90.0,
        isMistake: true,
        reason: 'Crash into Road Guardrail / Border',
        done: true,
      };
    }

    // 2. Critical Mistake: Direct Physical Vehicle Contact (Bumper / Body Touch)
    for (const other of traffic) {
      if (other.state.isDamaged && other.state.speed < 0.1) continue;
      const dist = v.position.distance(other.state.position);
      if (dist < 4.8) {
        const touched = dist < 3.8 || Collision.checkPolygonCollision(this.vehicle.state.polygon, other.state.polygon);
        if (touched) {
          v.isDamaged = true;
          other.state.isDamaged = true;
          return {
            reward: -100.0,
            isMistake: true,
            reason: `Vehicle Contact / Crash into ${other.config.name}`,
            done: true,
          };
        }
      }
    }

    // 3. Stalling / Traffic Obstruction Watchdog
    if (v.speed < 1.0) {
      this.idleSteps++;
      if (this.idleSteps > 110) {
        v.isDamaged = true;
        this.idleSteps = 0;
        return {
          reward: -60.0,
          isMistake: true,
          reason: 'Vehicle Stalled / Blocked Traffic Flow',
          done: true,
        };
      }
    } else {
      this.idleSteps = Math.max(0, this.idleSteps - 1);
    }

    // 3. Significant Mistake: Excessive tire skid
    if (v.isSkidding) {
      return {
        reward: -10.0,
        isMistake: true,
        reason: 'Loss of Lateral Grip (Excessive Cornering Speed)',
        done: false,
      };
    }

    // 4. Mistake: Obstacle Approaching From Rear (Tailgating threat)
    if (this.radar.rearThreatLevel > 0.6) {
      return {
        reward: -4.0,
        isMistake: true,
        reason: 'Obstacle Approaching Rapidly From Rear (Need Acceleration or Lane Shift)',
        done: false,
      };
    }

    // 5. Significant Mistake: Exceeding legal speed limit
    const legalLimitKmh = track.getSpeedLimitAtDistance(frenet.s);
    const legalLimitMps = legalLimitKmh / 3.6;
    if (v.speed > legalLimitMps + 0.85) {
      const overspeed = v.speed - legalLimitMps;
      return {
        reward: -4.0 * overspeed,
        isMistake: true,
        reason: `Exceeded Legal Speed Limit (${Math.round(v.speed * 3.6)} km/h vs ${legalLimitKmh} km/h posted)`,
        done: false,
      };
    }

    // 6. Significant Mistake: Crossing solid lines
    const laneA = track.getLaneIndex(frenet.d);
    const dividerType = track.getDividerTypeAt(Math.max(0, Math.min(track.laneCount - 2, laneA)), frenet.s);
    if (dividerType === 'DOUBLE_SOLID_YELLOW' && frenet.d < 0 && track.isBidirectional) {
      return {
        reward: -8.0,
        isMistake: true,
        reason: 'Crossed Double Solid Yellow Centerline (Head-On Hazard)',
        done: false,
      };
    }
    if (dividerType === 'SOLID_WHITE' && Math.abs(v.steerAngle) > 0.18) {
      return {
        reward: -3.0,
        isMistake: true,
        reason: 'Unlawful Lane Departure Over Solid White Line',
        done: false,
      };
    }

    // 7. Significant Mistake: Lane Straddling (driving on top of divider lines)
    let isStraddlingDivider = false;
    const halfCarW = this.vehicle.config.width * 0.5;
    for (let l = 1; l < track.laneCount; l++) {
      const dividerD = (track.totalWidth * 0.5) - l * track.laneWidth;
      if (Math.abs(frenet.d - dividerD) < halfCarW + 0.15) {
        isStraddlingDivider = true;
        break;
      }
    }
    if (isStraddlingDivider && !v.isBlinkingLeft && !v.isBlinkingRight) {
      return {
        reward: -4.5,
        isMistake: true,
        reason: 'Lane Straddling Violation (Vehicle Driving On Divider Line)',
        done: false,
      };
    }

    // Positive Feedback: Law-abiding forward progression
    let reward = 0;
    if (v.speed > 2.0 && v.speed <= legalLimitMps) {
      reward += (v.speed / legalLimitMps) * 2.2;
    } else if (v.speed > legalLimitMps) {
      reward -= (v.speed - legalLimitMps) * 2.0;
    } else {
      reward -= 0.6; // Penalize idling
    }

    // Reward keeping near lane center
    const laneIdx = track.getLaneIndex(frenet.d);
    const laneCenterD = track.getLaneCenterD(laneIdx);
    const distToCenter = Math.abs(frenet.d - laneCenterD);
    if (distToCenter < 0.6) {
      reward += 1.0;
    }

    // If navigated near an obstacle safely
    if (this.radar.frontTarget && this.radar.frontTarget.distance > 8.0 && this.radar.frontTarget.distance < 20.0) {
      this.mistakesAvoided++;
    }

    return {
      reward,
      isMistake: false,
      reason: 'Normal Forward Cruising',
      done: false,
    };
  }

  public replayTrain(): void {
    const totalTransitions = this.generalMemory.length + this.mistakeMemory.length;
    if (totalTransitions < this.batchSize) return;

    const mistakeSampleSize = Math.min(
      Math.floor(this.batchSize * 0.5),
      this.mistakeMemory.length
    );
    const generalSampleSize = this.batchSize - mistakeSampleSize;

    const batch: Transition[] = [];

    for (let i = 0; i < mistakeSampleSize; i++) {
      const idx = Math.floor(Math.random() * this.mistakeMemory.length);
      batch.push(this.mistakeMemory[idx]);
    }

    for (let i = 0; i < generalSampleSize; i++) {
      const idx = Math.floor(Math.random() * this.generalMemory.length);
      batch.push(this.generalMemory[idx]);
    }

    let batchLossSum = 0;

    for (const item of batch) {
      let targetQ = item.reward;

      if (!item.done) {
        const nextQValues = this.targetNet.forward(item.nextState);
        let maxNextQ = -Infinity;
        for (let a = 0; a < nextQValues.length; a++) {
          if (nextQValues[a] > maxNextQ) {
            maxNextQ = nextQValues[a];
          }
        }
        targetQ += this.gamma * maxNextQ;
      }

      const loss = this.policyNet.trainStep(
        item.state,
        item.action,
        targetQ,
        this.learningRate
      );
      batchLossSum += loss;
    }

    this.rollingLoss = 0.9 * this.rollingLoss + 0.1 * (batchLossSum / batch.length);
  }

  public resetEpisode(track: Track): void {
    const laneStart = track.isBidirectional ? track.oncomingLaneCount : 0;
    const forwardLaneCount = Math.max(1, track.laneCount - laneStart);
    const middleForwardLane = laneStart + Math.floor(forwardLaneCount / 2);
    const start = track.frenet.frenetToCartesian(10.0, track.getLaneCenterD(middleForwardLane));
    this.vehicle.reset(start.position, start.heading);
    this.prevState = null;
    this.episode++;
    this.currentEpisodeReward = 0;
  }

  public getStats(): QLearningStats {
    let phase: 'Exploring' | 'Correcting Mistakes' | 'Fine-Tuning' = 'Exploring';
    if (this.epsilon < 0.25) {
      phase = 'Fine-Tuning';
    } else if (this.mistakeMemory.length > 20) {
      phase = 'Correcting Mistakes';
    }

    return {
      episode: this.episode,
      totalSteps: this.totalSteps,
      epsilon: parseFloat(this.epsilon.toFixed(3)),
      currentLoss: parseFloat(this.rollingLoss.toFixed(4)),
      totalMistakes: this.totalMistakes,
      mistakesAvoided: this.mistakesAvoided,
      lastMistakeReason: this.lastMistakeReason,
      qValues: this.lastQValues.map((v) => parseFloat(v.toFixed(2))),
      chosenActionName: ACTION_NAMES[this.lastActionIndex] || 'Cruise',
      learningPhase: phase,
      averageEpisodeReward: parseFloat(this.currentEpisodeReward.toFixed(1)),
    };
  }
}
