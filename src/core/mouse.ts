import { defaultSetup, games } from './games';
import { dpiSchema } from './schema';
import type { AppState, CalibrationSession, TrialTask } from './types';

/** DPI is physical counts per inch, independent of the display's scaling setting. */
export function atDpi(angular: number, sourceDpi: number, targetDpi: number): number {
  return (angular * sourceDpi) / targetDpi;
}
export function sessionDpi(state: AppState, session: CalibrationSession): number {
  return state.mouseSettings.sessionDpiOverrides[session.id] ?? session.setup.dpi;
}
export function currentDpi(state: AppState): number {
  const active = state.sessions.find((s) => s.id === state.activeResultId);
  return (
    state.mouseSettings.dpi ??
    state.setup?.dpi ??
    (active ? sessionDpi(state, active.session) : undefined) ??
    defaultSetup.dpi
  );
}
export function currentProfile(state: AppState) {
  const active = state.sessions.find((s) => s.id === state.activeResultId);
  const setup = active?.setup ?? state.setup ?? defaultSetup;
  const sourceDpi = active ? sessionDpi(state, active.session) : setup.dpi;
  const dpi = currentDpi(state);
  const angular = atDpi(
    active?.angular ?? games[setup.game].toAngular(setup.sensitivity),
    sourceDpi,
    dpi,
  );
  return { angular, dpi, sourceDpi, game: setup.game };
}
/** Render at current hardware DPI; record trials in their original calibration units. */
export function taskAtDpi(
  state: AppState,
  session: CalibrationSession,
  task: TrialTask,
): TrialTask {
  return { ...task, angular: atDpi(task.angular, sessionDpi(state, session), currentDpi(state)) };
}
export function updateMouseDpi(state: AppState, dpi: number): AppState {
  return { ...state, mouseSettings: { ...state.mouseSettings, dpi: dpiSchema.parse(dpi) } };
}
export function correctSessionDpi(
  state: AppState,
  id: string,
  dpi: number,
  useAsCurrent: boolean,
): AppState {
  const value = dpiSchema.parse(dpi);
  if (!state.sessions.some((s) => s.id === id) && state.pending?.id !== id)
    throw new Error('This calibration is no longer available. Choose another test.');
  return {
    ...state,
    mouseSettings: {
      dpi: useAsCurrent ? value : currentDpi(state),
      sessionDpiOverrides: { ...state.mouseSettings.sessionDpiOverrides, [id]: value },
    },
  };
}
export function estimateDpi(
  horizontalCounts: number,
  distanceCm: number,
  verticalCounts = 0,
): number {
  if (!Number.isFinite(distanceCm) || distanceCm < 1 || distanceCm > 100)
    throw new Error('Enter a measurement distance between 1 and 100 cm.');
  if (!Number.isFinite(horizontalCounts) || Math.abs(horizontalCounts) < 100)
    throw new Error(
      'Too little movement was recorded. Move along the full measured distance and try again.',
    );
  if (
    !Number.isFinite(verticalCounts) ||
    Math.abs(verticalCounts) > Math.abs(horizontalCounts) * 0.1
  )
    throw new Error('Move horizontally along a straight ruler for a more reliable estimate.');
  const dpi = Math.round((Math.abs(horizontalCounts) * 2.54) / distanceCm);
  if (!dpiSchema.safeParse(dpi).success)
    throw new Error(
      'The estimate is outside 100–64000 DPI. Check the distance and repeat the measurement.',
    );
  return dpi;
}
