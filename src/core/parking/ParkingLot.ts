import { Vector2D } from '../math/Vector2D';

export interface ParkingStall {
  id: string;
  type: 'PERPENDICULAR' | 'PARALLEL';
  center: Vector2D;
  width: number; // e.g. 2.6m
  length: number; // e.g. 5.2m
  heading: number; // orientation angle
  isTarget: boolean;
  isOccupied: boolean;
}

export class ParkingLot {
  public stalls: ParkingStall[] = [];
  public targetStall: ParkingStall | null = null;
  public startPose: { position: Vector2D; heading: number } = {
    position: new Vector2D(0, 0),
    heading: 0,
  };

  constructor() {
    this.setupPerpendicularScenario();
  }

  public setupPerpendicularScenario(): void {
    this.stalls = [];
    const stallW = 2.7;
    const stallL = 5.2;

    // Create a row of 5 perpendicular stalls
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * stallW;
      const y = 8.5; // Stalls are 8.5m north of access aisle
      const isTarget = i === 2; // Center stall is target
      const isOccupied = i === 1 || i === 3; // Adjacent cars parked

      const stall: ParkingStall = {
        id: `stall-${i + 1}`,
        type: 'PERPENDICULAR',
        center: new Vector2D(x, y),
        width: stallW,
        length: stallL,
        heading: Math.PI * 0.5, // pointing North
        isTarget,
        isOccupied,
      };

      this.stalls.push(stall);
      if (isTarget) this.targetStall = stall;
    }

    // Starting pose: vehicle stopped in aisle facing East, ready to reverse into stall
    this.startPose = {
      position: new Vector2D(-6.0, 3.2),
      heading: 0,
    };
  }
}
