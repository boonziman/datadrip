import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { PageHeader } from '../components/PageHeader';
import { ResultsScreen } from '../components/ResultsScreen';
import { Toast } from '../components/Toast';
import { ANSWERS, isValidWord, getAnswersByLength } from './data/wordless-words';

type TileStatus = 'correct' | 'present' | 'absent' | 'empty';
type GameStatus = 'playing' | 'won' | 'lost';

interface SavedState {
  guesses: string[];
  status: GameStatus;
  hardMode: boolean;
  blindMode: boolean;
  length: number;
}

const MAX_GUESSES = 6;

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
  const pool = getAnswersByLength(length);
  if (!pool.length) return ANSWERS[dayIndex % ANSWERS.length];
  // Use a per-length salt so e.g. day-100/length-4 differs from day-100/length-5
  const rand = mulberry32(dayIndex * 73856093 + length * 19349663);
  const idx = Math.floor(rand() * pool.length);
  return pool[idx];
}

function validateHardMode(guess: string, prev: string[], target: string): string | null {
  if (!prev.length) return null;
  const last = prev[prev.length - 1];
  const ls = getStatuses(last, target);
  for (let i = 0; i < ls.length; i++) {
    if (ls[i] === 'correct' && guess[i] !== last[i]) {
      return `Position ${i + 1} must be ${last[i].toUpperCase()}`;
    }
    if (ls[i] === 'present' && !guess.includes(last[i])) {
      return `Guess must contain ${last[i].toUpperCase()}`;
    }
  }
  return null;
}

const TILE_BG: Record<TileStatus, string> = {
  correct: '#55B725',
  present: '#DAC316',
  absent: '#3a3d40',
  empty: '#1e2021',
};

export const Wordless: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const [length, setLength] = useState<number>(() => {
    const saved = loadState<SavedState>('wordless', day.key);
    return saved?.length ?? 5;
  });
  const target = useMemo(() => pickTargetForLength(length, day.index), [length, day.index]);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [status, setStatus] = useState<GameStatus>('playing');
  const [hardMode, setHardMode] = useState(false);
  const [blindMode, setBlindMode] = useState(false);
  const [toast, setToast] = useState('');
  const [shake, setShake] = useState(false);
  const [revealRow, setRevealRow] = useState<number | null>(null);

  // Load saved state on mount or length change
  useEffect(() => {
    const saved = loadState<SavedState>('wordless', day.key);
    if (saved && saved.length === length) {
      setGuesses(saved.guesses);
      setStatus(saved.status);
      setHardMode(saved.hardMode);
      setBlindMode(saved.blindMode);
    } else {
      setGuesses([]); setCurrent(''); setStatus('playing');
    }
  }, [length, day.key]);

  // Persist state
  useEffect(() => {
    saveState<SavedState>('wordless', day.key, { guesses, status, hardMode, blindMode, length });
  }, [guesses, status, hardMode, blindMode, length, day.key]);

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const submit = useCallback(() => {
    if (status !== 'playing') return;
    const g = current.toLowerCase();
    if (g.length !== length) { setToast(`Need ${length} letters`); setShake(true); return; }
    if (!isValidWord(g)) { setToast('Not in word list'); setShake(true); return; }
    if (hardMode) {
      const err = validateHardMode(g, guesses, target);
      if (err) { setToast(err); setShake(true); return; }
    }
    const newGuesses = [...guesses, g];
    setGuesses(newGuesses);
    setCurrent('');
    setRevealRow(newGuesses.length - 1);
    setTimeout(() => setRevealRow(null), 700);
    if (g === target) {
      setStatus('won');
      const dist: Record<string, number> = {};
      dist[String(newGuesses.length)] = 1;
      recordResult('wordless', day.key, true, { guessDistribution: dist, totalGuesses: newGuesses.length });
    } else if (newGuesses.length >= MAX_GUESSES) {
      setStatus('lost');
      recordResult('wordless', day.key, false);
    }
  }, [status, current, length, hardMode, guesses, target, day.key]);

  // Shake reset
  useEffect(() => { if (shake) { const id = setTimeout(() => setShake(false), 420); return () => clearTimeout(id); } }, [shake]);

  // Keyboard handling
  const handleKey = useCallback((key: string) => {
    if (status !== 'playing') return;
    if (key === 'ENTER') return submit();
    if (key === 'BACK') { setCurrent(c => c.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && current.length < length) setCurrent(c => c + key.toLowerCase());
  }, [status, submit, current.length, length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') handleKey('ENTER');
      else if (e.key === 'Backspace') handleKey('BACK');
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleKey]);

  // Best status per letter for keyboard color
  const letterStatuses = useMemo<Record<string, TileStatus>>(() => {
    const map: Record<string, TileStatus> = {};
    if (blindMode && status === 'playing') return map;
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
  }, [guesses, target, blindMode, status]);

  const stats = loadStats('wordless');
  const isOver = status !== 'playing';

  // Build distribution display
  const dist = useMemo(() => {
    const d = stats.guessDistribution || {};
    return [1, 2, 3, 4, 5, 6].map(n => ({
      label: String(n),
      count: d[String(n)] || 0,
      highlight: status === 'won' && guesses.length === n,
    }));
  }, [stats.guessDistribution, status, guesses.length]);

  // Share text
  const shareText = useMemo(() => {
    const head = `Wordless · ${day.key} · ${status === 'won' ? guesses.length : 'X'}/${MAX_GUESSES} · ${length}L${hardMode ? ' · Hard' : ''}${blindMode ? ' · Blind' : ''}`;
    const grid = guesses.map(g => getStatuses(g, target).map(s => s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛').join('')).join('\n');
    return `${head}\n${grid}\nhttps://datadripco.com/puzzles/wordless/`;
  }, [day.key, status, guesses, length, hardMode, blindMode, target]);

  return (
    <div className="dd-games min-h-screen pb-20">
      {toast && <Toast message={toast} />}
      <PageHeader
        title="Wordless"
        subtitle={`${length} letters · ${MAX_GUESSES} guesses${hardMode ? ' · Hard' : ''}${blindMode ? ' · Blind' : ''}`}
        dayLabel={`Daily · ${formatDate(day.date)}`}
        isDev={day.isDev}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => length > 3 && !guesses.length && setLength(length - 1)}
              disabled={guesses.length > 0 || length <= 3}
              className="w-9 h-9 bg-panel3 rounded-lg text-xl disabled:opacity-30"
            >−</button>
            <div className="bg-panel2 rounded-lg w-12 h-9 flex items-center justify-center font-bold tabular-nums">{length}</div>
            <button
              onClick={() => length < 8 && !guesses.length && setLength(length + 1)}
              disabled={guesses.length > 0 || length >= 8}
              className="w-9 h-9 bg-panel3 rounded-lg text-xl disabled:opacity-30"
            >+</button>
          </div>
        }
      />

      {/* Mode toggles - only when game not started */}
      {guesses.length === 0 && status === 'playing' && (
        <div className="flex justify-center gap-2 mb-4 px-4 animate-fade-up">
          <label className="flex items-center gap-2 bg-panel rounded-lg px-3 py-2 text-sm cursor-pointer">
            <input type="checkbox" checked={hardMode} onChange={e => setHardMode(e.target.checked)} className="accent-accent" />
            Hard mode
          </label>
          <label className="flex items-center gap-2 bg-panel rounded-lg px-3 py-2 text-sm cursor-pointer">
            <input type="checkbox" checked={blindMode} onChange={e => setBlindMode(e.target.checked)} className="accent-accent" />
            Blind mode
          </label>
        </div>
      )}

      {/* Board */}
      <div className={`flex flex-col items-center gap-1.5 mb-6 ${shake ? 'animate-shake' : ''}`}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => {
          const isCurrent = row === guesses.length && status === 'playing';
          const guess = guesses[row] || (isCurrent ? current : '');
          const showColors = row < guesses.length && (!blindMode || status !== 'playing');
          const statuses = row < guesses.length ? getStatuses(guesses[row], target) : null;
          return (
            <div key={row} className="flex gap-1.5">
              {Array.from({ length }).map((_, col) => {
                const letter = guess[col]?.toUpperCase() || '';
                const s = statuses ? statuses[col] : 'empty';
                const bg = showColors ? TILE_BG[s] : letter ? '#3a3d40' : TILE_BG.empty;
                const border = letter ? '#55595c' : '#303436';
                const flip = revealRow === row;
                return (
                  <div
                    key={col}
                    className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center text-2xl font-bold rounded border-2 ${flip ? 'animate-flip' : ''} ${letter && !showColors ? 'animate-pop-in' : ''}`}
                    style={{ backgroundColor: bg, borderColor: border, animationDelay: flip ? `${col * 100}ms` : undefined }}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Keyboard */}
      <Keyboard onKey={handleKey} statuses={letterStatuses} />

      {/* Results */}
      {isOver && (
        <div className="mt-8">
          <ResultsScreen
            won={status === 'won'}
            title={status === 'won' ? '🎉 Got it!' : 'Better luck tomorrow'}
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
      )}
    </div>
  );
};

// ─── Keyboard ────────────────────────────────────────
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const KEY_BG: Record<TileStatus, string> = {
  correct: '#55B725', present: '#DAC316', absent: '#3a3d40', empty: '#55595c',
};

const Keyboard: React.FC<{ onKey: (k: string) => void; statuses: Record<string, TileStatus> }> = ({ onKey, statuses }) => (
  <div className="px-2 max-w-xl mx-auto select-none">
    {ROWS.map((row, ri) => (
      <div key={ri} className="flex justify-center gap-1 mb-1.5">
        {ri === 2 && (
          <button
            onClick={() => onKey('ENTER')}
            className="px-3 h-12 sm:h-14 rounded font-bold bg-panel3 text-white text-xs active:scale-95"
          >ENTER</button>
        )}
        {row.split('').map(k => {
          const s = statuses[k.toLowerCase()];
          const bg = s ? KEY_BG[s] : '#55595c';
          return (
            <button
              key={k}
              onClick={() => onKey(k)}
              className="w-8 sm:w-10 h-12 sm:h-14 rounded font-bold text-white text-sm sm:text-base active:scale-95 transition-transform"
              style={{ backgroundColor: bg }}
            >{k}</button>
          );
        })}
        {ri === 2 && (
          <button
            onClick={() => onKey('BACK')}
            className="px-3 h-12 sm:h-14 rounded font-bold bg-panel3 text-white text-base active:scale-95"
          >⌫</button>
        )}
      </div>
    ))}
  </div>
);
