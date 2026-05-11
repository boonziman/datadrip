/**
 * Daily-puzzle utilities — deterministic per-day rotation everyone shares.
 * Allows ?day=YYYY-MM-DD or ?day=N override for dev/testing.
 */

export const EPOCH = new Date('2024-01-01T00:00:00Z');

export function dayKey(date = new Date()): string {
  // YYYY-MM-DD in user's local time so the day rolls at local midnight.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayNumber(date = new Date()): number {
  // # of days since EPOCH — used as a deterministic seed for everything.
  const ms = date.getTime() - EPOCH.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function getPuzzleDay(): { date: Date; key: string; index: number; isDev: boolean } {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('day');
  if (override) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(override)) {
      const d = new Date(override + 'T00:00:00');
      return { date: d, key: dayKey(d), index: dayNumber(d), isDev: true };
    }
    const n = parseInt(override, 10);
    if (!Number.isNaN(n)) {
      const d = new Date(EPOCH.getTime() + n * 86_400_000);
      return { date: d, key: dayKey(d), index: n, isDev: true };
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
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function msUntilNextLocalMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return tomorrow.getTime() - now.getTime();
}
