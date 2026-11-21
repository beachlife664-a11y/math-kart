export type KartId = 'comet' | 'reef' | 'bolt' | 'sprout' | 'nova' | 'titan' | 'mochi';
export type PlayerIndex = 0 | 1;
export type GamePhase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';
export type PowerUpKind = 'nitro' | 'shield' | 'overdrive' | null;
export type TrackSectionId = 'seaside' | 'harbor' | 'cliff' | 'cave' | 'bridge';

export interface IMathQuestion {
  id: number;
  text: string;
  answer: number;
  submittedAnswer: number | null;
  isCorrect: boolean | null;
  challenge: TrackSectionId | null;
  rewardLabel: string | null;
}

export interface IRacerSnapshot {
  id: KartId;
  playerIndex: PlayerIndex;
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
  playerIndex: PlayerIndex;
  name: string;
  color: string;
  time: number;
  isPlayer: boolean;
}

export interface IPlayerSnapshot {
  playerIndex: PlayerIndex;
  kartId: KartId;
  question: IMathQuestion | null;
  answerInput: string;
  questionFeedback: 'correct' | 'wrong' | null;
  correctCount: number;
  streak: number;
  bestStreak: number;
  energy: number;
  powerUp: PowerUpKind;
  inventory: Exclude<PowerUpKind, null> | null;
  boostRemaining: number;
  shieldRemaining: number;
  eventLabel: string;
  autoStatus: string;
  overtakeCount: number;
  obstacleHits: number;
  collisionSlowRemaining: number;
  sectionId: TrackSectionId;
  sectionName: string;
  sectionProgress: number;
  landingBoostArmed: boolean;
  routeRewards: TrackSectionId[];
}

export interface GameSnapshot {
  phase: GamePhase;
  playerCount: 1 | 2;
  cameraMode: 'shared' | 'split';
  cameraSeparation: number;
  selectedKarts: KartId[];
  players: IPlayerSnapshot[];
  racers: IRacerSnapshot[];
  elapsed: number;
  countdown: number;
  results: IRaceResult[];
  muted: boolean;
  loadedModels: KartId[];
  loadedLandmarks: string[];
  eventLabel: string;
  rivalAlert: string;
  /** 以下字段保留为玩家 1 的快捷视图，供 HUD、存档和诊断复用。 */
  selectedKart: KartId;
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
  autoStatus: string;
  overtakeCount: number;
  obstacleHits: number;
  collisionSlowRemaining: number;
  sectionId: TrackSectionId;
  sectionName: string;
  sectionProgress: number;
  landingBoostArmed: boolean;
  routeRewards: TrackSectionId[];
}
