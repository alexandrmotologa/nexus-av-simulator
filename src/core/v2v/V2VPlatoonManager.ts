import { Vector2D } from '../math/Vector2D';
import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { RadarSensor } from '../sensors/RadarSensor';
import { LidarSensor } from '../sensors/LidarSensor';
import { RoadObstacle } from '../world/Obstacle';
import { SafetyGovernor } from '../control/SafetyGovernor';
import { ControlInput } from '../physics/VehicleState';

export interface V2VMessage {
  senderId: string;
  platoonId: string;
  index: number;
  position: Vector2D;
  speed: number;
  acceleration: number;
  heading: number;
  targetSpeed: number;
  brakeActive: boolean;
  turnSignal: 'NONE' | 'LEFT' | 'RIGHT';
  timestamp: number;
}

export interface PlatoonMember {
  vehicle: VehicleModel;
  radar: RadarSensor;
  lidar: LidarSensor;
  role: 'LEADER' | 'FOLLOWER';
  index: number;
  assignedLane: number;
  targetLane: number;
  draftSavingsPct: number;
  lastGap: number;
  lastTTC: number;
  v2vLatencyMs: number;
}

export interface PlatoonTelemetry {
  isActive: boolean;
  memberCount: number;
  targetSpeedKmh: number;
  timeHeadwaySec: number;
  averageGapMeters: number;
  averageDraftSavingsPct: number;
  v2vPacketRateHz: number;
  latencyMs: number;
  isManeuverActive: boolean;
  currentManeuver: string;
  members: {
    id: string;
    speedKmh: number;
    gapMeters: number;
    draftPct: number;
    role: string;
  }[];
}

export class V2VPlatoonManager {
  public isActive: boolean = false;
  public platoonId: string = 'PLATOON-ALPHA';
  public members: PlatoonMember[] = [];
  public targetSpeed: number = 25.0; // 90 km/h
  public timeHeadway: number = 0.65; // Ultra-tight 0.65s CACC headway
  public standstillGap: number = 4.0; // meters

  // CACC Controller gains
  private kp: number = 0.85;
  private kd: number = 1.35;
  private kff: number = 0.95;

  // Maneuver state machine (Coordinated Lane Change)
  public isManeuverActive: boolean = false;
  public maneuverPhase: 'IDLE' | 'TAIL_SECURING' | 'CASCADE_SHIFT' | 'SETTLING' = 'IDLE';
  public maneuverTimer: number = 0;
  public targetManeuverLane: number = 0;
  public maneuverDescription: string = 'STEADY CRUISE';

  private governor: SafetyGovernor = new SafetyGovernor();
  private v2vMeshBus: Map<string, V2VMessage> = new Map();

  constructor() {}

  /**
   * Spawns or re-assembles an aerodynamic connected platoon of N vehicles
   */
  public activatePlatoon(
    track: Track,
    leadCandidate?: VehicleModel | null,
    memberCount: number = 4
  ): void {
    this.deactivatePlatoon();
    this.isActive = true;
    this.members = [];
    this.isManeuverActive = false;
    this.maneuverPhase = 'IDLE';
    this.maneuverDescription = 'CONNECTED CACC CRUISE';

    const forwardLaneStart = track.isBidirectional ? track.oncomingLaneCount : 0;
    const forwardLanes = Math.max(1, track.laneCount - forwardLaneStart);
    // Prefer right-hand cruising lane or middle lane
    const baseLane = forwardLaneStart + Math.min(1, forwardLanes - 1);
    const laneCenterD = track.getLaneCenterD(baseLane);

    let startS = 40.0;
    if (leadCandidate) {
      const leadFrenet = track.frenet.cartesianToFrenet(
        leadCandidate.state.position,
        leadCandidate.state.heading,
        leadCandidate.state.speed
      );
      startS = leadFrenet.s;
    }

    const colors = ['#06b6d4', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

    for (let i = 0; i < memberCount; i++) {
      // Leader is at front; followers staggered behind by desired standstill gap + headway buffer (~9m spacing)
      let memberS = startS - i * 9.5;
      if (track.closed && memberS < 0) {
        memberS += track.spline.totalLength;
      }

      const cartesian = track.frenet.frenetToCartesian(memberS, laneCenterD);
      const vehicle = new VehicleModel(
        {
          id: `platoon-car-${i}`,
          name: i === 0 ? 'Platoon Leader' : `Platoon Follower #${i}`,
          color: colors[i % colors.length],
          maxSpeed: 38.0,
          acceleration: 4.5,
          brakeDecel: 9.0,
        },
        cartesian.position,
        cartesian.heading
      );
      vehicle.state.speed = this.targetSpeed;

      const member: PlatoonMember = {
        vehicle,
        radar: new RadarSensor(60.0),
        lidar: new LidarSensor({ rayCount: 20, maxRange: 50.0 }),
        role: i === 0 ? 'LEADER' : 'FOLLOWER',
        index: i,
        assignedLane: baseLane,
        targetLane: baseLane,
        draftSavingsPct: 0,
        lastGap: 9.5,
        lastTTC: Infinity,
        v2vLatencyMs: Math.round(12 + Math.random() * 6), // 12-18ms realistic C-V2X latency
      };

      this.members.push(member);
    }
  }

  public deactivatePlatoon(): void {
    this.isActive = false;
    this.members = [];
    this.v2vMeshBus.clear();
    this.isManeuverActive = false;
    this.maneuverPhase = 'IDLE';
  }

  /**
   * Main Physics & CACC Cooperative Control Loop
   */
  public update(
    dt: number,
    track: Track,
    allTraffic: VehicleModel[],
    obstacles: RoadObstacle[] = []
  ): void {
    if (!this.isActive || this.members.length === 0) return;

    // 1. Broadcast simulated 5.9 GHz C-V2X V2V radio packets into mesh
    this.v2vMeshBus.clear();
    for (const m of this.members) {
      const v = m.vehicle.state;
      this.v2vMeshBus.set(m.vehicle.config.id, {
        senderId: m.vehicle.config.id,
        platoonId: this.platoonId,
        index: m.index,
        position: v.position.clone(),
        speed: v.speed,
        acceleration: v.longitudinalAcc,
        heading: v.heading,
        targetSpeed: this.targetSpeed,
        brakeActive: v.longitudinalAcc < -0.8,
        turnSignal: v.isBlinkingLeft ? 'LEFT' : v.isBlinkingRight ? 'RIGHT' : 'NONE',
        timestamp: performance.now(),
      });
    }

    // 2. Advance coordinated maneuver state machine if engaged
    this.updateManeuverStateMachine(dt, track, allTraffic);

    // 3. Compute control inputs and aerodynamic drafting physics for each vehicle
    const platoonVehicles = this.members.map((m) => m.vehicle);
    const nonPlatoonTraffic = allTraffic.filter(
      (t) => !this.members.some((m) => m.vehicle.config.id === t.config.id)
    );

    const leader = this.members[0];

    for (let i = 0; i < this.members.length; i++) {
      const member = this.members[i];
      const v = member.vehicle;

      // Update radar with all surrounding traffic and platoon members
      const surroundingVehicles = [...nonPlatoonTraffic, ...platoonVehicles.filter((pv) => pv !== v)];
      member.radar.update(v, track, surroundingVehicles);

      const frenet = track.frenet.cartesianToFrenet(v.state.position, v.state.heading, v.state.speed);

      if (member.role === 'LEADER') {
        // Leader: Standard Adaptive Autonomous Cruise to posted speed limit
        const activeSpeedLimit = track.getSpeedLimitAtDistance(frenet.s);
        const legalTargetSpeed = Math.min(this.targetSpeed, activeSpeedLimit / 3.6);

        let accelCmd = (legalTargetSpeed - v.state.speed) * 0.75;

        // Front obstacle / slow traffic check
        if (member.radar.targetDetected && member.radar.targetDistance < 28.0) {
          const gap = member.radar.targetDistance;
          const relSpeed = member.radar.closingSpeed;
          accelCmd = Math.min(accelCmd, (gap - 16.0) * 0.5 - relSpeed * 0.8);
        }

        let throttle = 0;
        let brake = 0;
        if (accelCmd >= 0) {
          throttle = Math.min(1.0, accelCmd / v.config.acceleration);
        } else {
          brake = Math.min(1.0, Math.abs(accelCmd) / v.config.brakeDecel);
        }

        // Steer along assigned lane center
        const targetD = track.getLaneCenterD(member.assignedLane);
        const lookaheadS = frenet.s + Math.max(10.0, v.state.speed * 0.9);
        const goalCartesian = track.frenet.frenetToCartesian(lookaheadS, targetD);
        const toGoal = goalCartesian.position.sub(v.state.position);
        let alpha = toGoal.angle() - v.state.heading;
        while (alpha > Math.PI) alpha -= 2 * Math.PI;
        while (alpha < -Math.PI) alpha += 2 * Math.PI;

        const Ld = Math.max(1.0, toGoal.magnitude());
        const curvature = (2.0 * Math.sin(alpha)) / Ld;
        const steerAngle = Math.atan(curvature * v.config.wheelbase);
        const rawSteer = Math.max(-1.0, Math.min(1.0, steerAngle / v.config.maxSteerAngle));

        const rawControl: ControlInput = { throttle, brake, steer: rawSteer };
        member.lidar.update(v, track, surroundingVehicles, obstacles);
        const safeControl = this.governor.applySafetyShield(
          v,
          track,
          member.lidar,
          member.radar,
          nonPlatoonTraffic,
          obstacles,
          rawControl,
          dt,
          member.assignedLane
        );

        v.step(safeControl, dt);
        member.draftSavingsPct = 0; // Leader breaks the wind
      } else {
        // Follower: CACC (Cooperative Adaptive Cruise Control) using V2V Broadcast from Leader + Predecessor
        const predecessor = this.members[i - 1];
        const predMsg = this.v2vMeshBus.get(predecessor.vehicle.config.id);
        const leadMsg = this.v2vMeshBus.get(leader.vehicle.config.id);

        const currentGap = v.state.position.distance(predecessor.vehicle.state.position) - predecessor.vehicle.config.length;
        member.lastGap = Math.max(0.1, currentGap);

        // Desired safe spacing with constant time-headway
        const desiredGap = this.standstillGap + this.timeHeadway * v.state.speed;
        const gapError = currentGap - desiredGap;
        const speedError = v.state.speed - (predMsg?.speed ?? predecessor.vehicle.state.speed);

        // Feedforward acceleration from predecessor + leader
        const predAccel = predMsg?.acceleration ?? predecessor.vehicle.state.longitudinalAcc;
        const leadAccel = leadMsg?.acceleration ?? leader.vehicle.state.longitudinalAcc;
        const feedforward = this.kff * (0.65 * predAccel + 0.35 * leadAccel);

        // CACC string-stable control law:
        let caccAccel = feedforward + this.kp * gapError - this.kd * speedError;

        // Emergency safety override if gap drops below critical 2.5m
        if (currentGap < 2.5) {
          caccAccel = -8.0; // Hard braking to protect formation
        }

        let throttle = 0;
        let brake = 0;
        if (caccAccel >= 0) {
          throttle = Math.min(1.0, caccAccel / v.config.acceleration);
        } else {
          brake = Math.min(1.0, Math.abs(caccAccel) / v.config.brakeDecel);
        }

        // Lateral steering: track assigned lane center
        const targetD = track.getLaneCenterD(member.assignedLane);
        const lookaheadS = frenet.s + Math.max(8.0, v.state.speed * 0.85);
        const goalCartesian = track.frenet.frenetToCartesian(lookaheadS, targetD);
        const toGoal = goalCartesian.position.sub(v.state.position);
        let alpha = toGoal.angle() - v.state.heading;
        while (alpha > Math.PI) alpha -= 2 * Math.PI;
        while (alpha < -Math.PI) alpha += 2 * Math.PI;

        const Ld = Math.max(1.0, toGoal.magnitude());
        const curvature = (2.0 * Math.sin(alpha)) / Ld;
        const steerAngle = Math.atan(curvature * v.config.wheelbase);
        const steer = Math.max(-1.0, Math.min(1.0, steerAngle / v.config.maxSteerAngle));

        const control: ControlInput = { throttle, brake, steer };
        v.step(control, dt);

        // Aerodynamic slipstream drafting physics
        // Tight drafting gap (under 12m) significantly reduces aerodynamic drag
        const draftFactor = Math.max(0, Math.min(1.0, 1.0 - currentGap / 12.0));
        member.draftSavingsPct = Math.round(draftFactor * 26.5 * 10) / 10; // Up to 26.5% aerodynamic drag reduction
      }

      v.enforceTrackBoundary(track);
    }
  }

  /**
   * Executes a synchronized multi-vehicle platoon lane change (Cascade Protocol)
   */
  public triggerCoordinatedLaneChange(direction: 'LEFT' | 'RIGHT', track: Track): boolean {
    if (!this.isActive || this.members.length === 0 || this.isManeuverActive) return false;

    const currentLane = this.members[0].assignedLane;
    const forwardLaneStart = track.isBidirectional ? track.oncomingLaneCount : 0;
    const targetLane = direction === 'LEFT' ? currentLane - 1 : currentLane + 1;

    // Validate lane boundary constraints
    if (targetLane < forwardLaneStart || targetLane >= track.laneCount) {
      return false;
    }

    this.isManeuverActive = true;
    this.maneuverPhase = 'TAIL_SECURING';
    this.maneuverTimer = 0;
    this.targetManeuverLane = targetLane;
    this.maneuverDescription = `COORDINATED ${direction} PASS CASCADE`;

    // Phase 1: Tail vehicle immediately signals turn to block traffic and secure the lane pocket
    const tailMember = this.members[this.members.length - 1];
    if (direction === 'LEFT') {
      tailMember.vehicle.state.isBlinkingLeft = true;
      tailMember.vehicle.state.isBlinkingRight = false;
    } else {
      tailMember.vehicle.state.isBlinkingRight = true;
      tailMember.vehicle.state.isBlinkingLeft = false;
    }

    return true;
  }

  private updateManeuverStateMachine(
    dt: number,
    track: Track,
    allTraffic: VehicleModel[]
  ): void {
    if (!this.isManeuverActive) return;

    this.maneuverTimer += dt;
    const direction = this.targetManeuverLane < this.members[0].assignedLane ? 'LEFT' : 'RIGHT';

    if (this.maneuverPhase === 'TAIL_SECURING') {
      // Securing the pocket behind for 0.8 seconds
      if (this.maneuverTimer > 0.8) {
        this.maneuverPhase = 'CASCADE_SHIFT';
        this.maneuverTimer = 0;

        // Cascade blinkers and assign new target lanes across entire platoon
        for (const m of this.members) {
          if (direction === 'LEFT') {
            m.vehicle.state.isBlinkingLeft = true;
            m.vehicle.state.isBlinkingRight = false;
          } else {
            m.vehicle.state.isBlinkingRight = true;
            m.vehicle.state.isBlinkingLeft = false;
          }
          m.assignedLane = this.targetManeuverLane;
        }
      }
    } else if (this.maneuverPhase === 'CASCADE_SHIFT') {
      // Vehicles are migrating across the divider line
      let allSettled = true;
      const targetLaneD = track.getLaneCenterD(this.targetManeuverLane);

      for (const m of this.members) {
        const frenet = track.frenet.cartesianToFrenet(
          m.vehicle.state.position,
          m.vehicle.state.heading,
          m.vehicle.state.speed
        );
        if (Math.abs(frenet.d - targetLaneD) > 0.45) {
          allSettled = false;
        }
      }

      if (allSettled || this.maneuverTimer > 3.8) {
        this.maneuverPhase = 'SETTLING';
        this.maneuverTimer = 0;
      }
    } else if (this.maneuverPhase === 'SETTLING') {
      // Turn off blinkers and re-lock single-file formation
      for (const m of this.members) {
        m.vehicle.state.isBlinkingLeft = false;
        m.vehicle.state.isBlinkingRight = false;
      }
      this.isManeuverActive = false;
      this.maneuverPhase = 'IDLE';
      this.maneuverDescription = 'CONNECTED CACC CRUISE';
    }
  }

  public setTargetSpeed(speedKmh: number): void {
    this.targetSpeed = Math.max(10.0, Math.min(38.0, speedKmh / 3.6));
  }

  public setTimeHeadway(headwaySec: number): void {
    this.timeHeadway = Math.max(0.4, Math.min(1.8, headwaySec));
  }

  public getVehicles(): VehicleModel[] {
    return this.members.map((m) => m.vehicle);
  }

  public getTelemetry(): PlatoonTelemetry {
    let totalGap = 0;
    let totalDraft = 0;
    const count = this.members.length;

    for (let i = 1; i < count; i++) {
      totalGap += this.members[i].lastGap;
      totalDraft += this.members[i].draftSavingsPct;
    }

    const avgGap = count > 1 ? totalGap / (count - 1) : 0;
    const avgDraft = count > 1 ? totalDraft / (count - 1) : 0;

    return {
      isActive: this.isActive,
      memberCount: count,
      targetSpeedKmh: Math.round(this.targetSpeed * 3.6),
      timeHeadwaySec: parseFloat(this.timeHeadway.toFixed(2)),
      averageGapMeters: parseFloat(avgGap.toFixed(1)),
      averageDraftSavingsPct: parseFloat(avgDraft.toFixed(1)),
      v2vPacketRateHz: this.isActive ? 20 : 0,
      latencyMs: this.isActive ? 14 : 0,
      isManeuverActive: this.isManeuverActive,
      currentManeuver: this.maneuverDescription,
      members: this.members.map((m) => ({
        id: m.vehicle.config.id,
        speedKmh: Math.round(m.vehicle.state.speed * 3.6),
        gapMeters: parseFloat(m.lastGap.toFixed(1)),
        draftPct: m.draftSavingsPct,
        role: m.role,
      })),
    };
  }
}
