export const builtInGameIds = [
  'cs2',
  'apex',
  'minecraft',
  'battlefield6',
  'pubg',
  'modernwarfare',
  'warzone',
  'valorant',
  'overwatch2',
  'fortnite',
  'siege',
  'destiny2',
  'thefinals',
] as const;
export type GameId = (typeof builtInGameIds)[number];
export interface CustomGame {
  id: string;
  name: string;
  scale: GameId | 'linear';
  yaw?: number;
}
export type Drill = 'tracking' | 'ads' | 'snap';
export type Candidate = 'lower' | 'higher' | 'original' | 'result' | 'warmup';
export type Choice = 'lower' | 'higher' | 'keep';
export interface Setup {
  dpi: number;
  game: GameId;
  sensitivity: number;
  hipFov: number;
  adsFov: number;
  adsMultiplier: number;
}
export interface TrialMetrics {
  duration: number;
  onTargetSeconds: number;
  meanAngularError: number;
  shots: number;
  hits: number;
  acquisitionTimes: number[];
  score: number;
}
export interface TrialTask {
  key: string;
  drill: Drill;
  candidate: Candidate;
  angular: number;
  seed: number;
  duration: number;
  attempt: number;
}
export interface TrialRecord extends TrialTask {
  metrics: TrialMetrics;
  completedAt: string;
}
export interface Comparison {
  advantage: number;
  lowerScores: Record<Drill, number>;
  higherScores: Record<Drill, number>;
  choice: Choice;
  tied: boolean;
}
export interface RoundDecision extends Comparison {
  round: number;
  center: number;
  lower: number;
  higher: number;
  selected: Choice;
  overridden: boolean;
}
export interface CalibrationSession {
  id: string;
  createdAt: string;
  setup: Setup;
  original: number;
  center: number;
  phase: 'warmup' | 'search' | 'validation' | 'complete';
  round: number;
  trials: TrialRecord[];
  decisions: RoundDecision[];
  review: RoundDecision | null;
  result: {
    angular: number;
    proposed: number;
    validated: boolean;
    comparison: Comparison;
    saved: boolean;
  } | null;
}
export interface SavedResult {
  id: string;
  createdAt: string;
  angular: number;
  setup: Setup;
  validated: boolean;
  session: CalibrationSession;
}
export interface AppState {
  version: 1;
  setup: Setup | null;
  activeResultId: string | null;
  games: GameId[];
  customGames: CustomGame[];
  sessions: SavedResult[];
  pending: CalibrationSession | null;
}
export interface DesktopAPI {
  profileInfo(): Promise<{ directory: string; file: string }>;
  openProfileFolder(): Promise<void>;
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
  exportBackup(): Promise<boolean>;
  importBackup(): Promise<AppState | null>;
  fullscreen(value: boolean): Promise<void>;
}
declare global {
  interface Window {
    sensiviti?: DesktopAPI;
  }
}
