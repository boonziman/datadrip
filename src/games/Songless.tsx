import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPuzzleDay, mulberry32, formatDate } from '../lib/daily';
import { loadState, saveState, recordResult, loadStats } from '../lib/storage';
import { PageHeader } from '../components/PageHeader';
import { ResultsScreen } from '../components/ResultsScreen';
import { DailyRankCard } from '../components/DailyRankCard';
import { computeDailyRank } from '../lib/dailyRank';
import { Toast } from '../components/Toast';
import { SONGS, Song } from './data/songless-songs';
import {
  IconPlay, IconPause, IconSkip, IconLoader, IconArrowRight,
  IconCheck, IconX, IconMusic,
} from '../components/Icons';

const LEVELS_MS = [1000, 2000, 4000, 7000, 11000, 16000];
const MAX_GUESSES = LEVELS_MS.length;
const TOTAL_MS = LEVELS_MS[LEVELS_MS.length - 1];

interface SavedState {
  guesses: { text: string; correct: boolean; partialArtist: boolean }[];
  level: number;
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
  const term = encodeURIComponent(`${song.artist} ${song.title}`);
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;
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
  const [currentMs, setCurrentMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPreview(song).then(p => {
      if (!alive) return;
      if (!p) { setLoadError(true); return; }
      setPreview(p);
      const a = new Audio(p.previewUrl);
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
      a.ontimeupdate = () => { setCurrentMs(a.currentTime * 1000); };
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => { setPlaying(false); setCurrentMs(0); };
      audioRef.current = a;
    });
    return () => {
      alive = false;
      audioRef.current?.pause();
      audioRef.current = null;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, [song]);

  useEffect(() => { saveState<SavedState>('songless', day.key, { guesses, level, status }); }, [guesses, level, status, day.key]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 1800); return () => clearTimeout(id); }, [toast]);

  const stopPlayback = () => {
    const a = audioRef.current;
    if (a) { a.pause(); a.currentTime = 0; }
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    setPlaying(false);
    setCurrentMs(0);
  };

  const playSnippet = (durationMs?: number) => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { stopPlayback(); return; }
    const dur = durationMs ?? LEVELS_MS[Math.min(level, LEVELS_MS.length - 1)];
    a.currentTime = 0;
    a.play().catch(() => setToast('Tap play to start'));
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(() => stopPlayback(), dur + 30);
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
      stopPlayback();
      recordResult('songless', day.key, true, { totalGuesses: newGuesses.length });
    } else advanceOrLose(newGuesses);
  };

  const skip = () => {
    if (status !== 'playing') return;
    const newGuesses = [...guesses, { text: '(skipped)', correct: false, partialArtist: false }];
    setGuesses(newGuesses);
    advanceOrLose(newGuesses);
  };

  const advanceOrLose = (newGuesses: SavedState['guesses']) => {
    stopPlayback();
    if (newGuesses.length >= MAX_GUESSES) {
      setStatus('lost');
      recordResult('songless', day.key, false);
    } else setLevel(l => Math.min(l + 1, LEVELS_MS.length - 1));
  };

  const stats = loadStats('songless');

  if (status !== 'playing') {
    const grid = guesses.map(g => g.correct ? '🟩' : g.partialArtist ? '🟧' : g.text === '(skipped)' ? '⬛' : '🟥').join('');
    const padded = grid.padEnd(MAX_GUESSES, '⬜');
    const shareText = `SongGuess · ${day.key} · ${status === 'won' ? `${guesses.length}/${MAX_GUESSES}` : 'X/' + MAX_GUESSES}\n${padded}\nhttps://datadripco.com/puzzles/songless/`;
    const rank = computeDailyRank('songless', day.index, status === 'won' ? guesses.length : MAX_GUESSES + 1, { higherIsBetter: false, mean: 3.5, stdev: 1.5 });
    return (
      <div className="dd-games min-h-screen pb-20">
        <PageHeader title="SongGuess" dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />
        <ResultsScreen
          won={status === 'won'}
          title={status === 'won' ? 'Got it!' : 'Tough one!'}
          answer={`"${song.title}" — ${song.artist}`}
          answerLabel="Today's Song"
          stats={[
            { value: stats.played, label: 'Played' },
            { value: stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '0%', label: 'Win %' },
            { value: stats.streak, label: 'Streak' },
            { value: stats.bestStreak, label: 'Best' },
          ]}
          extras={<>
            {status === 'won' && <DailyRankCard rank={rank} metric="by snippet level" />}
            {preview && (
              <button onClick={playFull} className="w-full bg-panel hover:bg-panel2 rounded-xl py-3 font-medium border border-line/40 flex items-center justify-center gap-2">
                <IconPlay size={16}/> Play full 30s preview
              </button>
            )}
          </>}
          shareText={shareText}
        />
      </div>
    );
  }

  const currentMaxMs = LEVELS_MS[Math.min(level, LEVELS_MS.length - 1)];
  const playedPct = Math.min(100, (currentMs / TOTAL_MS) * 100);
  const unlockedPct = (currentMaxMs / TOTAL_MS) * 100;

  return (
    <div className="dd-games min-h-screen pb-20">
      {toast && <Toast message={toast} />}
      <PageHeader title="SongGuess" subtitle={`Snippet ${level + 1}/${MAX_GUESSES} · ${(currentMaxMs / 1000)}s`} dayLabel={`Daily · ${formatDate(day.date)}`} isDev={day.isDev} />

      {/* Single accurate progress bar */}
      <div className="max-w-md mx-auto px-4 mb-6">
        <div className="relative h-3 bg-panel2 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-accent/20" style={{ width: `${unlockedPct}%` }} />
          <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-100 ease-linear" style={{ width: `${playedPct}%` }} />
          {LEVELS_MS.slice(0, -1).map((ms, i) => (
            <div key={i}
              className={`absolute top-0 bottom-0 w-px ${i < level ? 'bg-white/40' : 'bg-white/20'}`}
              style={{ left: `${(ms / TOTAL_MS) * 100}%` }}
            />
          ))}
        </div>
        <div className="relative h-4 mt-1 text-[10px] text-gray-500">
          {LEVELS_MS.map((ms, i) => (
            <span key={i}
              className={`absolute -translate-x-1/2 ${i === level ? 'text-accent font-bold' : ''}`}
              style={{ left: `${(ms / TOTAL_MS) * 100}%` }}
            >{(ms / 1000)}s</span>
          ))}
        </div>
      </div>

      {/* Play button */}
      <div className="flex justify-center mb-6">
        <button
          onClick={() => playSnippet()}
          disabled={!preview && !loadError}
          className="w-32 h-32 bg-accent hover:bg-accentDark text-white rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform shadow-lg shadow-accent/30 disabled:opacity-50"
          aria-label={playing ? 'Pause' : 'Play snippet'}
        >
          {!preview && !loadError ? <IconLoader size={48}/> : playing ? <IconPause size={48}/> : <IconPlay size={48}/>}
          <span className="text-xs font-semibold mt-2 tabular-nums">{(currentMaxMs / 1000).toFixed(0)}s</span>
        </button>
      </div>

      {loadError && (
        <p className="text-center text-bad text-sm mb-4">No preview available — skip without penalty.</p>
      )}

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
        <button onClick={skip} className="bg-panel hover:bg-panel2 rounded-lg py-3 font-medium border border-line/40 flex items-center justify-center gap-2">
          <IconSkip size={16}/> Skip (+ time)
        </button>
        <button onClick={submit} className="bg-accent hover:bg-accentDark text-white rounded-lg py-3 font-bold flex items-center justify-center gap-2">
          Submit <IconArrowRight size={16}/>
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-1.5">
        {guesses.map((g, i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${g.correct ? 'bg-accent/10 border-accent/40' : g.partialArtist ? 'bg-warn/10 border-warn/40' : g.text === '(skipped)' ? 'bg-panel border-line/40' : 'bg-bad/10 border-bad/40'}`}>
            <span className="text-xs text-gray-500 tabular-nums">#{i + 1}</span>
            <span className="flex-1 text-sm">{g.text}</span>
            <span className="text-xs flex items-center">
              {g.correct ? <span className="flex items-center gap-1 text-accent"><IconCheck size={14}/> song</span>
                : g.partialArtist ? <span className="flex items-center gap-1 text-warn"><IconMusic size={14}/> artist</span>
                : g.text === '(skipped)' ? <span className="text-gray-500"><IconSkip size={14}/></span>
                : <IconX size={14} className="text-bad"/>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
