import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { ResultsScreen } from '../components/ResultsScreen';
import { DailyRankCard } from '../components/DailyRankCard';
import { computeDailyRank } from '../lib/dailyRank';
import { HelpModal, IconBtn } from '../components/HelpModal';
import { CATEGORIES, MoreLessItem, MoreLessCategory } from './data/moreless-data';
import { fetchEntityImage, getCachedImage } from '../lib/images';
import { sndWin, sndLose, sndCount, sndBloop, sndPop } from '../lib/sound';

// Four stages — fixed daily order; items inside shuffled per day.
const STAGE_IDS = ['google', 'spotify', 'movies', 'random'] as const;
const STAGE_LABELS: Record<string, string> = {
  google: 'Google Searches',
  spotify: 'Spotify Streams',
  movies: 'Box Office',
  random: 'Random',
};

interface StageResult { stageId: string; correct: number; }
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

// Build a deck of pairs that always have distinct values, no repeats within stage.
function buildStageDeck(category: MoreLessCategory, dayIndex: number): MoreLessItem[] {
  const rand = mulberry32(dayIndex * 0x85ebca6b ^ category.id.length * 0xc2b2ae35);
  // Filter unique values
  const seen = new Set<number>();
  const dedup = category.items.filter(it => { if (seen.has(it.value)) return false; seen.add(it.value); return true; });
  return shuffle(dedup, rand);
}

// Format full integer with thousands commas (no abbreviations)
function formatFull(n: number, fmt: MoreLessCategory['format']) {
  if (fmt === 'decimal') return n.toFixed(1);
  return Math.round(n).toLocaleString('en-US');
}

// ─── Counter rollup hook ─────────────────────
function useRollup(target: number, active: boolean, fmt: MoreLessCategory['format']) {
  const [text, setText] = useState('0');
  useEffect(() => {
    if (!active) { setText('0'); return; }
    const dur = 1500;
    const start = performance.now();
    let raf = 0;
    let lastTick = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = eased * target;
      setText(formatFull(cur, fmt));
      if (now - lastTick > 60 && t < 1) { sndCount(); lastTick = now; }
      if (t < 1) raf = requestAnimationFrame(tick);
      else setText(formatFull(target, fmt));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, fmt]);
  return text;
}

// ─── Card ────────────────────────────────────
type RevealKind = null | 'self' | 'other';
const Card: React.FC<{
  item: MoreLessItem;
  category: MoreLessCategory;
  reveal: boolean;
  rollupActive: boolean;
  outcome: 'win' | 'lose' | null;
  onPick?: () => void;
  disabled?: boolean;
  enterAnim?: 'right' | 'left' | null;
  exitAnim?: 'left' | 'right' | null;
  slideToLeft?: boolean;
}> = ({ item, category, reveal, rollupActive, outcome, onPick, disabled, enterAnim, exitAnim, slideToLeft }) => {
  const [imgUrl, setImgUrl] = useState<string | null | undefined>(() => getCachedImage(item.name));
  useEffect(() => {
    let alive = true;
    if (imgUrl === undefined || imgUrl === null) {
      fetchEntityImage(item.name, item.wiki).then(u => { if (alive) setImgUrl(u); });
    }
    return () => { alive = false; };
  }, [item.name, item.wiki]);

  const text = useRollup(item.value, rollupActive, category.format);

  const ringCls =
    outcome === 'win'  ? 'hl-card--win'  :
    outcome === 'lose' ? 'hl-card--lose' : '';
  const enterCls = enterAnim === 'right' ? 'hl-card--enter-right' : enterAnim === 'left' ? 'hl-card--enter-left' : '';
  const exitCls  = exitAnim === 'left' ? 'hl-card--exit-left' : exitAnim === 'right' ? 'hl-card--exit-right' : '';
  const slideCls = slideToLeft ? 'hl-card--slide-to-left' : '';

  return (
    <button
      onClick={() => !disabled && onPick && onPick()}
      disabled={disabled}
      className={`hl-card ${ringCls} ${enterCls} ${exitCls} ${slideCls} ${!disabled && onPick ? 'hl-card--clickable' : ''}`}
    >
      <div className="hl-card-img">
        {imgUrl
          ? <img src={imgUrl} alt={item.name} loading="lazy" />
          : <span className="hl-card-emoji">{item.image || '❓'}</span>}
        {outcome && (
          <span className={`hl-badge animate-check-pop ${outcome === 'win' ? 'hl-badge--win' : 'hl-badge--lose'}`}>
            {outcome === 'win' ? '✓' : '✗'}
          </span>
        )}
      </div>
      <div className="hl-card-name">"{item.name}"</div>
      <div className={`hl-card-num ${reveal ? 'hl-card-num--show' : ''}`}>
        {reveal ? text : '?'}
      </div>
    </button>
  );
};

// ─── Game ────────────────────────────────────
export const MoreLess: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const stages = useMemo(() => STAGE_IDS.map(id => CATEGORIES.find(c => c.id === id)!).filter(Boolean), []);

  const initial = loadState<SavedState>('more-less', day.key);
  const [stageIdx, setStageIdx] = useState(initial?.stageIdx ?? 0);
  const [stageResults, setStageResults] = useState<StageResult[]>(initial?.stageResults ?? []);
  const [finished, setFinished] = useState(initial?.finished ?? false);
  const [showHelp, setShowHelp] = useState(false);

  const stage = stages[stageIdx];
  const deck = useMemo(() => stage ? buildStageDeck(stage, day.index + stageIdx * 17) : [], [stage, day.index, stageIdx]);

  const [deckPos, setDeckPos] = useState(2);              // index of NEXT contender to bring in
  const [leftItem, setLeftItem]   = useState<MoreLessItem | null>(deck[0] ?? null);
  const [rightItem, setRightItem] = useState<MoreLessItem | null>(deck[1] ?? null);
  const [streak, setStreak] = useState(0);
  // phase:
  //  guess     – user choosing
  //  reveal-pick – picked card's number rolling up
  //  reveal-other – the other card's number rolling up
  //  outcome   – show ✓/✗ (correct goes to advancing; wrong goes to stage-end)
  //  advancing – sliding to next pair
  //  stage-end – modal/CTA to next stage
  const [phase, setPhase] = useState<'guess' | 'reveal-pick' | 'reveal-other' | 'outcome' | 'advancing' | 'stage-end'>('guess');
  const [pickedSide, setPickedSide] = useState<null | 'left' | 'right'>(null);
  const [enterAnim, setEnterAnim] = useState<'right' | null>(null);
  const [leftExit, setLeftExit] = useState<'left' | null>(null);
  const [rightExit, setRightExit] = useState<'right' | null>(null);
  const [rightSlideToLeft, setRightSlideToLeft] = useState(false);
  const [stageStart, setStageStart] = useState(false);

  // First card always shows '?' until first pick. After first round, the surviving "left" card
  // already had its number revealed in the previous round, so leave it visible.
  const [leftRevealed, setLeftRevealed] = useState(false);
  const [rightRevealed, setRightRevealed] = useState(false);
  const [leftRollup, setLeftRollup]   = useState(false);
  const [rightRollup, setRightRollup] = useState(false);

  // Reset on stage switch
  useEffect(() => {
    setLeftItem(deck[0] ?? null);
    setRightItem(deck[1] ?? null);
    setDeckPos(2);
    setStreak(0);
    setPhase('guess');
    setPickedSide(null);
    setLeftRevealed(false);
    setRightRevealed(false);
    setLeftRollup(false);
    setRightRollup(false);
    setEnterAnim(null);
    setStageStart(s => !s);
  }, [stageIdx, deck]);

  useEffect(() => {
    saveState<SavedState>('more-less', day.key, { stageIdx, stageResults, finished });
  }, [stageIdx, stageResults, finished, day.key]);

  if (!stage || finished) {
    return <FinishedView day={day} stageResults={stageResults} stages={stages} onHelp={() => setShowHelp(true)} showHelp={showHelp} setShowHelp={setShowHelp} />;
  }

  // Determine question's "MORE/LESS" wording (always MORE for our game)
  const questionText = (() => {
    // category.question has shape "has MORE monthly Google searches"
    const parts = stage.question.split(/(MORE|LESS)/i);
    return parts;
  })();

  const pick = (which: 'left' | 'right') => {
    if (phase !== 'guess' || !leftItem || !rightItem) return;
    setPickedSide(which);

    // 1) Reveal picked card's number first
    setPhase('reveal-pick');
    if (which === 'left')  { setLeftRevealed(true);  setLeftRollup(true); }
    else                   { setRightRevealed(true); setRightRollup(true); }

    // 2) After a beat, reveal the other card's number
    setTimeout(() => {
      setPhase('reveal-other');
      if (which === 'left') { setRightRevealed(true); setRightRollup(true); }
      else                  { setLeftRevealed(true);  setLeftRollup(true); }
    }, 1700);

    // 3) Determine outcome and react
    setTimeout(() => {
      const pickedItem = which === 'left' ? leftItem : rightItem;
      const otherItem  = which === 'left' ? rightItem : leftItem;
      const correct = pickedItem.value >= otherItem.value;
      setPhase('outcome');
      if (correct) {
        sndPop(); sndWin();
        setStreak(s => s + 1);
        // 4) After a beat, advance: winner slides left, new contender slides in right
        setTimeout(() => advancePair(which, pickedItem, otherItem), 1300);
      } else {
        sndLose();
        // Stage ends
        setTimeout(() => {
          const result: StageResult = { stageId: stage.id, correct: streak };
          const newResults = [...stageResults, result];
          setStageResults(newResults);
          setPhase('stage-end');
        }, 1500);
      }
    }, 3500);
  };

  const advancePair = (winnerSide: 'left' | 'right', winnerItem: MoreLessItem, _loserItem: MoreLessItem) => {
    const nextItem = deck[deckPos];
    if (!nextItem) {
      // Deck exhausted — finish stage successfully
      const result: StageResult = { stageId: stage.id, correct: streak + 1 };
      const newResults = [...stageResults, result];
      setStageResults(newResults);
      setPhase('stage-end');
      return;
    }
    setPhase('advancing');
    // Animation: the WINNER always ends up on the left.
    //  - If right won: left card exits left, right card slides into left position.
    //  - If left  won: right card exits right, new contender enters from right.
    if (winnerSide === 'right') {
      setLeftExit('left');
      setRightSlideToLeft(true);
      setTimeout(() => {
        setLeftItem(winnerItem);
        setLeftRevealed(true);
        setLeftRollup(false);
        setRightItem(nextItem);
        setRightRevealed(false);
        setRightRollup(false);
        setLeftExit(null);
        setRightSlideToLeft(false);
        setEnterAnim('right');
        setDeckPos(p => p + 1);
        setPickedSide(null);
        setPhase('guess');
        setTimeout(() => setEnterAnim(null), 500);
      }, 500);
    } else {
      setRightExit('right');
      setTimeout(() => {
        setLeftItem(winnerItem);
        setLeftRevealed(true);
        setLeftRollup(false);
        setRightItem(nextItem);
        setRightRevealed(false);
        setRightRollup(false);
        setRightExit(null);
        setEnterAnim('right');
        setDeckPos(p => p + 1);
        setPickedSide(null);
        setPhase('guess');
        setTimeout(() => setEnterAnim(null), 500);
      }, 350);
    }
  };

  const goNextStage = () => {
    sndBloop();
    if (stageIdx + 1 >= stages.length) {
      setFinished(true);
      const totalCorrect = stageResults.reduce((s, r) => s + r.correct, 0);
      recordResult('more-less', day.key, totalCorrect >= 8);
    } else {
      setStageIdx(stageIdx + 1);
    }
  };

  const stageOver = phase === 'stage-end';

  return (
    <div className="dd-games hl-screen">
      <Header onHelp={() => setShowHelp(true)} title="HighLow" date={formatDate(day.date)} />

      {/* Tabs */}
      <nav className="hl-tabs" aria-label="Stages">
        {stages.map((s, i) => {
          const r = stageResults[i];
          const isActive = i === stageIdx;
          const isDone = !!r;
          return (
            <div key={s.id} className={`hl-tab ${isActive ? 'hl-tab--active' : ''} ${isDone ? 'hl-tab--done' : ''}`}>
              {STAGE_LABELS[s.id]}
              {isDone && <span className="hl-tab-score">{r.correct}</span>}
            </div>
          );
        })}
      </nav>

      {/* Stage badge + question */}
      <div className="hl-question">
        <div className="hl-stage-badge">{stageIdx + 1}</div>
        <h2 className="hl-question-text">
          Which {questionText.map((p, i) =>
            /^MORE$/i.test(p) ? <span key={i} className="hl-q-more">MORE</span> :
            /^LESS$/i.test(p) ? <span key={i} className="hl-q-less">LESS</span> :
            <span key={i}>{p}</span>
          )}?
        </h2>
      </div>

      <div className="hl-streak">Streak: <strong>{streak}</strong></div>

      {/* Cards side-by-side */}
      <div key={`stage-${stageIdx}-${stageStart}`} className="hl-cards">
        {leftItem && (
          <Card
            item={leftItem}
            category={stage}
            reveal={leftRevealed}
            rollupActive={leftRollup}
            outcome={
              phase === 'outcome' || phase === 'advancing' || phase === 'stage-end'
                ? (pickedSide === 'left'
                    ? (leftItem && rightItem && leftItem.value >= rightItem.value ? 'win' : 'lose')
                    : (leftItem && rightItem && leftItem.value > rightItem.value  ? 'win' : null))
                : null
            }
            onPick={() => pick('left')}
            disabled={phase !== 'guess'}
            enterAnim={null}
            exitAnim={leftExit}
          />
        )}
        {rightItem && (
          <Card
            item={rightItem}
            category={stage}
            reveal={rightRevealed}
            rollupActive={rightRollup}
            outcome={
              phase === 'outcome' || phase === 'advancing' || phase === 'stage-end'
                ? (pickedSide === 'right'
                    ? (leftItem && rightItem && rightItem.value >= leftItem.value ? 'win' : 'lose')
                    : (leftItem && rightItem && rightItem.value > leftItem.value  ? 'win' : null))
                : null
            }
            onPick={() => pick('right')}
            disabled={phase !== 'guess'}
            enterAnim={enterAnim}
            exitAnim={rightExit}
            slideToLeft={rightSlideToLeft}
          />
        )}
      </div>

      {stageOver && (
        <div className="hl-stage-end animate-fade-up">
          <p className="hl-stage-end-title">{streak} correct in {STAGE_LABELS[stage.id]}</p>
          <button onClick={goNextStage} className="hl-next-btn">
            {stageIdx + 1 >= stages.length ? 'See Final Results →' : `Next: ${STAGE_LABELS[stages[stageIdx + 1].id]} →`}
          </button>
        </div>
      )}

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} title="How to Play"><HelpBody /></HelpModal>
      <style>{hlInlineCSS}</style>
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
  const grid = stageResults.map(r => r.correct >= 5 ? '🟩' : r.correct >= 3 ? '🟨' : '🟥').join('');
  const shareText = `HighLow · ${day.key} · ${totalCorrect}\n${grid}\nhttps://datadripco.com/puzzles/more-less/`;
  return (
    <div className="dd-games hl-screen">
      <Header onHelp={onHelp} title="HighLow" date={formatDate(day.date)} />
      <div className="hl-finished">
        <h2 className="hl-fin-title">Final Score</h2>
        <p className="hl-fin-score">{totalCorrect}</p>
        <p className="hl-fin-sub">correct guesses across {stageResults.length} categories</p>
        <div className="hl-fin-grid">
          {stageResults.map((r, i) => {
            const stage = stages.find(s => s.id === r.stageId)!;
            return (
              <div key={i} className="hl-fin-row">
                <span>{STAGE_LABELS[stage?.id || '']}</span>
                <strong>{r.correct}</strong>
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
          extras={<DailyRankCard rank={computeDailyRank('more-less', day.index, totalCorrect, { higherIsBetter: true, mean: 8, stdev: 4 })} metric="by streak total" />}
        />
      </div>
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} title="How to Play"><HelpBody /></HelpModal>
      <style>{hlInlineCSS}</style>
    </div>
  );
};

const Header: React.FC<{ onHelp: () => void; title: string; date: string }> = ({ onHelp, title, date }) => (
  <div className="hl-header">
    <IconBtn onClick={onHelp} ariaLabel="How to play">?</IconBtn>
    <div className="hl-header-mid">
      <h1>{title}</h1>
      <p>Daily · {date}</p>
    </div>
    <div style={{ width: 40 }} />
  </div>
);

const HelpBody: React.FC = () => {
  const [page, setPage] = useState<1 | 2>(1);
  return (
    <div>
      {page === 1 ? (
        <>
          <p className="text-center text-gray-300 mb-5">Pick the card with the higher value.</p>
          <ul className="space-y-3">
            <li className="flex items-center gap-3"><span className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-white font-bold">✓</span><span>Right? Winner stays. New challenger slides in.</span></li>
            <li className="flex items-center gap-3"><span className="w-9 h-9 rounded-md bg-bad flex items-center justify-center text-white font-bold">✗</span><span>Wrong? Move on to the next category.</span></li>
            <li className="flex items-center gap-3"><span className="w-9 h-9 rounded-md bg-panel2 flex items-center justify-center text-white">📊</span><span>4 categories · build the longest streak.</span></li>
          </ul>
        </>
      ) : (
        <>
          <p className="text-center text-gray-300 mb-4">Today's categories</p>
          <ul className="space-y-3">
            <li className="flex items-center gap-3"><span className="text-accent font-bold w-7">1</span><span>Google Searches — monthly U.S. search volume</span></li>
            <li className="flex items-center gap-3"><span className="text-accent font-bold w-7">2</span><span>Spotify Streams — total artist streams</span></li>
            <li className="flex items-center gap-3"><span className="text-accent font-bold w-7">3</span><span>Box Office — worldwide gross</span></li>
            <li className="flex items-center gap-3"><span className="text-accent font-bold w-7">4</span><span>Random — Wikipedia popularity</span></li>
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

// ─── Inline scoped CSS ─────────────────────────
const hlInlineCSS = `
.hl-screen { min-height: 100vh; padding-bottom: 40px; background: #1e2021; }
.hl-header { display: flex; align-items: center; padding: 14px 14px 6px; }
.hl-header-mid { flex: 1; text-align: center; }
.hl-header-mid h1 { font-size: clamp(2rem, 6vw, 3rem); font-weight: 900; letter-spacing: -.04em; margin: 0; color: #fff; line-height: 1; }
.hl-header-mid p  { font-size: 11px; color: #777; margin: 4px 0 0; letter-spacing: .04em; }

.hl-tabs {
  display: flex; gap: 4px; padding: 6px; margin: 12px auto 0; max-width: 720px;
  background: #27282a; border-radius: 14px; border: 1px solid rgba(255,255,255,0.05);
}
.hl-tab {
  flex: 1; padding: 10px 8px; text-align: center; border-radius: 10px;
  font-size: 12px; color: #8a8e92; font-weight: 600; letter-spacing: .01em;
  position: relative;
}
@media (min-width: 640px) { .hl-tab { font-size: 13px; } }
.hl-tab--active { background: #1e2021; color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.hl-tab--done { color: #cfd2d4; }
.hl-tab-score { position: absolute; top: 2px; right: 6px; background: #55B725; color: #fff; font-size: 9px; padding: 1px 5px; border-radius: 8px; }

.hl-question { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 24px 16px 6px; max-width: 720px; margin: 0 auto; }
.hl-stage-badge {
  width: 52px; height: 52px; border-radius: 50%; background: #fff; color: #1e2021;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 900; flex-shrink: 0;
}
.hl-question-text {
  font-size: clamp(1.2rem, 3.5vw, 1.6rem); font-weight: 800; color: #fff;
  letter-spacing: -.02em; line-height: 1.15; margin: 0;
}
.hl-q-more { color: #55B725; }
.hl-q-less { color: #C62121; }

.hl-streak { text-align: center; font-size: 12px; color: #8a8e92; padding: 4px 0 14px; letter-spacing: .04em; }
.hl-streak strong { color: #fff; font-weight: 800; margin-left: 4px; }

.hl-cards {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
  padding: 0 14px; max-width: 720px; margin: 0 auto;
}

.hl-card {
  display: flex; flex-direction: column; background: #27282a;
  border: 2px solid rgba(255,255,255,0.04); border-radius: 14px; overflow: hidden;
  text-align: center; padding: 0; transition: transform .2s ease, border-color .2s ease, box-shadow .25s ease;
}
.hl-card--clickable:hover { transform: translateY(-3px); border-color: #55B725; box-shadow: 0 14px 30px rgba(0,0,0,0.35); cursor: pointer; }
.hl-card--clickable:active { transform: scale(.98); }
.hl-card--win  { border-color: #55B725; box-shadow: 0 0 0 3px rgba(85,183,37,0.4), 0 12px 30px rgba(85,183,37,0.25); }
.hl-card--lose { border-color: #C62121; box-shadow: 0 0 0 3px rgba(198,33,33,0.35), 0 12px 30px rgba(198,33,33,0.2); opacity: .85; }

.hl-card--enter-right { animation: hlEnterRight 480ms cubic-bezier(.34,1.4,.64,1) both; }
@keyframes hlEnterRight { 0% { transform: translateX(110%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
.hl-card--enter-left { animation: hlEnterLeft 480ms cubic-bezier(.34,1.4,.64,1) both; }
@keyframes hlEnterLeft { 0% { transform: translateX(-110%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
.hl-card--exit-left  { animation: hlExitLeft  460ms cubic-bezier(.4,0,.7,.4) both; }
@keyframes hlExitLeft  { 0% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(-115%); opacity: 0; } }
.hl-card--exit-right { animation: hlExitRight 380ms cubic-bezier(.4,0,.7,.4) both; }
@keyframes hlExitRight { 0% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(115%); opacity: 0; } }
.hl-card--slide-to-left { animation: hlSlideToLeft 480ms cubic-bezier(.34,1.2,.64,1) both; z-index: 2; }
@keyframes hlSlideToLeft { 0% { transform: translateX(0); } 100% { transform: translateX(calc(-100% - 14px)); } }

.hl-card-img {
  position: relative; aspect-ratio: 1/1; width: 100%;
  background: #1e2021; display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.hl-card-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hl-card-emoji { font-size: 4rem; }

.hl-badge {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 64px; height: 64px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 36px; font-weight: 900; color: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.hl-badge--win  { background: #55B725; }
.hl-badge--lose { background: #C62121; }

.hl-card-name {
  padding: 14px 10px 6px; color: #fff; font-size: clamp(1rem, 2.5vw, 1.2rem); font-weight: 700; letter-spacing: -.01em;
  border-top: 1px solid rgba(255,255,255,0.04);
}
.hl-card-num {
  padding: 6px 10px 18px; color: #fff;
  font-size: clamp(1.3rem, 3.5vw, 1.9rem);
  font-weight: 900; letter-spacing: -.02em; font-variant-numeric: tabular-nums;
  min-height: 2.4em;
}
.hl-card-num--show { color: #fff; }

.hl-stage-end {
  max-width: 480px; margin: 24px auto 0; padding: 0 16px;
}
.hl-stage-end-title { text-align: center; color: #cfd2d4; font-size: 1rem; margin: 0 0 12px; }
.hl-next-btn {
  width: 100%; background: #55B725; color: #fff; font-weight: 800; padding: 14px 18px;
  border-radius: 12px; font-size: 1rem; transition: transform .1s ease, background .15s ease;
}
.hl-next-btn:hover { background: #4a9e1f; }
.hl-next-btn:active { transform: scale(.99); }

.hl-finished { max-width: 480px; margin: 16px auto 0; padding: 0 16px; }
.hl-fin-title { text-align: center; color: #fff; font-size: 1.5rem; font-weight: 800; margin: 8px 0 4px; }
.hl-fin-score { text-align: center; color: #55B725; font-size: 4rem; font-weight: 900; margin: 0; line-height: 1; font-variant-numeric: tabular-nums; }
.hl-fin-sub   { text-align: center; color: #777; font-size: 12px; margin: 4px 0 18px; }
.hl-fin-grid  { display: flex; flex-direction: column; gap: 6px; margin: 0 0 18px; }
.hl-fin-row   { display: flex; justify-content: space-between; padding: 12px 14px; background: #27282a; border-radius: 10px; color: #cfd2d4; font-size: 13px; }
.hl-fin-row strong { color: #55B725; font-weight: 800; font-variant-numeric: tabular-nums; }
`;
