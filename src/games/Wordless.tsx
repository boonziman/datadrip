import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { ResultsScreen } from '../components/ResultsScreen';
import { Toast } from '../components/Toast';
import { HelpModal, IconBtn } from '../components/HelpModal';
import { isValidWord } from './data/wordless-words';
import { poolFor } from './data/wordguess-pool';
import { sndType, sndDelete, sndReveal, sndWin, sndLose, sndError, sndBloop } from '../lib/sound';

type TileStatus = 'correct' | 'present' | 'absent' | 'empty';
type GameStatus = 'playing' | 'won' | 'lost';

interface SavedState {
  guesses: string[];
  status: GameStatus;
  length: number;
}

const MAX_GUESSES = 6;
const REVEAL_STAGGER = 280;   // ms between letter flips on submit
const REVEAL_DURATION = 600;  // matches keyframe

function getStatuses(guess: string, target: string): TileStatus[] {
  const out: TileStatus[] = Array(guess.length).fill('absent');
  const remaining = target.split('');
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) { out[i] = 'correct'; remaining[i] = '#'; }
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] === 'correct') continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) { out[i] = 'present'; remaining[idx] = '#'; }
  }
  return out;
}

function pickTargetForLength(length: number, dayIndex: number): string {
  const pool = poolFor(length);
  if (!pool.length) return 'about';
  const rand = mulberry32(dayIndex * 73856093 ^ length * 19349663);
  return pool[Math.floor(rand() * pool.length)];
}

const TILE_BG: Record<TileStatus, string> = {
  correct: '#55B725',
  present: '#DAC316',
  absent:  '#3a3d40',
  empty:   'transparent',
};
const TILE_BORDER: Record<TileStatus, string> = {
  correct: '#55B725',
  present: '#DAC316',
  absent:  '#3a3d40',
  empty:   '#3a3d40',
};

export const Wordless: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const saved = useMemo(() => loadState<SavedState>('wordless', day.key), [day.key]);

  const [length, setLength] = useState<number>(saved?.length ?? 5);
  const target = useMemo(() => pickTargetForLength(length, day.index), [length, day.index]);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [status, setStatus] = useState<GameStatus>('playing');
  const [toast, setToast] = useState('');
  const [shake, setShake] = useState(false);
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Reload saved when length changes (per-length board)
  useEffect(() => {
    const s = loadState<SavedState>('wordless', day.key);
    if (s && s.length === length) {
      setGuesses(s.guesses); setStatus(s.status);
    } else {
      setGuesses([]); setStatus('playing');
    }
    setCurrent('');
    setShowResults(false);
  }, [length, day.key]);

  useEffect(() => {
    saveState<SavedState>('wordless', day.key, { guesses, status, length });
  }, [guesses, status, length, day.key]);

  // Toast clear
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 1700);
    return () => clearTimeout(id);
  }, [toast]);

  // Open results when over (after reveal)
  useEffect(() => {
    if (status === 'playing') return;
    const id = setTimeout(() => setShowResults(true), length * REVEAL_STAGGER + REVEAL_DURATION + 300);
    return () => clearTimeout(id);
  }, [status, length]);

  const submit = useCallback(() => {
    if (status !== 'playing' || revealRow !== null) return;
    const g = current.toLowerCase();
    if (g.length !== length) {
      setToast(`Need ${length} letters`); setShake(true); sndError(); return;
    }
    if (!isValidWord(g)) {
      setToast('Not in word list'); setShake(true); sndError(); return;
    }
    const newGuesses = [...guesses, g];
    setGuesses(newGuesses);
    setCurrent('');
    const rowIdx = newGuesses.length - 1;
    setRevealRow(rowIdx);
    // Sound per letter as it flips
    for (let i = 0; i < length; i++) setTimeout(() => sndReveal(), i * REVEAL_STAGGER + 200);

    const totalReveal = length * REVEAL_STAGGER + REVEAL_DURATION;
    setTimeout(() => {
      setRevealRow(null);
      if (g === target) {
        setStatus('won');
        sndWin();
        const dist: Record<string, number> = { [String(newGuesses.length)]: 1 };
        recordResult('wordless', day.key, true, { guessDistribution: dist, totalGuesses: newGuesses.length });
      } else if (newGuesses.length >= MAX_GUESSES) {
        setStatus('lost');
        sndLose();
        recordResult('wordless', day.key, false);
      }
    }, totalReveal);
  }, [status, current, length, guesses, target, day.key, revealRow]);

  useEffect(() => { if (shake) { const id = setTimeout(() => setShake(false), 420); return () => clearTimeout(id); } }, [shake]);

  const handleKey = useCallback((key: string) => {
    if (status !== 'playing' || revealRow !== null) return;
    if (key === 'ENTER') return submit();
    if (key === 'BACK') {
      if (current.length) { sndDelete(); setCurrent(c => c.slice(0, -1)); }
      return;
    }
    if (/^[A-Z]$/.test(key) && current.length < length) {
      sndType();
      setCurrent(c => c + key.toLowerCase());
    }
  }, [status, submit, current.length, length, revealRow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); handleKey('ENTER'); }
      else if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); }
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleKey]);

  const letterStatuses = useMemo<Record<string, TileStatus>>(() => {
    const map: Record<string, TileStatus> = {};
    for (const g of guesses) {
      const s = getStatuses(g, target);
      for (let i = 0; i < g.length; i++) {
        const cur = map[g[i]];
        if (s[i] === 'correct') map[g[i]] = 'correct';
        else if (s[i] === 'present' && cur !== 'correct') map[g[i]] = 'present';
        else if (!cur) map[g[i]] = 'absent';
      }
    }
    return map;
  }, [guesses, target]);

  const stats = loadStats('wordless');

  const dist = useMemo(() => {
    const d = stats.guessDistribution || {};
    return [1, 2, 3, 4, 5, 6].map(n => ({
      label: String(n),
      count: d[String(n)] || 0,
      highlight: status === 'won' && guesses.length === n,
    }));
  }, [stats.guessDistribution, status, guesses.length]);

  const shareText = useMemo(() => {
    const head = `Wordguess · ${day.key} · ${status === 'won' ? guesses.length : 'X'}/${MAX_GUESSES} · ${length}L`;
    const grid = guesses.map(g => getStatuses(g, target).map(s => s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛').join('')).join('\n');
    return `${head}\n${grid}\nhttps://datadripco.com/puzzles/wordless/`;
  }, [day.key, status, guesses, length, target]);

  const canChangeLength = guesses.length === 0 && status === 'playing';

  return (
    <div className="dd-games min-h-screen flex flex-col">
      {toast && <Toast message={toast} />}

      {/* Top bar: help on left, length controls on right */}
      <div className="w-full max-w-3xl mx-auto px-4 pt-4 flex items-start justify-between">
        <IconBtn onClick={() => setShowHelp(true)} ariaLabel="How to play">?</IconBtn>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tighter text-white text-center flex-1">Wordguess</h1>
        <div className="w-10" />
      </div>
      <p className="text-center text-xs text-gray-500 mt-1 mb-2">Daily · {formatDate(day.date)}</p>

      {/* Length controls */}
      <div className="flex justify-center items-center gap-3 mb-3">
        <button
          onClick={() => canChangeLength && length > 3 && setLength(length - 1)}
          disabled={!canChangeLength || length <= 3}
          className="w-9 h-9 bg-panel2 rounded-lg text-xl text-white disabled:opacity-30 active:scale-95"
        >−</button>
        <div className="bg-panel rounded-lg px-3 h-9 flex items-center justify-center font-bold tabular-nums text-white text-sm gap-1">
          <span>{length}</span><span className="text-[10px] text-gray-400 uppercase">letters</span>
        </div>
        <button
          onClick={() => canChangeLength && length < 8 && setLength(length + 1)}
          disabled={!canChangeLength || length >= 8}
          className="w-9 h-9 bg-panel2 rounded-lg text-xl text-white disabled:opacity-30 active:scale-95"
        >+</button>
      </div>

      {/* Board */}
      <div className={`flex flex-col items-center gap-1.5 mb-4 flex-shrink-0 ${shake ? 'animate-shake' : ''}`}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => {
          const isCurrent = row === guesses.length && status === 'playing' && revealRow === null;
          const submittedGuess = row < guesses.length;
          const guess = submittedGuess ? guesses[row] : (isCurrent ? current : '');
          const statuses = submittedGuess ? getStatuses(guesses[row], target) : null;
          return (
            <div key={row} className="flex gap-1.5">
              {Array.from({ length }).map((_, col) => {
                const letter = guess[col]?.toUpperCase() || '';
                const s: TileStatus = statuses ? statuses[col] : 'empty';
                const flipping = revealRow === row;
                const showColor = submittedGuess && (!flipping || (Date.now()));
                const bg = submittedGuess ? TILE_BG[s] : 'transparent';
                const border = submittedGuess ? TILE_BORDER[s] : (letter ? '#55595c' : '#3a3d40');
                return (
                  <div
                    key={col}
                    className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center text-2xl font-extrabold rounded border-2 text-white ${flipping ? 'animate-flip' : ''} ${letter && !submittedGuess ? 'animate-tile-pop' : ''}`}
                    style={{
                      backgroundColor: bg,
                      borderColor: border,
                      animationDelay: flipping ? `${col * REVEAL_STAGGER}ms` : undefined,
                      animationFillMode: flipping ? 'forwards' : undefined,
                    }}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Inline mini-results pill while game continues */}
      {status !== 'playing' && !showResults && (
        <p className="text-center text-sm text-gray-400 mb-2">Revealing…</p>
      )}

      {/* Reopen results button */}
      {(status !== 'playing' && showResults) && (
        <div className="text-center mb-3">
          <button
            onClick={() => { sndBloop(); setShowResults(true); }}
            className="text-xs text-accent hover:underline"
          >View results</button>
        </div>
      )}

      {/* Keyboard pinned to bottom */}
      <div className="mt-auto pb-4">
        <Keyboard onKey={handleKey} statuses={letterStatuses} />
      </div>

      {/* Help modal */}
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} title="How to Play">
        <p className="text-center text-gray-300 mb-4">Type a word. Tiles reveal how close you are.</p>
        <div className="flex justify-center gap-1.5 mb-5">
          {['W','E','A','R','Y'].map((c, i) => {
            const cls = i === 0 ? 'bg-accent border-accent' : i === 2 ? 'bg-warn border-warn text-black' : 'bg-panel2 border-panel3';
            return <div key={i} className={`w-10 h-10 rounded border-2 flex items-center justify-center font-extrabold text-white ${cls}`}>{c}</div>;
          })}
        </div>
        <ul className="space-y-3">
          <li className="flex items-center gap-3"><span className="w-7 h-7 rounded bg-accent flex items-center justify-center text-white font-bold text-xs">W</span><span>Correct letter, correct spot</span></li>
          <li className="flex items-center gap-3"><span className="w-7 h-7 rounded bg-warn flex items-center justify-center text-black font-bold text-xs">A</span><span>Correct letter, wrong spot</span></li>
          <li className="flex items-center gap-3"><span className="w-7 h-7 rounded bg-panel2 flex items-center justify-center text-white font-bold text-xs">R</span><span>Not in the word</span></li>
        </ul>
        <p className="text-center text-xs text-gray-500 mt-5">New word every day at midnight Pacific time.</p>
      </HelpModal>

      {/* Results overlay */}
      {showResults && status !== 'playing' && (
        <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowResults(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-md">
            <ResultsScreen
              won={status === 'won'}
              title={status === 'won' ? 'Got it!' : 'Game Over'}
              answer={target.toUpperCase()}
              answerLabel="Today's Word"
              stats={[
                { value: stats.played, label: 'Played' },
                { value: stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '0%', label: 'Win %' },
                { value: stats.streak, label: 'Streak' },
                { value: stats.bestStreak, label: 'Best' },
              ]}
              distribution={dist}
              shareText={shareText}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Keyboard ────────────────────────────────────────
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const KEY_BG: Record<TileStatus, string> = {
  correct: '#55B725', present: '#DAC316', absent: '#1f2123', empty: '#55595c',
};

const Keyboard: React.FC<{ onKey: (k: string) => void; statuses: Record<string, TileStatus> }> = ({ onKey, statuses }) => (
  <div className="px-1 max-w-xl mx-auto select-none">
    {ROWS.map((row, ri) => (
      <div key={ri} className="flex justify-center gap-1 mb-1.5">
        {ri === 2 && (
          <button
            onClick={() => onKey('ENTER')}
            className="px-3 h-12 sm:h-14 rounded font-bold bg-panel2 hover:bg-panel3 text-white text-xs active:scale-95 transition-transform"
          >ENTER</button>
        )}
        {row.split('').map(k => {
          const s = statuses[k.toLowerCase()];
          const bg = s ? KEY_BG[s] : '#55595c';
          const txt = s === 'absent' ? '#7a7d80' : '#fff';
          return (
            <button
              key={k}
              onClick={() => onKey(k)}
              className="w-8 sm:w-10 h-12 sm:h-14 rounded font-bold text-sm sm:text-base active:scale-95 transition-all"
              style={{ backgroundColor: bg, color: txt }}
            >{k}</button>
          );
        })}
        {ri === 2 && (
          <button
            onClick={() => onKey('BACK')}
            className="px-3 h-12 sm:h-14 rounded font-bold bg-panel2 hover:bg-panel3 text-white text-base active:scale-95 transition-transform"
          >⌫</button>
        )}
      </div>
    ))}
  </div>
);
