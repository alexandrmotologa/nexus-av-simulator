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
  {
    id: 'pacific-coast-highway',
    name: 'Pacific Two-Way Arterial (6 Lanes)',
    description: 'Bidirectional multi-lane expressway: 3 oncoming lanes, double solid yellow centerline divider, and 3 forward lanes.',
    difficulty: 'Intermediate',
    laneCount: 6,
    laneWidth: 3.8,
    closed: true,
    createTrack: () => {
      const waypoints = [
        new Vector2D(0, 0),
        new Vector2D(350, 40),
        new Vector2D(650, 140),
        new Vector2D(800, 360),
        new Vector2D(680, 580),
        new Vector2D(350, 620),
        new Vector2D(50, 520),
        new Vector2D(-200, 420),
        new Vector2D(-350, 240),
        new Vector2D(-250, 60),
      ];
      return new Track('pacific-coast-highway', 'Pacific Two-Way Arterial (6 Lanes)', waypoints, 6, 3.8, true, true, 3);
    },
  },
  {
    id: 'transfagarasan-pass',
    name: 'Transfăgărășan Two-Way Pass (4 Lanes)',
    description: 'Bidirectional mountain pass: 2 oncoming lanes, double solid continuous lines, and 2 forward lanes with tight chicanes.',
    difficulty: 'Expert',
    laneCount: 4,
    laneWidth: 3.8,
    closed: true,
    createTrack: () => {
      const waypoints = [
        new Vector2D(0, 0),
        new Vector2D(180, 100),
        new Vector2D(320, -60),
        new Vector2D(480, 110),
        new Vector2D(640, -40),
        new Vector2D(700, 200),
        new Vector2D(580, 360),
        new Vector2D(380, 240),
        new Vector2D(220, 420),
        new Vector2D(60, 300),
        new Vector2D(-120, 220),
      ];
      return new Track('transfagarasan-pass', 'Transfăgărășan Two-Way Pass (4 Lanes)', waypoints, 4, 3.8, true, true, 2);
    },
  },
  {
    id: 'highway-on-ramp',
    name: 'Silicon Expressway & On-Ramp (5 Lanes)',
    description: 'High-speed 5-lane arterial with highway acceleration entrance lane and variable speed zones.',
    difficulty: 'Intermediate',
    laneCount: 5,
    laneWidth: 4.0,
    closed: true,
    createTrack: () => {
      const waypoints = [
        new Vector2D(0, 0),
        new Vector2D(400, 30),
        new Vector2D(750, 160),
        new Vector2D(900, 380),
        new Vector2D(780, 600),
        new Vector2D(420, 640),
        new Vector2D(80, 540),
        new Vector2D(-180, 420),
        new Vector2D(-300, 220),
        new Vector2D(-200, 50),
      ];
      return new Track('highway-on-ramp', 'Silicon Expressway & On-Ramp (5 Lanes)', waypoints, 5, 4.0, true);
    },
  },
  {
    id: 'roundabout-circus',
    name: 'Etoile Mega Roundabout (4 Lanes)',
    description: 'Continuous 4-lane circular orbital with multiple radial approach vectors and strict yield etiquette.',
    difficulty: 'Beginner',
    laneCount: 4,
    laneWidth: 4.2,
    closed: true,
    createTrack: () => {
      const R = 220.0;
      const waypoints: Vector2D[] = [];
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        waypoints.push(new Vector2D(Math.cos(theta) * R, Math.sin(theta) * R));
      }
      return new Track('roundabout-circus', 'Etoile Mega Roundabout (4 Lanes)', waypoints, 4, 4.2, true);
    },
  },
  {
    id: 'valet-parking',
    name: 'Valet Parking Facility (Bay Maneuvering)',
    description: 'Precision parking terminal with marked stalls, narrow access aisle, and tight multi-point reversing challenges.',
    difficulty: 'Expert',
    laneCount: 2,
    laneWidth: 4.8,
    closed: true,
    createTrack: () => {
      const waypoints = [
        new Vector2D(-70, 0),
        new Vector2D(70, 0),
        new Vector2D(110, 45),
        new Vector2D(110, 110),
        new Vector2D(70, 155),
        new Vector2D(-70, 155),
        new Vector2D(-110, 110),
        new Vector2D(-110, 45),
      ];
      return new Track('valet-parking', 'Valet Parking Facility (Bay Maneuvering)', waypoints, 2, 4.8, true);
    },
  },
];
