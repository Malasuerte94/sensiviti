import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Download,
  Gamepad2,
  History,
  Home,
  Info,
  Layers3,
  LoaderCircle,
  Mouse,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Timer,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  createSession,
  commitDecision,
  DRILLS,
  drillNames,
  getTask,
  recordTrial,
  repeatRound,
  sessionProgress,
} from './core/calibration';
import { cm360, defaultSetup, displayAngular, gameIds, games } from './core/games';
import { initialState } from './core/schema';
import type {
  AppState,
  CalibrationSession,
  GameId,
  SavedResult,
  Setup,
  TrialMetrics,
  TrialTask,
} from './core/types';
import { storage } from './storage';
import { SetupWizard } from './components/SetupWizard';
import { Trainer } from './components/Trainer';
import { RoundReview } from './components/RoundReview';
import { GameCard, StatCard } from './components/Common';

type Page = 'home' | 'setup' | 'practice' | 'games' | 'history' | 'settings' | 'session' | 'result';
const navItems = [
  { id: 'home', label: 'Overview', icon: Home },
  { id: 'setup', label: 'Calibration', icon: Crosshair },
  { id: 'practice', label: 'Practice range', icon: Target },
  { id: 'games', label: 'My games', icon: Gamepad2 },
  { id: 'history', label: 'Session history', icon: History },
] as const;
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function App() {
  const [data, setData] = useState<AppState>(initialState);
  const ref = useRef(data);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [notice, setNotice] = useState('');
  const [practice, setPractice] = useState<TrialTask | null>(null);
  const [practiceResult, setPracticeResult] = useState<TrialMetrics | null>(null);
  const [viewedResult, setViewedResult] = useState<CalibrationSession | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action(): Promise<void>;
  } | null>(null);
  const [help, setHelp] = useState(false);
  const [profileFile, setProfileFile] = useState<string | null>(null);
  async function load() {
    try {
      const state = await storage.load();
      ref.current = state;
      setData(state);
      setPage(state.setup ? 'home' : 'setup');
      setLoadFailed(false);
      setError('');
    } catch (e) {
      setLoadFailed(true);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    void load();
    if (window.sensiviti)
      void window.sensiviti
        .profileInfo()
        .then((info) => setProfileFile(info.file))
        .catch(() => {});
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function update(change: (state: AppState) => AppState) {
    const operation = queue.current.then(async () => {
      setSaving(true);
      const next = change(ref.current);
      await storage.save(next);
      ref.current = next;
      setData(next);
    });
    queue.current = operation.catch(() => {});
    try {
      await operation;
    } finally {
      setSaving(false);
    }
  }
  async function safe(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function navigate(next: Page) {
    if (document.pointerLockElement) document.exitPointerLock();
    setPractice(null);
    setPracticeResult(null);
    setPage(next);
  }
  function startCalibration(setup: Setup) {
    const session = createSession(setup);
    const action = async () => {
      await update((s) => ({ ...s, setup, pending: session }));
      setPage('session');
      setConfirmation(null);
    };
    if (data.pending)
      setConfirmation({
        title: 'Start a fresh calibration?',
        description:
          'This replaces your unfinished calibration. Your saved results stay in session history.',
        action,
      });
    else void safe(action);
  }
  function saveSetup(setup: Setup) {
    const action = async () => {
      await update((s) => ({ ...s, setup, pending: null }));
      setConfirmation(null);
      setPage('home');
      setNotice('Your setup is ready. Calibrate whenever you like.');
    };
    if (data.pending)
      setConfirmation({
        title: 'Update your setup?',
        description:
          'New settings require a fresh calibration. Your unfinished session will be replaced.',
        action,
      });
    else void safe(action);
  }
  async function importBackup() {
    const imported = await storage.import();
    if (!imported) return;
    setConfirmation({
      title: 'Restore this backup?',
      description: `Replace local data with ${imported.sessions.length} saved result(s)${imported.pending ? ' and an unfinished calibration' : ''}. Export your current data first if you want to keep it.`,
      action: async () => {
        await update(() => imported);
        setLoadFailed(false);
        setError('');
        setConfirmation(null);
        setPage(imported.setup ? 'home' : 'setup');
        setNotice('Backup restored.');
      },
    });
  }
  const active = data.sessions.find((r) => r.id === data.activeResultId);
  const setup = data.setup ?? defaultSetup;
  const angular = active?.angular ?? games[setup.game].toAngular(setup.sensitivity);
  const resultDpi = active?.setup.dpi ?? setup.dpi;
  const session = data.pending;
  async function completeTrial(metrics: TrialMetrics) {
    const current = ref.current.pending;
    if (!current) return;
    const task = getTask(current);
    if (!task) return;
    const next = recordTrial(current, task, metrics);
    await update((s) => ({ ...s, pending: next }));
    if (next.phase === 'complete') {
      document.exitPointerLock();
      setViewedResult(next);
      setPage('result');
    }
  }
  async function saveResult(value: CalibrationSession) {
    if (!value.result) return;
    const savedSession = { ...value, result: { ...value.result, saved: true } };
    const saved: SavedResult = {
      id: value.id,
      createdAt: new Date().toISOString(),
      angular: value.result.angular,
      setup: value.setup,
      validated: value.result.validated,
      session: savedSession,
    };
    await update((s) => ({
      ...s,
      activeResultId: saved.id,
      sessions: [saved, ...s.sessions.filter((r) => r.id !== saved.id)].slice(0, 500),
      pending: s.pending?.id === value.id ? null : s.pending,
    }));
    setViewedResult(savedSession);
    setNotice('Recommendation saved and activated.');
    setPage('home');
  }
  const contentTitle =
    page === 'settings'
      ? 'Settings'
      : page === 'session'
        ? 'Calibration'
        : page === 'result'
          ? 'Your results'
          : (navItems.find((n) => n.id === page)?.label ?? 'Overview');
  if (!loaded)
    return (
      <div className="app-loading">
        <Crosshair size={38} />
        <p>Opening your range…</p>
      </div>
    );
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
          }}
          aria-label="Sensiviti home"
        >
          <span className="brand-symbol">
            <Crosshair size={26} strokeWidth={1.8} />
          </span>
          <span>
            sensiviti<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id || (item.id === 'setup' && ['session', 'result'].includes(page)) ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === 'setup' && <span className="nav-new">PSA</span>}
              {item.id === 'games' && <span className="nav-count">{data.games.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <div className="tip-reticle">
            <Crosshair size={27} strokeWidth={1.4} />
          </div>
          <h4>
            Your aim.
            <br />
            Your settings.
          </h4>
          <p>
            Build consistency.
            <br />
            One comparison at a time.
          </p>
          <span>
            FIND YOUR FEEL <ArrowDownRight size={14} />
          </span>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} />
            Settings
          </button>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            How it works <span className="help-dot" />
          </button>
          <div className="local-footer">
            <span className="status-dot" />
            <span>LOCAL & OFFLINE</span>
            <small>v1.0.0</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>{contentTitle}</span>
          </div>
          <div className="row gap20">
            <span className="saved-status">
              {saving ? (
                <LoaderCircle size={13} className="spin" />
              ) : (
                <span className="status-dot" />
              )}
              {saving ? 'Saving…' : 'On-device storage'}
            </span>
            <span className="divider" />
            <span className="device-badge">
              <Mouse size={15} />
              {setup.dpi} <small>DPI</small>
            </span>
            <span className="avatar">P1</span>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <Info size={17} />
            <span>{error}</span>
            {!loadFailed && (
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <main>
          {loadFailed ? (
            <div className="panel empty-state">
              <Info size={35} />
              <h2>Your saved file needs attention.</h2>
              <p>
                The existing file has been preserved. Retry loading it or restore a valid exported
                backup.
              </p>
              <div className="row gap12">
                <button className="button primary" onClick={() => void load()}>
                  Retry loading
                </button>
                <button className="button secondary" onClick={() => void safe(importBackup)}>
                  <Upload size={15} /> Import backup
                </button>
              </div>
            </div>
          ) : (
            <>
              {page === 'setup' && (
                <SetupWizard
                  key="calibration"
                  initial={data.setup}
                  configured={!!data.setup}
                  onStart={startCalibration}
                  onSave={saveSetup}
                />
              )}
              {page === 'home' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">AIM WITH INTENTION</span>
                      <h1>
                        Your aim, in focus
                        <span className="heading-dot" />
                      </h1>
                      <p>
                        {active
                          ? 'Your feel is dialed in. Keep building on it.'
                          : 'Good aim starts with a sensitivity that feels right.'}
                      </p>
                    </div>
                    <span className="pill">
                      <span className="status-dot" />
                      {active ? 'PROFILE CALIBRATED' : 'READY WHEN YOU ARE'}
                    </span>
                  </div>
                  {session && (
                    <div className="resume-banner">
                      <div className="row gap12">
                        <RotateCcw size={19} />
                        <div>
                          <strong>
                            {session.phase === 'complete'
                              ? 'Your calibration results are ready.'
                              : 'Pick up where you left off.'}
                          </strong>
                          <span>
                            {session.phase === 'warmup'
                              ? 'Warm-up'
                              : session.phase === 'complete'
                                ? 'Review and save your recommendation'
                                : `Round ${Math.min(7, session.round + 1)} of 7`}{' '}
                            · Progress saved on this device
                          </span>
                        </div>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => {
                          if (session.phase === 'complete') {
                            setViewedResult(session);
                            setPage('result');
                          } else setPage('session');
                        }}
                      >
                        {session.phase === 'complete' ? 'View results' : 'Resume session'}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  <section className="hero panel">
                    <div className="hero-copy">
                      <span className="hero-label">
                        <span className="status-dot" /> THE SENSITIVITY FINDER
                      </span>
                      <h2>
                        Stop guessing.
                        <br />
                        Find your <span>sweet spot.</span>
                      </h2>
                      <p>
                        Let your aim do the talking. Three focused drills and seven smart
                        comparisons find a setting that works with you.
                      </p>
                      <button className="button primary" onClick={() => navigate('setup')}>
                        {active ? 'Recalibrate sensitivity' : 'Find my sensitivity'}
                        <ArrowRight size={17} />
                      </button>
                      <div className="hero-meta">
                        <span>
                          <Timer size={14} />
                          12–15 min
                        </span>
                        <span>
                          <Layers3 size={14} />7 rounds
                        </span>
                        <span>
                          <Zap size={14} />
                          Auto-adjusted
                        </span>
                      </div>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="art-grid" />
                      <div className="art-orbit orbit-one" />
                      <div className="art-orbit orbit-two" />
                      <div className="art-orbit orbit-three" />
                      <div className="art-axes" />
                      <div className="art-target">
                        <span />
                        <i />
                        <b />
                      </div>
                      <span className="art-point p1" />
                      <span className="art-point p2" />
                      <span className="art-point p3" />
                      <div className="art-coordinates">
                        X 0.000
                        <br />Y 0.000
                      </div>
                      <div className="art-caption">
                        <span className="status-dot" /> PRECISION IS PERSONAL
                      </div>
                      <span className="art-label">CALIBRATE / ADAPT / IMPROVE</span>
                    </div>
                  </section>
                  <div className="stats-grid">
                    <StatCard
                      label={active ? 'Active sensitivity' : 'Starting sensitivity'}
                      value={displayAngular(angular, active?.setup.game ?? setup.game)}
                      detail={`${games[active?.setup.game ?? setup.game].name} · ${active ? 'Calibrated profile' : 'Ready for calibration'}`}
                      icon="target"
                    />
                    <StatCard
                      label="Turn distance"
                      value={cm360(angular, resultDpi).toFixed(2)}
                      unit="cm/360"
                      detail={`At ${resultDpi} DPI · same physical distance`}
                      icon="trend"
                    />
                    <StatCard
                      label="Your game library"
                      value={data.games.length.toString().padStart(2, '0')}
                      unit="games"
                      detail="One feel. Across your favorites."
                      icon="game"
                    />
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>
                        Three ways to find your feel <span className="count-badge">03</span>
                      </h2>
                      <p>Each skill gets an equal say in your result.</p>
                    </div>
                    <button className="text-button" onClick={() => navigate('practice')}>
                      Open practice range <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="drill-grid">
                    {DRILLS.map((drill, i) => (
                      <button
                        key={drill}
                        className={`panel drill-card ${drill}`}
                        onClick={() => {
                          navigate('practice');
                        }}
                      >
                        <div className={`drill-illustration ${drill}`}>
                          <div className="mini-grid" />
                          {drill === 'snap' ? (
                            <>
                              <i className="snap-ball a" />
                              <i className="snap-ball b" />
                              <span className="snap-path" />
                            </>
                          ) : (
                            <>
                              <span className="tracking-path" />
                              <i className="mini-player" />
                              {drill === 'ads' && <div className="scope-circle" />}
                            </>
                          )}
                          <span className="mini-crosshair">+</span>
                          <span className="drill-number">0{i + 1}</span>
                        </div>
                        <div className="drill-info">
                          <span className="eyebrow">
                            {['STAY CONNECTED', 'LOCK IT IN', 'MAKE THE SWITCH'][i]}
                          </span>
                          <h3>
                            {drillNames[drill]}
                            <ArrowRight size={16} />
                          </h3>
                          <p>
                            {
                              [
                                'Follow a strafing player. Find control in continuous motion.',
                                'Stay on target through a tighter view and fixed ADS multiplier.',
                                'Move from point A to B. Balance quick reactions with clean stops.',
                              ][i]
                            }
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>Your settings, everywhere</h2>
                      <p>Matched by physical turn distance. Ready for your next game.</p>
                    </div>
                    <button className="text-button" onClick={() => navigate('games')}>
                      Manage games <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="game-grid">
                    {data.games.length ? (
                      data.games.map((id) => (
                        <GameCard key={id} id={id} angular={angular} dpi={resultDpi} compact />
                      ))
                    ) : (
                      <div className="panel empty-state">
                        <p>Add a game to see your converted settings.</p>
                        <button className="button secondary" onClick={() => navigate('games')}>
                          Add games
                        </button>
                      </div>
                    )}
                  </div>
                  <footer className="page-footer">
                    <span>
                      <ShieldCheck size={13} />
                      Private by design. All calculations happen on your device.
                    </span>
                    <span>MADE FOR YOUR MUSCLE MEMORY</span>
                  </footer>
                </>
              )}
              {page === 'session' && session && session.phase !== 'complete' && (
                <section id="session-surface" className="session-page">
                  <div className="page-heading compact-heading">
                    <div>
                      <span className="eyebrow">
                        {session.phase === 'warmup'
                          ? 'GET TO KNOW THE RANGE'
                          : session.phase === 'validation'
                            ? 'THE FINAL CHECK'
                            : `COMPARISON ${session.round + 1} OF 7`}
                      </span>
                      <h1>
                        {session.phase === 'warmup'
                          ? 'A little warm-up.'
                          : session.phase === 'validation'
                            ? 'Put it to the test.'
                            : 'Follow your feel.'}
                      </h1>
                      <p>
                        {session.phase === 'warmup'
                          ? 'Try each drill for 10 seconds. These scores won’t affect your result.'
                          : session.phase === 'validation'
                            ? 'Comparing your original setting with the newly calculated center.'
                            : 'Your sensitivity updates automatically. Just focus on the target.'}
                      </p>
                    </div>
                    <span className="pill">
                      <span className="status-dot" /> PROGRESS SAVED
                    </span>
                  </div>
                  <div className="session-progress">
                    <div className="progress-track">
                      <i style={{ width: `${sessionProgress(session) * 100}%` }} />
                    </div>
                    <span>{Math.round(sessionProgress(session) * 100)}%</span>
                  </div>
                  {session.review ? (
                    <RoundReview
                      key={session.round}
                      review={session.review}
                      game={session.setup.game}
                      onCommit={(choice) =>
                        void safe(async () => {
                          await update((s) => ({
                            ...s,
                            pending: commitDecision(s.pending!, choice),
                          }));
                        })
                      }
                      onRepeat={() =>
                        void safe(async () => {
                          await update((s) => ({ ...s, pending: repeatRound(s.pending!) }));
                        })
                      }
                      onExit={() => navigate('home')}
                    />
                  ) : (
                    getTask(session) && (
                      <Trainer
                        key={getTask(session)!.key}
                        task={getTask(session)!}
                        setup={session.setup}
                        onComplete={(metrics) => void safe(() => completeTrial(metrics))}
                        onExit={() => navigate('home')}
                      />
                    )
                  )}
                </section>
              )}
              {page === 'session' && (!session || session.phase === 'complete') && (
                <div className="panel empty-state">
                  <Check size={32} />
                  <h2>{session ? 'Your result is ready.' : 'Ready for a fresh start?'}</h2>
                  <button
                    className="button primary"
                    onClick={() => {
                      if (session) {
                        setViewedResult(session);
                        setPage('result');
                      } else setPage('setup');
                    }}
                  >
                    {session ? 'View results' : 'Set up calibration'}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {page === 'result' && viewedResult?.result && (
                <ResultView
                  session={viewedResult}
                  gameIds={data.games}
                  onSave={() => void safe(() => saveResult(viewedResult))}
                  onBack={() => navigate('home')}
                  saved={data.sessions.some((s) => s.id === viewedResult.id)}
                />
              )}
              {page === 'practice' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">NO PRESSURE. JUST PROGRESS.</span>
                      <h1>
                        Practice range
                        <span className="heading-dot" />
                      </h1>
                      <p>
                        Build consistency with your{' '}
                        {active ? 'active recommendation' : 'starting sensitivity'}. Practice scores
                        stay separate from calibration.
                      </p>
                    </div>
                    <span className="pill">
                      {displayAngular(angular, setup.game)} SENS · {resultDpi} DPI
                    </span>
                  </div>
                  {practice ? (
                    <section id="session-surface">
                      {practiceResult ? (
                        <div className="panel practice-summary">
                          <span className="success-icon">
                            <Check size={25} />
                          </span>
                          <span className="eyebrow">PRACTICE COMPLETE</span>
                          <h2>{drillNames[practice.drill]}</h2>
                          <div className="practice-numbers">
                            <div>
                              <strong>
                                {(practice.drill === 'snap'
                                  ? practiceResult.shots
                                    ? (practiceResult.hits / practiceResult.shots) * 100
                                    : 0
                                  : practiceResult.score * 100
                                ).toFixed(1)}
                                %
                              </strong>
                              <span>
                                {practice.drill === 'snap' ? 'shot accuracy' : 'time on target'}
                              </span>
                            </div>
                            <div>
                              <strong>
                                {practice.drill === 'snap'
                                  ? practiceResult.hits
                                  : practiceResult.meanAngularError.toFixed(2)}
                                {practice.drill !== 'snap' && '°'}
                              </strong>
                              <span>
                                {practice.drill === 'snap' ? 'targets hit' : 'mean angular error'}
                              </span>
                            </div>
                          </div>
                          {practice.drill === 'snap' && (
                            <p className="muted">
                              {practiceResult.shots - practiceResult.hits} misses · average
                              acquisition{' '}
                              {practiceResult.acquisitionTimes.length
                                ? (
                                    practiceResult.acquisitionTimes.reduce((a, b) => a + b, 0) /
                                    practiceResult.acquisitionTimes.length
                                  ).toFixed(2)
                                : '—'}
                              s
                            </p>
                          )}
                          <div className="row gap12">
                            <button
                              className="button secondary"
                              onClick={() => {
                                setPractice(null);
                                setPracticeResult(null);
                              }}
                            >
                              Choose another drill
                            </button>
                            <button
                              className="button primary"
                              onClick={() => {
                                setPractice({ ...practice, key: crypto.randomUUID() });
                                setPracticeResult(null);
                              }}
                            >
                              Run again <RotateCcw size={15} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Trainer
                          key={practice.key}
                          task={practice}
                          setup={{ ...setup, dpi: resultDpi }}
                          practice
                          onExit={() => {
                            setPractice(null);
                            setPracticeResult(null);
                          }}
                          onComplete={(metrics) => {
                            document.exitPointerLock();
                            setPracticeResult(metrics);
                          }}
                        />
                      )}
                    </section>
                  ) : (
                    <>
                      <div className="practice-grid">
                        {DRILLS.map((drill, i) => (
                          <div className="panel practice-card" key={drill}>
                            <span className="practice-icon">
                              {i === 0 ? <Activity /> : i === 1 ? <Crosshair /> : <Zap />}
                            </span>
                            <span className="eyebrow">SCENARIO 0{i + 1}</span>
                            <h2>{drillNames[drill]}</h2>
                            <p>
                              {i === 0
                                ? 'Track the moving player with your crosshair. Focus on smooth, continuous control.'
                                : i === 1
                                  ? 'Practice precision through a zoomed view. Your trainer ADS multiplier stays fixed.'
                                  : 'Acquire alternating targets and click to hit. Faster is good. Accurate is better.'}
                            </p>
                            <div className="practice-card-meta">
                              <Timer size={15} />
                              30 seconds <span>·</span>{' '}
                              {i === 2 ? 'Click to hit' : 'No firing required'}
                            </div>
                            <button
                              className="button secondary"
                              onClick={() => {
                                setPractice({
                                  key: crypto.randomUUID(),
                                  drill,
                                  candidate: 'result',
                                  angular,
                                  duration: 30,
                                  attempt: 0,
                                  seed: 777 + i,
                                });
                                setPracticeResult(null);
                              }}
                            >
                              Start practice <ArrowRight size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="inline-note">
                        <Info size={20} />
                        <p>
                          Use Calibration to discover a new setting. Practice uses your current
                          profile without changing it.
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
              {page === 'games' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">ONE FEEL. DIFFERENT WORLDS.</span>
                      <h1>
                        Your game library
                        <span className="heading-dot" />
                      </h1>
                      <p>
                        {active ? 'Your calibrated' : 'Your starting'} sensitivity, converted by
                        matching cm/360 at {resultDpi} DPI.
                      </p>
                    </div>
                    <span className="pill">
                      <Crosshair size={14} />
                      {cm360(angular, resultDpi).toFixed(2)} CM/360
                    </span>
                  </div>
                  <div className="game-library-controls">
                    {gameIds.map((id) => (
                      <button
                        key={id}
                        className={`button ${data.games.includes(id) ? 'secondary' : 'ghost'}`}
                        onClick={() =>
                          void safe(async () => {
                            await update((s) => ({
                              ...s,
                              games: s.games.includes(id)
                                ? s.games.filter((g) => g !== id)
                                : [...s.games, id],
                            }));
                          })
                        }
                      >
                        {data.games.includes(id) ? <Check size={15} /> : <Plus size={15} />}{' '}
                        {games[id].name}
                      </button>
                    ))}
                  </div>
                  <div className="game-grid library">
                    {data.games.map((id) => (
                      <GameCard key={id} id={id} angular={angular} dpi={resultDpi} />
                    ))}
                  </div>
                  {data.games.length === 0 && (
                    <div className="panel empty-state">
                      <Gamepad2 size={35} />
                      <h2>Make room for your favorites.</h2>
                      <p>Select a game above to add its converted settings.</p>
                    </div>
                  )}
                  <div className="inline-note">
                    <SlidersHorizontal size={20} />
                    <p>
                      These values match physical hipfire turn distance. Field of view, zoom,
                      game-specific ADS behavior, and slider rounding can change how a setting
                      feels. Keep the displayed mouse DPI the same.
                    </p>
                  </div>
                </>
              )}
              {page === 'history' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">YOUR PROGRESS, KEPT CLOSE</span>
                      <h1>
                        Session history
                        <span className="heading-dot" />
                      </h1>
                      <p>Revisit your comparisons and reactivate a previous recommendation.</p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() =>
                        void safe(async () => {
                          if (await storage.export(data)) setNotice('Backup exported.');
                        })
                      }
                    >
                      <Download size={15} />
                      Export backup
                    </button>
                  </div>
                  {data.sessions.length ? (
                    <div className="panel history-table">
                      <div className="history-row table-head">
                        <span>Session</span>
                        <span>Reference game</span>
                        <span>Recommendation</span>
                        <span>Turn distance</span>
                        <span>Status</span>
                        <span />
                      </div>
                      {data.sessions.map((item) => (
                        <div className="history-row" key={item.id}>
                          <span>
                            <strong>{date(item.createdAt)}</strong>
                            <small>{item.setup.dpi} DPI · 7 rounds</small>
                          </span>
                          <span>{games[item.setup.game].name}</span>
                          <strong>{displayAngular(item.angular, item.setup.game)}</strong>
                          <span>{cm360(item.angular, item.setup.dpi).toFixed(2)} cm</span>
                          <span
                            className={`history-status ${item.id === data.activeResultId ? 'active' : ''}`}
                          >
                            {item.id === data.activeResultId
                              ? 'Active'
                              : item.validated
                                ? 'Validated'
                                : 'Baseline retained'}
                          </span>
                          <div className="row gap8">
                            <button
                              className="text-button"
                              onClick={() => {
                                setViewedResult(item.session);
                                setPage('result');
                              }}
                            >
                              Review <ChevronRight size={14} />
                            </button>
                            {item.id !== data.activeResultId && (
                              <button
                                className="icon-button"
                                aria-label={`Activate session ${date(item.createdAt)}`}
                                onClick={() =>
                                  void safe(async () => {
                                    await update((s) => ({ ...s, activeResultId: item.id }));
                                    setNotice('Previous profile activated.');
                                  })
                                }
                              >
                                <Check size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel empty-state">
                      <History size={38} />
                      <h2>Your first session is a fresh page.</h2>
                      <p>Complete and save a calibration to see your results here.</p>
                      <button className="button primary" onClick={() => navigate('setup')}>
                        Start calibration <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {page === 'settings' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">YOUR DEVICE. YOUR DATA.</span>
                      <h1>
                        Settings
                        <span className="heading-dot" />
                      </h1>
                      <p>Manage your local profile, trainer preferences, and backups.</p>
                    </div>
                    <span className="pill">
                      <ShieldCheck size={14} />
                      OFFLINE FIRST
                    </span>
                  </div>
                  <div className="settings-grid">
                    <section className="panel settings-panel">
                      <span className="icon-box">
                        <Mouse size={21} />
                      </span>
                      <h2>Mouse & trainer setup</h2>
                      <p>
                        Reference game, mouse DPI, starting sensitivity, field of view, and the
                        trainer’s ADS multiplier.
                      </p>
                      <div className="settings-values">
                        <span>{setup.dpi} DPI</span>
                        <span>{setup.hipFov}° hipfire</span>
                        <span>{setup.adsFov}° ADS</span>
                        <span>{setup.adsMultiplier}× ADS</span>
                      </div>
                      <button className="button secondary" onClick={() => navigate('setup')}>
                        Edit setup <ArrowRight size={15} />
                      </button>
                      <small>
                        Changes require a fresh calibration. Saved recommendations keep their
                        original DPI.
                      </small>
                    </section>
                    <section className="panel settings-panel">
                      <span className="icon-box">
                        <ShieldCheck size={21} />
                      </span>
                      <h2>Keep your progress</h2>
                      <p>
                        Settings and sessions live on this device. Export a backup to move them to
                        another computer.
                      </p>
                      <div className="row gap12">
                        <button
                          className="button secondary"
                          onClick={() =>
                            void safe(async () => {
                              if (await storage.export(data)) setNotice('Backup exported.');
                            })
                          }
                        >
                          <Download size={15} />
                          Export backup
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => void safe(importBackup)}
                        >
                          <Upload size={15} />
                          Import backup
                        </button>
                      </div>
                      <small>
                        Versioned JSON · validated before restoring · no account required
                      </small>
                      <div className="profile-location">
                        <span>Loaded automatically at every startup</span>
                        <code>
                          {profileFile ??
                            (window.sensiviti
                              ? '%APPDATA%\\Sensiviti\\sensiviti.json'
                              : 'This browser’s local storage')}
                        </code>
                        {window.sensiviti && (
                          <button
                            className="text-button"
                            onClick={() => void safe(() => window.sensiviti!.openProfileFolder())}
                          >
                            Open saved-data folder <ArrowRight size={15} />
                          </button>
                        )}
                      </div>
                    </section>
                  </div>
                  <section className="panel about-panel">
                    <div className="row gap12">
                      <span className="brand-symbol">
                        <Crosshair size={24} />
                      </span>
                      <div>
                        <h3>
                          Sensiviti <span className="muted small">1.0.0</span>
                        </h3>
                        <p>Find your feel. Built for mouse & keyboard.</p>
                      </div>
                    </div>
                    <p>
                      Score-guided Perfect Sensitivity Approximation. Your result is a practical
                      recommendation based on these drills. Repeat rested sessions to check
                      consistency.
                    </p>
                    <button className="text-button" onClick={() => setHelp(true)}>
                      How the math works <ArrowRight size={15} />
                    </button>
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {confirmation && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label={confirmation.title}>
            <span className="dialog-icon">
              <RotateCcw />
            </span>
            <h2>{confirmation.title}</h2>
            <p>{confirmation.description}</p>
            <div className="row gap12">
              <button className="button secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </button>
              <button
                className="button primary"
                disabled={saving}
                onClick={() => void safe(confirmation.action)}
              >
                {saving ? 'Saving…' : 'Confirm'}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <div
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="How Sensiviti works"
          >
            <button
              className="modal-close icon-button"
              onClick={() => setHelp(false)}
              aria-label="Close help"
            >
              <X size={19} />
            </button>
            <span className="eyebrow">A LITTLE MATH. A LOT OF YOU.</span>
            <h2>How Sensiviti works</h2>
            <p>
              PSA compares lower and higher settings around a starting sensitivity. We test both
              with three equally weighted drills and use measured scores to choose.
            </p>
            <ol>
              <li>
                <strong>Compare both sides.</strong> Seven rounds use offsets of 50%, 50%, 40%, 30%,
                20%, 10%, and 5%.
              </li>
              <li>
                <strong>Move the center.</strong> The next center is halfway between the old center
                and the chosen setting. Close scores get one repeat.
              </li>
              <li>
                <strong>Check the result.</strong> The final setting must beat your original by at
                least 3% in the combined comparison. Otherwise, we recommend keeping your baseline.
              </li>
            </ol>
            <p>
              Tracking score is time on target. Snap score is hits per second × shot accuracy. Each
              scenario’s relative difference contributes one third of the comparison.
            </p>
            <div className="formula">cm/360 = 914.4 ÷ (DPI × degrees per count)</div>
            <p>
              Conversions preserve physical turn distance. CS2 and Apex use standard 0.022 angular
              scaling; Minecraft Java uses its nonlinear sensitivity curve. ADS is simulated with a
              fixed trainer multiplier.
            </p>
            <button className="button primary" onClick={() => setHelp(false)}>
              Got it <Check size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultView({
  session,
  gameIds: selectedGames,
  onSave,
  onBack,
  saved,
}: {
  session: CalibrationSession;
  gameIds: GameId[];
  onSave(): void;
  onBack(): void;
  saved: boolean;
}) {
  const result = session.result!;
  const [showRounds, setShowRounds] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CALIBRATION COMPLETE</span>
          <h1>
            A setting to settle into
            <span className="heading-dot" />
          </h1>
          <p>Seven comparisons, three skills, and one final check against where you started.</p>
        </div>
        <button className="button ghost" onClick={onBack}>
          <ArrowLeft size={15} />
          Overview
        </button>
      </div>
      <section className="panel result-hero">
        <div>
          <span className="pill">
            <Check size={14} />
            {result.validated ? 'FINAL CHECK PASSED' : 'BASELINE RETAINED'}
          </span>
          <h2>
            {result.validated ? 'Meet your next sensitivity.' : 'Your baseline held its ground.'}
          </h2>
          <p>
            {result.validated
              ? 'The calculated setting outperformed your original in the final comparison.'
              : 'The calculated setting did not lead by 3%. Your original is the recommendation for now.'}
          </p>
          <div className="result-setting">
            <strong>{displayAngular(result.angular, session.setup.game)}</strong>
            <span>
              {games[session.setup.game].name}
              <br />
              {session.setup.dpi} DPI · {cm360(result.angular, session.setup.dpi).toFixed(2)} cm/360
            </span>
          </div>
          <button className="button primary" onClick={onSave}>
            {saved ? 'Activate this result' : 'Save & activate recommendation'}
            <Check size={16} />
          </button>
        </div>
        <div className="result-comparison">
          <span className="eyebrow">THE FINAL COMPARISON</span>
          <div>
            <span>Original sensitivity</span>
            <strong>{displayAngular(session.original, session.setup.game)}</strong>
          </div>
          <div>
            <span>Calculated center</span>
            <strong>{displayAngular(result.proposed, session.setup.game)}</strong>
          </div>
          <div>
            <span>Calculated advantage</span>
            <strong className={result.validated ? 'cyan' : ''}>
              {result.comparison.advantage > 0 ? '+' : ''}
              {(result.comparison.advantage * 100).toFixed(1)}%
            </strong>
          </div>
          <p>
            Measured on equal drills. ADS used {session.setup.adsMultiplier}× at{' '}
            {session.setup.adsFov}° FOV.
          </p>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>The scores behind your result</h2>
          <p>Final validation · identical target sequences at both settings.</p>
        </div>
      </div>
      <div className="panel review-scores result-scores">
        <div className="table-row table-head">
          <span>Scenario</span>
          <span>Original</span>
          <span>Calculated</span>
        </div>
        {DRILLS.map((drill) => (
          <div className="table-row" key={drill}>
            <span>{drillNames[drill]}</span>
            <strong>
              {drill === 'snap'
                ? result.comparison.lowerScores[drill].toFixed(3)
                : `${(result.comparison.lowerScores[drill] * 100).toFixed(1)}%`}
            </strong>
            <strong>
              {drill === 'snap'
                ? result.comparison.higherScores[drill].toFixed(3)
                : `${(result.comparison.higherScores[drill] * 100).toFixed(1)}%`}
            </strong>
          </div>
        ))}
        <p>
          Tracking: time on target. Snap: hits/second × accuracy. Each scenario is weighted equally.
        </p>
      </div>
      <div className="section-heading">
        <div>
          <h2>Take your settings with you</h2>
          <p>Enter these values in your games at {session.setup.dpi} DPI.</p>
        </div>
      </div>
      <div className="game-grid">
        {(selectedGames.length ? selectedGames : gameIds).map((id) => (
          <GameCard key={id} id={id} angular={result.angular} dpi={session.setup.dpi} />
        ))}
      </div>
      <button className="button secondary round-toggle" onClick={() => setShowRounds((v) => !v)}>
        <History size={16} />
        {showRounds ? 'Hide' : 'Show'} all seven comparisons
      </button>
      {showRounds && (
        <div className="panel rounds-table">
          <div className="round-row table-head">
            <span>Round</span>
            <span>Lower</span>
            <span>Center</span>
            <span>Higher</span>
            <span>Decision</span>
          </div>
          {session.decisions.map((r) => (
            <div className="round-row" key={r.round}>
              <span>0{r.round + 1}</span>
              <span>{displayAngular(r.lower, session.setup.game)}</span>
              <span>{displayAngular(r.center, session.setup.game)}</span>
              <span>{displayAngular(r.higher, session.setup.game)}</span>
              <span>
                {r.selected === 'keep' ? 'Keep center' : r.selected}
                {r.overridden && ' · override'}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
