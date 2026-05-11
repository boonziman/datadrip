import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { ResultsScreen } from '../components/ResultsScreen';
import { Toast } from '../components/Toast';
import { HelpModal, IconBtn } from '../components/HelpModal';
import { SPELLING_BANK, SpellingRound } from './data/spelling-bank';
import { sndType, sndDelete, sndReveal, sndWin, sndLose, sndError, sndBloop } from '../lib/sound';

interface RoundResult {
  word: string;
  userAnswer: string;
  correct: boolean;
  revealed?: boolean;
}
interface SavedState {
  roundIndex: number;
  results: RoundResult[];
  finished: boolean;
}

const ROUNDS_PER_DAY = 5;
const REVEAL_STAGGER = 200;

function pickDailyWords(dayIndex: number) {
  const rand = mulberry32(dayIndex * 2654435761 ^ 0x9e3779b9);
  const out: typeof SPELLING_BANK = [];
  for (let d = 1; d <= ROUNDS_PER_DAY; d++) {
    const pool = SPELLING_BANK.filter(w => w.difficulty === d);
    out.push(pool[Math.floor(rand() * pool.length)]);
  }
  return out;
}

async function fetchWordData(word: string): Promise<Partial<SpellingRound>> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return {};
    const data = await res.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry) return {};
    const phonetic = entry.phonetics?.find((p: any) => p.audio)?.audio;
    const audioUrl = phonetic ? (phonetic.startsWith('//') ? 'https:' + phonetic : phonetic) : undefined;
    const meaning = entry.meanings?.[0];
    const def = meaning?.definitions?.[0];
    return {
      audioUrl,
      definition: def?.definition,
      example: def?.example,
      partOfSpeech: meaning?.partOfSpeech,
    };
  } catch { return {}; }
}

// Single fixed voice for consistency. Pick once and reuse.
let cachedVoice: SpeechSynthesisVoice | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Prefer high-quality en-US neural voices that exist on most platforms.
  const preferred = [
    'Google US English', 'Samantha', 'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)', 'Karen', 'Daniel',
    'Alex',
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { cachedVoice = v; return v; }
  }
  cachedVoice = voices.find(v => v.lang === 'en-US') || voices[0];
  return cachedVoice;
}

function speak(text: string, rate = 0.85) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.pitch = 1.0;
  u.lang = 'en-US';
  const v = pickVoice();
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

export const SpellingBee: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const dailyWords = useMemo(() => pickDailyWords(day.index), [day.index]);

  const initial = loadState<SavedState>('spelling-bee', day.key);
  const [roundIndex, setRoundIndex] = useState(initial?.roundIndex ?? 0);
  const [results, setResults] = useState<RoundResult[]>(initial?.results ?? []);
  const [finished, setFinished] = useState(initial?.finished ?? false);
  const [meta, setMeta] = useState<Partial<SpellingRound>>({});
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'typing' | 'checking' | 'correct' | 'wrong'>('typing');
  const [toast, setToast] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showHelpers, setShowHelpers] = useState<{ definition: boolean; example: boolean }>({ definition: false, example: false });
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = dailyWords[roundIndex];

  // Preload voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const trigger = () => pickVoice();
    trigger();
    window.speechSynthesis.onvoiceschanged = trigger;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Fetch metadata for current word but DO NOT auto-play (user must click).
  useEffect(() => {
    if (!currentWord || finished) return;
    setLoading(true);
    setShowHelpers({ definition: false, example: false });
    setInput('');
    setPhase('typing');
    fetchWordData(currentWord.word).then(m => { setMeta(m); setLoading(false); });
  }, [roundIndex, finished, currentWord]);

  useEffect(() => {
    saveState<SavedState>('spelling-bee', day.key, { roundIndex, results, finished });
  }, [roundIndex, results, finished, day.key]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 1700);
    return () => clearTimeout(id);
  }, [toast]);

  const playWord = () => {
    sndBloop();
    if (meta.audioUrl) {
      try { new Audio(meta.audioUrl).play().catch(() => speak(currentWord.word, 0.78)); }
      catch { speak(currentWord.word, 0.78); }
    } else {
      speak(currentWord.word, 0.78);
    }
  };

  const playExample = () => {
    if (meta.example) {
      const masked = meta.example.replace(new RegExp(`\\b${currentWord.word}\\b`, 'gi'), 'blank');
      speak(masked, 0.95);
    }
  };
  const playDefinition = () => {
    if (meta.definition) speak(meta.definition.replace(new RegExp(`\\b${currentWord.word}\\b`, 'gi'), 'blank'), 0.95);
  };

  const finishRound = (result: RoundResult) => {
    const newResults = [...results, result];
    setResults(newResults);
    setTimeout(() => {
      if (roundIndex + 1 >= ROUNDS_PER_DAY) {
        setFinished(true);
        recordResult('spelling-bee', day.key, newResults.filter(r => r.correct).length >= 3);
      } else {
        setRoundIndex(r => r + 1);
      }
    }, 900);
  };

  const submit = () => {
    if (!input.trim() || phase !== 'typing') return;
    const guess = input.trim().toLowerCase();
    const target = currentWord.word.toLowerCase();
    setPhase('checking');
    // Animated reveal: stagger over the longer of the two strings
    const len = Math.max(guess.length, target.length);
    for (let i = 0; i < len; i++) setTimeout(() => sndReveal(), i * REVEAL_STAGGER);
    const total = len * REVEAL_STAGGER + 400;
    setTimeout(() => {
      const correct = guess === target;
      if (correct) { sndWin(); setPhase('correct'); finishRound({ word: target, userAnswer: guess, correct: true }); }
      else         { sndLose(); setPhase('wrong'); }
    }, total);
  };

  const tryAgain = () => { setInput(''); setPhase('typing'); setTimeout(() => inputRef.current?.focus(), 50); };
  const reveal   = () => { finishRound({ word: currentWord.word, userAnswer: input.trim().toLowerCase(), correct: false, revealed: true }); };

  const stats = loadStats('spelling-bee');
  const correctCount = results.filter(r => r.correct).length;

  if (finished) {
    const shareGrid = results.map(r => r.correct ? '🟩' : '🟥').join('');
    const shareText = `SpellIt · ${day.key} · ${correctCount}/${ROUNDS_PER_DAY}\n${shareGrid}\nhttps://datadripco.com/puzzles/spelling-bee/`;
    return (
      <div className="dd-games min-h-screen pb-10">
        <Header onHelp={() => setShowHelp(true)} title="SpellIt" date={formatDate(day.date)} />
        <div className="max-w-md mx-auto px-4 mt-2">
          <h2 className="text-2xl font-bold text-white text-center mb-1">Final Results</h2>
          <p className="text-center text-xs text-gray-500 mb-5">{formatDate(day.date)}</p>
          <div className="space-y-2 mb-6">
            {results.map((r, i) => (
              <div key={i} className="bg-panel rounded-xl px-3 py-3 flex items-center gap-3 border border-line/40">
                <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm ${r.correct ? 'bg-accent text-white' : 'bg-bad text-white'}`}>{i + 1}</div>
                <div className="flex-1">
                  {r.correct
                    ? <div className="text-white font-semibold">✓ {r.word}</div>
                    : <>
                        <div className="text-bad text-sm line-through">✗ {r.userAnswer || '—'}</div>
                        <div className="text-white font-semibold">✓ {r.word}</div>
                      </>
                  }
                </div>
              </div>
            ))}
          </div>
          <ResultsScreen
            won={correctCount >= 3}
            title={correctCount === 5 ? 'Perfect!' : correctCount >= 3 ? 'Nice work' : 'Keep practicing'}
            stats={[
              { value: `${correctCount}/5`, label: 'Today' },
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
  }

  // ── Per-letter result for animation ──
  const renderCheckedWord = () => {
    const guess = input.trim().toLowerCase();
    const target = currentWord.word.toLowerCase();
    const len = Math.max(guess.length, target.length);
    return (
      <div className="text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Checking your spelling…</p>
        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          {Array.from({ length: len }).map((_, i) => {
            const c = guess[i] || '';
            const matches = c === target[i];
            const cls = matches ? 'text-accent' : 'text-bad';
            return (
              <span
                key={i}
                className={`inline-block animate-bounce-letter ${cls}`}
                style={{ animationDelay: `${i * REVEAL_STAGGER}ms`, animationFillMode: 'both' }}
              >{c || '·'}</span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="dd-games min-h-screen pb-20">
      {toast && <Toast message={toast} />}
      <Header onHelp={() => setShowHelp(true)} title="SpellIt" date={formatDate(day.date)} />

      {/* Round dots */}
      <p className="text-center text-xs text-gray-400 mb-1 mt-2">Round</p>
      <div className="flex justify-center gap-2 mb-6">
        {dailyWords.map((_, i) => {
          const r = results[i];
          const cls = r ? (r.correct ? 'bg-accent text-white' : 'bg-bad text-white') : i === roundIndex ? 'bg-white text-black' : 'bg-panel2 text-gray-400';
          return (
            <div key={i} className={`relative w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold ${cls}`}>
              {r ? (r.correct ? '✓' : '✗') : i + 1}
              {i === roundIndex && !r && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-white" style={{ width: 0, height: 0 }} />}
            </div>
          );
        })}
      </div>

      {/* Speaker button */}
      <div className="flex justify-center mb-6">
        <button
          onClick={playWord}
          disabled={loading}
          className="w-24 h-24 sm:w-28 sm:h-28 bg-accent hover:bg-accentDark rounded-full flex items-center justify-center text-5xl active:scale-95 transition-transform shadow-xl shadow-accent/20 disabled:opacity-50 animate-glow"
          aria-label="Play word"
          style={{ animation: phase === 'typing' && !loading ? undefined : 'none' }}
        >
          {loading ? '⋯' : '🔊'}
        </button>
      </div>

      {/* Hint area: shows checking animation, definition, example, or prompt */}
      <div className="max-w-md mx-auto px-4 min-h-[140px] mb-4">
        {phase === 'checking' || phase === 'correct' || phase === 'wrong' ? renderCheckedWord() : (
          <>
            <p className="text-center text-gray-400 text-lg mb-3">Spell the word…</p>
            {showHelpers.definition && meta.definition && (
              <div className="bg-panel border border-line/40 rounded-xl p-4 mb-2 animate-fade-up">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">📖 Definition</p>
                <p className="text-gray-100 text-sm">A <span className="bg-panel3 px-2 py-0.5 rounded text-transparent">{currentWord.word}</span>{meta.definition.replace(new RegExp(`^.*?${currentWord.word}\\b`, 'i'), '').trim() || ' — ' + meta.definition}</p>
              </div>
            )}
            {showHelpers.example && meta.example && (
              <div className="bg-panel border border-line/40 rounded-xl p-4 mb-2 animate-fade-up">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">💬 Example</p>
                <p className="text-gray-100 italic text-sm">"{meta.example.replace(new RegExp(`\\b${currentWord.word}\\b`, 'gi'), '_____')}"</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input + helpers */}
      {phase === 'typing' && (
        <div className="max-w-md mx-auto px-4 space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={e => { sndType(); setInput(e.target.value); }}
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Backspace' && input) sndDelete();
              }}
              placeholder="Type your spelling…"
              className="w-full bg-panel border-2 border-line rounded-xl px-5 py-4 text-2xl text-center text-white focus:outline-none focus:border-accent placeholder:text-gray-500"
              autoComplete="off" autoCorrect="off" spellCheck={false} autoCapitalize="off"
            />
            {input.trim() && (
              <button
                onClick={submit}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent text-white rounded-lg px-3 py-2 text-sm font-bold animate-slide-in-r active:scale-95"
                aria-label="Check"
              >→</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setShowHelpers(h => ({ ...h, definition: true })); playDefinition(); }}
              className="bg-gray-200 hover:bg-white text-black font-semibold rounded-lg py-3 text-sm flex items-center justify-center gap-2 active:scale-95"
            ><span>🔊</span> Definition</button>
            <button
              onClick={() => { setShowHelpers(h => ({ ...h, example: true })); playExample(); }}
              className="bg-gray-200 hover:bg-white text-black font-semibold rounded-lg py-3 text-sm flex items-center justify-center gap-2 active:scale-95"
            ><span>🔊</span> Sentence</button>
          </div>
          <button
            onClick={submit}
            disabled={!input.trim()}
            className="w-full bg-accent hover:bg-accentDark text-white font-bold rounded-xl py-4 text-lg disabled:opacity-50 active:scale-[0.99]"
          >Check Spelling</button>
        </div>
      )}

      {phase === 'wrong' && (
        <div className="max-w-md mx-auto px-4 mt-4 animate-fade-up">
          <p className="text-center text-bad font-bold text-xl mb-3">INCORRECT</p>
          <button
            onClick={reveal}
            className="w-full bg-panel hover:bg-panel2 border border-line/50 rounded-xl py-3 text-white font-semibold mb-2 active:scale-[0.99]"
          >Reveal Answer</button>
          <button
            onClick={tryAgain}
            className="w-full text-gray-400 hover:text-white text-sm py-2 underline"
          >Keep trying</button>
        </div>
      )}
      {phase === 'correct' && (
        <p className="text-center text-accent font-bold text-xl mt-4 animate-fade-up">CORRECT</p>
      )}

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
    <p className="text-center text-gray-300 mb-4">Listen to the word. Spell it correctly.</p>
    <div className="flex justify-center gap-1.5 mb-4">
      {['A','P','P','L','E'].map((c, i) => (
        <div key={i} className={`w-10 h-10 rounded flex items-center justify-center font-extrabold text-white ${i < 3 ? 'bg-accent' : 'bg-panel2 border-2 border-panel3'}`}>{c}</div>
      ))}
    </div>
    <ul className="space-y-3">
      <li className="flex items-center gap-3"><span className="w-9 h-9 rounded-full bg-panel2 flex items-center justify-center">🔊</span><span>Click to listen</span></li>
      <li className="flex items-center gap-3"><span className="px-3 h-9 rounded bg-gray-200 text-black flex items-center text-sm font-semibold">Definition</span><span>Show the meaning</span></li>
      <li className="flex items-center gap-3"><span className="px-3 h-9 rounded bg-gray-200 text-black flex items-center text-sm font-semibold">Sentence</span><span>Use it in a sentence</span></li>
    </ul>
    <p className="text-center text-xs text-gray-500 mt-5">5 words per game · gets harder each round</p>
  </>
);
