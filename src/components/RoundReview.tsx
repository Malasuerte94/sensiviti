import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Equal,
  Pause,
  Play,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { DRILLS, drillNames } from '../core/calibration';
import { displayAngular } from '../core/games';
import type { Choice, GameId, RoundDecision } from '../core/types';
export function RoundReview({
  review,
  game,
  angularScale = 1,
  onCommit,
  onRepeat,
  onExit,
}: {
  review: RoundDecision;
  game: GameId;
  angularScale?: number;
  onCommit(choice: Choice): void;
  onRepeat(): void;
  onExit(): void;
}) {
  const [remaining, setRemaining] = useState(5);
  const [paused, setPaused] = useState(!document.pointerLockElement);
  const [choice, setChoice] = useState<Choice>(review.selected);
  const callback = useRef(onCommit);
  callback.current = onCommit;
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => {
      if (remaining <= 1) callback.current(choice);
      else setRemaining((s) => s - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [remaining, paused, choice]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Digit1') {
        setChoice('lower');
        setPaused(true);
      }
      if (e.code === 'Digit2') {
        setChoice('higher');
        setPaused(true);
      }
      if (e.code === 'Digit3') {
        setChoice('keep');
        setPaused(true);
      }
      if (e.code === 'KeyP' || e.code === 'Escape') setPaused(true);
      if (e.code === 'Space') {
        e.preventDefault();
        callback.current(choice);
      }
      if (e.code === 'KeyR') onRepeat();
    };
    const lost = () => {
      if (!document.pointerLockElement) setPaused(true);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerlockchange', lost);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerlockchange', lost);
    };
  }, [choice, onRepeat]);
  return (
    <div className="review-wrap">
      <div className="review-heading">
        <span className="success-icon">
          <Check size={25} />
        </span>
        <span className="eyebrow">ROUND {review.round + 1} COMPLETE</span>
        <h2>
          {review.tied
            ? 'A close call. Let’s narrow it.'
            : `${review.choice === 'lower' ? 'Lower' : 'Higher'} is looking better.`}
        </h2>
        <p>
          {review.tied
            ? 'After a repeat, neither side led by 3%. We’ll keep the center and tighten the next comparison.'
            : `The ${review.choice} candidate led by ${(Math.abs(review.advantage) * 100).toFixed(1)}% on the equally weighted drill comparison.`}
        </p>
      </div>
      <div className="choice-grid">
        {(['lower', 'keep', 'higher'] as const).map((option, i) => {
          const Icon = option === 'lower' ? TrendingDown : option === 'higher' ? TrendingUp : Equal;
          return (
            <button
              className={`panel choice-card ${choice === option ? 'selected' : ''}`}
              key={option}
              onClick={() => {
                setChoice(option);
                setPaused(true);
              }}
            >
              <Icon size={22} />
              <span>{option === 'keep' ? 'Keep center' : `${option} sensitivity`}</span>
              <strong>
                {displayAngular(
                  (option === 'keep' ? review.center : review[option]) * angularScale,
                  game,
                )}
              </strong>
              <small>
                <kbd>{i + 1}</kbd> {review.choice === option ? 'APP CHOICE' : 'OVERRIDE'}
              </small>
            </button>
          );
        })}
      </div>
      <div className="panel review-scores">
        <div className="table-row table-head">
          <span>Scenario</span>
          <span>Lower</span>
          <span>Higher</span>
        </div>
        {DRILLS.map((drill) => (
          <div className="table-row" key={drill}>
            <span>{drillNames[drill]}</span>
            <strong>
              {drill === 'snap'
                ? review.lowerScores[drill].toFixed(3)
                : `${(review.lowerScores[drill] * 100).toFixed(1)}%`}
            </strong>
            <strong>
              {drill === 'snap'
                ? review.higherScores[drill].toFixed(3)
                : `${(review.higherScores[drill] * 100).toFixed(1)}%`}
            </strong>
          </div>
        ))}
        <p>
          Snap score = hits/second × accuracy. <kbd>ESC</kbd> releases the mouse for these controls.
        </p>
      </div>
      <div className="review-actions">
        <button className="button ghost" onClick={onExit}>
          Save & leave
        </button>
        <button className="button secondary" onClick={onRepeat}>
          <RotateCcw size={15} /> Repeat <kbd>R</kbd>
        </button>
        <button className="button secondary" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={15} /> : <Pause size={15} />}{' '}
          {paused ? 'Resume timer' : 'Pause timer'}
        </button>
        <button className="button primary" onClick={() => onCommit(choice)}>
          {paused ? 'Continue' : `Continuing in ${remaining}s`}
          <ArrowRight size={15} />
        </button>
      </div>
      <p className="review-help">
        <kbd>1</kbd> Lower <kbd>2</kbd> Higher <kbd>3</kbd> Keep <kbd>SPACE</kbd> Continue{' '}
        <kbd>P</kbd> Pause
      </p>
    </div>
  );
}
