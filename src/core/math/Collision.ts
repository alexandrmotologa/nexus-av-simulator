import { Vector2D } from './Vector2D';

export interface IntersectionResult {
  point: Vector2D;
  t: number; // Distance parameter along ray (0 to 1)
}

export class Collision {
  /**
   * Line segment vs line segment intersection.
   * p1 -> p2 (ray/segment 1) vs q1 -> q2 (segment 2).
   */
  static segmentIntersection(
    p1: Vector2D,
    p2: Vector2D,
    q1: Vector2D,
    q2: Vector2D
  ): IntersectionResult | null {
    const r = p2.sub(p1);
    const s = q2.sub(q1);
    const rxs = r.cross(s);
    const qpxr = q1.sub(p1).cross(r);

    // Collinear or parallel
    if (Math.abs(rxs) < 1e-9) {
      return null;
    }

    const t = q1.sub(p1).cross(s) / rxs;
    const u = qpxr / rxs;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        point: p1.add(r.scale(t)),
        t,
      };
    }

    return null;
  }

  /**
   * Ray vs line segment intersection.
   * rayOrigin with direction rayDir and max range rayLength vs segment q1 -> q2.
   */
  static raySegmentIntersection(
    rayOrigin: Vector2D,
    rayEnd: Vector2D,
    q1: Vector2D,
    q2: Vector2D
  ): IntersectionResult | null {
    return this.segmentIntersection(rayOrigin, rayEnd, q1, q2);
  }

  /**
   * Ray vs circle intersection test.
   * Returns distance from ray origin to nearest intersection point, or null if no hit.
   */
  static rayCircleIntersection(
    rayOrigin: Vector2D,
    rayEnd: Vector2D,
    circleCenter: Vector2D,
    circleRadius: number
  ): number | null {
    const rayDir = rayEnd.sub(rayOrigin);
    const maxDist = rayDir.magnitude();
    if (maxDist < 1e-4) return null;
    const d = rayDir.scale(1 / maxDist);

    const f = rayOrigin.sub(circleCenter);
    const b = 2 * f.dot(d);
    const c = f.dot(f) - circleRadius * circleRadius;
    const discriminant = b * b - 4 * c;

    if (discriminant < 0) return null;
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / 2;
    const t2 = (-b + sqrtDisc) / 2;

    if (t1 >= 0 && t1 <= maxDist) return t1;
    if (t2 >= 0 && t2 <= maxDist) return t2;
    return null;
  }

  /**
   * Separating Axis Theorem (SAT) for checking overlap between two 2D convex polygons.
   * Returns true if polyA and polyB collide.
   */
  static checkPolygonCollision(polyA: Vector2D[], polyB: Vector2D[]): boolean {
    const polygons = [polyA, polyB];

    for (let i = 0; i < polygons.length; i++) {
      const polygon = polygons[i];

      for (let i1 = 0; i1 < polygon.length; i1++) {
        const i2 = (i1 + 1) % polygon.length;
        const p1 = polygon[i1];
        const p2 = polygon[i2];

        // Normal perpendicular to the edge
        const edge = p2.sub(p1);
        const axis = edge.perpendicular().normalize();

        // Project both polygons onto axis
        const projA = this.projectPolygon(polyA, axis);
        const projB = this.projectPolygon(polyB, axis);

        // Check if projections do not overlap (separating axis found)
        if (projA.max < projB.min || projB.max < projA.min) {
          return false;
        }
      }
    }

    // Overlap on all axes: collision occurs
    return true;
  }

  private static projectPolygon(
    polygon: Vector2D[],
    axis: Vector2D
  ): { min: number; max: number } {
    let min = polygon[0].dot(axis);
    let max = min;

    for (let i = 1; i < polygon.length; i++) {
      const p = polygon[i].dot(axis);
      if (p < min) min = p;
      if (p > max) max = p;
    }

    return { min, max };
  }
}
