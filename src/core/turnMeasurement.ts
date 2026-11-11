/** A single, user-marked horizontal turn, captured from Windows Raw Input. */
export interface TurnSample {
  x: number;
  y: number;
  pathX: number;
  pathY: number;
  elapsedMs: number;
}
export interface TurnCaptureRequest {
  id: string;
  dpi: number;
  sensitivity: number;
}
export type TurnCaptureEvent =
  | { id: string; type: 'ready' | 'measuring' | 'cancelled' }
  | { id: string; type: 'sample'; count: number; cm: number }
  | { id: string; type: 'complete'; cm: number; spread: number }
  | { id: string; type: 'error'; message: string };

export function validateTurnSettings(dpi: number, sensitivity: number) {
  if (!Number.isInteger(dpi) || dpi < 100 || dpi > 64000)
    throw new Error('Enter your active mouse DPI (100–64000) before measuring.');
  if (!Number.isFinite(sensitivity) || sensitivity < 0.000001 || sensitivity > 100000)
    throw new Error('Enter a positive in-game sensitivity before measuring.');
}

export function turnDistance(sample: TurnSample, dpi: number): number {
  validateTurnSettings(dpi, 1);
  if (
    ![sample.x, sample.y, sample.pathX, sample.pathY].every(Number.isSafeInteger) ||
    sample.pathX < Math.abs(sample.x) ||
    sample.pathY < Math.abs(sample.y) ||
    !Number.isFinite(sample.elapsedMs) ||
    sample.elapsedMs < 500 ||
    sample.elapsedMs > 120000 ||
    Math.abs(sample.x) < 100
  )
    throw new Error(
      'Too little movement or an incomplete turn. Repeat one full turn between F11 presses.',
    );
  // Only signed horizontal counts determine yaw. Vertical drift and backtracking
  // are allowed: the player marks the net full turn by returning to the landmark.
  const cm = (Math.abs(sample.x) * 2.54) / dpi;
  if (cm < 0.1 || cm > 2000)
    throw new Error('The turn distance is outside the supported range. Check your DPI and repeat.');
  return cm;
}

export function summarizeTurns(samples: TurnSample[], dpi: number) {
  if (samples.length !== 3) throw new Error('Complete three turns before using the measurement.');
  const distances = samples.map((sample) => turnDistance(sample, dpi)).sort((a, b) => a - b);
  const cm = distances[1];
  const spread = (distances[2] - distances[0]) / cm;
  if (spread > 0.05)
    throw new Error(
      'The three turns differ by more than 5%. Keep DPI, sensitivity and FOV fixed, disable acceleration, and repeat.',
    );
  return { cm, spread };
}
