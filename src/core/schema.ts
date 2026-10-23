import { z } from 'zod';
import { games } from './games';
import type { AppState } from './types';
import { candidates, getTask, nextCenter } from './calibration';
const finite = z.number().finite();
const positive = finite.positive();
const gameId = z.enum(['cs2', 'apex', 'minecraft']);
const drill = z.enum(['tracking', 'ads', 'snap']);
const choice = z.enum(['lower', 'higher', 'keep']);
export const setupSchema = z
  .object({
    dpi: z.number().int().min(100).max(64000),
    game: gameId,
    sensitivity: finite.min(0),
    hipFov: finite.min(60).max(130),
    adsFov: finite.min(20).max(100),
    adsMultiplier: positive.max(2),
  })
  .refine(
    (s) => s.sensitivity >= games[s.game].min && s.sensitivity <= games[s.game].max,
    'Sensitivity is outside the game range',
  )
  .refine((s) => s.adsFov < s.hipFov, 'ADS FOV must be narrower than hipfire FOV');
const scores = z.object({ tracking: finite.min(0), ads: finite.min(0), snap: finite.min(0) });
const comparison = z.object({
  advantage: finite.min(-1).max(1),
  lowerScores: scores,
  higherScores: scores,
  choice,
  tied: z.boolean(),
});
const decision = comparison.extend({
  round: z.number().int().min(0).max(6),
  center: positive,
  lower: positive,
  higher: positive,
  selected: choice,
  overridden: z.boolean(),
});
const trial = z.object({
  key: z.string().max(100),
  drill,
  candidate: z.enum(['lower', 'higher', 'original', 'result', 'warmup']),
  angular: positive,
  seed: z.number().int(),
  duration: positive.max(60),
  attempt: z.number().int().min(0).max(1),
  completedAt: z.string().datetime(),
  metrics: z.object({
    duration: positive.max(60),
    onTargetSeconds: finite.min(0),
    meanAngularError: finite.min(0),
    shots: z.number().int().min(0),
    hits: z.number().int().min(0),
    acquisitionTimes: z.array(finite.min(0)).max(10000),
    score: finite.min(0),
  }),
});
const session = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  setup: setupSchema,
  original: positive,
  center: positive,
  phase: z.enum(['warmup', 'search', 'validation', 'complete']),
  round: z.number().int().min(0).max(7),
  trials: z.array(trial).max(200),
  decisions: z.array(decision).max(7),
  review: decision.nullable(),
  result: z
    .object({
      angular: positive,
      proposed: positive,
      validated: z.boolean(),
      comparison,
      saved: z.boolean(),
    })
    .nullable(),
});
export const stateSchema = z.object({
  version: z.literal(1),
  setup: setupSchema.nullable(),
  activeResultId: z.string().uuid().nullable(),
  games: z.array(gameId).max(3),
  sessions: z
    .array(
      z.object({
        id: z.string().uuid(),
        createdAt: z.string().datetime(),
        angular: positive,
        setup: setupSchema,
        validated: z.boolean(),
        session,
      }),
    )
    .max(500),
  pending: session.nullable(),
});
export function parseState(input: unknown): AppState {
  const parsed = stateSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      'This is not a supported Sensiviti v1 backup. Its setup, session data, or format version is invalid.',
    );
  const state = parsed.data;
  const invalid = () => {
    throw new Error(
      'This Sensiviti backup has inconsistent session progress. Your existing data has not been changed.',
    );
  };
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * 1e-10;
  for (const current of [
    ...state.sessions.map((s) => s.session),
    ...(state.pending ? [state.pending] : []),
  ]) {
    if (!near(current.original, games[current.setup.game].toAngular(current.setup.sensitivity)))
      invalid();
    if (
      new Set(current.trials.map((t) => t.key)).size !== current.trials.length ||
      current.decisions.length !== current.round
    )
      invalid();
    if (current.phase === 'warmup' && (current.round !== 0 || current.review)) invalid();
    if (current.phase === 'search' && current.round > 6) invalid();
    if (
      ['complete', 'validation'].includes(current.phase) &&
      (current.round !== 7 || current.review)
    )
      invalid();
    if ((current.phase === 'complete') !== Boolean(current.result)) invalid();
    let center = current.original;
    for (let i = 0; i < current.decisions.length; i++) {
      const d = current.decisions[i];
      const pair = candidates(center, i);
      if (
        d.round !== i ||
        !near(d.center, center) ||
        !near(d.lower, pair.lower) ||
        !near(d.higher, pair.higher)
      )
        invalid();
      center = d.selected === 'keep' ? center : nextCenter(center, d[d.selected]);
    }
    if (!near(center, current.center)) invalid();
    if (
      current.review &&
      (current.phase !== 'search' ||
        current.review.round !== current.round ||
        !near(current.review.center, current.center))
    )
      invalid();
    if (current.phase !== 'complete' && !current.review && !getTask(current)) invalid();
    for (const t of current.trials)
      if (
        t.metrics.onTargetSeconds > t.metrics.duration + 1e-6 ||
        t.metrics.hits > t.metrics.shots ||
        !near(t.duration, t.metrics.duration)
      )
        invalid();
    if (
      current.result &&
      (!near(current.result.proposed, current.center) ||
        !near(current.result.angular, current.result.validated ? current.center : current.original))
    )
      invalid();
  }
  if (
    new Set(state.games).size !== state.games.length ||
    new Set(state.sessions.map((s) => s.id)).size !== state.sessions.length
  )
    invalid();
  if (state.activeResultId && !state.sessions.some((s) => s.id === state.activeResultId)) invalid();
  if (
    state.sessions.some(
      (s) =>
        s.id !== s.session.id ||
        s.session.phase !== 'complete' ||
        !s.session.result ||
        !near(s.angular, s.session.result.angular),
    )
  )
    invalid();
  return state;
}
export const initialState = (): AppState => ({
  version: 1,
  setup: null,
  activeResultId: null,
  games: ['cs2', 'apex', 'minecraft'],
  sessions: [],
  pending: null,
});
