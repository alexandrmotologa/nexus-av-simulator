import { Vector2D } from '../math/Vector2D';

export type RoadNodeType = 'REGULAR' | 'FORK' | 'MERGE' | 'ROUNDABOUT_ENTRY';

export interface LaneSegment {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  waypoints: Vector2D[];
  laneIndex: number;
  speedLimit: number;
  isAccelerationLane?: boolean;
}

export interface RoadNode {
  id: string;
  position: Vector2D;
  type: RoadNodeType;
  outgoingSegmentIds: string[];
  incomingSegmentIds: string[];
}

export class RoadNetworkGraph {
  public nodes: Map<string, RoadNode> = new Map();
  public segments: Map<string, LaneSegment> = new Map();

  public addNode(id: string, position: Vector2D, type: RoadNodeType = 'REGULAR'): RoadNode {
    const node: RoadNode = {
      id,
      position,
      type,
      outgoingSegmentIds: [],
      incomingSegmentIds: [],
    };
    this.nodes.set(id, node);
    return node;
  }

  public addSegment(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    waypoints: Vector2D[],
    laneIndex: number = 0,
    speedLimit: number = 90,
    isAccelerationLane: boolean = false
  ): LaneSegment {
    const segment: LaneSegment = {
      id,
      fromNodeId,
      toNodeId,
      waypoints,
      laneIndex,
      speedLimit,
      isAccelerationLane,
    };
    this.segments.set(id, segment);

    const fromNode = this.nodes.get(fromNodeId);
    if (fromNode) fromNode.outgoingSegmentIds.push(id);

    const toNode = this.nodes.get(toNodeId);
    if (toNode) toNode.incomingSegmentIds.push(id);

    return segment;
  }

  /**
   * Evaluates highway on-ramp gap acceptance:
   * Returns true if merging vehicle can safely join highway flow
   */
  public evaluateMergeGap(
    mergingPos: Vector2D,
    mergingSpeed: number,
    highwayVehicles: { position: Vector2D; speed: number }[]
  ): { canMerge: boolean; minGapAhead: number; minGapBehind: number } {
    let minGapAhead = Infinity;
    let minGapBehind = Infinity;

    for (const hv of highwayVehicles) {
      const dist = hv.position.distance(mergingPos);
      const isAhead = (hv.position.x - mergingPos.x) > 0;

      if (isAhead && dist < minGapAhead) {
        minGapAhead = dist;
      } else if (!isAhead && dist < minGapBehind) {
        minGapBehind = dist;
      }
    }

    // Safe gap criteria: at least 16m ahead and 18m behind
    const canMerge = minGapAhead > 16.0 && minGapBehind > 18.0;

    return { canMerge, minGapAhead, minGapBehind };
  }
}
