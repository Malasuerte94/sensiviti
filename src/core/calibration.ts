import type {
  CalibrationSession,
  Candidate,
  Choice,
  Comparison,
  Drill,
  RoundDecision,
  Setup,
  TrialMetrics,
  TrialRecord,
  TrialTask,
} from './types';
import { games } from './games';
export const OFFSETS = [0.5, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05] as const;
export const DRILLS: Drill[] = ['tracking', 'ads', 'snap'];
export const drillNames: Record<Drill, string> = {
  tracking: 'Smooth tracking',
  ads: 'ADS tracking',
  snap: 'Snap aiming',
};
export function createSession(setup: Setup): CalibrationSession {
  const angular = games[setup.game].toAngular(setup.sensitivity);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    setup: { ...setup },
    original: angular,
    center: angular,
    phase: 'warmup',
    round: 0,
    trials: [],
    decisions: [],
    review: null,
    result: null,
  };
}
export function candidates(center: number, round: number) {
  const offset = OFFSETS[round];
  if (offset === undefined) throw new Error('Invalid PSA round');
  return { lower: center * (1 - offset), higher: center * (1 + offset) };
}
export function nextCenter(center: number, chosen: number) {
  return (center + chosen) / 2;
}
export function trialScore(drill: Drill, metrics: Omit<TrialMetrics, 'score'>): number {
  if (metrics.duration <= 0) return 0;
  return drill === 'snap'
    ? (metrics.hits / metrics.duration) * (metrics.shots ? metrics.hits / metrics.shots : 0)
    : metrics.onTargetSeconds / metrics.duration;
}
export function compare(
  records: TrialRecord[],
  low: Candidate = 'lower',
  high: Candidate = 'higher',
): Comparison {
  const lowerScores = {} as Record<Drill, number>;
  const higherScores = {} as Record<Drill, number>;
  let sum = 0;
  for (const drill of DRILLS) {
    const average = (candidate: Candidate) => {
      const scores = records
        .filter((r) => r.candidate === candidate && r.drill === drill)
        .map((r) => r.metrics.score);
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    };
    const l = (lowerScores[drill] = average(low));
    const h = (higherScores[drill] = average(high));
    sum += Math.max(l, h) > 0 ? (h - l) / Math.max(l, h) : 0;
  }
  const advantage = sum / 3;
  const tied = Math.abs(advantage) < 0.03;
  return {
    advantage,
    lowerScores,
    higherScores,
    choice: tied ? 'keep' : advantage > 0 ? 'higher' : 'lower',
    tied,
  };
}
function tasksFor(session: CalibrationSession, attempt = 0): TrialTask[] {
  if (session.phase === 'complete') return [];
  if (session.phase === 'warmup')
    return DRILLS.map((drill, i) => ({
      key: `warmup-${drill}`,
      drill,
      candidate: 'warmup',
      angular: session.original,
      seed: 103 + i,
      duration: 10,
      attempt: 0,
    }));
  const validation = session.phase === 'validation';
  const pair = validation
    ? { original: session.original, result: session.center }
    : candidates(session.center, session.round);
  const order: Candidate[] = validation
    ? ['original', 'result']
    : (session.round + attempt) % 2 === 0
      ? ['lower', 'higher']
      : ['higher', 'lower'];
  return order.flatMap((candidate) =>
    DRILLS.map((drill, i) => ({
      key: `${validation ? 'validation' : session.round}-${attempt}-${candidate}-${drill}`,
      drill,
      candidate,
      angular: pair[candidate as keyof typeof pair] as number,
      seed: 1000 + (validation ? 9 : session.round) * 100 + attempt * 10 + i,
      duration: 15,
      attempt,
    })),
  );
}
export function roundTrials(session: CalibrationSession) {
  return session.trials.filter((r) => r.key.startsWith(`${session.round}-`));
}
export function getTask(session: CalibrationSession): TrialTask | null {
  if (session.review || session.phase === 'complete') return null;
  const completed = new Set(session.trials.map((r) => r.key));
  const first = tasksFor(session);
  const next = first.find((t) => !completed.has(t.key));
  if (next) return next;
  if (
    session.phase === 'search' &&
    (roundTrials(session).some((t) => t.attempt === 1) ||
      compare(roundTrials(session).filter((t) => t.attempt === 0)).tied)
  )
    return tasksFor(session, 1).find((t) => !completed.has(t.key)) ?? null;
  return null;
}
export function recordTrial(
  session: CalibrationSession,
  task: TrialTask,
  metrics: TrialMetrics,
): CalibrationSession {
  const expected = getTask(session);
  if (!expected || expected.key !== task.key) throw new Error('Trial is no longer current');
  let updated: CalibrationSession = {
    ...session,
    trials: [...session.trials, { ...task, metrics, completedAt: new Date().toISOString() }],
  };
  if (getTask(updated)) return updated;
  if (session.phase === 'warmup') return { ...updated, phase: 'search' };
  if (session.phase === 'search') {
    const comparison = compare(roundTrials(updated));
    updated.review = {
      ...comparison,
      ...candidates(session.center, session.round),
      center: session.center,
      round: session.round,
      selected: comparison.choice,
      overridden: false,
    };
  } else if (session.phase === 'validation') {
    const comparison = compare(
      updated.trials.filter((t) => t.key.startsWith('validation-')),
      'original',
      'result',
    );
    const validated = comparison.advantage >= 0.03;
    updated = {
      ...updated,
      phase: 'complete',
      result: {
        angular: validated ? session.center : session.original,
        proposed: session.center,
        validated,
        comparison,
        saved: false,
      },
    };
  }
  return updated;
}
export function commitDecision(session: CalibrationSession, selected?: Choice): CalibrationSession {
  const review = session.review;
  if (!review) return session;
  const chosen = selected ?? review.selected;
  const decision: RoundDecision = {
    ...review,
    selected: chosen,
    overridden: chosen !== review.choice,
  };
  return {
    ...session,
    center: chosen === 'keep' ? session.center : nextCenter(session.center, review[chosen]),
    review: null,
    decisions: [...session.decisions, decision],
    round: session.round + 1,
    phase: session.round === 6 ? 'validation' : 'search',
  };
}
export function repeatRound(session: CalibrationSession): CalibrationSession {
  return {
    ...session,
    review: null,
    trials: session.trials.filter((t) => !t.key.startsWith(`${session.round}-`)),
  };
}
export function sessionProgress(session: CalibrationSession) {
  if (session.phase === 'complete') return 1;
  const warmup = session.trials.filter((t) => t.candidate === 'warmup').length;
  const search = session.phase === 'search' ? Math.min(6, roundTrials(session).length) : 0;
  const validation = session.trials.filter((t) => t.key.startsWith('validation-')).length;
  return (warmup + session.decisions.length * 6 + search + validation) / 51;
}
