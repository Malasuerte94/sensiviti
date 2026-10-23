import { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Expand,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AimEngine } from '../engine/AimEngine';
import { drillNames } from '../core/calibration';
import { displayAngular } from '../core/games';
import type { Setup, TrialMetrics, TrialTask } from '../core/types';
interface Props {
  task: TrialTask;
  setup: Setup;
  onComplete(metrics: TrialMetrics): void;
  onExit(): void;
  practice?: boolean;
}
export function Trainer({ task, setup, onComplete, onExit, practice }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<AimEngine | null>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const [status, setStatus] = useState<
    'ready' | 'countdown' | 'running' | 'paused' | 'error' | 'finished'
  >('ready');
  const statusRef = useRef(status);
  statusRef.current = status;
  const [count, setCount] = useState(2);
  const [remaining, setRemaining] = useState(task.duration);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ accuracy: 0, hits: 0, onTarget: false });
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const lastHud = useRef(0);
  useEffect(() => {
    let live = true;
    const element = host.current!;
    try {
      engine.current = new AimEngine(
        host.current!,
        task,
        setup,
        (left, metrics, hit) => {
          if (!live || performance.now() - lastHud.current < 80) return;
          lastHud.current = performance.now();
          setRemaining(left);
          setStats({
            accuracy:
              task.drill === 'snap'
                ? metrics.shots
                  ? (metrics.hits / metrics.shots) * 100
                  : 0
                : metrics.score * 100,
            hits: metrics.hits,
            onTarget: hit,
          });
        },
        (metrics) => {
          if (!live) return;
          statusRef.current = 'finished';
          setStatus('finished');
          complete.current(metrics);
        },
      );
    } catch (e) {
      setError(
        `The 3D trainer could not start. Check that hardware acceleration is available. ${e instanceof Error ? e.message : ''}`,
      );
      setStatus('error');
    }
    const pause = () => {
      if (!['running', 'countdown'].includes(statusRef.current)) return;
      engine.current?.stop();
      statusRef.current = 'paused';
      setStatus('paused');
      if (document.pointerLockElement) document.exitPointerLock();
    };
    const lockChanged = () => {
      if (!document.pointerLockElement) pause();
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') pause();
    };
    document.addEventListener('pointerlockchange', lockChanged);
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', pause);
    host.current?.addEventListener('trainer-stalled', pause);
    if (document.pointerLockElement && engine.current) {
      setCount(2);
      setStatus('countdown');
    }
    return () => {
      live = false;
      element.removeEventListener('trainer-stalled', pause);
      engine.current?.dispose();
      engine.current = null;
      document.removeEventListener('pointerlockchange', lockChanged);
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', pause);
    };
  }, [task.key, attempt]);
  useEffect(() => {
    if (status !== 'countdown') return;
    const timer = window.setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else {
        statusRef.current = 'running';
        setStatus('running');
        engine.current?.startTrial();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [status, count]);
  async function start() {
    if (!engine.current) {
      setStatus('error');
      return;
    }
    if (status === 'paused' || status === 'error') {
      setAttempt((a) => a + 1);
      setRemaining(task.duration);
      setStats({ accuracy: 0, hits: 0, onTarget: false });
    }
    try {
      const lock = document.getElementById('session-surface')!;
      const promise = lock.requestPointerLock({ unadjustedMovement: true });
      if (!promise || typeof promise.then !== 'function')
        throw new Error('Raw mouse movement is unavailable in this runtime.');
      await promise;
      setCount(2);
      setStatus('countdown');
    } catch (e) {
      if (document.pointerLockElement) document.exitPointerLock();
      setError(
        `Unadjusted mouse input was not granted. Click Retry input to request it again. Close overlays or remote desktop tools if it keeps failing. ${e instanceof Error ? e.message : ''}`,
      );
      setStatus('error');
    }
  }
  const exit = () => {
    engine.current?.stop();
    if (document.pointerLockElement) document.exitPointerLock();
    onExit();
  };
  return (
    <div className="trainer-shell">
      <div className="trainer-toolbar">
        <div className="row gap12">
          <span className="icon-box">
            <Crosshair size={19} />
          </span>
          <div>
            <h3>{drillNames[task.drill]}</h3>
            <p>
              {task.candidate === 'warmup'
                ? 'Warm-up · get comfortable'
                : `${practice ? 'Free practice' : `${task.candidate} sensitivity`} · ${displayAngular(task.angular, setup.game)}`}
              {task.attempt === 1 ? ' · close-score repeat' : ''}
            </p>
          </div>
        </div>
        <div className="row gap12">
          <span className="raw-badge">
            <ShieldCheck size={13} /> RAW INPUT
          </span>
          <button
            className="icon-button"
            aria-label="Toggle fullscreen"
            onClick={async () => {
              if (window.sensiviti) {
                await window.sensiviti.fullscreen(!fullscreen);
                setFullscreen((f) => !f);
              } else if (document.fullscreenElement) await document.exitFullscreen();
              else await document.documentElement.requestFullscreen();
            }}
          >
            <Expand size={17} />
          </button>
          <button className="icon-button" aria-label="Leave trainer" onClick={exit}>
            <X size={19} />
          </button>
        </div>
      </div>
      <div className="arena" ref={host}>
        <div className="arena-top">
          <span>
            {task.drill === 'ads' ? 'ADS MODE' : 'HIPFIRE'}
            <i /> {task.drill === 'ads' ? setup.adsFov : setup.hipFov}° FOV
          </span>
          <span className="arena-clock">
            {remaining.toFixed(1)}
            <small>s</small>
          </span>
        </div>
        <div className={`crosshair ${stats.onTarget && status === 'running' ? 'on-target' : ''}`}>
          <i />
          <i />
          <i />
          <i />
          <b />
        </div>
        {(status === 'ready' || status === 'paused' || status === 'error') && (
          <div className="arena-overlay">
            <div className="arena-dialog">
              <span className="dialog-icon">
                {status === 'paused' ? (
                  <Pause />
                ) : status === 'error' ? (
                  <MousePointer2 />
                ) : (
                  <Crosshair />
                )}
              </span>
              <span className="eyebrow">
                {task.candidate === 'warmup' ? 'LEARN THE DRILL' : 'YOUR NEXT TRIAL'}
              </span>
              <h2>
                {status === 'paused'
                  ? 'Take your time.'
                  : status === 'error'
                    ? 'Let’s check your input.'
                    : drillNames[task.drill]}
              </h2>
              <p>
                {status === 'paused'
                  ? 'Your progress is safe. This interrupted trial will restart, so partial scores never count.'
                  : status === 'error'
                    ? error
                    : task.drill === 'snap'
                      ? 'Move quickly from target to target. Left-click to hit each sphere. Targets expire after 2.5 seconds.'
                      : `Keep the crosshair on the moving player. No clicking needed.${task.drill === 'ads' ? ` Zoom and a fixed ${setup.adsMultiplier}× mouse multiplier are applied automatically.` : ''}`}
              </p>
              <button className="button primary" onClick={() => void start()}>
                {status === 'ready' ? <Play size={16} /> : <RotateCcw size={16} />}{' '}
                {status === 'ready'
                  ? 'Begin trial'
                  : status === 'paused'
                    ? 'Restart trial'
                    : 'Retry input'}
              </button>
              <small>Click to capture your mouse. Press Esc to pause.</small>
            </div>
          </div>
        )}
        {status === 'countdown' && (
          <div className="countdown">
            <span>GET READY</span>
            <b>{count}</b>
            <p>
              {drillNames[task.drill]} · {task.duration} seconds
            </p>
          </div>
        )}
        {status === 'finished' && (
          <div className="countdown">
            <span>TRIAL COMPLETE</span>
            <b>✓</b>
            <p>Saving your progress…</p>
          </div>
        )}
        <div className="arena-bottom">
          <span>
            <kbd>ESC</kbd> Pause & release mouse
          </span>
          <span>{task.drill === 'snap' ? 'LEFT CLICK TO HIT' : 'FOLLOW THE PLAYER'}</span>
        </div>
      </div>
      <div className="trainer-stats">
        <div>
          <span>{task.drill === 'snap' ? 'Shot accuracy' : 'Time on target'}</span>
          <strong>
            {stats.accuracy.toFixed(1)}
            <small>%</small>
          </strong>
        </div>
        <div>
          <span>{task.drill === 'snap' ? 'Targets hit' : 'Sensitivity'}</span>
          <strong>
            {task.drill === 'snap' ? stats.hits : displayAngular(task.angular, setup.game)}
          </strong>
        </div>
        <div>
          <span>Mouse DPI</span>
          <strong>{setup.dpi}</strong>
        </div>
        <div>
          <span>{task.drill === 'ads' ? 'ADS multiplier' : 'Input mode'}</span>
          <strong className="text-small">
            {task.drill === 'ads'
              ? `${setup.adsMultiplier}× · fixed`
              : status === 'running'
                ? 'Unadjusted'
                : 'Awaiting trial'}
          </strong>
        </div>
      </div>
    </div>
  );
}
