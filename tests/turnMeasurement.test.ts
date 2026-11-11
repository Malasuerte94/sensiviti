import { describe, expect, it } from 'vitest';
import {
  summarizeTurns,
  turnDistance,
  validateTurnSettings,
  type TurnSample,
} from '../src/core/turnMeasurement';
import { angularFromCm, cm360, customGameProfile } from '../src/core/games';
import { getTask } from '../src/core/calibration';
import { parseState } from '../src/core/schema';
import legacy100 from './fixtures/profiles/v1.0.0.json';
import legacy110 from './fixtures/profiles/v1.1.0.json';
import legacy120 from './fixtures/profiles/v1.2.0.json';

const sample = (x = 16000, patch: Partial<TurnSample> = {}): TurnSample => ({
  x,
  y: 0,
  pathX: Math.abs(x),
  pathY: 0,
  elapsedMs: 5000,
  ...patch,
});

describe('in-game turn measurement', () => {
  it('uses signed horizontal raw counts and entered DPI, independent of screen pixels', () => {
    expect(turnDistance(sample(), 1600)).toBe(25.4);
    expect(turnDistance(sample(-16000), 1600)).toBe(25.4);
    expect(turnDistance(sample(16000, { pathX: 16100, pathY: 10 }), 800)).toBe(50.8);
    expect(turnDistance(sample(), 3200)).toBe(12.7);
  });
  it('ignores vertical drift and accounts for horizontal corrections without requiring a straight line', () => {
    expect(turnDistance(sample(16000, { y: 4000, pathX: 30000, pathY: 60000 }), 1600)).toBe(25.4);
    expect(turnDistance(sample(-16000, { y: -8000, pathX: 32000, pathY: 20000 }), 1600)).toBe(25.4);
  });
  it('rejects invalid settings, impossible packets and incomplete turns', () => {
    for (const dpi of [0, 99, 800.5, 64001, NaN])
      expect(() => validateTurnSettings(dpi, 1)).toThrow();
    for (const sens of [0, -1, NaN, Infinity, 100001])
      expect(() => validateTurnSettings(800, sens)).toThrow();
    for (const bad of [
      sample(99),
      sample(NaN),
      sample(100.5),
      sample(16000, { pathX: 10 }),
      sample(16000, { elapsedMs: 499 }),
      sample(16000, { elapsedMs: 120001 }),
      sample(16000, { pathY: 0, y: 1 }),
      sample(16000, { pathY: Infinity }),
    ])
      expect(() => turnDistance(bad, 1600)).toThrow();
  });
  it('requires three consistent turns, using the median and rejecting a missed full rotation', () => {
    const result = summarizeTurns([sample(15900), sample(-16100), sample(16000)], 1600);
    expect(result.cm).toBe(25.4);
    expect(result.spread).toBeCloseTo(0.0125);
    expect(() => summarizeTurns([sample(), sample()], 1600)).toThrow('three');
    expect(() => summarizeTurns([sample(), sample(), sample(32000)], 1600)).toThrow('5%');
  });
});

describe('saving a measured game keeps released profiles intact', () => {
  for (const [version, fixture] of [
    ['1.0.0', legacy100],
    ['1.1.0', legacy110],
    ['1.2.0', legacy120],
  ] as const) {
    it(`round-trips a measured game and resumes the original ${version} calibration`, () => {
      const state = parseState(fixture);
      const original = structuredClone(state);
      const cm = summarizeTurns([sample(), sample(), sample()], 1600).cm;
      const measured = {
        id: 'd6e57647-9d51-4777-9308-6dcfa76d11af',
        name: 'Synthetic measured game',
        scale: 'linear' as const,
        yaw: angularFromCm(cm, 1600) / 2,
      };
      const restored = parseState(
        JSON.parse(JSON.stringify({ ...state, customGames: [...state.customGames, measured] })),
      );
      expect(restored.version).toBe(1);
      expect(restored.setup).toEqual(original.setup);
      expect(restored.sessions).toEqual(original.sessions);
      expect(restored.pending).toEqual(original.pending);
      expect(restored.mouseSettings).toEqual(original.mouseSettings);
      expect(restored.customGames.slice(0, -1)).toEqual(original.customGames);
      expect(getTask(restored.pending!)).toEqual(getTask(original.pending!));
      expect(cm360(customGameProfile(restored.customGames.at(-1)!).toAngular(2), 1600)).toBeCloseTo(
        cm,
      );
      expect(state).toEqual(original);
    });
  }
});
