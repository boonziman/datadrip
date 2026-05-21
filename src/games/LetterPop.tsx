/**
 * LetterPop — daily letter-pool word builder (Letterset-inspired).
 *
 * Daily seeded pool of 20 tiles. Three are power-ups:
 *   ★ WILD     — counts as any letter
 *   2L        — doubles the value of THIS letter when used
 *   2W        — doubles the entire word's score when used
 * Form valid English words (>=3 letters) from the pool. Submitting a word
 * consumes those tiles. Bonus: +5 per length over 4. "Go-out" bonus +50.
 *
 * Daily lock: stored per-day in localStorage. Only one full attempt per day.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate, shuffle } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { computeDailyRank } from '../lib/dailyRank';
import { ResultsScreen } from '../components/ResultsScreen';
import { DailyRankCard } from '../components/DailyRankCard';
import { Toast } from '../components/Toast';
import { HelpModal, IconBtn, HelpItem } from '../components/HelpModal';
import { PageHeader } from '../components/PageHeader';
import { isValidWord } from './data/wordless-words';
import { sndBloop, sndPop, sndType, sndWin, sndError, sndReveal } from '../lib/sound';
import { IconStats } from '../components/Icons';

type PowerKind = 'wild' | '2L' | '2W';
interface Tile {
  id: number;        // stable id (index in initial pool)
  letter: string;    // for wild this is '★' until used
  power?: PowerKind;
  used: boolean;
}
interface SubmittedWord { word: string; score: number; tiles: number[]; powers: PowerKind[]; }
interface SavedState {
  pool: Tile[];
  submitted: SubmittedWord[];
  status: 'playing' | 'finished';
  goOut: boolean;
  finalScore: number;
}

// Scrabble-ish letter values
const VAL: Record<string, number> = {
  a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,
  p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10,
};
// Frequency-weighted bag for picking pool letters
const BAG = (
  'aaaaaaaaa' + 'bb' + 'cc' + 'dddd' + 'eeeeeeeeeeee' + 'ff' + 'ggg' + 'hh' +
  'iiiiiiiii' + 'j' + 'k' + 'llll' + 'mm' + 'nnnnnn' + 'oooooooo' + 'pp' +
  'q' + 'rrrrrr' + 'ssss' + 'tttttt' + 'uuuu' + 'vv' + 'ww' + 'x' + 'yy' + 'z'
).split('');

const POOL_SIZE = 20;
const MIN_WORD = 3;

function generatePool(dayIndex: number): Tile[] {
  const rand = mulberry32(dayIndex * 9301 + 49297);
  // Pick 20 letters with at least 5 vowels for solvability
  const vowels = 'aeiou'.split('');
  const consonants = BAG.filter(c => !vowels.includes(c));
  const letters: string[] = [];
  for (let i = 0; i < 6; i++) letters.push(vowels[Math.floor(rand() * vowels.length)]);
  while (letters.length < POOL_SIZE) {
    const pool = rand() < 0.6 ? consonants : BAG;
    letters.push(pool[Math.floor(rand() * pool.length)]);
  }
  const shuffled = shuffle(letters, rand);
  const tiles: Tile[] = shuffled.map((l, i) => ({ id: i, letter: l, used: false }));
  // Place power-ups deterministically on 3 random positions
  const positions = shuffle([...Array(POOL_SIZE).keys()], rand).slice(0, 3);
  tiles[positions[0]] = { ...tiles[positions[0]], power: 'wild', letter: '★' };
  tiles[positions[1]] = { ...tiles[positions[1]], power: '2L' };
  tiles[positions[2]] = { ...tiles[positions[2]], power: '2W' };
  return tiles;
}

function letterValue(letter: string): number {
  return VAL[letter.toLowerCase()] || 0;
}

function scoreWord(selected: Tile[], wildLetters: Record<number, string>): number {
  let base = 0;
  let wordMult = 1;
  for (const t of selected) {
    const letter = t.power === 'wild' ? (wildLetters[t.id] || 'a') : t.letter;
    let v = letterValue(letter);
    if (t.power === '2L') v *= 2;
    if (t.power === 'wild') v = 0; // wild itself contributes 0 to score
    base += v;
    if (t.power === '2W') wordMult *= 2;
  }
  let score = base * wordMult;
  if (selected.length > 4) score += (selected.length - 4) * 5;
  return score;
}

function effectiveWord(selected: Tile[], wildLetters: Record<number, string>): string {
  return selected.map(t => t.power === 'wild' ? (wildLetters[t.id] || '?') : t.letter).join('');
}

export const LetterPop: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const initial = loadState<SavedState>('letterpop', day.key);

  const [pool, setPool] = useState<Tile[]>(initial?.pool || generatePool(day.index));
  const [submitted, setSubmitted] = useState<SubmittedWord[]>(initial?.submitted || []);
  const [status, setStatus] = useState<'playing' | 'finished'>(initial?.status || 'playing');
  const [goOut, setGoOut] = useState<boolean>(initial?.goOut || false);
  const [selection, setSelection] = useState<number[]>([]); // tile ids in order
  const [wildLetters, setWildLetters] = useState<Record<number, string>>({});
  const [wildPrompt, setWildPrompt] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showResults, setShowResults] = useState<boolean>(status === 'finished');
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const totalScore = submitted.reduce((s, w) => s + w.score, 0) + (goOut ? 50 : 0);

  useEffect(() => {
    const state: SavedState = { pool, submitted, status, goOut, finalScore: totalScore };
    saveState<SavedState>('letterpop', day.key, state);
  }, [pool, submitted, status, goOut, totalScore, day.key]);

  const selectedTiles = useMemo(
    () => selection.map(id => pool.find(t => t.id === id)!).filter(Boolean),
    [selection, pool]
  );

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const toggleTile = useCallback((id: number) => {
    if (status !== 'playing') return;
    const t = pool.find(x => x.id === id);
    if (!t || t.used) return;
    if (selection.includes(id)) {
      setSelection(s => s.filter(x => x !== id));
      sndPop();
    } else {
      if (t.power === 'wild' && !wildLetters[id]) {
        setWildPrompt(id);
        return;
      }
      setSelection(s => [...s, id]);
      sndType();
    }
  }, [pool, selection, status, wildLetters]);

  const assignWild = (letter: string) => {
    if (wildPrompt == null) return;
    setWildLetters(wl => ({ ...wl, [wildPrompt]: letter }));
    setSelection(s => [...s, wildPrompt]);
    setWildPrompt(null);
    sndType();
  };

  const clearSelection = () => { setSelection([]); sndPop(); };

  const submitWord = () => {
    if (selection.length < MIN_WORD) { showToast(`Pick at least ${MIN_WORD} tiles`); sndError(); return; }
    const word = effectiveWord(selectedTiles, wildLetters).toLowerCase();
    if (!isValidWord(word)) { showToast(`"${word.toUpperCase()}" not in word list`); sndError(); return; }
    if (submitted.some(s => s.word === word)) { showToast('Already used'); sndError(); return; }
    const score = scoreWord(selectedTiles, wildLetters);
    const powers = selectedTiles.map(t => t.power).filter(Boolean) as PowerKind[];
    setSubmitted(arr => [...arr, { word, score, tiles: selection, powers }]);
    setPool(p => p.map(t => selection.includes(t.id) ? { ...t, used: true } : t));
    setSelection([]);
    sndWin();
    // Check go-out
    const remaining = pool.filter(t => !t.used && !selection.includes(t.id)).length;
    if (remaining === 0) {
      setGoOut(true);
      setStatus('finished');
      setTimeout(() => { sndReveal(); setShowResults(true); recordResult('letterpop', day.key, true, { totalGuesses: submitted.length + 1 }); }, 400);
    }
  };

  const finishGame = () => {
    setStatus('finished');
    recordResult('letterpop', day.key, submitted.length > 0, { totalGuesses: submitted.length });
    sndReveal();
    setShowResults(true);
  };

  const rank = useMemo(
    () => computeDailyRank('letterpop', day.index, totalScore, {
      higherIsBetter: true, mean: 85, stdev: 35,
    }),
    [day.index, totalScore]
  );
  const stats = loadStats('letterpop');

  // Results screen
  if (showResults && status === 'finished') {
    const shareText = `LetterPop · ${day.key} · ${totalScore} pts · ${submitted.length} words${goOut ? ' · WENT OUT' : ''}\nhttps://datadripco.com/puzzles/letterpop/`;
    return (
      <div className="min-h-screen bg-bg py-8 px-2">
        <PageHeader title="LetterPop" dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />
        <ResultsScreen
          won={totalScore > 0}
          title={goOut ? 'You went out!' : 'Game over'}
          stats={[
            { value: totalScore, label: 'Score' },
            { value: submitted.length, label: 'Words' },
            { value: stats.streak, label: 'Streak' },
            { value: goOut ? '+50' : '0', label: 'Go-out' },
          ]}
          shareText={shareText}
          extras={<DailyRankCard rank={rank} metric="by score" />}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center px-3 py-4">
      <Toast text={toast || ''} show={!!toast} />
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} title="LetterPop">
        <HelpItem icon="1">Tap tiles to spell a word (3+ letters from today's pool).</HelpItem>
        <HelpItem icon="2">Submit a valid word to consume those tiles and score points.</HelpItem>
        <HelpItem icon={<span className="text-accent">★</span>}>Wild — counts as any letter you choose.</HelpItem>
        <HelpItem icon={<span className="text-blue-400">2L</span>}>Doubles that letter's value.</HelpItem>
        <HelpItem icon={<span className="text-yellow-300">2W</span>}>Doubles the whole word's score.</HelpItem>
        <HelpItem icon="✓">Clear all 20 tiles for a +50 GO-OUT bonus.</HelpItem>
      </HelpModal>

      <div className="w-full max-w-xl flex items-center justify-between mb-3">
        <IconBtn onClick={() => setShowHelp(true)} ariaLabel="How to play">?</IconBtn>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">LetterPop</h1>
          <p className="text-xs text-gray-500">{formatDate(day.date)}</p>
        </div>
        <button
          onClick={() => status === 'finished' && setShowResults(true)}
          disabled={status === 'playing'}
          className={`p-2 rounded-lg ${status === 'playing' ? 'text-gray-600 cursor-not-allowed' : 'text-white hover:bg-panel2'}`}
          aria-label="Results"
        >
          <IconStats size={18}/>
        </button>
      </div>

      {/* Score / progress */}
      <div className="w-full max-w-xl bg-panel rounded-2xl p-4 mb-3 border border-line/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Score</p>
            <p className="text-3xl font-extrabold text-accent tabular-nums">{totalScore}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Tiles left</p>
            <p className="text-3xl font-extrabold text-white tabular-nums">{pool.filter(t => !t.used).length}<span className="text-gray-500 text-base">/{POOL_SIZE}</span></p>
          </div>
        </div>
      </div>

      {/* Pool */}
      <div className="w-full max-w-xl grid grid-cols-5 gap-2 mb-4">
        {pool.map(t => {
          const isSelected = selection.includes(t.id);
          const disabled = t.used || status !== 'playing';
          const power = t.power;
          let cls = 'aspect-square rounded-xl flex flex-col items-center justify-center font-extrabold relative select-none transition-transform active:scale-95';
          if (t.used) cls += ' bg-panel3/30 text-gray-700 opacity-40';
          else if (isSelected) cls += ' bg-accent text-black scale-95 shadow-lg shadow-accent/30';
          else if (power === 'wild') cls += ' bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-md';
          else if (power === '2L') cls += ' bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-md';
          else if (power === '2W') cls += ' bg-gradient-to-br from-yellow-400 to-orange-500 text-black shadow-md';
          else cls += ' bg-panel2 text-white hover:bg-panel3 border border-line/30';
          return (
            <button key={t.id} disabled={disabled} onClick={() => toggleTile(t.id)} className={cls} aria-label={`Tile ${t.letter}`}>
              <span className="text-2xl uppercase">{power === 'wild' && wildLetters[t.id] ? wildLetters[t.id] : t.letter}</span>
              {power && (
                <span className="absolute top-0.5 right-1 text-[9px] font-black opacity-90">
                  {power === 'wild' ? '★' : power}
                </span>
              )}
              {!power && !t.used && (
                <span className="absolute bottom-0.5 right-1 text-[9px] text-gray-400 font-bold">{letterValue(t.letter)}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Word builder */}
      <div className="w-full max-w-xl bg-panel rounded-2xl p-3 mb-3 border border-line/30 min-h-[68px] flex items-center justify-between gap-3">
        <div className="flex-1 min-h-[40px] flex items-center flex-wrap gap-1">
          {selectedTiles.length === 0 ? (
            <span className="text-gray-500 text-sm italic">Tap tiles to build a word…</span>
          ) : (
            selectedTiles.map(t => (
              <span key={t.id} className="px-2 py-1 bg-accent/20 text-accent rounded font-bold uppercase">
                {t.power === 'wild' ? (wildLetters[t.id] || '?') : t.letter}
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          {selection.length > 0 && (
            <button onClick={clearSelection} className="px-3 py-2 bg-panel2 text-gray-300 rounded-lg text-sm font-bold hover:bg-panel3">Clear</button>
          )}
          <button onClick={submitWord} disabled={selection.length < MIN_WORD} className={`px-4 py-2 rounded-lg text-sm font-bold ${selection.length < MIN_WORD ? 'bg-panel3 text-gray-600' : 'bg-accent text-black hover:bg-accentDark active:scale-95'}`}>
            Submit
          </button>
        </div>
      </div>

      {/* Submitted */}
      {submitted.length > 0 && (
        <div className="w-full max-w-xl bg-panel rounded-2xl p-3 mb-3 border border-line/30">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Words played</p>
          <div className="flex flex-wrap gap-2">
            {submitted.map((s, i) => (
              <span key={i} className="px-2 py-1 bg-panel2 rounded text-sm">
                <span className="text-white font-bold uppercase">{s.word}</span>
                <span className="text-accent ml-2 font-bold">+{s.score}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <button onClick={finishGame} disabled={status === 'finished'} className="text-gray-500 text-sm underline hover:text-gray-300 mt-2">
        Done — finish game
      </button>

      {/* Wild prompt */}
      {wildPrompt != null && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setWildPrompt(null)}>
          <div className="bg-panel rounded-2xl p-5 max-w-sm w-full border border-line" onClick={e => e.stopPropagation()}>
            <p className="text-white font-bold mb-3 text-center">Wild tile — pick a letter</p>
            <div className="grid grid-cols-6 gap-2">
              {'abcdefghijklmnopqrstuvwxyz'.split('').map(l => (
                <button key={l} onClick={() => assignWild(l)} className="aspect-square bg-panel2 hover:bg-accent hover:text-black text-white font-bold uppercase rounded-lg">{l}</button>
              ))}
            </div>
            <button onClick={() => setWildPrompt(null)} className="mt-3 w-full py-2 text-gray-400 hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
