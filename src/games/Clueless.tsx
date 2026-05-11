import React, { useEffect, useMemo, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { PageHeader } from '../components/PageHeader';
import { ResultsScreen } from '../components/ResultsScreen';
import { Toast } from '../components/Toast';
import { CLUELESS_TARGETS } from './data/clueless-targets';

interface SavedState {
  guesses: { word: string; rank: number | null; score: number }[];
  status: 'playing' | 'won' | 'gave-up';
  hintsUsed: number;
}

// Datamuse `ml=` returns up to 1000 means-like words ranked by similarity.
// We map rank -> a "similarity score" 0-100 and a label.
async function fetchSimilar(target: string): Promise<{ word: string; score: number }[]> {
  const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(target)}&max=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Datamuse failed');
  const data: { word: string; score?: number }[] = await res.json();
  return data.map(d => ({ word: d.word.toLowerCase(), score: d.score ?? 0 }));
}

function rankToSim(rank: number | null, total: number): number {
  if (rank === null) return 0;
  // rank 0 = closest. Convert to 1..100 (100 = closest)
  return Math.max(1, Math.round(100 * (1 - rank / Math.max(1, total))));
}

function tier(rank: number | null): { label: string; color: string } {
  if (rank === null) return { label: 'cold', color: '#3a3d40' };
  if (rank === 0)   return { label: '🎯 FOUND', color: '#55B725' };
  if (rank < 50)    return { label: '🔥 hot', color: '#C62121' };
  if (rank < 200)   return { label: '🌡 warm', color: '#DAC316' };
  if (rank < 500)   return { label: '❄ cool', color: '#4a8fb7' };
  return { label: 'cold', color: '#3a3d40' };
}

export const Clueless: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const target = useMemo(() => {
    const rand = mulberry32(day.index * 374761393);
    return CLUELESS_TARGETS[Math.floor(rand() * CLUELESS_TARGETS.length)];
  }, [day.index]);

  const [neighbors, setNeighbors] = useState<{ word: string; score: number }[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const initial = loadState<SavedState>('clueless', day.key);
  const [guesses, setGuesses] = useState<SavedState['guesses']>(initial?.guesses ?? []);
  const [status, setStatus] = useState<SavedState['status']>(initial?.status ?? 'playing');
  const [hintsUsed, setHintsUsed] = useState(initial?.hintsUsed ?? 0);
  const [input, setInput] = useState('');
  const [toast, setToast] = useState('');
  const [lastGuess, setLastGuess] = useState<string | null>(null);

  // Fetch neighbors (cached per day)
  useEffect(() => {
    const cacheKey = `dd:clueless-neighbors:${day.key}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setNeighbors(JSON.parse(cached)); return; } catch {}
    }
    fetchSimilar(target).then(n => {
      setNeighbors(n);
      try { localStorage.setItem(cacheKey, JSON.stringify(n)); } catch {}
    }).catch(() => setLoadError(true));
  }, [target, day.key]);

  // Persist
  useEffect(() => {
    saveState<SavedState>('clueless', day.key, { guesses, status, hintsUsed });
  }, [guesses, status, hintsUsed, day.key]);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 1800); return () => clearTimeout(id); }, [toast]);

  const lookup = (word: string): number | null => {
    if (word === target) return 0;
    if (!neighbors) return null;
    const idx = neighbors.findIndex(n => n.word === word);
    if (idx === -1) return null;
    return idx + 1;
  };

  const submit = () => {
    if (status !== 'playing') return;
    const w = input.trim().toLowerCase();
    if (!w) return;
    if (!/^[a-z\- ]+$/.test(w)) { setToast('Letters only'); return; }
    if (guesses.find(g => g.word === w)) { setToast('Already guessed'); setInput(''); return; }
    if (!neighbors && !loadError) { setToast('Loading clues…'); return; }
    const rank = lookup(w);
    const total = neighbors?.length || 1000;
    const score = rankToSim(rank, total);
    const newG = [...guesses, { word: w, rank, score }];
    setGuesses(newG);
    setLastGuess(w);
    setInput('');
    if (rank === 0) {
      setStatus('won');
      recordResult('clueless', day.key, true, { totalGuesses: newG.length });
    }
  };

  const useHint = () => {
    if (status !== 'playing' || !neighbors) return;
    const guessed = new Set(guesses.map(g => g.word));
    // Find the closest unguessed neighbor
    for (let i = 0; i < neighbors.length; i++) {
      if (!guessed.has(neighbors[i].word) && neighbors[i].word !== target) {
        const rank = i + 1;
        setGuesses([...guesses, { word: neighbors[i].word, rank, score: rankToSim(rank, neighbors.length) }]);
        setHintsUsed(h => h + 1);
        setLastGuess(neighbors[i].word);
        return;
      }
    }
  };

  const giveUp = () => {
    if (status !== 'playing') return;
    if (!confirm(`Reveal today's word "${target}"?`)) return;
    setStatus('gave-up');
    recordResult('clueless', day.key, false);
  };

  const stats = loadStats('clueless');
  const sorted = [...guesses].sort((a, b) => {
    if (a.rank === null && b.rank === null) return 0;
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });
  const closestRank = guesses.reduce((min, g) => g.rank !== null && g.rank < min ? g.rank : min, Infinity);

  if (status !== 'playing') {
    const shareText = `Clueless · ${day.key} · ${status === 'won' ? `${guesses.length} guesses${hintsUsed ? ` (${hintsUsed} hints)` : ''}` : 'gave up'}\nhttps://datadripco.com/puzzles/clueless/`;
    return (
      <div className="dd-games min-h-screen pb-20">
        <PageHeader title="Clueless" dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />
        <ResultsScreen
          won={status === 'won'}
          title={status === 'won' ? '🎯 You found it!' : 'Better luck tomorrow'}
          answer={target.toUpperCase()}
          answerLabel="Today's Word"
          stats={[
            { value: guesses.length, label: 'Guesses' },
            { value: hintsUsed, label: 'Hints' },
            { value: stats.streak, label: 'Streak' },
            { value: stats.bestStreak, label: 'Best' },
          ]}
          shareText={shareText}
        />
      </div>
    );
  }

  return (
    <div className="dd-games min-h-screen pb-20">
      {toast && <Toast message={toast} />}
      <PageHeader
        title="Clueless"
        subtitle="Guess the secret word using semantic similarity"
        dayLabel={`Daily · ${formatDate(day.date)}`}
        isDev={day.isDev}
      />

      {/* Stats line */}
      <div className="max-w-2xl mx-auto px-4 mb-4 flex justify-between text-sm">
        <div className="bg-panel rounded-lg px-3 py-2"><span className="text-gray-500">Guesses </span><span className="font-bold tabular-nums">{guesses.length}</span></div>
        <div className="bg-panel rounded-lg px-3 py-2"><span className="text-gray-500">Closest </span><span className="font-bold text-warn tabular-nums">{closestRank === Infinity ? '—' : `#${closestRank}`}</span></div>
        <div className="bg-panel rounded-lg px-3 py-2"><span className="text-gray-500">Hints </span><span className="font-bold tabular-nums">{hintsUsed}</span></div>
      </div>

      {/* Input */}
      <div className="max-w-2xl mx-auto px-4 mb-3 flex gap-2">
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder={neighbors ? 'Type a guess…' : loadError ? 'Offline — partial mode' : 'Loading clues…'}
          className="flex-1 bg-panel border-2 border-line rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
        <button onClick={submit} className="bg-accent hover:bg-accentDark text-black font-bold rounded-xl px-6">Guess</button>
      </div>
      <div className="max-w-2xl mx-auto px-4 mb-6 flex gap-2">
        <button onClick={useHint} className="flex-1 bg-panel hover:bg-panel2 rounded-lg py-2 text-sm border border-line/40">💡 Hint</button>
        <button onClick={giveUp} className="flex-1 bg-panel hover:bg-panel2 rounded-lg py-2 text-sm border border-line/40">🏳 Give up</button>
      </div>

      {/* Last guess banner */}
      {lastGuess && (() => {
        const g = guesses.find(x => x.word === lastGuess);
        if (!g) return null;
        const t = tier(g.rank);
        return (
          <div className="max-w-2xl mx-auto px-4 mb-4 animate-fade-up">
            <GuessRow guess={g} target={target} highlight />
          </div>
        );
      })()}

      {/* Guess list */}
      <div className="max-w-2xl mx-auto px-4 space-y-1.5">
        {sorted.map(g => (
          <GuessRow key={g.word} guess={g} target={target} highlight={false} />
        ))}
        {!guesses.length && (
          <p className="text-center text-gray-500 text-sm py-8">Start guessing — closer guesses rank higher.</p>
        )}
      </div>
    </div>
  );
};

const GuessRow: React.FC<{ guess: { word: string; rank: number | null; score: number }; target: string; highlight: boolean }> = ({ guess, target, highlight }) => {
  const t = tier(guess.rank);
  const widthPct = guess.score;
  return (
    <div className={`relative bg-panel rounded-lg overflow-hidden ${highlight ? 'ring-2 ring-warn' : ''}`}>
      <div
        className="absolute inset-y-0 left-0 opacity-30"
        style={{ width: `${widthPct}%`, backgroundColor: t.color }}
      />
      <div className="relative flex justify-between items-center px-4 py-2.5">
        <span className="font-medium text-white">{guess.word}</span>
        <div className="flex items-center gap-3 tabular-nums text-sm">
          <span className="text-gray-400">{guess.rank === null ? '—' : `#${guess.rank}`}</span>
          <span className="font-bold text-white w-12 text-right">{guess.score}</span>
          <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded" style={{ backgroundColor: t.color + '40', color: t.color === '#3a3d40' ? '#888' : t.color }}>{t.label}</span>
        </div>
      </div>
    </div>
  );
};
