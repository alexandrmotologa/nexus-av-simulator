# Nexus AV Simulator: API & Telemetry Specification

This document outlines the data interfaces, telemetry formats, and neural model schemas used across the simulation.

---

## 1. Simulation Telemetry Interface

The simulation engine emits telemetry at 15 Hz to update the cockpit HUD and analytics drawers without impacting 60 FPS canvas rendering.

```typescript
export interface SimulationTelemetry {
  pilotMode: 'NEUROEVOLUTION' | 'DEEP_RL_AGENT' | 'CLASSIC_ROBOTICS' | 'HUMAN_DRIVER';
  trackName: string;
  generation: number;
  aliveCount: number;
  totalAgents: number;
  bestFitness: number;
  currentBestSpeed: number; // km/h
  currentBestDistance: number; // meters
  steerAngleDeg: number; // degrees
  lateralG: number; // G-force (1.0 = 9.81 m/s²)
  fps: number;
  timeScale: number;
  weather: 'DRY' | 'WET' | 'NIGHT';
  obstacleCount: number;
  fitnessHistory: FitnessPoint[];
  leaderboard: LeaderboardEntry[];
  rlStats?: QLearningStats;
}

export interface FitnessPoint {
  gen: number;
  fitness: number;
  speed: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  speed: number;
  distance: number;
  fitness: number;
  overtakes: number;
  color: string;
}
```

---

## 2. Q-Learning Real-Time Stats

When operating in `DEEP_RL_AGENT` mode, the agent exposes reinforcement learning diagnostics:

```typescript
export interface QLearningStats {
  episode: number;
  totalSteps: number;
  epsilon: number; // Exploration rate (decaying to 0.05)
  currentLoss: number; // Rolling Huber loss
  totalMistakes: number; // Total collision or off-road strikes recorded
  mistakesAvoided: number; // Successful evasions of high-risk scenarios
  lastMistakeReason: string;
  qValues: number[]; // Q-values across 7 discrete actions
  chosenActionName: string; // Active action (e.g., 'Steer Right (Soft)')
  learningPhase: 'Exploring' | 'Correcting Mistakes' | 'Fine-Tuning';
  averageEpisodeReward: number;
}
```

### Discrete Action Set
The Q-network maps the 24-dimensional feature vector to 7 discrete vehicle commands:

| Action ID | Identifier | Control Mapping |
| :--- | :--- | :--- |
| `0` | `Cruise` | Throttle: 0.45, Brake: 0.0, Steer: 0.0 |
| `1` | `Accelerate` | Throttle: 1.0, Brake: 0.0, Steer: 0.0 |
| `2` | `Brake` | Throttle: 0.0, Brake: 0.85, Steer: 0.0 |
| `3` | `Steer Left (Soft)` | Throttle: 0.5, Brake: 0.0, Steer: -0.3 |
| `4` | `Steer Left (Hard)` | Throttle: 0.25, Brake: 0.0, Steer: -0.85 |
| `5` | `Steer Right (Soft)` | Throttle: 0.5, Brake: 0.0, Steer: +0.3 |
| `6` | `Steer Right (Hard)` | Throttle: 0.25, Brake: 0.0, Steer: +0.85 |

---

## 3. Brain Model Hub JSON Schemas

The simulator exports and imports neural network weights using standardized JSON payloads.

### 3.1 Neuroevolution Model Schema

```json
{
  "type": "NEUROEVOLUTION",
  "version": 1,
  "generation": 28,
  "bestFitness": 713.5,
  "timestamp": 1793836800000,
  "brain": {
    "layers": [
      {
        "inputs": 24,
        "outputs": 18,
        "activation": "relu",
        "weights": [0.12, -0.45, "..."],
        "biases": [0.01, 0.01, "..."]
      },
      {
        "inputs": 18,
        "outputs": 12,
        "activation": "relu",
        "weights": ["..."],
        "biases": ["..."]
      },
      {
        "inputs": 12,
        "outputs": 3,
        "activation": "tanh",
        "weights": ["..."],
        "biases": ["..."]
      }
    ],
    "fitness": 713.5,
    "generation": 28
  }
}
```

### 3.2 Deep RL Model Schema

```json
{
  "type": "DEEP_RL_AGENT",
  "version": 1,
  "totalSteps": 14250,
  "totalMistakes": 29,
  "mistakesAvoided": 84,
  "timestamp": 1793836800000,
  "weights": {
    "weights": [
      [0.05, -0.12, "..."],
      ["..."],
      ["..."]
    ],
    "biases": [
      [0.01, 0.01, "..."],
      ["..."],
      ["..."]
    ]
  }
}
```

---

## 4. Road Obstacle Protocol

Obstacles dropped via the interactive Sandbox mode implement the following data contract:

```typescript
export type ObstacleType = 'cone' | 'barrier';

export interface RoadObstacle {
  id: string; // Unique timestamped identifier
  position: Vector2D; // World position coordinates (meters)
  radius: number; // Collision and raycast radius (1.2m for cone, 2.2m for barrier)
  type: ObstacleType;
  heading: number; // Yaw angle (radians)
}
```
