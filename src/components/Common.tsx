import { Check, Copy, Crosshair, Gamepad2, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { cm360, convert, games } from '../core/games';
import type { GameId } from '../core/types';

export function CopyButton({ value, label = 'Copy setting' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      className={`button copy-button ${copied ? 'copied' : ''}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setFailed(false);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setFailed(true);
        }
      }}
      aria-label={label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
      {copied ? 'Copied' : failed ? 'Copy failed — select text' : label}
    </button>
  );
}
export function GameCard({
  id,
  angular,
  dpi,
  compact = false,
}: {
  id: GameId;
  angular: number;
  dpi: number;
  compact?: boolean;
}) {
  const game = games[id],
    converted = convert(angular, dpi, id);
  return (
    <article className={`panel conversion-card ${compact ? 'compact' : ''}`}>
      <div className="row between">
        <span className={`game-mark ${id}`}>{game.shortName}</span>
        <span className="small-tag">{id === 'minecraft' ? 'JAVA' : 'HIPFIRE'}</span>
      </div>
      <h3>{game.name}</h3>
      <p className="muted small">{game.category}</p>
      <div className="conversion-value">
        {converted.display}
        <span>{id === 'minecraft' ? 'sensitivity' : 'in-game sens'}</span>
      </div>
      <div className="conversion-distance">
        <Crosshair size={14} />
        {converted.actualCm.toFixed(2)} cm/360 <span>{dpi} DPI</span>
      </div>
      {!converted.reachable && (
        <p className="conversion-warning">
          Outside this game’s range. Nearest setting differs by{' '}
          {converted.differenceCm > 0 ? '+' : ''}
          {converted.differenceCm.toFixed(2)} cm/360.
        </p>
      )}
      {id === 'minecraft' && converted.reachable && (
        <p className="rounding-note">Exact match uses options.txt; the slider is rounded.</p>
      )}
      {!compact && <p className="game-instruction">{game.instruction}</p>}
      <code className="setting-code">{converted.command}</code>
      <CopyButton value={converted.command} />
    </article>
  );
}
export function StatCard({
  label,
  value,
  unit,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  detail: string;
  icon: 'target' | 'trend' | 'game';
}) {
  const Icon = icon === 'target' ? Target : icon === 'trend' ? TrendingUp : Gamepad2;
  return (
    <div className="panel stat-card">
      <div className="row between">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>{detail}</p>
    </div>
  );
}
export function TurnDistance({ angular, dpi }: { angular: number; dpi: number }) {
  return (
    <>
      {cm360(angular, dpi).toFixed(2)}
      <small>cm/360</small>
    </>
  );
}
