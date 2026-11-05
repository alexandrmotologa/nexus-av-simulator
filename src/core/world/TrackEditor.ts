import { Vector2D } from '../math/Vector2D';
import { Track } from './Track';
import { RoadSign } from './RoadSign';

export interface EditableTrackData {
  id: string;
  name: string;
  waypoints: { x: number; y: number }[];
  closed: boolean;
  laneCount: number;
  laneWidth: number;
  isBidirectional: boolean;
  oncomingLaneCount: number;
  speedLimit: number;
}

export class TrackEditor {
  public waypoints: Vector2D[] = [];
  public closed: boolean = true;
  public laneCount: number = 3;
  public laneWidth: number = 4.2;
  public isBidirectional: boolean = false;
  public oncomingLaneCount: number = 1;
  public defaultSpeedLimit: number = 90;
  public selectedIndex: number = -1;
  public hoveredIndex: number = -1;
  public isEditing: boolean = false;

  constructor() {
    this.resetToDefaultLoop();
  }

  public resetToDefaultLoop(): void {
    // Generates a simple smooth 8-point starter loop
    this.waypoints = [
      new Vector2D(0, 0),
      new Vector2D(120, 20),
      new Vector2D(220, 100),
      new Vector2D(180, 220),
      new Vector2D(60, 260),
      new Vector2D(-80, 200),
      new Vector2D(-140, 90),
      new Vector2D(-60, 10),
    ];
    this.closed = true;
    this.selectedIndex = -1;
  }

  public loadFromTrack(track: Track): void {
    const rawWaypoints = track.frenet ? (track as any).waypoints || track.centerLine.slice(0, 30) : [];
    if (rawWaypoints.length > 2) {
      this.waypoints = rawWaypoints.map((w: Vector2D) => w.clone());
    } else {
      this.resetToDefaultLoop();
    }
    this.laneCount = track.laneCount;
    this.laneWidth = track.laneWidth;
    this.isBidirectional = track.isBidirectional;
    this.oncomingLaneCount = track.oncomingLaneCount;
    this.closed = true;
  }

  public addWaypoint(pos: Vector2D): number {
    this.waypoints.push(pos.clone());
    this.selectedIndex = this.waypoints.length - 1;
    return this.selectedIndex;
  }

  public insertWaypointAfter(index: number, pos: Vector2D): number {
    if (index >= 0 && index < this.waypoints.length) {
      this.waypoints.splice(index + 1, 0, pos.clone());
      this.selectedIndex = index + 1;
      return this.selectedIndex;
    }
    return this.addWaypoint(pos);
  }

  public moveWaypoint(index: number, newPos: Vector2D): void {
    if (index >= 0 && index < this.waypoints.length) {
      this.waypoints[index].set(newPos.x, newPos.y);
    }
  }

  public removeWaypoint(index: number): boolean {
    if (this.waypoints.length <= 3) return false; // Minimum 3 points required for spline
    if (index >= 0 && index < this.waypoints.length) {
      this.waypoints.splice(index, 1);
      this.selectedIndex = -1;
      return true;
    }
    return false;
  }

  public findNearestWaypoint(pos: Vector2D, maxRadius: number = 18.0): number {
    let nearestIdx = -1;
    let nearestDist = maxRadius;

    for (let i = 0; i < this.waypoints.length; i++) {
      const d = pos.distance(this.waypoints[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    return nearestIdx;
  }

  public buildTrack(id: string = `custom-${Date.now()}`, name: string = 'Custom User Circuit'): Track {
    const track = new Track(
      id,
      name,
      this.waypoints.map((w) => w.clone()),
      this.laneCount,
      this.laneWidth,
      this.closed,
      this.isBidirectional,
      this.isBidirectional ? this.oncomingLaneCount : 0
    );

    return track;
  }

  public serialize(id: string = `custom-${Date.now()}`, name: string = 'Custom Circuit'): EditableTrackData {
    return {
      id,
      name,
      waypoints: this.waypoints.map((w) => ({ x: parseFloat(w.x.toFixed(2)), y: parseFloat(w.y.toFixed(2)) })),
      closed: this.closed,
      laneCount: this.laneCount,
      laneWidth: this.laneWidth,
      isBidirectional: this.isBidirectional,
      oncomingLaneCount: this.oncomingLaneCount,
      speedLimit: this.defaultSpeedLimit,
    };
  }

  public deserialize(data: EditableTrackData): void {
    if (!data || !Array.isArray(data.waypoints)) return;
    this.waypoints = data.waypoints.map((w) => new Vector2D(w.x, w.y));
    this.closed = Boolean(data.closed);
    this.laneCount = data.laneCount || 3;
    this.laneWidth = data.laneWidth || 4.2;
    this.isBidirectional = Boolean(data.isBidirectional);
    this.oncomingLaneCount = data.oncomingLaneCount || 1;
    this.defaultSpeedLimit = data.speedLimit || 90;
    this.selectedIndex = -1;
  }
}
