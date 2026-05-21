import React from 'react';
import type { RankResult } from '../lib/dailyRank';

interface Props {
  rank: RankResult;
  /** Hint sub-text e.g. "by guesses used" */
  metric?: string;
}

/**
 * Renders the "vs. today's players" card. Honest about being a synthetic but
 * deterministic field — same number for every player who got the same score today.
 */
export const DailyRankCard: React.FC<Props> = ({ rank, metric }) => {
  const pctFill = Math.max(2, Math.min(100, rank.percentile));
  return (
    <div className="bg-panel2 rounded-xl p-4 border border-line/30">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Today vs. players</p>
        <p className="text-[10px] text-gray-500">{metric || 'today'}</p>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold text-accent tabular-nums">{rank.label}</span>
        <span className="text-sm text-gray-400 tabular-nums">#{rank.rank.toLocaleString()} of {rank.total.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-panel3 rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all duration-700 ease-out" style={{ width: `${pctFill}%` }} />
      </div>
    </div>
  );
};
