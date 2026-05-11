import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { ResultsScreen } from '../components/ResultsScreen';
import { HelpModal, IconBtn } from '../components/HelpModal';
import { CATEGORIES, MoreLessItem, MoreLessCategory } from './data/moreless-data';
import { fetchEntityImage, getCachedImage } from '../lib/images';
import { sndWin, sndLose, sndCount, sndBloop, sndError } from '../lib/sound';

// Four stages — order is fixed daily but the items inside are shuffled per day.
const STAGE_IDS = ['youtube', 'spotify', 'movies', 'companies'] as const;
type StageId = typeof STAGE_IDS[number];

interface StageResult { stageId: string; correct: number; total: number; }
interface SavedState {
  stageIdx: number;
  stageResults: StageResult[];
  finished: boolean;
}

function shuffle<T>(arr: T[], rand: () => number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatValue(n: number, fmt: MoreLessCategory['format']) {
  if (fmt === 'compact') {
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(n);
  }
  if (fmt === 'currency-bn') return '$' + (n / 1e9).toFixed(0) + 'B';
  if (fmt === 'currency-m')  return '$' + (n / 1e6).toFixed(0) + 'M';
  if (fmt === 'decimal') return n.toFixed(1);
  return n.toLocaleString();
}

// ─── Counter rollup hook ─────────────────────
function useRollup(target: number, active: boolean, fmt: MoreLessCategory['format']) {
  const [val, setVal] = useState(0);
  const [text, setText] = useState('0');
  useEffect(() => {
    if (!active) { setVal(0); setText('0'); return; }
    const dur = 1300;
    const start = performance.now();
    let raf = 0;
    let lastTick = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(eased * target);
      setVal(cur);
      setText(formatValue(cur, fmt));
      if (now - lastTick > 70 && t < 1) { sndCount(); lastTick = now; }
      if (t < 1) raf = requestAnimationFrame(tick);
      else { setText(formatValue(target, fmt)); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, fmt]);
  return text;
}

// ─── Card component ──────────────────────────
const Card: React.FC<{
  item: MoreLessItem;
  category: MoreLessCategory;
  reveal: boolean;
  onPick?: () => void;
  highlight?: 'win' | 'lose' | null;
  side: 'top' | 'bottom';
  disabled?: boolean;
}> = ({ item, category, reveal, onPick, highlight, side, disabled }) => {
  const [imgUrl, setImgUrl] = useState<string | null | undefined>(() => getCachedImage(item.name));

  useEffect(() => {
    let alive = true;
    if (imgUrl === undefined) {
      fetchEntityImage(item.name, item.wiki).then(u => { if (alive) setImgUrl(u); });
    } else if (imgUrl === null && item.wiki) {
      fetchEntityImage(item.name, item.wiki).then(u => { if (alive && u) setImgUrl(u); });
    }
    return () => { alive = false; };
  }, [item.name, item.wiki]);

  const text = useRollup(item.value, reveal, category.format);

  const ringCls = highlight === 'win' ? 'ring-4 ring-accent shadow-[0_0_40px_rgba(85,183,37,0.5)]'
                : highlight === 'lose' ? 'ring-4 ring-bad shadow-[0_0_40px_rgba(198,33,33,0.4)]'
                : '';

  return (
    <button
      onClick={() => !disabled && onPick && onPick()}
      disabled={disabled}
      className={`group relative w-full overflow-hidden rounded-2xl border border-line/50 bg-panel transition-all ${ringCls} ${!disabled && onPick ? 'hover:border-accent active:scale-[0.99] cursor-pointer' : ''}`}
    >
      <div className="relative h-40 sm:h-48 w-full bg-panel2 flex items-center justify-center overflow-hidden">
        {imgUrl
          ? <img src={imgUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          : <span className="text-7xl">{item.image || '❓'}</span>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
          <p className="text-white font-extrabold text-lg sm:text-xl tracking-tight leading-tight">{item.name}</p>
        </div>
      </div>
      <div className="p-4 text-center min-h-[88px] flex flex-col items-center justify-center">
        <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider mb-1">{category.unit}</p>
        {reveal ? (
          <p className={`text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight ${highlight === 'win' ? 'text-accent' : highlight === 'lose' ? 'text-bad' : 'text-white'}`}>{text}</p>
        ) : (
          <p className="text-3xl sm:text-4xl font-extrabold text-gray-500 tracking-wider">?</p>
        )}
      </div>
    </button>
  );
};

// ─── Helpers ─────────────────────────────────
function buildStageDeck(category: MoreLessCategory, dayIndex: number) {
  const rand = mulberry32(dayIndex * 0x85ebca6b ^ category.id.length * 0xc2b2ae35);
  // Filter out items with same value as another (so no ties), then shuffle.
  const items = shuffle(category.items, rand);
  return items;
}

export const MoreLess: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const stages = useMemo(() => STAGE_IDS.map(id => CATEGORIES.find(c => c.id === id)!).filter(Boolean), []);

  const initial = loadState<SavedState>('more-less', day.key);
  const [stageIdx, setStageIdx] = useState(initial?.stageIdx ?? 0);
  const [stageResults, setStageResults] = useState<StageResult[]>(initial?.stageResults ?? []);
  const [finished, setFinished] = useState(initial?.finished ?? false);
  const [showHelp, setShowHelp] = useState(false);

  // Per-stage state
  const stage = stages[stageIdx];
  const deck = useMemo(() => stage ? buildStageDeck(stage, day.index + stageIdx * 17) : [], [stage, day.index, stageIdx]);
  const [deckPos, setDeckPos] = useState(1);     // index of bottom card; top is `keeper`
  const [keeper, setKeeper] = useState<MoreLessItem | null>(deck[0] ?? null);
  const [bottom, setBottom] = useState<MoreLessItem | null>(deck[1] ?? null);
  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState<'guess' | 'reveal' | 'next' | 'stage-end'>('guess');
  const [pickedSide, setPickedSide] = useState<null | 'top' | 'bottom'>(null);
  const [stageOver, setStageOver] = useState(false);

  // Reset board whenever we switch stages
  useEffect(() => {
    setKeeper(deck[0] ?? null);
    setBottom(deck[1] ?? null);
    setDeckPos(1);
    setStreak(0);
    setPhase('guess');
    setPickedSide(null);
    setStageOver(false);
  }, [stageIdx, deck]);

  useEffect(() => {
    saveState<SavedState>('more-less', day.key, { stageIdx, stageResults, finished });
  }, [stageIdx, stageResults, finished, day.key]);

  if (!stage || finished) return <FinishedView day={day} stageResults={stageResults} stages={stages} onHelp={() => setShowHelp(true)} showHelp={showHelp} setShowHelp={setShowHelp} />;

  const pick = (which: 'top' | 'bottom') => {
    if (phase !== 'guess' || !keeper || !bottom) return;
    const pickedItem = which === 'top' ? keeper : bottom;
    const otherItem  = which === 'top' ? bottom : keeper;
    const correct = pickedItem.value > otherItem.value || (pickedItem.value === otherItem.value); // ties favor player
    setPickedSide(which);
    setPhase('reveal');

    setTimeout(() => {
      if (correct) {
        sndWin();
        setStreak(s => s + 1);
        setPhase('next');
        setTimeout(() => {
          // Keep the card with the higher value; the loser is replaced with the next deck item.
          const winner = pickedItem.value >= otherItem.value ? pickedItem : otherItem;
          const nextPos = deckPos + 1;
          const nextItem = deck[nextPos];
          if (!nextItem) {
            endStage(true);
            return;
          }
          // The winner becomes the new keeper (always shown on top)
          setKeeper(winner);
          setBottom(nextItem);
          setDeckPos(nextPos);
          setPickedSide(null);
          setPhase('guess');
        }, 1400);
      } else {
        sndLose();
        setPhase('stage-end');
        setStageOver(true);
      }
    }, 1500);
  };

  const endStage = (completedFully: boolean) => {
    const result: StageResult = { stageId: stage.id, correct: streak + (completedFully ? 1 : 0), total: deck.length - 1 };
    const newResults = [...stageResults, result];
    setStageResults(newResults);
    advance(newResults);
  };

  const goNextStage = () => {
    sndBloop();
    const result: StageResult = { stageId: stage.id, correct: streak, total: deck.length - 1 };
    const newResults = [...stageResults, result];
    setStageResults(newResults);
    advance(newResults);
  };

  const advance = (newResults: StageResult[]) => {
    if (stageIdx + 1 >= stages.length) {
      setFinished(true);
      const totalCorrect = newResults.reduce((s, r) => s + r.correct, 0);
      recordResult('more-less', day.key, totalCorrect >= 8);
    } else {
      setStageIdx(stageIdx + 1);
    }
  };

  return (
    <div className="dd-games min-h-screen pb-24">
      <Header onHelp={() => setShowHelp(true)} title="HighLow" date={formatDate(day.date)} />

      {/* Stage progress dots */}
      <div className="flex justify-center gap-2 mt-3 mb-2">
        {stages.map((s, i) => {
          const r = stageResults[i];
          const cls = r ? 'bg-accent' : i === stageIdx ? 'bg-white' : 'bg-panel2';
          return <div key={s.id} className={`h-1.5 rounded-full transition-all ${cls}`} style={{ width: i === stageIdx ? 32 : 18 }} />;
        })}
      </div>
      <p className="text-center text-xs text-gray-400 uppercase tracking-wider mb-1">Stage {stageIdx + 1} of {stages.length}</p>
      <p className="text-center text-base sm:text-lg text-white font-semibold mb-4">Which {stage.question}?</p>

      <div className="flex justify-between items-center max-w-md mx-auto px-4 mb-3">
        <div className="text-xs text-gray-400">Streak: <span className="text-white font-bold">{streak}</span></div>
        <div className="text-xs text-gray-400">{stage.name}</div>
      </div>

      {/* Stacked cards */}
      <div className="max-w-md mx-auto px-4 space-y-3">
        {keeper && (
          <Card
            item={keeper}
            category={stage}
            // First round: keeper's value is hidden until reveal. After streak>0 the
            // keeper has already been revealed in a previous round, so keep it visible.
            reveal={streak > 0 || phase !== 'guess'}
            onPick={() => phase === 'guess' && streak === 0 ? pick('top') : undefined}
            disabled={phase !== 'guess' || streak > 0}
            side="top"
            highlight={phase === 'reveal' || phase === 'next' || phase === 'stage-end' ? (pickedSide === 'top' ? (bottom && (keeper.value >= bottom.value) ? 'win' : 'lose') : (bottom && (keeper.value > bottom.value) ? 'win' : null)) : null}
          />
        )}
        <div className="text-center text-xs uppercase tracking-widest text-gray-500 font-bold">vs</div>
        {bottom && (
          <Card
            item={bottom}
            category={stage}
            reveal={phase !== 'guess'}
            onPick={() => pick('bottom')}
            disabled={phase !== 'guess'}
            side="bottom"
            highlight={phase !== 'guess' ? (pickedSide === 'bottom' ? (keeper && bottom.value >= keeper.value ? 'win' : 'lose') : (keeper && bottom.value > keeper.value ? 'win' : null)) : null}
          />
        )}

        {phase === 'guess' && (
          <p className="text-center text-xs text-gray-500 pt-1">
            {streak === 0 ? 'Tap the card you think is higher' : 'Is the bottom card higher than the top?'}
          </p>
        )}

        {phase === 'guess' && streak > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={() => pick('bottom')} className="bg-accent hover:bg-accentDark text-white font-bold rounded-xl py-3 active:scale-[0.99]">Higher ↑</button>
            <button onClick={() => pick('top')}    className="bg-panel2 hover:bg-panel3 text-white font-bold rounded-xl py-3 active:scale-[0.99]">Lower ↓</button>
          </div>
        )}

        {phase === 'stage-end' && (
          <div className="bg-panel border border-line/50 rounded-xl p-5 text-center animate-fade-up">
            <p className="text-bad font-bold text-lg mb-1">End of round</p>
            <p className="text-sm text-gray-400 mb-4">You made {streak} correct guess{streak === 1 ? '' : 'es'} in {stage.name}.</p>
            <button onClick={goNextStage} className="w-full bg-accent hover:bg-accentDark text-white font-bold rounded-xl py-3 active:scale-[0.99]">
              {stageIdx + 1 >= stages.length ? 'See Final Results' : 'Next Category →'}
            </button>
          </div>
        )}
      </div>

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} title="How to Play"><HelpBody /></HelpModal>
    </div>
  );
};

const FinishedView: React.FC<{
  day: ReturnType<typeof getPuzzleDay>;
  stageResults: StageResult[];
  stages: MoreLessCategory[];
  onHelp: () => void;
  showHelp: boolean;
  setShowHelp: (b: boolean) => void;
}> = ({ day, stageResults, stages, onHelp, showHelp, setShowHelp }) => {
  const stats = loadStats('more-less');
  const totalCorrect = stageResults.reduce((s, r) => s + r.correct, 0);
  const totalPossible = stageResults.reduce((s, r) => s + r.total, 0);
  const grid = stageResults.map(r => r.correct >= 5 ? '🟩' : r.correct >= 3 ? '🟨' : '🟥').join('');
  const shareText = `HighLow · ${day.key} · ${totalCorrect}\n${grid}\nhttps://datadripco.com/puzzles/more-less/`;
  return (
    <div className="dd-games min-h-screen pb-10">
      <Header onHelp={onHelp} title="HighLow" date={formatDate(day.date)} />
      <div className="max-w-md mx-auto px-4 mt-4">
        <h2 className="text-2xl font-bold text-white text-center mb-1">Final Score</h2>
        <p className="text-center text-5xl font-extrabold text-accent tabular-nums mb-1">{totalCorrect}</p>
        <p className="text-center text-xs text-gray-500 mb-5">correct guesses across {stageResults.length} categories</p>
        <div className="space-y-2 mb-6">
          {stageResults.map((r, i) => {
            const stage = stages.find(s => s.id === r.stageId)!;
            return (
              <div key={i} className="bg-panel rounded-xl px-4 py-3 flex items-center justify-between border border-line/40">
                <div>
                  <p className="text-white font-semibold text-sm">{stage?.name}</p>
                  <p className="text-[11px] text-gray-500">{stage?.question}</p>
                </div>
                <div className="text-right">
                  <p className="text-accent font-bold tabular-nums">{r.correct}</p>
                  <p className="text-[10px] text-gray-500 uppercase">streak</p>
                </div>
              </div>
            );
          })}
        </div>
        <ResultsScreen
          won={totalCorrect >= 8}
          title={totalCorrect >= 12 ? 'Incredible!' : totalCorrect >= 8 ? 'Nice run' : 'Better tomorrow'}
          stats={[
            { value: totalCorrect, label: 'Today' },
            { value: stats.played, label: 'Played' },
            { value: stats.streak, label: 'Streak' },
            { value: stats.bestStreak, label: 'Best' },
          ]}
          shareText={shareText}
        />
      </div>
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} title="How to Play"><HelpBody /></HelpModal>
    </div>
  );
};

const Header: React.FC<{ onHelp: () => void; title: string; date: string }> = ({ onHelp, title, date }) => (
  <>
    <div className="w-full max-w-3xl mx-auto px-4 pt-4 flex items-start justify-between">
      <IconBtn onClick={onHelp} ariaLabel="How to play">?</IconBtn>
      <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tighter text-white text-center flex-1">{title}</h1>
      <div className="w-10" />
    </div>
    <p className="text-center text-xs text-gray-500 mt-1">Daily · {date}</p>
  </>
);

const HelpBody: React.FC = () => (
  <>
    <p className="text-center text-gray-300 mb-4">Pick which one has the higher number.</p>
    <ul className="space-y-3">
      <li className="flex items-center gap-3"><span className="w-9 h-9 rounded bg-accent flex items-center justify-center text-white font-bold">✓</span><span>Right? Keep going — winner stays.</span></li>
      <li className="flex items-center gap-3"><span className="w-9 h-9 rounded bg-bad flex items-center justify-center text-white font-bold">✗</span><span>Wrong? Move on to the next category.</span></li>
      <li className="flex items-center gap-3"><span className="w-9 h-9 rounded bg-panel2 flex items-center justify-center text-white">📊</span><span>4 categories per day · build the longest streak.</span></li>
    </ul>
    <p className="text-center text-xs text-gray-500 mt-5">YouTube · Spotify · Movies · Companies</p>
  </>
);
