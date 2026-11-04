import { NeuralNetwork } from './NeuralNetwork';
import { VehicleModel } from '../physics/VehicleModel';
import { LidarSensor } from '../sensors/LidarSensor';
import { RadarSensor } from '../sensors/RadarSensor';
import { Track } from '../world/Track';
import { Vector2D } from '../math/Vector2D';
import { ControlInput } from '../physics/VehicleState';
import { Collision } from '../math/Collision';
import { RoadObstacle } from '../world/Obstacle';
import { SafetyGovernor } from '../control/SafetyGovernor';

export interface AgentFitnessStats {
  distance: number;
  avgSpeed: number;
  timeAlive: number;
  laneCentering: number;
  crashes: number;
  overtakes: number;
  score: number;
}

export interface NeuralAgent {
  id: string;
  vehicle: VehicleModel;
  brain: NeuralNetwork;
  sensor: LidarSensor;
  radar: RadarSensor;
  fitness: number;
  stats: AgentFitnessStats;
  isAlive: boolean;
  overtakenVehicles: Set<string>;
  lastS: number;
  stalledFrames: number;
  deadTimer: number;
  assignedLane: number;
  targetLane: number;
}

export class GeneticEngine {
  public population: NeuralAgent[] = [];
  public populationSize: number;
  public generation: number = 1;
  public bestFitness: number = 0;
  public bestBrainEver: NeuralNetwork | null = null;
  public bestAgent: NeuralAgent | null = null;
  public avgFitness: number = 0;

  // Hyperparameters
  public elitismCount: number;
  public mutationRate: number = 0.15;
  public mutationStrength: number = 0.35;
  public randomInjectionRate: number = 0.05;

  public generationFrames: number = 0;
  public maxGenerationFrames: number = 850; // ~16-18s per generation to prevent hangs

  private track: Track;
  private governor: SafetyGovernor = new SafetyGovernor();

  constructor(track: Track, populationSize: number = 40) {
    this.track = track;
    this.populationSize = populationSize;
    this.elitismCount = Math.max(2, Math.floor(populationSize * 0.1));
    this.initPopulation();
    this.loadChampionFromStorage();
  }

  public saveChampionToStorage(): void {
    if (!this.bestBrainEver) return;
    try {
      localStorage.setItem('nexus_av_ga_champion', JSON.stringify(this.bestBrainEver.toJSON()));
    } catch (e) {
      console.warn('Failed to save GA champion to localStorage', e);
    }
  }

  public loadChampionFromStorage(): boolean {
    try {
      const raw = localStorage.getItem('nexus_av_ga_champion');
      if (!raw) return false;
      const json = JSON.parse(raw);
      if (json && json.layers && (json.fitness ?? 0) > 20.0) {
        this.bestBrainEver = NeuralNetwork.fromJSON(json);
        if (this.population.length > 0) {
          this.population[0].brain = this.bestBrainEver.clone();
        }
        return true;
      }
    } catch (e) {
      console.warn('Failed to load GA champion', e);
    }
    return false;
  }

  public setTrack(track: Track): void {
    this.track = track;
    this.resetAllAgents();
  }

  private createDefaultBrain(): NeuralNetwork {
    const net = new NeuralNetwork();
    // Inputs: 20 LiDAR rays (360° omnidirectional) + speed + steer + lane offset + rear radar threat = 24 inputs
    // Hidden 1: 18 neurons (ReLU)
    // Hidden 2: 12 neurons (Tanh)
    // Outputs: 3 outputs [throttle, brake, steer]
    net.addLayer(24, 18, 'relu');
    net.addLayer(18, 12, 'tanh');
    net.addLayer(12, 3, 'tanh');
    return net;
  }

  public getGridStartPosition(agentIndex: number): { pos: Vector2D; heading: number; lane: number; s: number } {
    const laneCount = Math.max(1, this.track.laneCount);
    const lane = agentIndex % laneCount;
    const row = Math.floor(agentIndex / laneCount);
    // Base distance s = 14m for pole position, staggered in clean starting grid boxes by 6m
    const s = 14.0 + row * 6.0;
    const d = this.track.getLaneCenterD(lane);
    const cartesian = this.track.frenet.frenetToCartesian(s, d);
    return {
      pos: cartesian.position,
      heading: cartesian.heading,
      lane,
      s,
    };
  }

  public initPopulation(): void {
    this.population = [];

    for (let i = 0; i < this.populationSize; i++) {
      const grid = this.getGridStartPosition(i);
      const vehicle = new VehicleModel(
        {
          id: `ai-agent-${i}`,
          name: `NeuroBot-${i}`,
          color: i === 0 ? '#10b981' : i < this.elitismCount ? '#f59e0b' : '#ef4444',
          maxSpeed: 40.0,
        },
        grid.pos,
        grid.heading
      );
      vehicle.state.speed = 10.0; // rolling start (~36 km/h)

      const agent: NeuralAgent = {
        id: `agent-${i}`,
        vehicle,
        brain: this.createDefaultBrain(),
        sensor: new LidarSensor({ rayCount: 20, maxRange: 50.0 }),
        radar: new RadarSensor(60.0),
        fitness: 0,
        stats: {
          distance: 0,
          avgSpeed: 0,
          timeAlive: 0,
          laneCentering: 0,
          crashes: 0,
          overtakes: 0,
          score: 0,
        },
        isAlive: true,
        overtakenVehicles: new Set(),
        lastS: grid.s,
        stalledFrames: 0,
        deadTimer: 0,
        assignedLane: grid.lane,
        targetLane: grid.lane,
      };

      this.population.push(agent);
    }

    this.bestAgent = this.population[0];
  }

  public getStartPosition(): { pos: Vector2D; heading: number } {
    const s = 14.0;
    const d = this.track.getLaneCenterD(1); // Middle lane
    const cartesian = this.track.frenet.frenetToCartesian(s, d);
    return {
      pos: cartesian.position,
      heading: cartesian.heading,
    };
  }

  public resetAllAgents(): void {
    this.generationFrames = 0;
    for (let i = 0; i < this.population.length; i++) {
      const agent = this.population[i];
      const grid = this.getGridStartPosition(i);
      agent.vehicle.reset(grid.pos, grid.heading);
      agent.vehicle.state.speed = 10.0; // rolling start
      agent.isAlive = true;
      agent.fitness = 0;
      agent.lastS = grid.s;
      agent.stalledFrames = 0;
      agent.deadTimer = 0;
      agent.assignedLane = grid.lane;
      agent.targetLane = grid.lane;
      agent.overtakenVehicles.clear();
      agent.stats = {
        distance: 0,
        avgSpeed: 0,
        timeAlive: 0,
        laneCentering: 0,
        crashes: 0,
        overtakes: 0,
        score: 0,
      };
    }
  }

  /**
   * Updates all agents, executes 360° perception, enforces barrier physics, anti-reverse checks, and updates fitness.
   */
  public update(dt: number, trafficVehicles: VehicleModel[], obstacles: RoadObstacle[] = []): void {
    let aliveCount = 0;

    for (const agent of this.population) {
      if (!agent.isAlive) continue;

      aliveCount++;
      const v = agent.vehicle;

      // 1. Senses: 360° LiDAR + Front/Rear Radar (including sandbox obstacles)
      agent.sensor.update(v, this.track, trafficVehicles, obstacles);
      agent.radar.update(v, this.track, trafficVehicles);
      const lidarReadings = agent.sensor.getReadings();

      const frenet = this.track.frenet.cartesianToFrenet(
        v.state.position,
        v.state.heading,
        v.state.speed
      );

      // ANTI-CHEAT: Check if car is driving backwards or flipped 180° (Wrong-Way Driving)
      const roadState = this.track.spline.evaluateAtDistance(frenet.s);
      const roadHeading = Math.atan2(roadState.tangent.y, roadState.tangent.x);
      const headingDiff = Math.abs(v.state.heading - roadHeading);
      const forwardCosine = Math.cos(v.state.heading - roadHeading);

      if (forwardCosine < 0.1 || v.state.speed < -0.2) {
        // Cheating detected: Driving backwards or flipped facing wrong-way!
        v.state.isDamaged = true;
        agent.isAlive = false;
        agent.fitness -= 80.0;
        continue;
      }

      // 2. Prepare normalized inputs
      const normalizedSpeed = Math.max(0, Math.min(1.0, v.state.speed / v.config.maxSpeed));
      const normalizedSteer = v.state.steerAngle / v.config.maxSteerAngle;
      const normalizedOffset = Math.max(-1, Math.min(1, frenet.d / (this.track.totalWidth * 0.5)));
      const rearThreat = agent.radar.rearThreatLevel;

      const inputs = new Float32Array(24);
      for (let i = 0; i < 20; i++) {
        inputs[i] = lidarReadings[i] ?? 1.0;
      }
      inputs[20] = normalizedSpeed;
      inputs[21] = normalizedSteer;
      inputs[22] = normalizedOffset;
      inputs[23] = rearThreat;

      // 3. Brain Inference: Decoupled Throttle & Braking
      const outputs = agent.brain.feedForward(inputs);
      let throttle = 0;
      let brake = 0;

      // outputs[0]: Longitudinal drive (-1 full brake to +1 full throttle)
      if (outputs[0] >= 0) {
        throttle = outputs[0];
        brake = 0;
      } else {
        throttle = 0;
        brake = -outputs[0];
      }

      // outputs[1]: High-confidence emergency obstacle brake
      if (outputs[1] > 0.5) {
        brake = Math.max(brake, outputs[1]);
        throttle = 0;
      }

      // outputs[2]: Continuous steering angle (-1 left to +1 right)
      const steer = Math.max(-1, Math.min(1, outputs[2]));

      // 3b. Evaluate Safe Lane Change (Traffic Rules & Non-Chaotic Driving)
      const radarLead = agent.radar.targetDetected ? agent.radar.targetDistance : Infinity;
      const needOvertake = radarLead < 22.0 || agent.radar.closingSpeed > 3.0;

      if (needOvertake && Math.random() < 0.05) {
        const candidateLanes: number[] = [];
        if (agent.assignedLane > 0) candidateLanes.push(agent.assignedLane - 1);
        if (agent.assignedLane < this.track.laneCount - 1) candidateLanes.push(agent.assignedLane + 1);

        for (const targetL of candidateLanes) {
          if (this.governor.isLaneChangeSafe(v, this.track, trafficVehicles, targetL)) {
            agent.assignedLane = targetL;
            break;
          }
        }
      }

      // 3c. Apply Automotive Safety Shield (LiDAR Wall Repulsion + Lane Centering + AEB)
      const rawControl: ControlInput = { throttle, brake, steer };
      const safeControl = this.governor.applySafetyShield(
        v,
        this.track,
        agent.sensor,
        agent.radar,
        trafficVehicles,
        obstacles,
        rawControl,
        dt,
        agent.assignedLane
      );

      v.step(safeControl, dt);

      // 4. Hard Barrier / Wall Collision check
      const hitBarrier = v.enforceTrackBoundary(this.track);
      if (hitBarrier) {
        agent.isAlive = false;
        agent.stats.crashes++;
        agent.fitness -= 60.0;
        continue;
      }

      // 5. Physical Vehicle-to-Vehicle Collision Check (SAT polygon / Bumper Touch)
      for (const t of trafficVehicles) {
        if (t.state.isDamaged && t.state.speed < 0.1) continue;
        const dist = v.state.position.distance(t.state.position);
        if (dist < 4.8) {
          const touched = dist < 3.8 || Collision.checkPolygonCollision(v.state.polygon, t.state.polygon);
          if (touched) {
            v.state.isDamaged = true;
            t.state.isDamaged = true;
            agent.isAlive = false;
            agent.stats.crashes++;
            agent.fitness -= 85.0;
            break;
          }
        }
      }

      // 6. Collision with Sandbox Road Hazards (Traffic Cones & Barriers)
      if (agent.isAlive) {
        for (const obs of obstacles) {
          if (v.state.position.distance(obs.position) < obs.radius + 1.8) {
            v.state.isDamaged = true;
            agent.isAlive = false;
            agent.stats.crashes++;
            agent.fitness -= 90.0;
            break;
          }
        }
      }

      // Anti-stalling / Parking Watchdog: eliminate cars that refuse to drive forward
      if (agent.isAlive) {
        if (v.state.speed < 1.5) {
          agent.stalledFrames++;
          if (agent.stalledFrames > 300) {
            v.state.isDamaged = true;
            agent.isAlive = false;
            agent.fitness -= 100.0;
            continue;
          }
        } else {
          agent.stalledFrames = Math.max(0, agent.stalledFrames - 1);
        }
      }

      // 5. Update Statistics and Forward Progress Reward
      agent.stats.timeAlive += dt;

      // Track true forward distance along path (not raw hypot)
      let forwardDeltaS = frenet.s - agent.lastS;
      if (this.track.closed) {
        if (forwardDeltaS < -this.track.spline.totalLength * 0.5) forwardDeltaS += this.track.spline.totalLength;
      }
      agent.lastS = frenet.s;

      if (forwardDeltaS > 0) {
        agent.stats.distance += forwardDeltaS;
        // Reward forward progression
        agent.fitness += forwardDeltaS * 1.8;
      } else {
        // Penalize reversing / regression
        agent.fitness -= 5.0 * dt;
      }

      // Bonus for lane centering
      const targetLaneD = this.track.getLaneCenterD(this.track.getLaneIndex(frenet.d));
      const distFromLaneCenter = Math.abs(frenet.d - targetLaneD);
      if (distFromLaneCenter < 0.6) {
        agent.fitness += 0.8 * dt;
      }

      // Penalty for high lateral acceleration / jerky skidding
      if (v.state.isSkidding) {
        agent.fitness -= 1.5 * dt;
      }

      // Bonus for clean overtake
      for (const t of trafficVehicles) {
        if (!agent.overtakenVehicles.has(t.config.id)) {
          const tFrenet = this.track.frenet.cartesianToFrenet(t.state.position, t.state.heading, t.state.speed);
          if (frenet.s > tFrenet.s && frenet.s - tFrenet.s < 20) {
            agent.overtakenVehicles.add(t.config.id);
            agent.stats.overtakes++;
            agent.fitness += 40.0; // Clean overtake rewarded
          }
        }
      }

      agent.stats.score = agent.fitness;
    }

    // Identify current best performer
    let topFitness = -Infinity;
    let topAgent = this.population[0];
    for (const agent of this.population) {
      if (agent.fitness > topFitness) {
        topFitness = agent.fitness;
        topAgent = agent;
      }
    }
    this.bestAgent = topAgent;

    this.generationFrames++;

    // Trigger next generation if all agents have crashed OR generation timer expired
    if (aliveCount === 0 || this.generationFrames >= this.maxGenerationFrames) {
      this.evolveNextGeneration();
    }
  }

  /**
   * Advances the evolutionary cycle by selecting top champions, crossing over, and mutating.
   */
  public evolveNextGeneration(): void {
    this.generationFrames = 0;
    this.population.sort((a, b) => b.fitness - a.fitness);

    const currentBest = this.population[0];
    if (currentBest.fitness > this.bestFitness) {
      this.bestFitness = currentBest.fitness;
      this.bestBrainEver = currentBest.brain.clone();
      this.saveChampionToStorage();
    }

    let sumFitness = 0;
    for (const a of this.population) sumFitness += Math.max(0, a.fitness);
    this.avgFitness = sumFitness / this.population.length;

    const nextBrains: NeuralNetwork[] = [];

    // 1. Elitism: preserve top performers untouched
    for (let i = 0; i < this.elitismCount; i++) {
      const elite = this.population[i].brain.clone();
      elite.generation = this.generation;
      nextBrains.push(elite);
    }

    // 2. Crossover & Mutation pool from top 40%
    const matingPoolSize = Math.max(4, Math.floor(this.populationSize * 0.4));
    const randomCount = Math.floor(this.populationSize * this.randomInjectionRate);
    const needToGenerate = this.populationSize - nextBrains.length - randomCount;

    for (let i = 0; i < needToGenerate; i++) {
      const parentA = this.population[Math.floor(Math.random() * matingPoolSize)].brain;
      const parentB = this.population[Math.floor(Math.random() * matingPoolSize)].brain;

      const child = NeuralNetwork.crossover(parentA, parentB);
      child.mutate(this.mutationRate, this.mutationStrength);
      child.generation = this.generation;
      nextBrains.push(child);
    }

    // 3. Fresh random brains injection
    for (let i = 0; i < randomCount; i++) {
      nextBrains.push(this.createDefaultBrain());
    }

    // Apply new brains and reset vehicles on staggered grid boxes
    for (let i = 0; i < this.population.length; i++) {
      const agent = this.population[i];
      const grid = this.getGridStartPosition(i);
      agent.brain = nextBrains[i] || this.createDefaultBrain();
      agent.vehicle.reset(grid.pos, grid.heading);
      agent.vehicle.state.speed = 10.0; // rolling start
      agent.vehicle.config.color = i === 0 ? '#10b981' : i < this.elitismCount ? '#f59e0b' : '#ef4444';
      agent.isAlive = true;
      agent.fitness = 0;
      agent.lastS = grid.s;
      agent.stalledFrames = 0;
      agent.deadTimer = 0;
      agent.assignedLane = grid.lane;
      agent.targetLane = grid.lane;
      agent.overtakenVehicles.clear();
      agent.stats = {
        distance: 0,
        avgSpeed: 0,
        timeAlive: 0,
        laneCentering: 0,
        crashes: 0,
        overtakes: 0,
        score: 0,
      };
    }

    this.generation++;
  }

  public exportBestBrain(): any {
    const brain = this.bestBrainEver || this.bestAgent?.brain || this.population[0]?.brain;
    if (!brain) return null;
    return {
      type: 'NEUROEVOLUTION',
      version: 1,
      generation: this.generation,
      bestFitness: parseFloat(this.bestFitness.toFixed(1)),
      brain: brain.toJSON(),
      timestamp: Date.now(),
    };
  }

  public importBrain(data: any): boolean {
    try {
      if (data && data.brain) {
        const net = NeuralNetwork.fromJSON(data.brain);
        this.bestBrainEver = net;
        // Inject into top elite agents
        for (let i = 0; i < Math.min(6, this.population.length); i++) {
          this.population[i].brain = net.clone();
        }
        return true;
      }
    } catch (e) {
      console.warn('Failed to import brain:', e);
    }
    return false;
  }
}
