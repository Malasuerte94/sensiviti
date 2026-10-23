import type { Drill, TrialMetrics } from './types';
import { trialScore } from './calibration';
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function trackingPosition(time: number, seed: number) {
  const phase = (seed % 37) * 0.17;
  return {
    yaw: 22 * Math.sin(time * 1.12 + phase) + 7 * Math.sin(time * 2.43 + phase),
    pitch: 5 * Math.sin(time * 0.81 + phase) + 2 * Math.cos(time * 1.73),
  };
}
export function snapPosition(index: number, seed: number) {
  const rng = random(seed + index * 7919);
  const direction = index % 2 ? -1 : 1;
  return { yaw: direction * (10 + rng() * 19), pitch: (rng() - 0.5) * 20 };
}
export function angularDistance(
  a: { yaw: number; pitch: number },
  b: { yaw: number; pitch: number },
) {
  const radians = Math.PI / 180;
  const p1 = a.pitch * radians,
    p2 = b.pitch * radians;
  return (
    Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          Math.sin(p1) * Math.sin(p2) +
            Math.cos(p1) * Math.cos(p2) * Math.cos((a.yaw - b.yaw) * radians),
        ),
      ),
    ) / radians
  );
}
export function trackingHit(
  camera: { yaw: number; pitch: number },
  target: { yaw: number; pitch: number },
) {
  const yaw = ((((camera.yaw - target.yaw + 540) % 360) + 360) % 360) - 180;
  const pitch = camera.pitch - target.pitch;
  const vertical = Math.max(0, Math.abs(pitch) - 2);
  return yaw * yaw + vertical * vertical <= 1.5 ** 2;
}
/** Fixed 240 Hz evaluation clock, independent of display refresh and RAF count. */
export class Measurement {
  time = 0;
  onTarget = 0;
  errorIntegral = 0;
  shots = 0;
  hits = 0;
  acquisitionTimes: number[] = [];
  private tick = 0;
  sampleUntil(time: number, sample: (at: number) => { hit: boolean; error: number }) {
    const endTick = Math.floor((time + 1e-9) * 240);
    while (this.tick < endTick) {
      const at = (++this.tick - 0.5) / 240;
      const value = sample(at);
      this.onTarget += value.hit ? 1 / 240 : 0;
      this.errorIntegral += value.error / 240;
    }
    this.time = time;
  }
  finish(drill: Drill, duration: number): TrialMetrics {
    const metrics = {
      duration,
      onTargetSeconds: Math.min(duration, this.onTarget),
      meanAngularError: this.errorIntegral / Math.max(duration, 0.001),
      shots: this.shots,
      hits: this.hits,
      acquisitionTimes: [...this.acquisitionTimes],
    };
    return { ...metrics, score: trialScore(drill, metrics) };
  }
}
