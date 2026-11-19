export type KartId = 'comet' | 'reef' | 'bolt' | 'sprout' | 'nova' | 'titan' | 'mochi';
export type GamePhase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';
export type PowerUpKind = 'nitro' | 'shield' | 'overdrive' | null;
export type TrackSectionId = 'seaside' | 'harbor' | 'cliff' | 'cave' | 'bridge';

export interface IMathQuestion {
  id: number;
  text: string;
  options: number[];
  correctIndex: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  challenge: TrackSectionId | null;
  rewardLabel: string | null;
}

export interface IRacerSnapshot {
  id: KartId;
  name: string;
  color: string;
  lap: number;
  totalLaps: number;
  position: number;
  speed: number;
  trackProgress: number;
  lane: number;
  finished: boolean;
  finishTime: number | null;
  isPlayer: boolean;
  boosting: boolean;
  drifting: number;
  airHeight: number;
  telegraph: number;
}

export interface KartRigSpec {
  modelSize: { x: number; y: number; z: number };
  wheelRadius: number;
  wheelWidth: number;
  wheelX: number;
  wheelY: number;
  frontZ: number;
  rearZ: number;
  driverPosition: [number, number, number];
  driverScale: number;
  armsPosition: [number, number, number];
}

export interface KartSpec {
  id: KartId;
  name: string;
  englishName: string;
  color: string;
  accent: string;
  description: string;
  rig: KartRigSpec;
}

export interface IRaceResult {
  rank: number;
  id: KartId;
  name: string;
  color: string;
  time: number;
  isPlayer: boolean;
}

export interface GameSnapshot {
  phase: GamePhase;
  selectedKart: KartId;
  racers: IRacerSnapshot[];
  elapsed: number;
  countdown: number;
  question: IMathQuestion | null;
  questionFeedback: 'correct' | 'wrong' | null;
  correctCount: number;
  streak: number;
  bestStreak: number;
  energy: number;
  powerUp: PowerUpKind;
  inventory: Exclude<PowerUpKind, null> | null;
  boostRemaining: number;
  shieldRemaining: number;
  results: IRaceResult[];
  muted: boolean;
  loadedModels: KartId[];
  loadedLandmarks: string[];
  eventLabel: string;
  autoStatus: string;
  rivalAlert: string;
  overtakeCount: number;
  obstacleHits: number;
  collisionSlowRemaining: number;
  sectionId: TrackSectionId;
  sectionName: string;
  sectionProgress: number;
  landingBoostArmed: boolean;
  routeRewards: TrackSectionId[];
}
