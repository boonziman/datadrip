import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { PageHeader } from '../components/PageHeader';
import { ResultsScreen } from '../components/ResultsScreen';
import { Toast } from '../components/Toast';
import { SONGS, Song } from './data/songless-songs';

const LEVELS_MS = [1000, 2000, 4000, 7000, 11000, 16000];
const MAX_GUESSES = LEVELS_MS.length; // 6

interface SavedState {
  guesses: { text: string; correct: boolean; partialArtist: boolean }[];
  level: number;          // current snippet level (0-5)
  status: 'playing' | 'won' | 'lost';
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

interface ITunesResult {
  trackName: string;
  artistName: string;
  previewUrl: string;
  artworkUrl100?: string;
}

async function fetchPreview(song: Song): Promise<ITunesResult | null> {
  // iTunes Search API: free, no key, returns 30s previewUrl MP3.
  // We use the JSONP-style endpoint with `term=`. CORS is open for itunes.apple.com.
  const term = encodeURIComponent(`${song.artist} ${song.title}`);
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;
    // Prefer exact title match
    const target = normalize(song.title);
    const best = data.results.find((r: any) => normalize(r.trackName).includes(target)) || data.results[0];
    if (!best.previewUrl) return null;
    return best;
  } catch { return null; }
}

export const Songless: React.FC = () => {
  const day = useMemo(() => getPuzzleDay(), []);
  const song = useMemo(() => {
    const rand = mulberry32(day.index * 2891336453);
    return SONGS[Math.floor(rand() * SONGS.length)];
  }, [day.index]);

  const initial = loadState<SavedState>('songless', day.key);
  const [guesses, setGuesses] = useState<SavedState['guesses']>(initial?.guesses ?? []);
  const [level, setLevel] = useState(initial?.level ?? 0);
  const [status, setStatus] = useState<SavedState['status']>(initial?.status ?? 'playing');
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ITunesResult | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState('');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // ms played in current snippet
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // Fetch preview
  useEffect(() => {
    fetchPreview(song).then(p => {
      if (!p) { setLoadError(true); return; }
      setPreview(p);
      const a = new Audio(p.previewUrl);
      a.preload = 'auto';
      audioRef.current = a;
    });
    return () => {
      audioRef.current?.pause();
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
    };
  }, [song]);

  // Persist
  useEffect(() => {
    saveState<SavedState>('songless', day.key, { guesses, level, status });
  }, [guesses, level, status, day.key]);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 1800); return () => clearTimeout(id); }, [toast]);

  const stop = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (tickRef.current) { cancelAnimationFrame(tickRef.current); tickRef.current = null; }
    setPlaying(false);
    setProgress(0);
  };

  const playSnippet = (durationMs?: number) => {
    if (!audioRef.current) return;
    stop();
    const dur = durationMs ?? LEVELS_MS[Math.min(level, LEVELS_MS.length - 1)];
    audioRef.current.currentTime = 0;
    audioRef.current.play().then(() => {
      setPlaying(true);
      const start = performance.now();
      const tick = (t: number) => {
        const elapsed = t - start;
        setProgress(elapsed);
        if (elapsed < dur) tickRef.current = requestAnimationFrame(tick);
      };
      tickRef.current = requestAnimationFrame(tick);
      stopTimerRef.current = window.setTimeout(() => stop(), dur);
    }).catch(() => setToast('Tap again to play'));
  };

  const playFull = () => playSnippet(30_000);

  const grade = (text: string): { correct: boolean; partialArtist: boolean } => {
    const g = normalize(text);
    const titleMatch = normalize(song.title) === g || (song.aliases || []).some(a => normalize(a) === g);
    const artistMatch = normalize(song.artist) === g || g.includes(normalize(song.artist));
    return { correct: titleMatch, partialArtist: !titleMatch && artistMatch };
  };

  const submit = () => {
    if (status !== 'playing') return;
    const text = input.trim();
    if (!text) { setToast('Type or skip'); return; }
    const g = grade(text);
    const newGuesses = [...guesses, { text, ...g }];
    setGuesses(newGuesses);
    setInput('');
    if (g.correct) {
      setStatus('won');
      stop();
      recordResult('songless', day.key, true, { totalGuesses: newGuesses.length });
    } else {
      advanceOrLose(newGuesses);
    }
  };

  const skip = () => {
    if (status !== 'playing') return;
    const newGuesses = [...guesses, { text: '(skipped)', correct: false, partialArtist: false }];
    setGuesses(newGuesses);
    advanceOrLose(newGuesses);
  };

  const advanceOrLose = (newGuesses: SavedState['guesses']) => {
    if (newGuesses.length >= MAX_GUESSES) {
      setStatus('lost');
      stop();
      recordResult('songless', day.key, false);
    } else {
      setLevel(l => Math.min(l + 1, LEVELS_MS.length - 1));
    }
  };

  const stats = loadStats('songless');

  if (status !== 'playing') {
    const grid = guesses.map(g => g.correct ? '🟩' : g.partialArtist ? '🟧' : g.text === '(skipped)' ? '⬛' : '🟥').join('');
    const padded = grid.padEnd(MAX_GUESSES, '⬜');
    const shareText = `Songless · ${day.key} · ${status === 'won' ? `${guesses.length}/${MAX_GUESSES}` : 'X/' + MAX_GUESSES}\n${padded}\nhttps://datadripco.com/puzzles/songless/`;
    return (
      <div className="dd-games min-h-screen pb-20">
        <PageHeader title="Songless" dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />
        <ResultsScreen
          won={status === 'won'}
          title={status === 'won' ? '🎵 Got it!' : 'Tough one!'}
          answer={`"${song.title}" — ${song.artist}`}
          answerLabel="Today's Song"
          stats={[
            { value: stats.played, label: 'Played' },
            { value: stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '0%', label: 'Win %' },
            { value: stats.streak, label: 'Streak' },
            { value: stats.bestStreak, label: 'Best' },
          ]}
          extras={preview && (
            <button onClick={playFull} className="w-full bg-panel hover:bg-panel2 rounded-xl py-3 font-medium border border-line/40">
              ▶ Play full 30s preview
            </button>
          )}
          shareText={shareText}
        />
      </div>
    );
  }

  const currentDur = LEVELS_MS[Math.min(level, LEVELS_MS.length - 1)];

  return (
    <div className="dd-games min-h-screen pb-20">
      {toast && <Toast message={toast} />}
      <PageHeader title="Songless" subtitle={`Snippet ${level + 1}/${MAX_GUESSES} · ${(currentDur / 1000)}s`} dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />

      {/* Progress segments */}
      <div className="max-w-md mx-auto px-4 mb-6">
        <div className="flex gap-1">
          {LEVELS_MS.map((ms, i) => {
            const seg = ms - (i > 0 ? LEVELS_MS[i - 1] : 0);
            const filled = i < level || (i === level && playing);
            const fillPct = i === level && playing ? Math.min(1, (progress - (i > 0 ? LEVELS_MS[i - 1] : 0)) / seg) : (i < level ? 1 : 0);
            return (
              <div key={i} className="flex-1 h-2 bg-panel2 rounded-full overflow-hidden" style={{ flexGrow: seg }}>
                <div className="h-full bg-accent transition-all" style={{ width: `${fillPct * 100}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-500">
          {LEVELS_MS.map((ms, i) => <span key={i}>{(ms / 1000)}s</span>)}
        </div>
      </div>

      {/* Play button */}
      <div className="flex justify-center mb-6">
        <button
          onClick={() => playSnippet()}
          disabled={!preview && !loadError}
          className="w-32 h-32 bg-accent hover:bg-accentDark text-black rounded-full flex flex-col items-center justify-center text-5xl active:scale-95 transition-transform shadow-lg shadow-accent/30 disabled:opacity-50"
        >
          {!preview && !loadError ? '⋯' : playing ? '⏸' : '▶'}
          <span className="text-xs font-semibold mt-1">{(currentDur / 1000).toFixed(0)}s</span>
        </button>
      </div>

      {loadError && (
        <p className="text-center text-bad text-sm mb-4">No preview available — skip without penalty.</p>
      )}

      {/* Guess input */}
      <div className="max-w-md mx-auto px-4 mb-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Song title (or artist for a hint)…"
          className="w-full bg-panel border-2 border-line rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="max-w-md mx-auto px-4 grid grid-cols-2 gap-2 mb-6">
        <button onClick={skip} className="bg-panel hover:bg-panel2 rounded-lg py-3 font-medium border border-line/40">⏭ Skip (+ time)</button>
        <button onClick={submit} className="bg-accent hover:bg-accentDark text-black rounded-lg py-3 font-bold">Submit</button>
      </div>

      {/* History */}
      <div className="max-w-md mx-auto px-4 space-y-1.5">
        {guesses.map((g, i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${g.correct ? 'bg-accent/10 border-accent/40' : g.partialArtist ? 'bg-warn/10 border-warn/40' : g.text === '(skipped)' ? 'bg-panel border-line/40' : 'bg-bad/10 border-bad/40'}`}>
            <span className="text-xs text-gray-500 tabular-nums">#{i + 1}</span>
            <span className="flex-1 text-sm">{g.text}</span>
            <span className="text-xs">{g.correct ? '✓ song' : g.partialArtist ? '◐ artist' : g.text === '(skipped)' ? '↷' : '✗'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
