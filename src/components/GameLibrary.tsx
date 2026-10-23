import { useState, type FormEvent } from 'react';
import { Check, Gamepad2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { angularFromCm, cm360, customGameProfile, gameIds, games } from '../core/games';
import { customGameSchema } from '../core/schema';
import type { AppState, CustomGame } from '../core/types';
import { GameCard } from './Common';

export function GameLibrary({
  data,
  angular,
  dpi,
  onChange,
}: {
  data: AppState;
  angular: number;
  dpi: number;
  onChange(change: (state: AppState) => AppState): Promise<void>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scale, setScale] = useState<CustomGame['scale']>('cs2');
  const [sensitivity, setSensitivity] = useState('1');
  const [measurementDpi, setMeasurementDpi] = useState(String(dpi));
  const [distance, setDistance] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function openForm(game?: CustomGame) {
    setEditing(game?.id ?? null);
    setName(game?.name ?? '');
    setScale(game?.scale ?? 'cs2');
    setSensitivity('1');
    setMeasurementDpi(String(dpi));
    setDistance(game?.yaw ? String(cm360(game.yaw, dpi)) : '');
    setError('');
    setFormOpen(true);
  }
  async function change(update: (state: AppState) => AppState) {
    setError('');
    setBusy(true);
    try {
      await onChange(update);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const measured = [Number(sensitivity), Number(measurementDpi), Number(distance)];
    if (scale === 'linear' && measured.some((value) => !Number.isFinite(value) || value <= 0)) {
      setError('Enter a positive sensitivity, DPI, and measured cm/360.');
      return;
    }
    const parsed = customGameSchema.safeParse({
      id: editing ?? crypto.randomUUID(),
      name,
      scale,
      ...(scale === 'linear' ? { yaw: angularFromCm(measured[2], measured[1]) / measured[0] } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const saved = await change((state) => {
      if (!editing && state.customGames.length >= 100)
        throw new Error('Your library can hold up to 100 custom games.');
      return {
        ...state,
        customGames: editing
          ? state.customGames.map((g) => (g.id === editing ? parsed.data : g))
          : [...state.customGames, parsed.data],
      };
    });
    if (saved) setFormOpen(false);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Choose your games</h2>
          <p>Add as many presets as you like, or create your own.</p>
        </div>
        <button className="button secondary" onClick={() => openForm()} disabled={busy}>
          <Plus size={15} /> Add custom game
        </button>
      </div>
      <div className="game-library-controls">
        {gameIds.map((id) => (
          <button
            key={id}
            aria-pressed={data.games.includes(id)}
            disabled={busy}
            className={`button ${data.games.includes(id) ? 'secondary' : 'ghost'}`}
            onClick={() =>
              void change((state) => ({
                ...state,
                games: state.games.includes(id)
                  ? state.games.filter((g) => g !== id)
                  : [...state.games, id],
              }))
            }
          >
            {data.games.includes(id) ? <Check size={15} /> : <Plus size={15} />}
            {games[id].name}
          </button>
        ))}
      </div>
      {formOpen && (
        <form className="panel custom-game-form" onSubmit={(event) => void save(event)}>
          <div className="section-heading">
            <h2>{editing ? 'Edit custom game' : 'New custom game'}</h2>
            <button
              type="button"
              className="button ghost"
              aria-label="Close custom game form"
              disabled={busy}
              onClick={() => setFormOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="fields-grid">
            <label className="field-label" htmlFor="custom-name">
              Game name
              <input
                id="custom-name"
                value={name}
                maxLength={80}
                required
                placeholder="e.g. My favorite shooter"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="custom-scale-field">
              <label className="field-label" htmlFor="custom-scale">
                Sensitivity scale
              </label>
              <select
                id="custom-scale"
                value={scale}
                onChange={(e) => setScale(e.target.value as CustomGame['scale'])}
              >
                {gameIds.map((id) => (
                  <option key={id} value={id}>
                    {games[id].name}
                  </option>
                ))}
                <option value="linear">Custom — measured cm/360 (linear scale)</option>
              </select>
            </div>
          </div>
          {scale === 'linear' ? (
            <>
              <p className="muted small">
                In your game, measure how far your mouse travels for one full hipfire turn. This
                method requires a linear sensitivity scale. Keep acceleration off and use the same
                FOV.
              </p>
              <div className="measurement-fields">
                <label className="field-label" htmlFor="custom-sensitivity">
                  Measured in-game sensitivity
                  <input
                    id="custom-sensitivity"
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                    value={sensitivity}
                    onChange={(e) => setSensitivity(e.target.value)}
                  />
                </label>
                <label className="field-label" htmlFor="custom-dpi">
                  Measurement DPI
                  <input
                    id="custom-dpi"
                    type="number"
                    min="100"
                    max="64000"
                    step="1"
                    required
                    value={measurementDpi}
                    onChange={(e) => setMeasurementDpi(e.target.value)}
                  />
                </label>
                <label className="field-label" htmlFor="custom-distance">
                  Measured cm/360
                  <input
                    id="custom-distance"
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                  />
                </label>
              </div>
            </>
          ) : (
            <p className="muted small">
              Choose a preset only when your game uses that same sensitivity scale and input
              settings.
            </p>
          )}
          <div className="row custom-game-actions">
            <button className="button primary" type="submit" disabled={busy}>
              {editing ? 'Save custom game' : 'Add to library'}
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={busy}
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="conversion-warning">
          {error}
        </p>
      )}
      <div className="game-grid library">
        {data.games.map((id) => (
          <GameCard key={id} id={id} angular={angular} dpi={dpi} />
        ))}
        {data.customGames.map((game) => (
          <GameCard
            key={game.id}
            profile={customGameProfile(game)}
            angular={angular}
            dpi={dpi}
            actions={
              <>
                <button
                  className="text-button"
                  aria-label={`Edit ${game.name}`}
                  disabled={busy}
                  onClick={() => openForm(game)}
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  className="text-button"
                  aria-label={`Remove ${game.name}`}
                  disabled={busy}
                  onClick={() =>
                    void change((state) => ({
                      ...state,
                      customGames: state.customGames.filter((g) => g.id !== game.id),
                    })).then((removed) => {
                      if (removed && editing === game.id) setFormOpen(false);
                    })
                  }
                >
                  <Trash2 size={14} /> Remove
                </button>
              </>
            }
          />
        ))}
      </div>
      {!data.games.length && !data.customGames.length && (
        <div className="panel empty-state">
          <Gamepad2 size={35} />
          <h2>Make room for your favorites.</h2>
          <p>Select a preset above or add a custom game to see its converted settings.</p>
        </div>
      )}
    </>
  );
}
