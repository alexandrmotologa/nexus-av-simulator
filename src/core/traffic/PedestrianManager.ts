import { Track } from '../world/Track';
import { Crosswalk } from '../world/Crosswalk';
import { PedestrianModel } from './PedestrianModel';
import { VehicleModel } from '../physics/VehicleModel';
import { Vector2D } from '../math/Vector2D';

export class PedestrianManager {
  public crosswalks: Crosswalk[] = [];
  public vrus: PedestrianModel[] = [];
  private track: Track;

  constructor(track: Track) {
    this.track = track;
    this.initializeEntities();
  }

  public setTrack(track: Track): void {
    this.track = track;
    this.initializeEntities();
  }

  public initializeEntities(): void {
    this.crosswalks = [];
    this.vrus = [];

    const totalLen = this.track.spline.totalLength;
    if (totalLen < 150) return;

    const halfRoadWidth = this.track.totalWidth * 0.5;

    // 1. Place 1-2 zebra crosswalks on straight track sectors
    const crosswalkS1 = totalLen * 0.35;
    const crosswalkS2 = totalLen * 0.72;

    this.crosswalks.push(new Crosswalk('cw-1', crosswalkS1, this.track));
    if (totalLen > 300) {
      this.crosswalks.push(new Crosswalk('cw-2', crosswalkS2, this.track));
    }

    // 2. Spawn Pedestrians at each crosswalk
    for (let i = 0; i < this.crosswalks.length; i++) {
      const cw = this.crosswalks[i];
      const startD = -halfRoadWidth - 1.2;
      const targetD = halfRoadWidth + 1.2;
      const p = new PedestrianModel(
        `ped-${i + 1}`,
        'PEDESTRIAN',
        cw.s,
        startD,
        targetD,
        cw.heading + Math.PI * 0.5,
        1.25 // ~4.5 km/h brisk walking
      );
      this.vrus.push(p);
    }

    // 3. Spawn 1-2 Cyclists riding along road shoulder
    const cyclistS1 = totalLen * 0.15;
    const cyclistD = -halfRoadWidth + 1.1; // Right shoulder inside road margin
    this.vrus.push(
      new PedestrianModel(
        'cyclist-1',
        'CYCLIST',
        cyclistS1,
        cyclistD,
        cyclistD,
        0,
        5.2 // ~19 km/h cycling speed
      )
    );
  }

  public update(dt: number, vehicles: VehicleModel[]): void {
    for (const vru of this.vrus) {
      vru.update(dt, this.track, vehicles);
    }
  }

  /**
   * Checks whether a given crosswalk is currently occupied by pedestrians on the road
   * or waiting at the curb with intention to cross.
   */
  public isCrosswalkOccupied(cw: Crosswalk): boolean {
    const halfRoadWidth = this.track.totalWidth * 0.5;
    for (const vru of this.vrus) {
      if (vru.type !== 'PEDESTRIAN') continue;
      // Longitudinal proximity to the crosswalk
      let deltaS = Math.abs(vru.s - cw.s);
      if (this.track.closed) {
        if (deltaS > this.track.spline.totalLength * 0.5) {
          deltaS = this.track.spline.totalLength - deltaS;
        }
      }
      if (deltaS > 4.5) continue;

      // Pedestrian is crossing or on the roadway / curb margin
      const isOnRoadOrCurb = Math.abs(vru.d) <= halfRoadWidth + 0.6;
      if (isOnRoadOrCurb && (vru.state === 'CROSSING' || vru.state === 'WAITING')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds the nearest upcoming crosswalk within lookahead distance and reports its occupancy status.
   */
  public getUpcomingCrosswalk(
    frenetS: number,
    lookahead: number = 45.0
  ): { crosswalk: Crosswalk; distance: number; isOccupied: boolean } | null {
    const totalLength = this.track.spline.totalLength;
    let closestCw: Crosswalk | null = null;
    let minDistance = Infinity;

    for (const cw of this.crosswalks) {
      let deltaS = cw.s - frenetS;
      if (this.track.closed) {
        if (deltaS < -totalLength * 0.5) deltaS += totalLength;
        if (deltaS > totalLength * 0.5) deltaS -= totalLength;
      }

      if (deltaS > 0 && deltaS <= lookahead && deltaS < minDistance) {
        minDistance = deltaS;
        closestCw = cw;
      }
    }

    if (closestCw) {
      return {
        crosswalk: closestCw,
        distance: minDistance,
        isOccupied: this.isCrosswalkOccupied(closestCw),
      };
    }
    return null;
  }

  /**
   * Evaluates if a vehicle is lawfully stopped or crawling before an occupied crosswalk.
   */
  public isLawfullyYieldingAtCrosswalk(frenetS: number, speedMps: number): boolean {
    if (speedMps > 3.0) return false;
    const upcoming = this.getUpcomingCrosswalk(frenetS, 14.0);
    return upcoming !== null && upcoming.isOccupied;
  }

  /**
   * Evaluates forward collision risk with vulnerable road users for VRU-AEB
   */
  public checkVRUCollisionRisk(
    egoPos: Vector2D,
    egoHeading: number,
    egoSpeed: number
  ): { mustStop: boolean; distance: number; vru: PedestrianModel | null } {
    const cosH = Math.cos(egoHeading);
    const sinH = Math.sin(egoHeading);

    for (const vru of this.vrus) {
      const dx = vru.position.x - egoPos.x;
      const dy = vru.position.y - egoPos.y;

      const forwardDist = dx * cosH + dy * sinH;
      const lateralDist = Math.abs(-dx * sinH + dy * cosH);

      // In vehicle forward corridor within braking distance
      const stopDistance = Math.max(12.0, egoSpeed * 2.2);

      if (forwardDist > 1.2 && forwardDist < stopDistance && lateralDist < 2.8) {
        return {
          mustStop: true,
          distance: forwardDist,
          vru,
        };
      }
    }

    return { mustStop: false, distance: Infinity, vru: null };
  }
}
