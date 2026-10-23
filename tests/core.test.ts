import { describe, expect, it } from 'vitest';
import {
  candidates,
  commitDecision,
  compare,
  createSession,
  DRILLS,
  getTask,
  nextCenter,
  OFFSETS,
  recordTrial,
  repeatRound,
  sessionProgress,
  trialScore,
} from '../src/core/calibration';
import { angularFromCm, cm360, convert, defaultSetup, gameIds, games } from '../src/core/games';
import {
  angularDistance,
  Measurement,
  random,
  snapPosition,
  trackingPosition,
} from '../src/core/motion';
import { initialState, parseState, setupSchema } from '../src/core/schema';
import type {
  CalibrationSession,
  Candidate,
  Drill,
  TrialMetrics,
  TrialRecord,
  TrialTask,
} from '../src/core/types';
const metrics = (score: number): TrialMetrics => ({
  duration: 15,
  score,
  onTargetSeconds: score * 15,
  meanAngularError: 2,
  shots: 20,
  hits: 10,
  acquisitionTimes: [0.5, 0.6],
});
function records(candidate: Candidate, scores: number[], attempt = 0): TrialRecord[] {
  return DRILLS.map((drill, i) => ({
    key: `0-${attempt}-${candidate}-${drill}`,
    candidate,
    drill,
    angular: 0.022,
    seed: 1,
    duration: 15,
    attempt,
    completedAt: new Date().toISOString(),
    metrics: metrics(scores[i]),
  }));
}
function playTasks(
  session: CalibrationSession,
  score: (task: TrialTask) => number,
): CalibrationSession {
  let current = session;
  for (let guard = 0; guard < 100; guard++) {
    const task = getTask(current);
    if (!task) return current;
    const value = score(task);
    current = recordTrial(current, task, {
      ...metrics(value),
      duration: task.duration,
      onTargetSeconds: value * task.duration,
    });
  }
  throw new Error('Non-terminating trial queue');
}
describe('PSA search', () => {
  it('uses the exact schedule and midpoint rather than adopting the candidate', () => {
    expect(OFFSETS).toEqual([0.5, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05]);
    expect(candidates(1, 0)).toEqual({ lower: 0.5, higher: 1.5 });
    expect(nextCenter(1, 0.5)).toBe(0.75);
    expect(() => candidates(1, 7)).toThrow();
  });
  it('creates three unscored warmups and transitions into search', () => {
    let s = createSession(defaultSetup);
    expect(getTask(s)?.candidate).toBe('warmup');
    for (let i = 0; i < 3; i++) s = recordTrial(s, getTask(s)!, metrics(1));
    expect(s.phase).toBe('search');
    expect(s.trials).toHaveLength(3);
    expect(s.review).toBeNull();
  });
  it('weights the scenario-relative advantages equally, despite incompatible score units', () => {
    const c = compare([...records('lower', [0.5, 0.2, 2]), ...records('higher', [1, 0.1, 4])]);
    expect(c.advantage).toBeCloseTo(1 / 6);
    expect(c.choice).toBe('higher');
  });
  it('handles zeros and the 3% threshold', () => {
    expect(compare([...records('lower', [0, 0, 0]), ...records('higher', [0, 0, 0])]).choice).toBe(
      'keep',
    );
    expect(
      compare([...records('lower', [0.98, 0.98, 0.98]), ...records('higher', [1, 1, 1])]).tied,
    ).toBe(true);
    expect(
      compare([...records('lower', [0.96, 0.96, 0.96]), ...records('higher', [1, 1, 1])]).choice,
    ).toBe('higher');
  });
  it('requires all six repeat trials even if the first repeat score breaks the tie', () => {
    let s = createSession(defaultSetup);
    s = playTasks(s, (t) =>
      t.candidate === 'warmup' ? 0.5 : t.attempt === 1 && t.candidate === 'lower' ? 1 : 0.5,
    );
    expect(s.review).not.toBeNull();
    expect(s.trials.filter((t) => t.attempt === 1)).toHaveLength(6);
    expect(s.review?.choice).toBe('lower');
  });
  it('reverses candidate order on repeat and alternates between rounds', () => {
    let s = createSession(defaultSetup);
    for (let i = 0; i < 3; i++) s = recordTrial(s, getTask(s)!, metrics(0.5));
    expect(getTask(s)?.candidate).toBe('lower');
    for (let i = 0; i < 6; i++) s = recordTrial(s, getTask(s)!, metrics(0.5));
    expect(getTask(s)?.candidate).toBe('higher');
  });
  it('keeps the center when a repeat is tied, preserves overrides, and can reset a round', () => {
    const reviewed = playTasks(createSession(defaultSetup), () => 0.5);
    expect(reviewed.review?.selected).toBe('keep');
    const kept = commitDecision(reviewed);
    expect(kept.center).toBe(reviewed.center);
    expect(kept.round).toBe(1);
    const override = commitDecision(reviewed, 'lower');
    expect(override.decisions[0].overridden).toBe(true);
    expect(override.center).toBeCloseTo(0.0165);
    const repeat = repeatRound(reviewed);
    expect(repeat.trials).toHaveLength(3);
    expect(getTask(repeat)?.candidate).toBe('lower');
  });
  it('uses matched seeds, duration, and angular settings for paired tasks', () => {
    const s = playTasks(createSession(defaultSetup), (t) => (t.candidate === 'higher' ? 0.8 : 0.5));
    const l = s.trials.filter((t) => t.candidate === 'lower'),
      h = s.trials.filter((t) => t.candidate === 'higher');
    for (let i = 0; i < 3; i++) {
      expect(l[i].seed).toBe(h[i].seed);
      expect(l[i].duration).toBe(15);
      expect(l[i].angular).toBeCloseTo(0.011);
      expect(h[i].angular).toBeCloseTo(0.033);
    }
  });
  it.each([true, false])(
    'finishes all rounds, validates against original, and round-trips through persistence (%s)',
    (win) => {
      let s = createSession(defaultSetup);
      while (s.phase !== 'complete') {
        s = playTasks(s, (t) =>
          t.candidate === 'higher' || (t.candidate === 'result' && win) ? 0.9 : 0.5,
        );
        if (s.review) s = commitDecision(s);
      }
      expect(s.decisions).toHaveLength(7);
      expect(s.result?.validated).toBe(win);
      expect(s.result?.angular).toBe(win ? s.center : s.original);
      expect(sessionProgress(s)).toBe(1);
      expect(s.trials.filter((t) => t.key.startsWith('validation-'))).toHaveLength(6);
      const state = { ...initialState(), setup: defaultSetup, pending: s };
      expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    },
  );
  it('rejects duplicate or obsolete completions', () => {
    const s = createSession(defaultSetup),
      task = getTask(s)!;
    const next = recordTrial(s, task, metrics(0.5));
    expect(() => recordTrial(next, task, metrics(0.5))).toThrow();
  });
});
describe('game conversions', () => {
  it('matches CS2 and Apex hipfire at default yaw', () => {
    expect(games.cs2.toAngular(1)).toBe(0.022);
    expect(convert(0.022, 800, 'apex').rounded).toBe(1);
    expect(cm360(0.022, 800)).toBeCloseTo(51.95454545);
  });
  it('round-trips every game within its actual setting precision', () => {
    for (const id of gameIds) {
      for (const s of id === 'minecraft' ? [0, 0.1, 0.5, 1] : [0.1, 1, 4]) {
        const a = games[id].toAngular(s);
        expect(games[id].fromAngular(a)).toBeCloseTo(s, 10);
        const c = convert(a, 800, id);
        expect(c.reachable).toBe(true);
        expect(Math.abs(c.differenceCm)).toBeLessThan(0.0001);
      }
    }
  });
  it('uses the nonlinear Java curve and 0–200% display', () => {
    expect(games.minecraft.toAngular(0.5)).toBeCloseTo(0.15);
    expect(convert(0.15, 800, 'minecraft').display).toBe('100.0%');
    expect(convert(0.0096, 800, 'minecraft').display).toBe('0.0%');
  });
  it('flags unreachable results instead of silently clamping', () => {
    const a = convert(0.001, 800, 'minecraft');
    expect(a.reachable).toBe(false);
    expect(a.rounded).toBe(0);
    expect(a.differenceCm).toBeLessThan(0);
    expect(convert(1, 800, 'minecraft').reachable).toBe(false);
  });
  it('handles DPI changes by preserving turn distance', () => {
    expect(cm360(0.022, 1600)).toBeCloseTo(cm360(0.022, 800) / 2);
    expect(angularFromCm(cm360(0.022, 800), 1600)).toBeCloseTo(0.011);
  });
});
describe('metrics and deterministic simulation', () => {
  it('calculates tracking and snap scores and handles no shots', () => {
    expect(trialScore('tracking', metrics(0.6))).toBeCloseTo(0.6);
    expect(trialScore('snap', { ...metrics(0), hits: 12, shots: 20 })).toBeCloseTo(0.48);
    expect(trialScore('snap', { ...metrics(0), shots: 0, hits: 0 })).toBe(0);
  });
  it('generates identical target motion and snap locations from seed and time', () => {
    expect(trackingPosition(1.23, 15)).toEqual(trackingPosition(1.23, 15));
    expect(snapPosition(2, 15)).toEqual(snapPosition(2, 15));
    expect(snapPosition(2, 15)).not.toEqual(snapPosition(3, 15));
    expect(random(10)()).toBe(random(10)());
    expect(angularDistance({ yaw: 359, pitch: 0 }, { yaw: -1, pitch: 0 })).toBeCloseTo(0);
  });
  it('scores a scripted aim trace identically at 60, 144, and 240 Hz', () => {
    const results = [60, 144, 240].map((hz) => {
      const measure = new Measurement();
      for (let frame = 1; frame <= 15 * hz; frame++) {
        measure.sampleUntil(frame / hz, (at) => {
          const target = trackingPosition(at, 123);
          const aim = { yaw: target.yaw + Math.sin(at * 3) * 2, pitch: target.pitch };
          const error = angularDistance(aim, target);
          return { hit: error < 1.5, error };
        });
      }
      return measure.finish('tracking', 15);
    });
    expect(results[0].score).toBeCloseTo(results[1].score, 12);
    expect(results[1].meanAngularError).toBeCloseTo(results[2].meanAngularError, 12);
  });
});
describe('input and backup validation', () => {
  it('accepts Java zero but rejects invalid DPI, NaN, invalid sensitivities, or ADS wider than hipfire', () => {
    expect(
      setupSchema.safeParse({ ...defaultSetup, game: 'minecraft', sensitivity: 0 }).success,
    ).toBe(true);
    for (const patch of [
      { dpi: 0 },
      { dpi: 800.5 },
      { sensitivity: NaN },
      { sensitivity: 9 },
      { adsFov: 100, hipFov: 90 },
    ])
      expect(setupSchema.safeParse({ ...defaultSetup, ...patch }).success).toBe(false);
  });
  it('rejects invalid or future backup versions', () => {
    expect(() => parseState({ ...initialState(), version: 2 })).toThrow();
    expect(() => parseState({})).toThrow();
  });
  it('rejects inconsistent session progress and dangling active profiles', () => {
    const bad = { ...createSession(defaultSetup), phase: 'search', round: 7 };
    expect(() => parseState({ ...initialState(), pending: bad })).toThrow();
    expect(() => parseState({ ...initialState(), activeResultId: crypto.randomUUID() })).toThrow();
    expect(() => parseState({ ...initialState(), games: ['cs2', 'cs2'] })).toThrow();
  });
});
