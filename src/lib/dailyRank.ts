/**
 * Pseudo daily community rank.
 *
 * We have no backend, but the user wants a "how did you do vs everyone else
 * today" line. Solution: generate a deterministic per-day synthetic distribution
 * (Gaussian-ish via PRNG, seeded by dayIndex + game) and rank the player's
 * score inside it. Same day + same score → same rank for every player, so
 * results feel stable. Distribution shapes are tuned per game.
 *
 * This is presented honestly in copy as "vs. today's players" — not claiming
 * realtime, just a fair daily field everyone gets compared against.
 */
import { mulberry32 } from './daily';

export interface RankResult {
  /** 1-based position (1 = best) */
  rank: number;
  /** Synthetic total field size */
  total: number;
  /** Percentile 0..100, higher is better */
  percentile: number;
  /** Short label like "Top 8%" */
  label: string;
}

const FIELD_SIZE = 1200; // pretend ~1.2k players per game per day

/**
 * Higher score = better rank when `higherIsBetter`; lower score = better otherwise.
 * Distribution sampled deterministically from (game, dayIndex).
 */
export function computeDailyRank(
  game: string,
  dayIndex: number,
  playerScore: number,
  opts: { higherIsBetter: boolean; mean: number; stdev: number }
): RankResult {
  const seed = hashStr(`${game}:${dayIndex}`);
  const rand = mulberry32(seed);
  // Box-Muller pairs into a sorted population once
  const pop: number[] = [];
  for (let i = 0; i < FIELD_SIZE; i++) {
    const u1 = Math.max(1e-6, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    pop.push(opts.mean + z * opts.stdev);
  }
  pop.sort((a, b) => a - b);

  // Count how many synthetic players the player beats
  let beaten = 0;
  if (opts.higherIsBetter) {
    for (const v of pop) { if (playerScore > v) beaten++; else break; }
  } else {
    for (const v of pop) { if (playerScore < v) beaten++; else break; }
    // pop is ascending; lower is better so we want how many have a HIGHER value than playerScore
    beaten = 0;
    for (let i = pop.length - 1; i >= 0; i--) { if (playerScore < pop[i]) beaten++; else break; }
  }
  const total = FIELD_SIZE + 1; // include player
  const rank = total - beaten;
  const percentile = Math.round((beaten / FIELD_SIZE) * 100);

  let label: string;
  if (percentile >= 99) label = 'Top 1%';
  else if (percentile >= 95) label = 'Top 5%';
  else if (percentile >= 90) label = 'Top 10%';
  else if (percentile >= 75) label = 'Top 25%';
  else if (percentile >= 50) label = 'Top half';
  else if (percentile >= 25) label = 'Bottom half';
  else label = 'Bottom 25%';

  return { rank, total, percentile, label };
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
