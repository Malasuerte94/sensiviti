import { useState, type FormEvent } from 'react';
import { Mouse } from 'lucide-react';
import { cm360, displayAngular, games } from '../core/games';
import {
  atDpi,
  correctSessionDpi,
  currentProfile,
  sessionDpi,
  updateMouseDpi,
} from '../core/mouse';
import { dpiSchema } from '../core/schema';
import type { AppState } from '../core/types';
import { DpiMeasurement } from './DpiMeasurement';

export function MouseSettings({
  data,
  onChange,
}: {
  data: AppState;
  onChange(change: (state: AppState) => AppState): Promise<void>;
}) {
  const profile = currentProfile(data);
  const tests = [
    ...data.sessions.map((s) => s.session),
    ...(data.pending && !data.sessions.some((s) => s.id === data.pending!.id)
      ? [data.pending]
      : []),
  ];
  const [dpi, setDpi] = useState(String(profile.dpi));
  const [testId, setTestId] = useState(
    data.activeResultId ?? data.pending?.id ?? tests[0]?.id ?? '',
  );
  const selected = tests.find((s) => s.id === testId);
  const [corrected, setCorrected] = useState(
    String(selected ? sessionDpi(data, selected) : profile.dpi),
  );
  const [useCurrent, setUseCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const validDpi = dpiSchema.safeParse(Number(dpi));
  async function apply(event: FormEvent, correction: boolean) {
    event.preventDefault();
    setError('');
    setNotice('');
    const parsed = dpiSchema.safeParse(Number(correction ? corrected : dpi));
    if (!parsed.success) {
      setError('Enter a whole-number DPI between 100 and 64000.');
      return;
    }
    setBusy(true);
    try {
      await onChange((state) =>
        correction
          ? correctSessionDpi(state, testId, parsed.data, useCurrent)
          : updateMouseDpi(state, parsed.data),
      );
      if (correction && useCurrent) setDpi(String(parsed.data));
      setNotice(
        correction
          ? 'Test DPI corrected. Conversions have been updated.'
          : 'Mouse DPI updated. Your turn distance is preserved.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel mouse-settings">
      <span className="icon-box">
        <Mouse size={21} />
      </span>
      <h2>Mouse settings</h2>
      <p>
        Set the DPI currently configured on your mouse. Your saved recommendations, game library,
        and practice sensitivity automatically keep the same physical turn distance.
      </p>
      <form onSubmit={(event) => void apply(event, false)}>
        <label className="field-label" htmlFor="current-mouse-dpi">
          Current mouse DPI
        </label>
        <div className="dpi-input-row">
          <input
            id="current-mouse-dpi"
            type="number"
            min="100"
            max="64000"
            step="1"
            required
            value={dpi}
            onChange={(e) => setDpi(e.target.value)}
          />
          <button className="button primary" type="submit" disabled={busy}>
            Update mouse DPI
          </button>
        </div>
        <div className="chips">
          {[400, 800, 1600, 3200].map((value) => (
            <button
              type="button"
              key={value}
              className={dpi === String(value) ? 'active' : ''}
              onClick={() => setDpi(String(value))}
            >
              {value} DPI
            </button>
          ))}
        </div>
        {validDpi.success && (
          <p className="dpi-preview">
            {games[profile.game].name}:{' '}
            <strong>
              {displayAngular(atDpi(profile.angular, profile.dpi, validDpi.data), profile.game)}
            </strong>
            {' at '}
            {validDpi.data} DPI · {cm360(profile.angular, profile.dpi).toFixed(2)} cm/360. Game
            slider limits and rounding are shown in My games.
          </p>
        )}
      </form>
      <p className="field-hint">
        DPI is entered manually or estimated below. Sensiviti cannot universally read or change a
        mouse’s hardware DPI. Windows display scaling and cursor speed are separate settings.
      </p>
      <details className="dpi-details">
        <summary>Estimate DPI with a ruler</summary>
        <DpiMeasurement onEstimate={(value) => setDpi(String(value))} />
      </details>
      {selected && (
        <details className="dpi-details">
          <summary>Correct a test’s recorded DPI</summary>
          <form className="dpi-correction" onSubmit={(event) => void apply(event, true)}>
            <p>
              If the mouse stayed at the same hardware DPI throughout the test but you entered the
              wrong number, enter the DPI you actually used. Your scores and completed test remain
              valid; the cm/360 value is corrected. A test performed while switching hardware DPI
              needs a fresh calibration.
            </p>
            <label className="field-label" htmlFor="dpi-test">
              Calibration to correct
            </label>
            <select
              id="dpi-test"
              value={testId}
              onChange={(e) => {
                setTestId(e.target.value);
                const test = tests.find((s) => s.id === e.target.value)!;
                setCorrected(String(sessionDpi(data, test)));
                setError('');
                setNotice('');
              }}
            >
              {tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {games[test.setup.game].name} · {new Date(test.createdAt).toLocaleString()} ·{' '}
                  {test.id === data.pending?.id
                    ? 'Unfinished'
                    : test.id === data.activeResultId
                      ? 'Active result'
                      : 'Saved result'}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Originally recorded: {selected.setup.dpi} DPI. Effective test DPI:{' '}
              {sessionDpi(data, selected)}.
            </p>
            <label className="field-label" htmlFor="actual-test-dpi">
              Actual DPI used during this test
            </label>
            <input
              id="actual-test-dpi"
              type="number"
              min="100"
              max="64000"
              step="1"
              required
              value={corrected}
              onChange={(e) => setCorrected(e.target.value)}
            />
            <label className="dpi-checkbox">
              <input
                type="checkbox"
                checked={useCurrent}
                onChange={(e) => setUseCurrent(e.target.checked)}
              />
              Also use this as my current mouse DPI
            </label>
            <button className="button secondary" type="submit" disabled={busy}>
              Correct test DPI
            </button>
          </form>
        </details>
      )}
      {notice && (
        <p className="cyan" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="conversion-warning" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
