import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { ResultsScreen } from '../components/ResultsScreen';
import { DailyRankCard } from '../components/DailyRankCard';
import { computeDailyRank } from '../lib/dailyRank';
import { Toast } from '../components/Toast';
import { HelpModal, IconBtn } from '../components/HelpModal';
import { isValidWord } from './data/wordless-words';
import { poolFor } from './data/wordguess-pool';
import { sndType, sndDelete, sndReveal, sndWin, sndLose, sndError, sndBloop, sndPop } from '../lib/sound';
import { IconStats } from '../components/Icons';

type TileStatus = 'correct' | 'present' | 'absent' | 'empty';
type GameStatus = 'playing' | 'won' | 'lost';

interface LengthState {
  guesses: string[];
  status: GameStatus;
}
interface SavedStateAll {
  lengths: Record<number, LengthState>;
  selected: number;
}

const MAX_GUESSES = 6;
const REVEAL_STAGGER = 320; // ms between letter flips
const REVEAL_HALF = 160;    // ms — half flip; color appears here
const REVEAL_DURATION = 480; // ms — full flip duration

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
  const rand = mulberry32((dayIndex * 73856093) ^ (length * 19349663));
  return pool[Math.floor(rand() * pool.length)];
}

const TILE_BG: Record<TileStatus, string> = {
  correct: '#55B725', present: '#DAC316', absent: '#3a3d40', empty: 'transparent',
};

export const Wordless: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const allSaved = loadState<SavedStateAll>('wordless', day.key);

  const [length, setLengthState] = useState<number>(allSaved?.selected ?? 3);
  const [lengthStates, setLengthStates] = useState<Record<number, LengthState>>(allSaved?.lengths ?? {});
  const target = useMemo(() => pickTargetForLength(length, day.index), [length, day.index]);

  const cur = lengthStates[length] ?? { guesses: [], status: 'playing' as GameStatus };
  const guesses = cur.guesses;
  const status = cur.status;

  const [current, setCurrent] = useState('');
  const [toast, setToast] = useState('');
  const [shake, setShake] = useState(false);
  const [revealRow, setRevealRow] = useState<number | null>(null);
  // letters revealed so far in the row (controls when color shows)
  const [revealedCount, setRevealedCount] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Persist
  useEffect(() => {
    saveState<SavedStateAll>('wordless', day.key, { lengths: lengthStates, selected: length });
  }, [lengthStates, length, day.key]);

  // Reset typing buffer + closed results on length switch
  useEffect(() => {
    setCurrent('');
    setRevealRow(null);
    setRevealedCount(0);
    setShowResults(false);
  }, [length]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 1700);
    return () => clearTimeout(id);
  }, [toast]);

  const updateLength = (s: LengthState) => setLengthStates(ls => ({ ...ls, [length]: s }));

  const submit = useCallback(() => {
    if (status !== 'playing' || revealRow !== null) return;
    const g = current.toLowerCase();
    if (g.length !== length) { setToast(`Need ${length} letters`); setShake(true); sndError(); return; }
    if (!isValidWord(g))     { setToast('Not in word list');    setShake(true); sndError(); return; }

    const newGuesses = [...guesses, g];
    updateLength({ guesses: newGuesses, status: 'playing' });
    setCurrent('');

    const rowIdx = newGuesses.length - 1;
    setRevealRow(rowIdx);
    setRevealedCount(0);

    // Stagger: at each step, advance revealedCount AND play sound
    for (let i = 0; i < length; i++) {
      setTimeout(() => {
        sndReveal();
        setRevealedCount(i + 1);
      }, i * REVEAL_STAGGER + REVEAL_HALF);
    }
    const totalReveal = (length - 1) * REVEAL_STAGGER + REVEAL_DURATION + 80;
    setTimeout(() => {
      setRevealRow(null);
      setRevealedCount(0);
      const won = g === target;
      const lost = !won && newGuesses.length >= MAX_GUESSES;
      if (won)  { updateLength({ guesses: newGuesses, status: 'won' });  sndWin(); recordResult('wordless', day.key, true,  { guessDistribution: { [String(newGuesses.length)]: 1 }, totalGuesses: newGuesses.length }); }
      if (lost) { updateLength({ guesses: newGuesses, status: 'lost' }); sndLose(); recordResult('wordless', day.key, false); }
      if (won || lost) setTimeout(() => setShowResults(true), 350);
    }, totalReveal);
  }, [status, current, length, guesses, target, day.key, revealRow]);

  useEffect(() => { if (shake) { const id = setTimeout(() => setShake(false), 420); return () => clearTimeout(id); } }, [shake]);

  const handleKey = useCallback((key: string) => {
    if (status !== 'playing' || revealRow !== null) return;
    if (key === 'ENTER') return submit();
    if (key === 'BACK')  { if (current.length) { sndDelete(); setCurrent(c => c.slice(0, -1)); } return; }
    if (/^[A-Z]$/.test(key) && current.length < length) { sndType(); setCurrent(c => c + key.toLowerCase()); }
  }, [status, submit, current.length, length, revealRow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter')          { e.preventDefault(); handleKey('ENTER'); }
      else if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); }
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleKey]);

  // Letter statuses for keyboard tinting (only for letters that have FULLY revealed)
  const letterStatuses = useMemo<Record<string, TileStatus>>(() => {
    const map: Record<string, TileStatus> = {};
    const finalGuesses = revealRow !== null ? guesses.slice(0, -1) : guesses;
    for (const g of finalGuesses) {
      const s = getStatuses(g, target);
      for (let i = 0; i < g.length; i++) {
        const cur = map[g[i]];
        if (s[i] === 'correct') map[g[i]] = 'correct';
        else if (s[i] === 'present' && cur !== 'correct') map[g[i]] = 'present';
        else if (!cur) map[g[i]] = 'absent';
      }
    }
    return map;
  }, [guesses, target, revealRow]);

  const stats = loadStats('wordless');
  const dist = useMemo(() => {
    const d = stats.guessDistribution || {};
    return [1, 2, 3, 4, 5, 6].map(n => ({
      label: String(n), count: d[String(n)] || 0,
      highlight: status === 'won' && guesses.length === n,
    }));
  }, [stats.guessDistribution, status, guesses.length]);

  const shareText = useMemo(() => {
    const head = `Wordguess · ${day.key} · ${length}L · ${status === 'won' ? guesses.length : 'X'}/${MAX_GUESSES}`;
    const grid = guesses.map(g => getStatuses(g, target).map(s => s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛').join('')).join('\n');
    return `${head}\n${grid}\nhttps://datadripco.com/puzzles/wordless/`;
  }, [day.key, status, guesses, length, target]);

  const lengthCompleted = (l: number) => {
    const s = lengthStates[l];
    return s ? s.status !== 'playing' : false;
  };

  return (
    <div className="dd-games wordguess-screen">
      {toast && <Toast message={toast} />}

      {/* Top bar */}
      <div className="wg-top">
        <IconBtn onClick={() => setShowHelp(true)} ariaLabel="How to play">?</IconBtn>
        <div className="wg-title-wrap">
          <h1 className="wg-title">Wordguess</h1>
          <p className="wg-date">{formatDate(day.date)}</p>
        </div>
        <button
          onClick={() => (status !== 'playing') && setShowResults(true)}
          disabled={status === 'playing'}
          className="wg-results-btn"
          aria-label="Results"
        ><IconStats size={18}/></button>
      </div>

      {/* Length selector — pills */}
      <div className="wg-length-pills">
        {[3,4,5,6,7,8].map(n => {
          const done = lengthCompleted(n);
          const isActive = n === length;
          return (
            <button
              key={n}
              onClick={() => { sndBloop(); setLengthState(n); }}
              className={`wg-pill ${isActive ? 'wg-pill--active' : ''} ${done ? 'wg-pill--done' : ''}`}
              aria-label={`${n} letters${done ? ' (completed)' : ''}`}
            >
              {n}{done && <span className="wg-pill-check">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Board */}
      <div className={`wg-board ${shake ? 'animate-shake' : ''}`} style={{ ['--len' as any]: length }}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => {
          const isRevealing = revealRow === row;
          const submittedGuess = row < guesses.length;
          const isCurrent = row === guesses.length && status === 'playing' && revealRow === null;
          const guessStr = submittedGuess ? guesses[row] : (isCurrent ? current : '');
          const statuses = submittedGuess ? getStatuses(guesses[row], target) : null;
          return (
            <div key={row} className="wg-row">
              {Array.from({ length }).map((_, col) => {
                const letter = guessStr[col]?.toUpperCase() || '';
                const s: TileStatus = statuses ? statuses[col] : 'empty';
                // Color shows ONLY after this tile has crossed mid-flip
                const colorOn = submittedGuess && (!isRevealing || col < revealedCount);
                const isFlipping = isRevealing && col === Math.max(0, revealedCount - 1) && col < revealedCount;
                const bg = colorOn ? TILE_BG[s] : 'transparent';
                const borderColor = colorOn ? TILE_BG[s] : (letter ? '#787c80' : '#3a3d40');
                return (
                  <div
                    key={col}
                    className={`wg-tile ${letter && !submittedGuess ? 'animate-tile-pop' : ''} ${isFlipping ? 'wg-flip' : ''}`}
                    style={{ backgroundColor: bg, borderColor }}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Status note */}
      {status !== 'playing' && (
        <div className="wg-status-bar">
          {status === 'won' ? <span className="wg-status-win">Solved in {guesses.length}</span> : <span className="wg-status-lose">Answer: <b>{target.toUpperCase()}</b></span>}
          <button onClick={() => setShowResults(true)} className="wg-status-link">View results</button>
        </div>
      )}

      {/* Keyboard */}
      <div className="wg-keyboard-wrap">
        <Keyboard onKey={handleKey} statuses={letterStatuses} />
      </div>

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} title="How to Play">
        <HowToPlay />
      </HelpModal>

      {showResults && status !== 'playing' && (
        <div className="dd-modal-overlay animate-fade-in" onClick={() => setShowResults(false)}>
          <div className="dd-modal-card" onClick={e => e.stopPropagation()}>
            <ResultsScreen
              won={status === 'won'}
              title={status === 'won' ? 'Got it!' : 'Game Over'}
              answer={target.toUpperCase()}
              answerLabel={`Today's ${length}-letter word`}
              stats={[
                { value: stats.played, label: 'Played' },
                { value: stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '0%', label: 'Win %' },
                { value: stats.streak, label: 'Streak' },
                { value: stats.bestStreak, label: 'Best' },
              ]}
              distribution={dist}
              shareText={shareText}
              extras={
                <>
                  <DailyRankCard rank={computeDailyRank(`wordless-${length}`, day.index, status === 'won' ? guesses.length : MAX_GUESSES + 1, { higherIsBetter: false, mean: 4.2, stdev: 1.4 })} metric="by guesses used" />
                  <p className="text-center text-xs text-gray-400 mt-3">Try a different length above ↑</p>
                </>
              }
            />
          </div>
        </div>
      )}

      <style>{wgInlineCSS}</style>
    </div>
  );
};

const HowToPlay: React.FC = () => {
  const [page, setPage] = useState<1 | 2>(1);
  return (
    <div>
      {page === 1 ? (
        <>
          <p className="text-center text-gray-300 mb-4">Guess the word in <b>6 tries</b>. Each guess must be a real word.</p>
          <div className="flex justify-center gap-1.5 mb-5">
            {[
              { c: 'W', s: 'correct' }, { c: 'E', s: '' }, { c: 'A', s: 'present' }, { c: 'R', s: '' }, { c: 'Y', s: '' }
            ].map((t, i) => {
              const cls = t.s === 'correct' ? 'bg-accent border-accent' : t.s === 'present' ? 'bg-warn border-warn text-black' : 'bg-panel2 border-panel3';
              return <div key={i} className={`w-10 h-10 rounded border-2 flex items-center justify-center font-extrabold text-white ${cls}`}>{t.c}</div>;
            })}
          </div>
          <ul className="space-y-3">
            <li className="flex items-center gap-3"><span className="w-7 h-7 rounded bg-accent flex items-center justify-center text-white font-bold text-xs">W</span><span>Correct letter, correct spot</span></li>
            <li className="flex items-center gap-3"><span className="w-7 h-7 rounded bg-warn flex items-center justify-center text-black font-bold text-xs">A</span><span>Correct letter, wrong spot</span></li>
            <li className="flex items-center gap-3"><span className="w-7 h-7 rounded bg-panel2 flex items-center justify-center text-white font-bold text-xs">R</span><span>Not in the word</span></li>
          </ul>
        </>
      ) : (
        <>
          <p className="text-center text-gray-300 mb-4">Pick your difficulty.</p>
          <div className="flex justify-center gap-2 mb-4 flex-wrap">
            {[3,4,5,6,7,8].map(n => <div key={n} className="w-9 h-9 rounded bg-panel2 border border-panel3 flex items-center justify-center text-white font-bold">{n}</div>)}
          </div>
          <ul className="space-y-3">
            <li className="flex items-start gap-3"><span className="text-accent mt-1">▸</span><span>Each length is its own puzzle. Play all six per day if you want.</span></li>
            <li className="flex items-start gap-3"><span className="text-accent mt-1">▸</span><span>Same words for everyone. Resets at <b>midnight Pacific</b>.</span></li>
            <li className="flex items-start gap-3"><span className="text-accent mt-1">▸</span><span>30,000+ words accepted as guesses.</span></li>
          </ul>
        </>
      )}
      <div className="flex items-center justify-between mt-6">
        <button className={`text-xs ${page === 1 ? 'opacity-30' : 'text-gray-300'}`} onClick={() => setPage(1)} disabled={page === 1}>← Basics</button>
        <div className="flex gap-1.5">
          <span className={`w-2 h-2 rounded-full ${page === 1 ? 'bg-white' : 'bg-panel3'}`} />
          <span className={`w-2 h-2 rounded-full ${page === 2 ? 'bg-white' : 'bg-panel3'}`} />
        </div>
        <button className={`text-xs ${page === 2 ? 'opacity-30' : 'text-gray-300'}`} onClick={() => setPage(2)} disabled={page === 2}>More →</button>
      </div>
    </div>
  );
};

// ─── Keyboard ────────────────────────────────────────
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const KEY_BG: Record<TileStatus, string> = {
  correct: '#55B725', present: '#DAC316', absent: '#1f2123', empty: '#5b5f63',
};

const Keyboard: React.FC<{ onKey: (k: string) => void; statuses: Record<string, TileStatus> }> = ({ onKey, statuses }) => (
  <div className="wg-kb">
    {ROWS.map((row, ri) => (
      <div key={ri} className="wg-kb-row">
        {ri === 2 && <button onClick={() => onKey('ENTER')} className="wg-key wg-key-wide">ENTER</button>}
        {row.split('').map(k => {
          const s = statuses[k.toLowerCase()];
          const bg = s ? KEY_BG[s] : '#5b5f63';
          const txt = s === 'absent' ? '#7a7d80' : '#fff';
          return (
            <button key={k} onClick={() => onKey(k)} className="wg-key" style={{ backgroundColor: bg, color: txt }}>{k}</button>
          );
        })}
        {ri === 2 && <button onClick={() => onKey('BACK')} className="wg-key wg-key-wide">⌫</button>}
      </div>
    ))}
  </div>
);

// ─── Inline scoped CSS so the game fits a single screen on most devices ──
const wgInlineCSS = `
.wordguess-screen { min-height: calc(100vh - 0px); display: flex; flex-direction: column; padding-bottom: 12px; }
.wg-top { display: flex; align-items: center; gap: 8px; padding: 10px 12px 4px; }
.wg-title-wrap { flex: 1; text-align: center; }
.wg-title { font-size: clamp(1.7rem, 6vw, 2.4rem); font-weight: 900; letter-spacing: -.035em; color: #fff; line-height: 1; margin: 0; }
.wg-date  { font-size: 11px; color: #777; margin: 4px 0 0; letter-spacing: .04em; }
.wg-results-btn { width: 40px; height: 40px; border-radius: 50%; background: #303436; color: #fff; font-size: 16px; }
.wg-results-btn:disabled { opacity: .35; }
.wg-length-pills { display: flex; justify-content: center; gap: 6px; padding: 8px 12px 6px; }
.wg-pill { position: relative; min-width: 36px; height: 32px; padding: 0 10px; border-radius: 999px; background: #303436; color: #cfd2d4; font-weight: 700; font-size: 13px; transition: all .15s ease; }
.wg-pill--active { background: #fff; color: #1e2021; transform: scale(1.05); }
.wg-pill--done   { box-shadow: inset 0 0 0 1px #55B725; }
.wg-pill--done.wg-pill--active { color: #1e2021; box-shadow: inset 0 0 0 2px #55B725; }
.wg-pill-check { position: absolute; top: -4px; right: -4px; width: 14px; height: 14px; border-radius: 50%; background: #55B725; color: #fff; font-size: 9px; display: flex; align-items: center; justify-content: center; }

.wg-board { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 12px; flex-shrink: 0; }
.wg-row { display: flex; gap: 6px; }
.wg-tile {
  width: clamp(38px, calc((100vw - 80px) / var(--len, 5)), 56px);
  height: clamp(38px, calc((100vw - 80px) / var(--len, 5)), 56px);
  max-width: 56px; max-height: 56px;
  display: flex; align-items: center; justify-content: center;
  font-size: clamp(18px, 5vw, 26px); font-weight: 900; color: #fff;
  border: 2px solid #3a3d40; border-radius: 4px;
  transition: border-color .15s ease;
}
.wg-flip { animation: wg-flip 480ms cubic-bezier(.55, 0, .45, 1) both; }
@keyframes wg-flip {
  0%   { transform: rotateX(0); }
  50%  { transform: rotateX(90deg); }
  100% { transform: rotateX(0); }
}

.wg-status-bar { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 4px 12px; font-size: 13px; color: #cfd2d4; }
.wg-status-win  { color: #55B725; font-weight: 700; }
.wg-status-lose { color: #cfd2d4; }
.wg-status-link { color: #9aa0a4; font-size: 12px; text-decoration: underline; }

.wg-keyboard-wrap { margin-top: auto; padding: 8px 6px 4px; }
.wg-kb { max-width: 540px; margin: 0 auto; }
.wg-kb-row { display: flex; justify-content: center; gap: 5px; margin-bottom: 5px; }
.wg-key { height: clamp(46px, 11vw, 56px); min-width: 28px; flex: 1; max-width: 44px; border-radius: 5px; background: #5b5f63; color: #fff; font-weight: 700; font-size: clamp(13px, 3vw, 16px); transition: transform .08s ease; }
.wg-key:active { transform: scale(.94); }
.wg-key-wide { flex: 1.4; max-width: 64px; font-size: 11px; }

.dd-modal-overlay { position: fixed; inset: 0; z-index: 150; background: rgba(0,0,0,0.72); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.dd-modal-card { width: 100%; max-width: 28rem; }
`;
