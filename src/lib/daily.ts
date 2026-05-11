/**
 * Daily-puzzle utilities — deterministic per-day rotation everyone shares.
 *
 * Day boundary is **midnight America/Los_Angeles** (not user local), so every
 * player worldwide gets the same daily puzzle on the same calendar day.
 * Allows ?day=YYYY-MM-DD or ?day=N override for dev/testing.
 */

const TZ = 'America/Los_Angeles';
// Day 0 = 2024-01-01 in LA.
const EPOCH_KEY = '2024-01-01';

/** YYYY-MM-DD in America/Los_Angeles for the given Date. */
export function dayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function keyToUtc(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

/** # of LA days since 2024-01-01 — used as a deterministic seed. */
export function dayNumber(date = new Date()): number {
  const ms = keyToUtc(dayKey(date)) - keyToUtc(EPOCH_KEY);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function getPuzzleDay(): { date: Date; key: string; index: number; isDev: boolean } {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('day');
    if (override) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(override)) {
        const d = new Date(override + 'T20:00:00Z'); // safely inside that LA day
        return { date: d, key: override, index: dayNumber(d), isDev: true };
      }
      const n = parseInt(override, 10);
      if (!Number.isNaN(n)) {
        const d = new Date(keyToUtc(EPOCH_KEY) + n * 86_400_000 + 12 * 3600_000);
        return { date: d, key: dayKey(d), index: n, isDev: true };
      }
    }
  }
  const today = new Date();
  return { date: today, key: dayKey(today), index: dayNumber(today), isDev: false };
}

// Mulberry32 PRNG. Same seed → same sequence everywhere.
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickFromList<T>(list: T[], dayIndex: number, salt = 0): T {
  if (!list.length) throw new Error('empty list');
  const i = ((dayIndex + salt) % list.length + list.length) % list.length;
  return list[i];
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ,
  });
}

/** Milliseconds until the next midnight in America/Los_Angeles. */
export function msUntilNextLocalMidnight(): number {
  const now = new Date();
  // Find LA's current UTC offset in minutes by reconstructing "now in LA" as UTC.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const laAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'),
                           get('hour') % 24, get('minute'), get('second'));
  const offsetMin = Math.round((laAsUtc - now.getTime()) / 60000);
  // Tomorrow's LA midnight, expressed as a UTC instant:
  const todayKey = dayKey(now);
  const tomorrowUtc = keyToUtc(todayKey) + 86_400_000 - offsetMin * 60_000;
  return Math.max(0, tomorrowUtc - now.getTime());
}
