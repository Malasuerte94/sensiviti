import { describe, expect, it } from 'vitest';
import legacy100 from './fixtures/profiles/v1.0.0.json';
import legacy110 from './fixtures/profiles/v1.1.0.json';
import legacy120 from './fixtures/profiles/v1.2.0.json';
import { getTask, recordTrial } from '../src/core/calibration';
import { cm360, defaultSetup, games } from '../src/core/games';
import {
  atDpi,
  correctSessionDpi,
  currentDpi,
  currentProfile,
  estimateDpi,
  sessionDpi,
  taskAtDpi,
  updateMouseDpi,
} from '../src/core/mouse';
import { initialState, parseState } from '../src/core/schema';

describe('mouse DPI conversion and corrections', () => {
  it('uses the latest configured DPI for older profiles even when an older recommendation is active', () => {
    const state = parseState({ ...legacy110, setup: { ...legacy110.setup, dpi: 1600 } });
    expect(currentDpi(state)).toBe(1600);
    expect(currentProfile(state).angular).toBe(state.sessions[0].angular / 2);
  });
  it('preserves physical turn distance without modifying a baseline or its history', () => {
    const state = { ...initialState(), setup: defaultSetup };
    const updated = updateMouseDpi(state, 1600);
    expect(currentProfile(updated).angular).toBe(0.011);
    expect(cm360(currentProfile(updated).angular, 1600)).toBeCloseTo(cm360(0.022, 800));
    expect(updated.setup).toEqual(state.setup);
    expect(updateMouseDpi(updated, 800).setup).toEqual(state.setup);
    expect(currentProfile(updateMouseDpi(updateMouseDpi(updated, 1000), 1600))).toEqual(
      currentProfile(updated),
    );
  });
  it('converts in angular units for nonlinear game sliders', () => {
    for (const [game, sensitivity] of [
      [games.minecraft, 0.5],
      [games.battlefield6, 100],
      [games.pubg, 50],
    ] as const) {
      const angular = game.toAngular(sensitivity);
      const converted = game.fromAngular(atDpi(angular, 800, 1600));
      expect(cm360(game.toAngular(converted), 1600)).toBeCloseTo(cm360(angular, 800));
      expect(converted).not.toBeCloseTo(sensitivity / 2);
    }
  });
  it('separates a wrong recorded DPI from a hardware change, preserving all test records', () => {
    const state = parseState(legacy110);
    const saved = state.sessions[0];
    const corrected = correctSessionDpi(state, saved.id, 1600, true);
    expect(currentDpi(corrected)).toBe(1600);
    expect(currentProfile(corrected).angular).toBe(saved.angular);
    expect(cm360(currentProfile(corrected).angular, 1600)).toBeCloseTo(
      cm360(saved.angular, 800) / 2,
    );
    const at800 = correctSessionDpi(updateMouseDpi(state, 800), saved.id, 1600, false);
    expect(currentProfile(at800).angular).toBeCloseTo(saved.angular * 2);
    expect(corrected.sessions).toEqual(state.sessions);
    expect(corrected.pending).toEqual(state.pending);
    expect(corrected.customGames).toEqual(state.customGames);
    expect(currentDpi(correctSessionDpi(state, saved.id, 1600, false))).toBe(800);
    expect(parseState(JSON.parse(JSON.stringify(corrected)))).toEqual(corrected);
    const reverted = correctSessionDpi(corrected, saved.id, 800, true);
    expect(currentProfile(reverted)).toEqual(currentProfile(state));
  });
  it('adapts unfinished trials at playback and retains their original task metadata when saving', () => {
    const state = parseState(legacy100);
    const session = state.pending!;
    const updated = updateMouseDpi(state, 3200);
    const original = getTask(session)!;
    const rendered = taskAtDpi(updated, session, original);
    expect(rendered.angular).toBe(original.angular / 2);
    expect(rendered.key).toBe(original.key);
    const continued = recordTrial(session, original, {
      duration: original.duration,
      onTargetSeconds: 5,
      meanAngularError: 2,
      shots: 10,
      hits: 5,
      acquisitionTimes: [0.5],
      score: 0.5,
    });
    expect(continued.trials.at(-1)!.angular).toBe(original.angular);
    expect(parseState({ ...updated, pending: continued }).pending!.trials).toHaveLength(
      session.trials.length + 1,
    );
  });
  it('uses each result’s effective DPI when activating different history entries', () => {
    const state = parseState(legacy110);
    const first = state.sessions[0];
    const second = {
      ...first,
      id: '5713ca89-9335-4409-856b-4cda7bbf9c87',
      setup: { ...first.setup, dpi: 1600 },
      session: {
        ...first.session,
        id: '5713ca89-9335-4409-856b-4cda7bbf9c87',
        setup: { ...first.setup, dpi: 1600 },
      },
    };
    const updated = updateMouseDpi(
      parseState({ ...state, sessions: [first, second], activeResultId: second.id }),
      800,
    );
    expect(currentProfile(updated).angular).toBe(first.angular * 2);
    expect(currentProfile({ ...updated, activeResultId: first.id }).angular).toBe(first.angular);
  });
  it('rejects invalid mouse values and corrections to missing calibrations', () => {
    for (const dpi of [0, 99, 800.5, 64001, NaN, Infinity]) {
      expect(() => updateMouseDpi(initialState(), dpi)).toThrow();
      expect(() =>
        parseState({ ...initialState(), mouseSettings: { dpi, sessionDpiOverrides: {} } }),
      ).toThrow();
    }
    expect(() =>
      correctSessionDpi(initialState(), '5713ca89-9335-4409-856b-4cda7bbf9c87', 800, false),
    ).toThrow();
    expect(() =>
      parseState({
        ...initialState(),
        mouseSettings: { dpi: null, sessionDpiOverrides: { bad: 800 } },
      }),
    ).toThrow();
  });
});

describe('ruler-based raw input estimate', () => {
  it('uses measured physical travel in either horizontal direction and rejects unreliable measurements', () => {
    expect(estimateDpi(6300, 10, 10)).toBe(1600);
    expect(estimateDpi(-6300, 10, -10)).toBe(1600);
    expect(estimateDpi(1000, 2.54)).toBe(1000);
    for (const [counts, cm, vertical] of [
      [0, 10, 0],
      [99, 10, 0],
      [1000, 0, 0],
      [1000, 101, 0],
      [1000, 10, 101],
      [NaN, 10, 0],
      [1e8, 10, 0],
      [100, 100, 0],
    ])
      expect(() => estimateDpi(counts, cm, vertical)).toThrow();
  });
});

describe('immutable released-profile compatibility', () => {
  for (const [version, fixture] of [
    ['1.0.0', legacy100],
    ['1.1.0', legacy110],
    ['1.2.0', legacy120],
  ] as const) {
    it(`loads, resumes, and round-trips a ${version} profile without changing historical data`, () => {
      const state = parseState(fixture);
      expect(state.mouseSettings).toEqual(
        'mouseSettings' in fixture ? fixture.mouseSettings : { dpi: null, sessionDpiOverrides: {} },
      );
      expect(state.sessions).toEqual(fixture.sessions);
      expect(state.pending).toEqual(fixture.pending);
      expect(getTask(state.pending!)).not.toBeNull();
      const updated = correctSessionDpi(
        updateMouseDpi(state, 3200),
        state.sessions[0].id,
        1600,
        false,
      );
      const restored = parseState(JSON.parse(JSON.stringify(updated)));
      expect(restored.sessions).toEqual(fixture.sessions);
      expect(restored.pending).toEqual(fixture.pending);
      expect(restored.customGames).toEqual('customGames' in fixture ? fixture.customGames : []);
      expect(sessionDpi(restored, restored.sessions[0].session)).toBe(1600);
      expect(currentDpi(restored)).toBe(3200);
    });
  }
});
