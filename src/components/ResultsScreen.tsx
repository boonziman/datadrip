import React, { useEffect, useState } from 'react';
import { msUntilNextLocalMidnight } from '../lib/daily';

interface ResultsScreenProps {
  title: string;
  // The "answer" line shown big at top (e.g. the word, the song)
  answer?: string;
  answerLabel?: string;
  // Big stats (4 across)
  stats: { value: React.ReactNode; label: string }[];
  // Optional guess distribution chart (Wordless)
  distribution?: { label: string; count: number; highlight?: boolean }[];
  // Plain-text share blob
  shareText: string;
  // Body slot for game-specific extras
  extras?: React.ReactNode;
  won: boolean;
  // Show the next-puzzle countdown
  showCountdown?: boolean;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  title, answer, answerLabel, stats, distribution, shareText, extras, won, showCountdown = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(msUntilNextLocalMidnight());

  useEffect(() => {
    if (!showCountdown) return;
    const id = setInterval(() => setCountdown(msUntilNextLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, [showCountdown]);

  const fmtTime = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch { /* user cancelled, fall through to copy */ }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ancient-browser fallback
      const ta = document.createElement('textarea');
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const maxCount = distribution ? Math.max(1, ...distribution.map(d => d.count)) : 1;

  return (
    <div className="w-full max-w-md mx-auto px-4 animate-fade-up">
      <div className="bg-panel rounded-2xl p-6 sm:p-8 border border-line/40">
        <h2 className={`text-3xl font-bold text-center mb-1 ${won ? 'text-accent' : 'text-bad'}`}>
          {title}
        </h2>
        {answer && (
          <div className="text-center mb-6">
            {answerLabel && <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{answerLabel}</p>}
            <p className="text-2xl font-bold text-white tracking-wide">{answer}</p>
          </div>
        )}

        {extras && <div className="mb-6">{extras}</div>}

        <div className={`grid ${stats.length === 4 ? 'grid-cols-4' : stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-6`}>
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-bold text-white tabular-nums">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {distribution && (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2 text-center">Guess Distribution</p>
            <div className="space-y-1">
              {distribution.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-gray-400 font-medium">{d.label}</span>
                  <div
                    className={`h-6 flex items-center justify-end px-2 text-white text-xs font-bold rounded ${d.highlight ? 'bg-accent' : 'bg-panel3'}`}
                    style={{ width: `${(d.count / maxCount) * 100}%`, minWidth: '24px' }}
                  >
                    {d.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {showCountdown && (
            <div className="flex-1 bg-panel2 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Next Puzzle</p>
              <p className="text-lg font-bold text-white tabular-nums">{fmtTime(countdown)}</p>
            </div>
          )}
          <button
            onClick={share}
            className="flex-1 bg-accent hover:bg-accentDark text-black font-bold rounded-xl py-3 transition-colors active:scale-95"
          >
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  );
};
