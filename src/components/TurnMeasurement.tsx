import { useEffect, useRef, useState } from 'react';
import { validateTurnSettings } from '../core/turnMeasurement';

export function TurnMeasurement({
  dpi,
  sensitivity,
  onDistance,
  onActive,
}: {
  dpi: number;
  sensitivity: number;
  onDistance(cm: number): void;
  onActive(active: boolean): void;
}) {
  const api = window.sensiviti?.turnCapture;
  const id = useRef<string | null>(null);
  const callbacks = useRef({ onDistance, onActive });
  callbacks.current = { onDistance, onActive };
  const [phase, setPhase] = useState<'idle' | 'starting' | 'ready' | 'measuring'>('idle');
  const [samples, setSamples] = useState<number[]>([]);
  const [result, setResult] = useState<{ cm: number; spread: number } | null>(null);
  const [error, setError] = useState('');
  const active = phase !== 'idle';

  useEffect(() => {
    if (!api?.available) return;
    const unsubscribe = api.subscribe((event) => {
      if (event.id !== id.current) return;
      if (event.type === 'ready') setPhase('ready');
      else if (event.type === 'measuring') setPhase('measuring');
      else if (event.type === 'sample') {
        setSamples((current) => [...current, event.cm]);
        setPhase('ready');
      } else {
        id.current = null;
        setPhase('idle');
        callbacks.current.onActive(false);
        if (event.type === 'complete') {
          setResult(event);
          callbacks.current.onDistance(event.cm);
        } else if (event.type === 'error') setError(event.message);
      }
    });
    return () => {
      unsubscribe();
      const pending = id.current;
      id.current = null;
      if (pending) void api.cancel(pending).catch(() => {});
      callbacks.current.onActive(false);
    };
  }, [api]);

  useEffect(() => {
    setResult(null);
    setSamples([]);
    setError('');
  }, [dpi, sensitivity]);

  async function start() {
    if (!api?.available || id.current) return;
    try {
      validateTurnSettings(dpi, sensitivity);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const requestId = crypto.randomUUID();
    id.current = requestId;
    setSamples([]);
    setResult(null);
    setError('');
    setPhase('starting');
    callbacks.current.onActive(true);
    try {
      await api.start({ id: requestId, dpi, sensitivity });
    } catch (e) {
      if (id.current !== requestId) return;
      id.current = null;
      setPhase('idle');
      callbacks.current.onActive(false);
      setError(e instanceof Error ? e.message : 'Could not start in-game measurement.');
    }
  }
  function cancel() {
    const pending = id.current;
    id.current = null;
    setPhase('idle');
    callbacks.current.onActive(false);
    setSamples([]);
    setError('Measurement cancelled. Your previous distance has not changed.');
    if (pending) void api?.cancel(pending).catch(() => {});
  }

  return (
    <div className="turn-measurement">
      <h3>Measure in your game — no ruler needed</h3>
      <p>
        Enter the DPI and sensitivity you use in this game above, then arm the measurement. Switch
        to that game, stand still and aim at a fixed landmark without zooming.
      </p>
      <ol>
        <li>
          Press <kbd>F11</kbd> to start. A low beep marks the start.
        </li>
        <li>
          Make exactly one full turn back to the same landmark. Press <kbd>F11</kbd> again; a higher
          beep marks the end.
        </li>
        <li>
          Repeat for three turns, keeping DPI, sensitivity and FOV unchanged. Then return here.
        </li>
      </ol>
      <p className="field-hint">
        Only left-right movement counts; small up-down movements are fine. The camera stays under
        your control. Keep acceleration off. Lift the mouse to reposition it if needed. Leaving the
        game during a turn cancels the measurement. F11 is reserved only while measurement is armed
        (up to 10 minutes).
      </p>
      {api?.available ? (
        <div className="row">
          <button
            type="button"
            className="button secondary"
            disabled={active}
            onClick={() => void start()}
          >
            {phase === 'starting' ? 'Preparing measurement…' : 'Arm in-game measurement'}
          </button>
          {active && (
            <button type="button" className="button ghost" onClick={cancel}>
              Cancel measurement
            </button>
          )}
        </div>
      ) : (
        <p className="field-hint">
          In-game measurement is available in the Windows desktop app. You can still enter a known
          cm/360 value above.
        </p>
      )}
      <div role="status" aria-live="polite">
        {phase === 'ready' && (
          <p>
            Ready: {samples.length}/3 turns recorded. Switch to your game and press F11 to start the
            next turn.
          </p>
        )}
        {phase === 'measuring' && (
          <p>
            Recording turn {samples.length + 1}/3. Return to the landmark after one full turn and
            press F11.
          </p>
        )}
        {samples.length > 0 && (
          <p className="turn-samples">
            Recorded turns: {samples.map((cm) => `${cm.toFixed(2)} cm`).join(' · ')}
          </p>
        )}
        {result && (
          <p className="turn-success">
            <strong>{result.cm.toFixed(4)} cm/360</strong> filled in above · three turns within{' '}
            {(result.spread * 100).toFixed(1)}%. Add the game to your library to save it.
          </p>
        )}
      </div>
      {error && (
        <p className="conversion-warning" role="alert">
          {error}
        </p>
      )}
      <p className="field-hint">
        Centimeters are estimated from your entered DPI. Matching three turns checks repeatability;
        it does not prove that the game's sensitivity scale is linear. Verify the recommended
        setting in your game.
      </p>
    </div>
  );
}
