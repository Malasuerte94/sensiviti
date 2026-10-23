import { useEffect, useRef, useState } from 'react';
import { estimateDpi } from '../core/mouse';

export function DpiMeasurement({ onEstimate }: { onEstimate(dpi: number): void }) {
  const surface = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const sample = useRef({ x: 0, y: 0 });
  const callback = useRef(onEstimate);
  callback.current = onEstimate;
  const [distance, setDistance] = useState('10');
  const distanceRef = useRef(distance);
  distanceRef.current = distance;
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<number | null>(null);
  useEffect(() => {
    function cancel() {
      if (!active.current) return;
      active.current = false;
      setRunning(false);
      setError('Measurement cancelled. Position your mouse at the start mark and try again.');
      if (document.pointerLockElement === surface.current) document.exitPointerLock();
    }
    function moved(event: MouseEvent) {
      if (!active.current || document.pointerLockElement !== surface.current) return;
      sample.current.x += event.movementX;
      sample.current.y += event.movementY;
    }
    function key(event: KeyboardEvent) {
      if (!active.current || event.code !== 'Space') return;
      event.preventDefault();
      active.current = false;
      setRunning(false);
      document.exitPointerLock();
      try {
        const dpi = estimateDpi(sample.current.x, Number(distanceRef.current), sample.current.y);
        setResult(dpi);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    function lockChanged() {
      if (document.pointerLockElement !== surface.current) cancel();
    }
    function hidden() {
      if (document.hidden) cancel();
    }
    document.addEventListener('mousemove', moved);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerlockchange', lockChanged);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', cancel);
    const element = surface.current;
    return () => {
      active.current = false;
      document.removeEventListener('mousemove', moved);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerlockchange', lockChanged);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', cancel);
      if (document.pointerLockElement === element) document.exitPointerLock();
    };
  }, []);
  async function start() {
    const cm = Number(distance);
    if (!Number.isFinite(cm) || cm < 1 || cm > 100) {
      setError('Enter a measurement distance between 1 and 100 cm.');
      return;
    }
    setError('');
    setResult(null);
    setStarting(true);
    const element = surface.current!;
    try {
      const promise = element.requestPointerLock({ unadjustedMovement: true });
      if (!promise || typeof promise.then !== 'function')
        throw new Error('Raw mouse input is unavailable in this runtime.');
      await promise;
      if (surface.current !== element || document.pointerLockElement !== element) return;
      sample.current = { x: 0, y: 0 };
      active.current = true;
      setRunning(true);
    } catch (e) {
      setError(
        `Raw mouse input could not be captured. Retry, or enter the DPI from your mouse software manually. ${e instanceof Error ? e.message : ''}`,
      );
    } finally {
      setStarting(false);
    }
  }
  return (
    <div className="dpi-measurement" ref={surface}>
      <p>
        Mark a horizontal distance on your desk. Place the mouse at the start, click Start
        measurement, move straight to the end mark, then press <kbd>Space</kbd>. <kbd>Esc</kbd>{' '}
        cancels.
      </p>
      <div className="dpi-input-row">
        <div>
          <label className="field-label" htmlFor="dpi-distance">
            Travel distance (cm)
          </label>
          <input
            id="dpi-distance"
            type="number"
            min="1"
            max="100"
            step="any"
            value={distance}
            disabled={running || starting}
            onChange={(e) => {
              setDistance(e.target.value);
              setResult(null);
            }}
          />
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => void start()}
          disabled={running || starting}
        >
          {running
            ? 'Measuring… press Space to finish'
            : starting
              ? 'Requesting raw input…'
              : 'Start measurement'}
        </button>
      </div>
      {running && <p role="status">Move exactly {distance} cm horizontally, then press Space.</p>}
      {result !== null && (
        <div className="dpi-estimate-result" role="status">
          <strong>Estimated DPI: {result}</strong>
          <button
            type="button"
            className="button secondary"
            onClick={() => callback.current(result)}
          >
            Use estimated DPI
          </button>
        </div>
      )}
      {error && (
        <p className="conversion-warning" role="alert">
          {error}
        </p>
      )}
      <p className="field-hint">
        This is a physical measurement estimate, not a hardware readout. Repeat it to check
        consistency; the DPI value in your mouse software is preferable when available.
      </p>
    </div>
  );
}
