import { Vector2D } from '../math/Vector2D';
import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { IntelligentDriverModel, IDMParameters } from './IDM';
import { MOBILLaneChanger } from './MOBIL';
import { RoadObstacle } from '../world/Obstacle';
import { Collision } from '../math/Collision';

export interface TrafficVehicleAgent {
  vehicle: VehicleModel;
  idm: IntelligentDriverModel;
  mobil: MOBILLaneChanger;
  currentLaneIndex: number;
  targetLaneIndex: number;
  laneChangeProgress: number; // 0 to 1
  isChangingLane: boolean;
  color: string;
  damageTimer: number;
}

export class TrafficManager {
  public agents: TrafficVehicleAgent[] = [];
  private track: Track;

  constructor(track: Track) {
    this.track = track;
  }

  public setTrack(track: Track): void {
    this.track = track;
    this.agents = [];
  }

  public spawnFleet(count: number): void {
    this.agents = [];
    const totalLength = this.track.spline.totalLength;
    if (totalLength < 50) return;

    const spacing = totalLength / Math.max(1, count + 1);
    const colors = ['#0284c7', '#0d9488', '#d97706', '#64748b', '#7c3aed', '#db2777'];

    for (let i = 0; i < count; i++) {
      const s = ((i + 1) * spacing + (Math.random() - 0.5) * 10) % totalLength;
      const laneIdx = i % this.track.laneCount;
      const isOncoming = this.track.isOncomingLane(laneIdx);
      const targetD = this.track.getLaneCenterD(laneIdx);

      const cartesian = this.track.frenet.frenetToCartesian(s, targetD);
      const speedVariation = 19.0 + (i % 3) * 3.5; // 19 - 26 m/s (~68 - 94 km/h)
      const heading = isOncoming ? (cartesian.heading + Math.PI) : cartesian.heading;

      const vehicle = new VehicleModel(
        {
          id: `traffic-${i}`,
          name: `NPC-${i}`,
          color: colors[i % colors.length],
          maxSpeed: 38.0,
          length: 4.5,
          width: 2.0,
        },
        cartesian.position,
        heading
      );
      vehicle.state.speed = speedVariation;

      const idmParams: Partial<IDMParameters> = {
        desiredSpeed: speedVariation,
        timeHeadway: 1.4,
        minGap: 3.5,
        maxAcceleration: 2.5,
        comfortableDecel: 3.5,
      };

      this.agents.push({
        vehicle,
        idm: new IntelligentDriverModel(idmParams),
        mobil: new MOBILLaneChanger(),
        currentLaneIndex: laneIdx,
        targetLaneIndex: laneIdx,
        laneChangeProgress: 1.0,
        isChangingLane: false,
        color: vehicle.config.color,
        damageTimer: 0,
      });
    }
  }

  private respawnAgent(agent: TrafficVehicleAgent, egoVehicle?: VehicleModel): void {
    const totalLength = this.track.spline.totalLength;
    let baseS = 0;
    if (egoVehicle) {
      const egoFrenet = this.track.frenet.cartesianToFrenet(egoVehicle.state.position, egoVehicle.state.heading, egoVehicle.state.speed);
      baseS = egoFrenet.s;
    }
    const laneIdx = Math.floor(Math.random() * this.track.laneCount);
    const isOncoming = this.track.isOncomingLane(laneIdx);
    const targetD = this.track.getLaneCenterD(laneIdx);

    const spawnS = isOncoming
      ? (baseS + 130 + Math.random() * 80) % totalLength
      : (baseS + 80 + Math.random() * 60) % totalLength;
    const cartesian = this.track.frenet.frenetToCartesian(spawnS, targetD);
    const heading = isOncoming ? (cartesian.heading + Math.PI) : cartesian.heading;

    agent.vehicle.reset(cartesian.position, heading);
    agent.vehicle.state.speed = 20.0 + Math.random() * 5.0;
    agent.currentLaneIndex = laneIdx;
    agent.targetLaneIndex = laneIdx;
    agent.isChangingLane = false;
    agent.laneChangeProgress = 1.0;
    agent.damageTimer = 0;
  }

  /**
   * Updates all NPC traffic over timestep dt using IDM, verified lane-changing, and physical collision resolution.
   */
  public update(dt: number, egoVehicle?: VehicleModel, obstacles: RoadObstacle[] = []): void {
    const allVehicles = [...this.agents.map((a) => a.vehicle)];
    if (egoVehicle) allVehicles.push(egoVehicle);

    for (const agent of this.agents) {
      if (agent.vehicle.state.isDamaged) {
        agent.damageTimer += dt;
        agent.vehicle.state.speed *= Math.max(0, 1 - 4 * dt);
        if (agent.damageTimer > 3.0) {
          this.respawnAgent(agent, egoVehicle);
        }
        continue;
      }

      // Check collision with road hazards
      for (const obs of obstacles) {
        if (agent.vehicle.state.position.distance(obs.position) < obs.radius + 1.8) {
          agent.vehicle.state.isDamaged = true;
          break;
        }
      }

      const vState = agent.vehicle.state;
      const frenet = this.track.frenet.cartesianToFrenet(vState.position, vState.heading, vState.speed);

      // 1. Find leading vehicle. If changing lanes, track leader in the target destination lane!
      const trackingLaneIndex = agent.isChangingLane ? agent.targetLaneIndex : agent.currentLaneIndex;
      const trackingLaneD = this.track.getLaneCenterD(trackingLaneIndex);

      let leaderDist = Infinity;
      let leaderSpeed = 0;
      let leaderIsDamaged = false;

      for (const other of allVehicles) {
        if (other === agent.vehicle) continue;
        const otherFrenet = this.track.frenet.cartesianToFrenet(other.state.position, other.state.heading, other.state.speed);

        let deltaS = otherFrenet.s - frenet.s;
        if (this.track.closed) {
          if (deltaS < -this.track.spline.totalLength * 0.5) deltaS += this.track.spline.totalLength;
          if (deltaS > this.track.spline.totalLength * 0.5) deltaS -= this.track.spline.totalLength;
        }

        const deltaD = Math.abs(otherFrenet.d - trackingLaneD);
        if (deltaS > 0 && deltaS < 90.0 && deltaD < this.track.laneWidth * 0.8) {
          const bumperDist = deltaS - (agent.vehicle.config.length + other.config.length) * 0.5;
          if (bumperDist < leaderDist) {
            leaderDist = bumperDist;
            leaderSpeed = other.state.speed;
            leaderIsDamaged = other.state.isDamaged;
          }
        }
      }

      // 2. Safe Lane Following & Active Obstacle Overtaking
      let targetD = this.track.getLaneCenterD(agent.currentLaneIndex);

      if (agent.isChangingLane) {
        agent.laneChangeProgress += dt * 0.7; // ~1.4s brisk, decisive lane transition
        const fromD = this.track.getLaneCenterD(agent.currentLaneIndex);
        const toD = this.track.getLaneCenterD(agent.targetLaneIndex);
        targetD = fromD + (toD - fromD) * Math.min(1, agent.laneChangeProgress);

        if (agent.laneChangeProgress >= 1.0) {
          agent.currentLaneIndex = agent.targetLaneIndex;
          agent.isChangingLane = false;
          agent.vehicle.state.isBlinkingLeft = false;
          agent.vehicle.state.isBlinkingRight = false;
        }
      } else {
        const isObstacleAhead = leaderDist < 35.0 && (leaderIsDamaged || leaderSpeed < 3.0);
        const isSlowMoving = leaderDist < 25.0 && leaderSpeed < agent.idm.params.desiredSpeed * 0.75;

        // If stopped/damaged obstacle ahead, evaluate EVERY frame! If slow moving, evaluate periodically.
        const shouldCheckOvertake = isObstacleAhead || (isSlowMoving && Math.random() < 0.08);

        if (shouldCheckOvertake) {
          const candidateLanes: number[] = [];
          const isOncoming = this.track.isOncomingLane(agent.currentLaneIndex);

          if (this.track.isBidirectional) {
            if (isOncoming) {
              // Respect double solid yellow: stay strictly in oncoming lanes (0 to oncomingLaneCount - 1)
              if (agent.currentLaneIndex > 0) candidateLanes.push(agent.currentLaneIndex - 1);
              if (agent.currentLaneIndex < this.track.oncomingLaneCount - 1) candidateLanes.push(agent.currentLaneIndex + 1);
            } else {
              // Respect double solid yellow: stay strictly in forward lanes (oncomingLaneCount to laneCount - 1)
              if (agent.currentLaneIndex > this.track.oncomingLaneCount) candidateLanes.push(agent.currentLaneIndex - 1);
              if (agent.currentLaneIndex < this.track.laneCount - 1) candidateLanes.push(agent.currentLaneIndex + 1);
            }
          } else {
            if (agent.currentLaneIndex > 0) candidateLanes.push(agent.currentLaneIndex - 1);
            if (agent.currentLaneIndex < this.track.laneCount - 1) candidateLanes.push(agent.currentLaneIndex + 1);
          }

          for (const candidate of candidateLanes) {
            // Traffic Rule Enforcement: Strictly forbid lane changes across solid lines, warning lines, or median
            if (!this.track.isLaneChangeAllowed(agent.currentLaneIndex, candidate, frenet.s)) {
              continue;
            }

            const candD = this.track.getLaneCenterD(candidate);
            let laneIsClear = true;

            // Strict traffic rules: ensure target lane is clean and do not cut off vehicles behind
            const minBehind = -12.0;
            const minAhead = isObstacleAhead ? 10.0 : 18.0;

            for (const other of allVehicles) {
              if (other === agent.vehicle) continue;
              const oFrenet = this.track.frenet.cartesianToFrenet(other.state.position, other.state.heading, other.state.speed);
              const dDiff = Math.abs(oFrenet.d - candD);

              if (dDiff < this.track.laneWidth * 0.75) {
                let sDist = oFrenet.s - frenet.s;
                if (this.track.closed) {
                  if (sDist < -this.track.spline.totalLength * 0.5) sDist += this.track.spline.totalLength;
                  if (sDist > this.track.spline.totalLength * 0.5) sDist -= this.track.spline.totalLength;
                }
                if (sDist > minBehind && sDist < minAhead) {
                  laneIsClear = false;
                  break;
                }
                // Time-To-Collision check: never cut off a faster vehicle approaching from behind
                if (sDist < 0 && sDist > -25.0 && other.state.speed > agent.vehicle.state.speed) {
                  const closingSpeed = other.state.speed - agent.vehicle.state.speed;
                  const ttc = Math.abs(sDist) / closingSpeed;
                  if (ttc < 3.0) {
                    laneIsClear = false;
                    break;
                  }
                }
              }
            }

            if (laneIsClear) {
              agent.targetLaneIndex = candidate;
              agent.isChangingLane = true;
              agent.laneChangeProgress = 0;
              if (candidate > agent.currentLaneIndex) {
                agent.vehicle.state.isBlinkingRight = true;
                agent.vehicle.state.isBlinkingLeft = false;
              } else {
                agent.vehicle.state.isBlinkingLeft = true;
                agent.vehicle.state.isBlinkingRight = false;
              }
              break;
            }
          }
        }
      }

      // 3. IDM longitudinal acceleration
      const accel = agent.idm.calculateAcceleration(vState.speed, leaderDist, leaderSpeed);
      let throttle = 0;
      let brake = 0;
      if (accel >= 0) {
        throttle = Math.min(1.0, accel / agent.vehicle.config.acceleration);
      } else {
        brake = Math.min(1.0, Math.abs(accel) / agent.vehicle.config.brakeDecel);
      }

      // If bypassing an obstacle in a lane shift, provide crawl/bypass throttle so car doesn't get pinned at 0 km/h
      if (agent.isChangingLane && vState.speed < 6.0) {
        throttle = Math.max(0.55, throttle);
        brake = 0;
      }

      // Lateral steering towards target lookahead point along path
      const isOncoming = this.track.isOncomingLane(agent.currentLaneIndex);
      const lookaheadDist = Math.max(9.0, vState.speed * 0.9);
      let targetS = isOncoming ? frenet.s - lookaheadDist : frenet.s + lookaheadDist;
      if (this.track.closed) {
        if (targetS < 0) targetS += this.track.spline.totalLength;
        if (targetS >= this.track.spline.totalLength) targetS -= this.track.spline.totalLength;
      }
      const targetCartesian = this.track.frenet.frenetToCartesian(targetS, targetD);

      const toTarget = targetCartesian.position.sub(vState.position);
      const targetAngle = toTarget.angle();
      let angleDiff = targetAngle - vState.heading;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      const steer = Math.max(-1.0, Math.min(1.0, angleDiff * 2.5));
      agent.vehicle.step({ throttle, brake, steer }, dt);
    }

    // 4. Elastic Separation & Collision Physics: Prevent cars from ever overlapping!
    this.resolvePhysicalOverlaps(allVehicles);
  }

  /**
   * Enforces physical rigid-body separation so vehicles never overlap or phase through each other.
   * Uses SAT polygon collision to strictly avoid phantom pushes between cars in adjacent lanes!
   */
  private resolvePhysicalOverlaps(vehicles: VehicleModel[]): void {
    for (let i = 0; i < vehicles.length; i++) {
      const vA = vehicles[i];
      for (let j = i + 1; j < vehicles.length; j++) {
        const vB = vehicles[j];

        const delta = vA.state.position.sub(vB.state.position);
        const distSq = delta.magnitudeSq();

        // Broad-phase: vehicles have a bounding radius of ~2.5m, so 25.0m² max check threshold
        if (distSq > 24.0) continue;

        // Narrow-phase SAT check: only nudge if the actual rectangular bodies physically overlap!
        const isColliding = Collision.checkPolygonCollision(vA.state.polygon, vB.state.polygon);
        if (!isColliding) continue;

        const dist = Math.sqrt(distSq);
        if (dist > 1e-4) {
          const separationNormal = delta.scale(1 / dist);
          const push = separationNormal.scale(0.06);

          vA.state.position = vA.state.position.add(push);
          vB.state.position = vB.state.position.sub(push);
          vA.updatePolygon();
          vB.updatePolygon();
        }
      }
    }
  }

  public getVehicles(): VehicleModel[] {
    return this.agents.map((a) => a.vehicle);
  }
}
