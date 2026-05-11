import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  dayLabel?: string;
  isDev?: boolean;
  right?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, dayLabel, isDev, right }) => (
  <div className="w-full max-w-2xl mx-auto flex items-start justify-between mb-6 px-4">
    <div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter text-white">{title}</h1>
      {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      {dayLabel && (
        <p className="text-xs text-gray-500 mt-1">
          {dayLabel}{isDev && <span className="ml-2 px-2 py-0.5 bg-bad text-white rounded">DEV</span>}
        </p>
      )}
    </div>
    {right && <div className="flex items-center gap-2">{right}</div>}
  </div>
);
