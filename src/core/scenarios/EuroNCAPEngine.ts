import { Vector2D } from '../math/Vector2D';
import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { RoadObstacle } from '../world/Obstacle';
import { PedestrianModel } from '../traffic/PedestrianModel';

export type EuroNCAPScenarioType =
  | 'NONE'
  | 'CUT_IN_EMERGENCY'
  | 'OCCLUDED_PEDESTRIAN'
  | 'BLACK_ICE_LOW_GRIP';

export interface EuroNCAPVerdict {
  scenario: EuroNCAPScenarioType;
  stars: number; // 0 to 5
  ratingLabel: string;
  minClearance: number; // meters
  minTTC: number; // seconds
  maxDecelG: number;
  collisionOccurred: boolean;
  notes: string;
  timestamp: number;
}

export class EuroNCAPEngine {
  public activeScenario: EuroNCAPScenarioType = 'NONE';
  public isRunning: boolean = false;
  public elapsedTime: number = 0;
  public duration: number = 6.0;

  // Active injected entities for the test
  public testVehicle: VehicleModel | null = null;
  public testObstacles: RoadObstacle[] = [];
  public testPedestrian: PedestrianModel | null = null;
  public frictionOverride: { startS: number; endS: number; gripCoeff: number } | null = null;

  // Real-time telemetry metrics
  public minClearance: number = Infinity;
  public minTTC: number = Infinity;
  public maxDecelG: number = 0;
  public collisionOccurred: boolean = false;
  public latestVerdict: EuroNCAPVerdict | null = null;
  public decelHistory: { time: number; decelG: number }[] = [];

  /**
   * Starts a standardized Euro NCAP active safety protocol
   */
  public startScenario(
    type: EuroNCAPScenarioType,
    ego: VehicleModel,
    track: Track
  ): void {
    this.reset();
    this.activeScenario = type;
    this.isRunning = true;
    this.elapsedTime = 0;
    this.collisionOccurred = false;
    this.minClearance = Infinity;
    this.minTTC = Infinity;
    this.maxDecelG = 0;
    this.decelHistory = [];

    const egoFrenet = track.frenet.cartesianToFrenet(
      ego.state.position,
      ego.state.heading,
      ego.state.speed
    );
    const egoLane = track.getLaneIndex(egoFrenet.d);

    if (type === 'CUT_IN_EMERGENCY') {
      this.duration = 5.5;
      // Spawn target vehicle in adjacent lane 18m ahead
      const targetLane = egoLane === 0 ? 1 : egoLane - 1;
      const targetS = egoFrenet.s + 18.0;
      const targetD = track.getLaneCenterD(targetLane);
      const targetPos = track.frenet.frenetToCartesian(targetS, targetD);

      this.testVehicle = new VehicleModel(
        {
          id: 'ncap-cut-in-sedan',
          name: 'EuroNCAP Target M1',
          color: '#e11d48', // High-visibility rose
          maxSpeed: 25.0,
          acceleration: 2.0,
        },
        targetPos.position,
        targetPos.heading
      );
      this.testVehicle.state.speed = Math.max(8.0, ego.state.speed * 0.72);
      this.testVehicle.state.isBlinkingRight = targetLane < egoLane;
      this.testVehicle.state.isBlinkingLeft = targetLane > egoLane;
    } else if (type === 'OCCLUDED_PEDESTRIAN') {
      this.duration = 5.0;
      // 1. Parked delivery van on road shoulder 22m ahead occluding camera vision
      const vanS = egoFrenet.s + 22.0;
      const vanD = track.getLaneCenterD(Math.min(track.laneCount - 1, egoLane + 1)) + 1.2;
      const vanPos = track.frenet.frenetToCartesian(vanS, vanD);

      this.testObstacles.push({
        id: 'ncap-occluding-van',
        type: 'barrier',
        position: vanPos.position,
        radius: 2.2,
        heading: vanPos.heading,
      });

      // 2. Pedestrian concealed behind the van stepping briskly across ego lane
      const pedStartD = vanD + 0.8;
      const targetCrossD = track.getLaneCenterD(egoLane) - 1.5;
      const pedPos = track.frenet.frenetToCartesian(vanS + 1.5, pedStartD);
      this.testPedestrian = new PedestrianModel(
        'ncap-vru-pedestrian',
        'PEDESTRIAN',
        vanS + 1.5,
        pedStartD,
        targetCrossD,
        pedPos.heading + Math.PI * 0.5,
        1.8 // brisk walking speed 1.8 m/s ~ 6.5 km/h
      );
      this.testPedestrian.position = pedPos.position;
      this.testPedestrian.state = 'CROSSING';
      this.testPedestrian.crossingDirection = pedStartD > targetCrossD ? -1 : 1;
    } else if (type === 'BLACK_ICE_LOW_GRIP') {
      this.duration = 6.0;
      // Injects ultra-low friction slick patch (mu = 0.18) 15m ahead for 35m length
      this.frictionOverride = {
        startS: egoFrenet.s + 15.0,
        endS: egoFrenet.s + 50.0,
        gripCoeff: 1.8, // Drops vehicle lateral grip from 8.5 to 1.8 m/s²
      };
    }
  }

  /**
   * Advances scenario physics and evaluates active safety response
   */
  public update(dt: number, ego: VehicleModel, track: Track): void {
    if (!this.isRunning || this.activeScenario === 'NONE') return;

    this.elapsedTime += dt;

    const egoFrenet = track.frenet.cartesianToFrenet(
      ego.state.position,
      ego.state.heading,
      ego.state.speed
    );

    // Track maximum deceleration and live telemetry curve
    const currentDecelG = Math.max(0, -ego.state.longitudinalAcc / 9.81);
    if (currentDecelG > this.maxDecelG) {
      this.maxDecelG = currentDecelG;
    }
    this.decelHistory.push({
      time: parseFloat(this.elapsedTime.toFixed(2)),
      decelG: parseFloat(currentDecelG.toFixed(2)),
    });
    if (this.decelHistory.length > 80) this.decelHistory.shift();

    // 1. Cut-In Scenario Dynamics
    if (this.activeScenario === 'CUT_IN_EMERGENCY' && this.testVehicle) {
      const v = this.testVehicle;
      const progress = this.elapsedTime / this.duration;

      // Cut-in maneuver initiates after 0.6 seconds
      if (this.elapsedTime > 0.6 && this.elapsedTime < 3.2) {
        const egoTargetD = track.getLaneCenterD(track.getLaneIndex(egoFrenet.d));
        const currentFrenet = track.frenet.cartesianToFrenet(v.state.position, v.state.heading, v.state.speed);
        // Lateral glide toward ego lane
        const lateralStep = (egoTargetD - currentFrenet.d) * (dt * 1.8);
        const newD = currentFrenet.d + lateralStep;
        const newCart = track.frenet.frenetToCartesian(currentFrenet.s + v.state.speed * dt, newD);
        v.state.position = newCart.position;
        v.state.heading = newCart.heading;
        v.updatePolygon();
      } else {
        // Continue along road
        const currentFrenet = track.frenet.cartesianToFrenet(v.state.position, v.state.heading, v.state.speed);
        const newCart = track.frenet.frenetToCartesian(currentFrenet.s + v.state.speed * dt, currentFrenet.d);
        v.state.position = newCart.position;
        v.state.heading = newCart.heading;
        v.updatePolygon();
      }

      // Measure clearance
      const dist = ego.state.position.distance(v.state.position) - (ego.config.length * 0.5 + v.config.length * 0.5);
      const bumperClearance = Math.max(0, dist);
      if (bumperClearance < this.minClearance) {
        this.minClearance = bumperClearance;
      }

      // Time-To-Collision (TTC)
      const relSpeed = ego.state.speed - v.state.speed;
      if (relSpeed > 0.5 && bumperClearance > 0) {
        const ttc = bumperClearance / relSpeed;
        if (ttc < this.minTTC) this.minTTC = ttc;
      }

      // Check contact
      if (dist <= 0.1 || ego.state.isDamaged) {
        this.collisionOccurred = true;
      }
    }

    // 2. Occluded Pedestrian Scenario Dynamics
    if (this.activeScenario === 'OCCLUDED_PEDESTRIAN' && this.testPedestrian) {
      this.testPedestrian.update(dt, track, [ego]);
      const dist = ego.state.position.distance(this.testPedestrian.position) - 2.2;
      const bumperClearance = Math.max(0, dist);
      if (bumperClearance < this.minClearance) {
        this.minClearance = bumperClearance;
      }

      if (ego.state.speed > 0.5 && bumperClearance > 0) {
        const ttc = bumperClearance / ego.state.speed;
        if (ttc < this.minTTC) this.minTTC = ttc;
      }

      if (dist <= 0.05 || ego.state.isDamaged) {
        this.collisionOccurred = true;
      }
    }

    // 3. Black Ice Friction Override
    if (this.activeScenario === 'BLACK_ICE_LOW_GRIP' && this.frictionOverride) {
      const inSlickZone = egoFrenet.s >= this.frictionOverride.startS && egoFrenet.s <= this.frictionOverride.endS;
      if (inSlickZone) {
        ego.config.tireGripCoeff = this.frictionOverride.gripCoeff; // Slippery ice surface
      } else {
        ego.config.tireGripCoeff = 8.5; // Restored normal asphalt adhesion
      }

      if (ego.state.isDamaged || !track.isPointOnRoad(ego.state.position)) {
        this.collisionOccurred = true;
      }
    }

    // Conclude scenario when duration expires
    if (this.elapsedTime >= this.duration) {
      this.concludeScenario(ego);
    }
  }

  /**
   * Evaluates final Euro NCAP 5-Star active safety score
   */
  public concludeScenario(ego: VehicleModel): EuroNCAPVerdict {
    this.isRunning = false;
    let stars = 5;
    let ratingLabel = '5-STAR SUPERIOR AEB';
    let notes = '';

    const clearance = isFinite(this.minClearance) ? parseFloat(this.minClearance.toFixed(2)) : 0;
    const ttc = isFinite(this.minTTC) ? parseFloat(this.minTTC.toFixed(2)) : 0;

    if (this.activeScenario === 'CUT_IN_EMERGENCY') {
      if (this.collisionOccurred) {
        stars = 0;
        ratingLabel = '0-STAR SAFETY FAILURE';
        notes = 'Direct collision with cut-in vehicle. Headway collapsed below safe envelope.';
      } else if (clearance >= 1.6) {
        stars = 5;
        ratingLabel = '5-STAR SUPERIOR AEB';
        notes = `Autonomous emergency braking decelerated cleanly. Minimum bumper clearance: +${clearance}m.`;
      } else if (clearance >= 0.8) {
        stars = 4;
        ratingLabel = '4-STAR GOOD ACTIVE SAFETY';
        notes = `Collision avoided with narrow margin. Minimum clearance: +${clearance}m.`;
      } else {
        stars = 2;
        ratingLabel = '2-STAR MARGINAL RESPONSE';
        notes = `Critical close call. Clearance shrunk to +${clearance}m (TTC: ${ttc}s).`;
      }
    } else if (this.activeScenario === 'OCCLUDED_PEDESTRIAN') {
      if (this.collisionOccurred) {
        stars = 0;
        ratingLabel = '0-STAR CRITICAL IMPACT';
        notes = 'Failed to stop prior to pedestrian path. Vulnerable road user contact detected.';
      } else if (clearance >= 1.8) {
        stars = 5;
        ratingLabel = '5-STAR VRU EXCELLENCE';
        notes = `Pedestrian AEB engaged early upon sensor unmasking. Standstill clearance: +${clearance}m.`;
      } else {
        stars = 4;
        ratingLabel = '4-STAR SATISFACTORY STOP';
        notes = `Vehicle brought to standstill with +${clearance}m clearance.`;
      }
    } else if (this.activeScenario === 'BLACK_ICE_LOW_GRIP') {
      if (this.collisionOccurred || ego.state.isDamaged) {
        stars = 0;
        ratingLabel = '0-STAR LOSS OF CONTROL';
        notes = 'Vehicle spun out of road boundary on black ice slick.';
      } else if (Math.abs(ego.state.yawRate) < 1.4) {
        stars = 5;
        ratingLabel = '5-STAR ESC EXCELLENCE';
        notes = 'Electronic stability control counter-steered and modulated throttle seamlessly across ice patch.';
      } else {
        stars = 3;
        ratingLabel = '3-STAR RECOVERED SLIP';
        notes = 'Vehicle suffered lateral skid but recovered before barrier impact.';
      }
    }

    // Reset tire friction if ice scenario ended
    ego.config.tireGripCoeff = 8.5;

    this.latestVerdict = {
      scenario: this.activeScenario,
      stars,
      ratingLabel,
      minClearance: clearance,
      minTTC: ttc,
      maxDecelG: parseFloat(this.maxDecelG.toFixed(2)),
      collisionOccurred: this.collisionOccurred,
      notes,
      timestamp: Date.now(),
    };

    return this.latestVerdict;
  }

  public reset(): void {
    this.activeScenario = 'NONE';
    this.isRunning = false;
    this.elapsedTime = 0;
    this.testVehicle = null;
    this.testObstacles = [];
    this.testPedestrian = null;
    this.frictionOverride = null;
    this.collisionOccurred = false;
    this.minClearance = Infinity;
    this.minTTC = Infinity;
    this.maxDecelG = 0;
    this.decelHistory = [];
  }
}
