import React, { useEffect, useMemo, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { PageHeader } from '../components/PageHeader';
import { ResultsScreen } from '../components/ResultsScreen';
import { Toast } from '../components/Toast';
import { SPELLING_BANK, SpellingRound } from './data/spelling-bank';

interface SavedState {
  roundIndex: number;
  results: { word: string; userAnswer: string; correct: boolean }[];
  finished: boolean;
}

const ROUNDS_PER_DAY = 5;

// Pick 5 daily words: one each at difficulty 1..5 to ramp up
function pickDailyWords(dayIndex: number) {
  const rand = mulberry32(dayIndex * 2654435761);
  const out: typeof SPELLING_BANK = [];
  for (let d = 1; d <= ROUNDS_PER_DAY; d++) {
    const pool = SPELLING_BANK.filter(w => w.difficulty === d);
    out.push(pool[Math.floor(rand() * pool.length)]);
  }
  return out;
}

// Free Dictionary API: https://api.dictionaryapi.dev/api/v2/entries/en/<word>
// Returns audio (sometimes) + definitions + examples. No key, free, public.
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

// Web Speech API fallback when no audio is available from the API
function speak(word: string, rate = 0.8) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.rate = rate;
  u.pitch = 1.0;
  u.lang = 'en-US';
  window.speechSynthesis.speak(u);
}

export const SpellingBee: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const dailyWords = useMemo(() => pickDailyWords(day.index), [day.index]);

  const initial = loadState<SavedState>('spelling-bee', day.key);
  const [roundIndex, setRoundIndex] = useState(initial?.roundIndex ?? 0);
  const [results, setResults] = useState<SavedState['results']>(initial?.results ?? []);
  const [finished, setFinished] = useState(initial?.finished ?? false);
  const [meta, setMeta] = useState<Partial<SpellingRound>>({});
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [toast, setToast] = useState('');
  const [showHelpers, setShowHelpers] = useState({ definition: false, example: false });

  const currentWord = dailyWords[roundIndex];

  // Fetch metadata for current word
  useEffect(() => {
    if (!currentWord || finished) return;
    setLoading(true);
    setShowHelpers({ definition: false, example: false });
    setInput('');
    setFeedback(null);
    fetchWordData(currentWord.word).then(m => {
      setMeta(m);
      setLoading(false);
      // Auto-play audio after slight delay
      setTimeout(() => playWord(m.audioUrl), 400);
    });
  }, [roundIndex, finished, currentWord]);

  // Persist
  useEffect(() => {
    saveState<SavedState>('spelling-bee', day.key, { roundIndex, results, finished });
  }, [roundIndex, results, finished, day.key]);

  // Toast clear
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const playWord = (url?: string) => {
    if (url) {
      try { new Audio(url).play().catch(() => speak(currentWord.word, 0.7)); }
      catch { speak(currentWord.word, 0.7); }
    } else {
      speak(currentWord.word, 0.7);
    }
  };

  const playExample = () => {
    if (meta.example) {
      // Replace the target word with "blank" so we don't spell it for the user
      const masked = meta.example.replace(new RegExp(currentWord.word, 'gi'), 'blank');
      speak(masked, 0.95);
    } else {
      setToast('No example available');
    }
  };

  const submit = () => {
    if (!input.trim() || feedback !== null) return;
    const correct = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setFeedback(correct ? 'correct' : 'wrong');
    const newResults = [...results, { word: currentWord.word, userAnswer: input.trim(), correct }];
    setResults(newResults);

    setTimeout(() => {
      if (roundIndex + 1 >= ROUNDS_PER_DAY) {
        setFinished(true);
        recordResult('spelling-bee', day.key, newResults.filter(r => r.correct).length >= 3);
      } else {
        setRoundIndex(r => r + 1);
      }
    }, 1500);
  };

  const stats = loadStats('spelling-bee');
  const correctCount = results.filter(r => r.correct).length;

  if (finished) {
    const shareGrid = results.map(r => r.correct ? '🟩' : '🟥').join('');
    const shareText = `Spelling Bee · ${day.key} · ${correctCount}/${ROUNDS_PER_DAY}\n${shareGrid}\nhttps://datadripco.com/puzzles/spelling-bee/`;
    return (
      <div className="dd-games min-h-screen pb-20">
        <PageHeader title="Spelling Bee" dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />
        <ResultsScreen
          won={correctCount >= 3}
          title={correctCount === 5 ? '🐝 Perfect!' : correctCount >= 3 ? 'Nice work!' : 'Keep practicing'}
          stats={[
            { value: `${correctCount}/5`, label: 'Today' },
            { value: stats.played, label: 'Played' },
            { value: stats.streak, label: 'Streak' },
            { value: stats.bestStreak, label: 'Best' },
          ]}
          extras={
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className={`flex justify-between items-center px-3 py-2 rounded-lg ${r.correct ? 'bg-accent/10 border border-accent/30' : 'bg-bad/10 border border-bad/30'}`}>
                  <span className="text-xs text-gray-400">#{i + 1}</span>
                  <span className="font-bold text-white">{r.word}</span>
                  {!r.correct && <span className="text-xs text-bad line-through">{r.userAnswer}</span>}
                  {r.correct && <span className="text-accent">✓</span>}
                </div>
              ))}
            </div>
          }
          shareText={shareText}
        />
      </div>
    );
  }

  return (
    <div className="dd-games min-h-screen pb-20">
      {toast && <Toast message={toast} />}
      <PageHeader title="Spelling Bee" subtitle={`Round ${roundIndex + 1} of ${ROUNDS_PER_DAY} · gets harder each round`} dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />

      {/* Round dots */}
      <div className="flex justify-center gap-2 mb-8">
        {dailyWords.map((_, i) => {
          const r = results[i];
          const cls = r ? (r.correct ? 'bg-accent text-black' : 'bg-bad text-white') : i === roundIndex ? 'bg-white text-black' : 'bg-panel2 text-gray-500';
          return (
            <div key={i} className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${cls}`}>
              {i + 1}
            </div>
          );
        })}
      </div>

      {/* Speaker */}
      <div className="flex justify-center mb-6">
        <button
          onClick={() => playWord(meta.audioUrl)}
          disabled={loading}
          className="w-28 h-28 bg-accent hover:bg-accentDark rounded-full flex items-center justify-center text-5xl active:scale-95 transition-transform shadow-lg shadow-accent/20 animate-pulse-soft disabled:opacity-50"
          aria-label="Play word"
        >
          {loading ? '⋯' : '🔊'}
        </button>
      </div>

      <p className="text-center text-gray-400 mb-6 text-lg">Spell the word…</p>

      {/* Input */}
      <div className="max-w-md mx-auto px-4 mb-4">
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Type your spelling…"
          disabled={feedback !== null}
          className="w-full bg-panel border-2 border-line rounded-xl px-5 py-4 text-2xl text-center focus:outline-none focus:border-accent disabled:opacity-50"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoCapitalize="off"
        />

        {feedback && (
          <div className={`mt-3 text-center font-bold text-xl animate-fade-up ${feedback === 'correct' ? 'text-accent' : 'text-bad'}`}>
            {feedback === 'correct' ? '✓ Correct!' : `✗ Was: ${currentWord.word}`}
          </div>
        )}
      </div>

      {/* Helpers */}
      <div className="max-w-md mx-auto px-4 mb-6 grid grid-cols-2 gap-2">
        <button
          onClick={() => { setShowHelpers(h => ({ ...h, definition: true })); }}
          className="bg-panel hover:bg-panel2 rounded-lg py-3 text-sm font-medium border border-line/40"
        >📖 Definition</button>
        <button
          onClick={() => { playExample(); setShowHelpers(h => ({ ...h, example: true })); }}
          className="bg-panel hover:bg-panel2 rounded-lg py-3 text-sm font-medium border border-line/40"
        >💬 Used in sentence</button>
      </div>

      {(showHelpers.definition || showHelpers.example) && (
        <div className="max-w-md mx-auto px-4 mb-6 bg-panel rounded-xl p-4 text-sm space-y-2 animate-fade-up">
          {showHelpers.definition && (
            <div>
              <span className="text-warn font-semibold uppercase text-[10px] tracking-wider">{meta.partOfSpeech || 'Definition'}: </span>
              <span className="text-gray-200">{meta.definition || '—'}</span>
            </div>
          )}
          {showHelpers.example && meta.example && (
            <div>
              <span className="text-warn font-semibold uppercase text-[10px] tracking-wider">Example: </span>
              <span className="text-gray-200 italic">{meta.example.replace(new RegExp(currentWord.word, 'gi'), '_____')}</span>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <div className="max-w-md mx-auto px-4">
        <button
          onClick={submit}
          disabled={!input.trim() || feedback !== null}
          className="w-full bg-accent hover:bg-accentDark text-black font-bold rounded-xl py-4 text-lg disabled:opacity-50 active:scale-[0.99] transition-transform"
        >Check Spelling</button>
      </div>
    </div>
  );
};
