import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Crosshair,
  Gauge,
  Mouse,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import { cm360, convert, defaultSetup, gameIds, games } from '../core/games';
import { setupSchema } from '../core/schema';
import type { Setup } from '../core/types';

export function SetupWizard({
  initial,
  configured,
  onStart,
  onSave,
}: {
  initial: Setup | null;
  configured: boolean;
  onStart(setup: Setup): void;
  onSave(setup: Setup): void;
}) {
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<Setup>(initial ?? defaultSetup);
  const [error, setError] = useState('');
  const valid = setupSchema.safeParse(setup);
  const next = () => {
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    setError('');
    setStep((s) => Math.min(2, s + 1));
  };
  const change = (patch: Partial<Setup>) => {
    setSetup((s) => ({ ...s, ...patch }));
    setError('');
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{configured ? 'A FRESH START' : 'WELCOME TO SENSIVITI'}</span>
          <h1>
            Find your <span className="serif-word">feel</span>
            <span className="heading-dot" />
          </h1>
          <p>A little science. A little muscle memory. A sensitivity that feels like you.</p>
        </div>
        <span className="pill">
          <ShieldCheck size={14} /> All local. All yours.
        </span>
      </div>
      <div className="wizard-layout">
        <section className="panel wizard-panel">
          <div className="wizard-steps">
            {['Your baseline', 'Trainer settings', 'Ready to aim'].map((name, i) => (
              <div
                className={`wizard-step ${step === i ? 'current' : step > i ? 'done' : ''}`}
                key={name}
              >
                <span>{step > i ? <Check size={13} /> : `0${i + 1}`}</span>
                <b>{name}</b>
                {i < 2 && <ChevronRight size={15} />}
              </div>
            ))}
          </div>
          <div className="wizard-content">
            <span className="step-label">STEP 0{step + 1} / 03</span>
            <h2>
              {
                [
                  'Start with what you know.',
                  'Make the range your own.',
                  'Your next good setting starts here.',
                ][step]
              }
            </h2>
            <p className="muted">
              {
                [
                  'We’ll use your current setup as a starting point, then do the math from there.',
                  'These settings stay fixed throughout calibration to keep comparisons fair.',
                  'Three drills. Seven comparisons. One sensitivity, measured around your aim.',
                ][step]
              }
            </p>
            {step === 0 && (
              <>
                <label className="field-label">
                  Reference game <span>Your result will use this game’s scale</span>
                </label>
                <div className="game-picker">
                  {gameIds.map((id) => (
                    <button
                      key={id}
                      className={`game-option ${setup.game === id ? 'selected' : ''}`}
                      onClick={() =>
                        change({
                          game: id,
                          sensitivity: convert(
                            games[setup.game].toAngular(
                              Number.isFinite(setup.sensitivity) ? setup.sensitivity : 1,
                            ),
                            setup.dpi,
                            id,
                          ).rounded,
                        })
                      }
                    >
                      <span className={`game-mark ${id}`} style={{ color: games[id].color }}>
                        {games[id].shortName}
                      </span>
                      <strong>{games[id].name}</strong>
                      <span className="radio">{setup.game === id && <i />}</span>
                    </button>
                  ))}
                </div>
                <div className="fields-grid">
                  <div>
                    <label htmlFor="dpi" className="field-label">
                      Mouse DPI <Mouse size={14} />
                    </label>
                    <div className="input-unit">
                      <input
                        id="dpi"
                        type="number"
                        min="100"
                        max="64000"
                        step="100"
                        value={Number.isNaN(setup.dpi) ? '' : setup.dpi}
                        onChange={(e) => change({ dpi: e.target.valueAsNumber })}
                      />
                      <span>DPI</span>
                    </div>
                    <div className="chips">
                      {[400, 800, 1600, 3200].map((dpi) => (
                        <button
                          key={dpi}
                          className={setup.dpi === dpi ? 'active' : ''}
                          onClick={() => change({ dpi })}
                        >
                          {dpi}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="sensitivity" className="field-label">
                      Starting sensitivity <Gauge size={14} />
                    </label>
                    <div className="input-unit">
                      <input
                        id="sensitivity"
                        type="number"
                        min={games[setup.game].min}
                        max={setup.game === 'minecraft' ? 200 : games[setup.game].max}
                        step="any"
                        value={
                          Number.isNaN(setup.sensitivity)
                            ? ''
                            : Number(
                                (setup.game === 'minecraft'
                                  ? setup.sensitivity * 200
                                  : setup.sensitivity
                                ).toFixed(8),
                              )
                        }
                        onChange={(e) =>
                          change({
                            sensitivity:
                              e.target.valueAsNumber / (setup.game === 'minecraft' ? 200 : 1),
                          })
                        }
                      />
                      <span>{setup.game === 'minecraft' ? '%' : 'IN-GAME'}</span>
                    </div>
                    <p className="field-hint">
                      {setup.game === 'minecraft'
                        ? 'Java’s slider runs from 0% to 200%.'
                        : 'Use your current setting, or start with 1.0.'}
                    </p>
                    {games[setup.game].note && (
                      <p className="rounding-note">{games[setup.game].note}</p>
                    )}
                  </div>
                </div>
                <div className="inline-note">
                  <span className="icon-box">
                    <ScanLine size={19} />
                  </span>
                  <div>
                    <strong>Your starting turn distance</strong>
                    <p>
                      {valid.success
                        ? `${cm360(games[setup.game].toAngular(setup.sensitivity), setup.dpi).toFixed(2)} cm for a full 360° turn`
                        : 'Enter your mouse DPI and a valid sensitivity.'}
                    </p>
                  </div>
                  <span className="small-tag">BASELINE</span>
                </div>
              </>
            )}
            {step === 1 && (
              <div className="slider-fields">
                {(
                  [
                    {
                      key: 'hipFov',
                      label: 'Hipfire field of view',
                      min: 60,
                      max: 130,
                      step: 1,
                      unit: '°',
                    },
                    {
                      key: 'adsFov',
                      label: 'ADS field of view',
                      min: 20,
                      max: 100,
                      step: 1,
                      unit: '°',
                    },
                    {
                      key: 'adsMultiplier',
                      label: 'ADS sensitivity multiplier',
                      min: 0.1,
                      max: 2,
                      step: 0.05,
                      unit: '×',
                    },
                  ] as const
                ).map((field) => (
                  <div className="slider-field" key={field.key}>
                    <div>
                      <label htmlFor={field.key}>{field.label}</label>
                      <strong>
                        {Number(setup[field.key].toFixed(2))}
                        {field.unit}
                      </strong>
                    </div>
                    <input
                      id={field.key}
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={setup[field.key]}
                      onChange={(e) => change({ [field.key]: Number(e.target.value) })}
                    />
                    <div className="range-labels">
                      <span>
                        {field.min}
                        {field.unit}
                      </span>
                      <span>
                        {field.max}
                        {field.unit}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="inline-note">
                  <SlidersHorizontal size={22} />
                  <p>
                    FOV is horizontal at 16:9. The ADS multiplier is for this trainer; your result
                    converts hipfire settings across games.
                  </p>
                </div>
              </div>
            )}
            {step === 2 && (
              <>
                <div className="ready-summary">
                  <div>
                    <span>REFERENCE</span>
                    <strong>{games[setup.game].shortName}</strong>
                  </div>
                  <div>
                    <span>MOUSE</span>
                    <strong>
                      {setup.dpi} <small>DPI</small>
                    </strong>
                  </div>
                  <div>
                    <span>BASELINE</span>
                    <strong>
                      {setup.game === 'minecraft'
                        ? `${(setup.sensitivity * 200).toFixed(1)}%`
                        : setup.sensitivity}
                    </strong>
                  </div>
                </div>
                <div className="checklist">
                  <p>
                    <Check />
                    Keep your mouse DPI the same for every trial.
                  </p>
                  <p>
                    <Check />
                    Give yourself enough mousepad space to turn comfortably.
                  </p>
                  <p>
                    <Check />
                    Follow the player in tracking. Click targets in snap aiming.
                  </p>
                  <p>
                    <Check />
                    Press Esc for a break. You can resume whenever you’re ready.
                  </p>
                </div>
                <div className="inline-note">
                  <ShieldCheck size={22} />
                  <p>
                    The app applies every trial sensitivity automatically. Afterwards, copy your
                    recommended settings into your games.
                  </p>
                </div>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="wizard-footer">
            {step > 0 ? (
              <button className="button ghost" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
            ) : (
              <span className="muted small">No account. No downloads after setup.</span>
            )}
            <div className="row gap12">
              {step === 2 && (
                <button
                  className="button ghost"
                  onClick={() => (valid.success ? onSave(setup) : next())}
                >
                  Save & explore
                </button>
              )}
              <button
                className="button primary"
                onClick={() => (step < 2 ? next() : valid.success ? onStart(setup) : next())}
              >
                {step === 2 ? 'Start calibration' : 'Continue'}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
        <aside className="wizard-aside">
          <div className="panel journey-panel">
            <div className="row between">
              <span className="eyebrow">THE GAME PLAN</span>
              <Sparkles size={17} />
            </div>
            <h3>
              Less guessing.
              <br />
              More <span>on target.</span>
            </h3>
            <p>We test both sides of your baseline, then narrow the gap around what works.</p>
            <div className="psa-visual">
              <div className="psa-line" />
              <span className="psa-low">LOWER</span>
              <span className="psa-base">YOUR BASE</span>
              <span className="psa-high">HIGHER</span>
              <i className="psa-node left" />
              <i className="psa-node center" />
              <i className="psa-node right" />
              <div className="psa-bracket" />
              <small>COMPARE. ADJUST. REPEAT.</small>
            </div>
            <div className="journey-stat">
              <Timer size={17} />
              <span>~12–15 minutes</span>
              <span>at your pace</span>
            </div>
            <div className="journey-stat">
              <Zap size={17} />
              <span>7 comparison rounds</span>
              <span>auto-adjusted</span>
            </div>
            <div className="journey-stat">
              <Crosshair size={17} />
              <span>3 aiming scenarios</span>
              <span>equally weighted</span>
            </div>
          </div>
          <div className="quiet-note">
            <ShieldCheck size={18} />
            <p>
              Your aim data stays on this device.
              <br />
              No accounts, uploads, or tracking.
            </p>
          </div>
          <div className="version-note">
            <span className="status-dot" /> BUILT FOR MOUSE & KEYBOARD
          </div>
        </aside>
      </div>
    </>
  );
}
