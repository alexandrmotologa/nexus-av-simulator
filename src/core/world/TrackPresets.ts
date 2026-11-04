import { Vector2D } from '../math/Vector2D';
import { Track } from './Track';

export interface TrackPresetMeta {
  id: string;
  name: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Expert';
  laneCount: number;
  laneWidth: number;
  closed: boolean;
  createTrack: () => Track;
}

export const TRACK_PRESETS: TrackPresetMeta[] = [
  {
    id: 'grand-prix-circuit',
    name: 'Monza Apex GP',
    description: 'Challenging circuit with high-speed straights, S-chicanes, and hairpin turns.',
    difficulty: 'Expert',
    laneCount: 3,
    laneWidth: 4.0,
    closed: true,
    createTrack: () => {
      const waypoints = [
        new Vector2D(0, 0),
        new Vector2D(250, 20),
        new Vector2D(450, 100),
        new Vector2D(550, 250),
        new Vector2D(500, 420),
        new Vector2D(350, 480),
        new Vector2D(200, 380),
        new Vector2D(50, 450),
        new Vector2D(-120, 380),
        new Vector2D(-250, 200),
        new Vector2D(-200, 60),
      ];
      return new Track('grand-prix-circuit', 'Monza Apex GP', waypoints, 3, 4.0, true);
    },
  },
  {
    id: 'curved-expressway',
    name: 'Neo Tokyo Expressway',
    description: 'Long sweeping multi-lane highway with moderate continuous curves and high-speed overtaking.',
    difficulty: 'Intermediate',
    laneCount: 4,
    laneWidth: 3.8,
    closed: true,
    createTrack: () => {
      const waypoints = [
        new Vector2D(0, 0),
        new Vector2D(200, -80),
        new Vector2D(450, -50),
        new Vector2D(650, 80),
        new Vector2D(700, 300),
        new Vector2D(550, 500),
        new Vector2D(300, 550),
        new Vector2D(50, 480),
        new Vector2D(-150, 350),
        new Vector2D(-180, 150),
      ];
      return new Track('curved-expressway', 'Neo Tokyo Expressway', waypoints, 4, 3.8, true);
    },
  },
  {
    id: 'slalom-corridor',
    name: 'Alpine Slalom',
    description: 'Rhythmic alternating S-curves testing lateral weight transfer, stability, and collision avoidance.',
    difficulty: 'Expert',
    laneCount: 3,
    laneWidth: 3.8,
    closed: true,
    createTrack: () => {
      const waypoints = [
        new Vector2D(0, 0),
        new Vector2D(120, 80),
        new Vector2D(240, -80),
        new Vector2D(360, 80),
        new Vector2D(480, -80),
        new Vector2D(550, 60),
        new Vector2D(520, 250),
        new Vector2D(360, 200),
        new Vector2D(240, 340),
        new Vector2D(100, 220),
        new Vector2D(-60, 180),
      ];
      return new Track('slalom-corridor', 'Alpine Slalom', waypoints, 3, 3.8, true);
    },
  },
  {
    id: 'straight-highway',
    name: 'Infinite Highway (Benchmark)',
    description: 'Straight multi-lane highway benchmark for testing traffic overtaking like the original repository.',
    difficulty: 'Beginner',
    laneCount: 3,
    laneWidth: 4.0,
    closed: true,
    createTrack: () => {
      // Loop track with long straightaways
      const waypoints = [
        new Vector2D(0, 0),
        new Vector2D(0, 500),
        new Vector2D(0, 1000),
        new Vector2D(100, 1150),
        new Vector2D(200, 1000),
        new Vector2D(200, 500),
        new Vector2D(200, 0),
        new Vector2D(100, -150),
      ];
      return new Track('straight-highway', 'Infinite Highway (Benchmark)', waypoints, 3, 4.0, true);
    },
  },
];
