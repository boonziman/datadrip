/**
 * localStorage wrappers — per-game per-day state + cumulative stats.
 * All keys namespaced to "dd:" to avoid collisions.
 */

const PREFIX = 'dd:';

export function loadState<T>(game: string, dayKey: string): T | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${game}:state:${dayKey}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function saveState<T>(game: string, dayKey: string, state: T): void {
  try { localStorage.setItem(`${PREFIX}${game}:state:${dayKey}`, JSON.stringify(state)); } catch {}
}

export function clearState(game: string, dayKey: string): void {
  try { localStorage.removeItem(`${PREFIX}${game}:state:${dayKey}`); } catch {}
}

export interface Stats {
  played: number;
  wins: number;
  streak: number;
  bestStreak: number;
  lastWonDay: string | null;
  // game-specific counters get spread in via Partial<Stats>
  guessDistribution?: Record<string, number>; // for Wordless: "1"..."6"
  totalGuesses?: number; // for averaging
}

export function loadStats(game: string): Stats {
  try {
    const raw = localStorage.getItem(`${PREFIX}${game}:stats`);
    if (raw) return { played: 0, wins: 0, streak: 0, bestStreak: 0, lastWonDay: null, ...JSON.parse(raw) };
  } catch {}
  return { played: 0, wins: 0, streak: 0, bestStreak: 0, lastWonDay: null };
}

export function saveStats(game: string, stats: Stats): void {
  try { localStorage.setItem(`${PREFIX}${game}:stats`, JSON.stringify(stats)); } catch {}
}

/** Call once per finished game. Updates streak based on previous day. */
export function recordResult(
  game: string,
  dayKey: string,
  won: boolean,
  extra?: Partial<Stats>
): Stats {
  const s = loadStats(game);
  // Avoid double-counting if user replays via ?day override
  if (s.lastWonDay === dayKey && won) return s;

  s.played += 1;
  if (won) {
    s.wins += 1;
    // streak = previous streak + 1 if previous day was a win, else 1
    const prevDay = new Date(dayKey + 'T00:00:00');
    prevDay.setDate(prevDay.getDate() - 1);
    const prevKey = prevDay.toISOString().slice(0, 10);
    s.streak = s.lastWonDay === prevKey ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastWonDay = dayKey;
  } else {
    s.streak = 0;
  }
  if (extra) {
    if (extra.guessDistribution) {
      s.guessDistribution = { ...(s.guessDistribution || {}), ...extra.guessDistribution };
    }
    if (typeof extra.totalGuesses === 'number') {
      s.totalGuesses = (s.totalGuesses || 0) + extra.totalGuesses;
    }
  }
  saveStats(game, s);
  return s;
}
