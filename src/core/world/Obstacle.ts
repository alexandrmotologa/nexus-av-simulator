import { Vector2D } from '../math/Vector2D';

export type ObstacleType = 'cone' | 'barrier';

export interface RoadObstacle {
  id: string;
  position: Vector2D;
  radius: number;
  type: ObstacleType;
  heading: number;
}

export class ObstacleManager {
  public obstacles: RoadObstacle[] = [];

  public addCone(position: Vector2D): RoadObstacle {
    const obstacle: RoadObstacle = {
      id: `cone-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      position: position.clone(),
      radius: 1.2,
      type: 'cone',
      heading: 0,
    };
    this.obstacles.push(obstacle);
    return obstacle;
  }

  public addBarrier(position: Vector2D, heading: number = 0): RoadObstacle {
    const obstacle: RoadObstacle = {
      id: `barrier-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      position: position.clone(),
      radius: 2.2,
      type: 'barrier',
      heading,
    };
    this.obstacles.push(obstacle);
    return obstacle;
  }

  public removeObstacle(id: string): void {
    this.obstacles = this.obstacles.filter((o) => o.id !== id);
  }

  public clearAll(): void {
    this.obstacles = [];
  }

  public clear(): void {
    this.clearAll();
  }
}
