import { VehicleModel } from '../physics/VehicleModel';
import { Vector2D } from '../math/Vector2D';

export interface BlindSpotStatus {
  leftOccupied: boolean;
  rightOccupied: boolean;
  leftCritical: boolean;  // Flashing red: blinker on toward occupied zone
  rightCritical: boolean; // Flashing red: blinker on toward occupied zone
  closestLeftDistance: number;
  closestRightDistance: number;
}

export class BlindSpotDetector {
  /**
   * Evaluates surrounding traffic relative to ego vehicle to detect blind spot occupancy
   */
  public evaluate(
    egoVehicle: VehicleModel,
    surroundingVehicles: VehicleModel[]
  ): BlindSpotStatus {
    const ego = egoVehicle.state;
    const uForward = Vector2D.fromAngle(ego.heading);
    const uRight = new Vector2D(-uForward.y, uForward.x); // Canvas coords: +y is down, so +90° turns right

    let leftOccupied = false;
    let rightOccupied = false;
    let closestLeftDistance = Infinity;
    let closestRightDistance = Infinity;

    for (const other of surroundingVehicles) {
      if (other === egoVehicle || other.state.isDamaged) continue;

      const delta = other.state.position.sub(ego.position);
      const dist = delta.magnitude();
      if (dist > 18.0) continue;

      const xLocal = delta.dot(uForward); // Along vehicle length
      const yLocal = delta.dot(uRight);   // Along vehicle width (+ = right, - = left)

      // Blind spot zone: laterally in adjacent lane (1.6m to 4.5m)
      // and longitudinally from front door to rear bumper (-4.5m to +1.0m)
      const inLongitudinalZone = xLocal >= -5.0 && xLocal <= 1.5;

      // Left Blind Spot
      if (yLocal < -1.4 && yLocal > -4.5 && inLongitudinalZone) {
        leftOccupied = true;
        if (dist < closestLeftDistance) closestLeftDistance = dist;
      }

      // Right Blind Spot
      if (yLocal > 1.4 && yLocal < 4.5 && inLongitudinalZone) {
        rightOccupied = true;
        if (dist < closestRightDistance) closestRightDistance = dist;
      }
    }

    return {
      leftOccupied,
      rightOccupied,
      leftCritical: leftOccupied && ego.isBlinkingLeft,
      rightCritical: rightOccupied && ego.isBlinkingRight,
      closestLeftDistance: closestLeftDistance === Infinity ? 0 : parseFloat(closestLeftDistance.toFixed(1)),
      closestRightDistance: closestRightDistance === Infinity ? 0 : parseFloat(closestRightDistance.toFixed(1)),
    };
  }
}
