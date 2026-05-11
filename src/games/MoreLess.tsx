import React, { useEffect, useMemo, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate, shuffle } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { PageHeader } from '../components/PageHeader';
import { ResultsScreen } from '../components/ResultsScreen';
import { CATEGORIES, MoreLessCategory, MoreLessItem } from './data/moreless-data';

interface Round {
  category: MoreLessCategory;
  left: MoreLessItem;
  right: MoreLessItem;
}

interface SavedState {
  index: number;
  score: number;
  finished: boolean;
  history: ('win' | 'loss')[];
}

const MAX_ROUNDS = 15;

function buildRounds(dayIndex: number): Round[] {
  const rand = mulberry32(dayIndex * 1779033703);
  const rounds: Round[] = [];
  // Cycle categories deterministically; for each round pick two items from a category
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const cat = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    let attempts = 0, left: MoreLessItem, right: MoreLessItem;
    do {
      const shuffled = shuffle(cat.items, rand);
      left = shuffled[0];
      right = shuffled[1];
      attempts++;
    } while (left.value === right.value && attempts < 5);
    rounds.push({ category: cat, left, right });
  }
  return rounds;
}

function fmt(value: number, format: MoreLessCategory['format']): string {
  if (format === 'currency-bn') {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9)  return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6)  return `$${(value / 1e6).toFixed(0)}M`;
    return `$${value.toLocaleString()}`;
  }
  if (format === 'currency-m') return `$${(value / 1e6).toFixed(0)}M`;
  if (format === 'compact') {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toLocaleString();
  }
  if (format === 'decimal') return value.toFixed(1);
  return value.toLocaleString();
}

export const MoreLess: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const rounds = useMemo(() => buildRounds(day.index), [day.index]);

  const initial = loadState<SavedState>('more-less', day.key);
  const [index, setIndex] = useState(initial?.index ?? 0);
  const [score, setScore] = useState(initial?.score ?? 0);
  const [finished, setFinished] = useState(initial?.finished ?? false);
  const [history, setHistory] = useState<SavedState['history']>(initial?.history ?? []);
  const [pick, setPick] = useState<'left' | 'right' | null>(null);
  const [revealing, setRevealing] = useState(false);

  // Persist
  useEffect(() => {
    saveState<SavedState>('more-less', day.key, { index, score, finished, history });
  }, [index, score, finished, history, day.key]);

  const round = rounds[Math.min(index, rounds.length - 1)];

  const handlePick = (side: 'left' | 'right') => {
    if (pick || finished) return;
    setPick(side);
    setRevealing(true);
    setTimeout(() => {
      const correct = side === 'left' ? round.left.value >= round.right.value : round.right.value > round.left.value;
      const newHistory: ('win' | 'loss')[] = [...history, correct ? 'win' : 'loss'];
      setHistory(newHistory);
      if (correct) {
        const newScore = score + 1;
        setScore(newScore);
        if (index + 1 >= MAX_ROUNDS) {
          setFinished(true);
          recordResult('more-less', day.key, true);
        } else {
          setTimeout(() => {
            setIndex(i => i + 1);
            setPick(null);
            setRevealing(false);
          }, 900);
        }
      } else {
        setTimeout(() => {
          setFinished(true);
          recordResult('more-less', day.key, false);
        }, 900);
      }
    }, 800);
  };

  const stats = loadStats('more-less');

  if (finished) {
    const grid = history.map(h => h === 'win' ? '🟩' : '🟥').join('');
    const shareText = `More/less · ${day.key} · Streak ${score}/${MAX_ROUNDS}\n${grid}\nhttps://datadripco.com/puzzles/more-less/`;
    return (
      <div className="dd-games min-h-screen pb-20">
        <PageHeader title="More/less" dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />
        <ResultsScreen
          won={score >= 10}
          title={score === MAX_ROUNDS ? '🔥 Perfect run!' : score >= 10 ? 'Strong streak' : 'Game over'}
          stats={[
            { value: score, label: 'Streak' },
            { value: stats.played, label: 'Played' },
            { value: stats.bestStreak, label: 'Best Day' },
            { value: stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '0%', label: 'Win %' },
          ]}
          shareText={shareText}
        />
      </div>
    );
  }

  const showValues = pick !== null;

  return (
    <div className="dd-games min-h-screen pb-20">
      <PageHeader title="More/less" dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />

      {/* Score bar */}
      <div className="max-w-2xl mx-auto px-4 mb-6 flex justify-between items-center">
        <div className="bg-panel rounded-lg px-4 py-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Round</div>
          <div className="text-xl font-bold text-white tabular-nums">{index + 1}/{MAX_ROUNDS}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Category</div>
          <div className="text-sm font-medium text-warn">{round.category.name}</div>
        </div>
        <div className="bg-panel rounded-lg px-4 py-2 text-right">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Streak</div>
          <div className="text-xl font-bold text-accent tabular-nums">{score}</div>
        </div>
      </div>

      {/* Question */}
      <p className="text-center text-2xl sm:text-3xl font-semibold tracking-tight mb-8 px-4">
        Which {round.category.question}?
      </p>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto px-4">
        {(['left', 'right'] as const).map(side => {
          const item = side === 'left' ? round.left : round.right;
          const isPicked = pick === side;
          const correctSide = round.left.value >= round.right.value ? 'left' : 'right';
          const showOutline = revealing && isPicked;
          const isCorrect = isPicked && correctSide === side;
          const ringCls = showOutline ? (isCorrect ? 'ring-4 ring-accent' : 'ring-4 ring-bad') : '';
          return (
            <button
              key={side}
              onClick={() => handlePick(side)}
              disabled={pick !== null}
              className={`group relative overflow-hidden rounded-3xl bg-panel border-2 border-line/40 hover:border-accent transition-all active:scale-[0.99] ${ringCls}`}
            >
              <div className="bg-panel2 aspect-[4/2] flex items-center justify-center text-7xl">
                {item.image}
              </div>
              <div className="px-5 py-5">
                <div className="text-xl sm:text-2xl font-bold text-white text-center mb-2 leading-tight">{item.name}</div>
                <div className="text-center min-h-[3rem]">
                  {showValues ? (
                    <div className={`text-3xl sm:text-4xl font-bold tabular-nums animate-pop-in ${isCorrect ? 'text-accent' : isPicked ? 'text-bad' : 'text-warn'}`}>
                      {fmt(item.value, round.category.format)}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">{round.category.unit}</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-500 mt-8">
        Wrong answer ends the run. Survive all 15 rounds for a perfect day.
      </p>
    </div>
  );
};
