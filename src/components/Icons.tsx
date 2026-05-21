import React from 'react';

/**
 * Inline SVG icons. Use these everywhere instead of emoji so the UI looks
 * identical on every OS / browser / font stack (Mac, Windows, Linux, mobile).
 */

interface IconProps {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
  title?: string;
}

const SvgBase: React.FC<React.PropsWithChildren<IconProps & { viewBox?: string }>> = ({
  size = 24, className = '', strokeWidth = 2, viewBox = '0 0 24 24', title, children,
}) => (
  <svg
    width={size} height={size} viewBox={viewBox}
    fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
    focusable="false"
  >
    {title && <title>{title}</title>}
    {children}
  </svg>
);

export const IconSpeaker: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </SvgBase>
);

export const IconPlay: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/>
  </SvgBase>
);

export const IconPause: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>
    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>
  </SvgBase>
);

export const IconSkip: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none"/>
    <line x1="19" y1="5" x2="19" y2="19"/>
  </SvgBase>
);

export const IconCheck: React.FC<IconProps> = (p) => (
  <SvgBase {...p} strokeWidth={p.strokeWidth ?? 3}>
    <polyline points="20 6 9 17 4 12"/>
  </SvgBase>
);

export const IconX: React.FC<IconProps> = (p) => (
  <SvgBase {...p} strokeWidth={p.strokeWidth ?? 3}>
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </SvgBase>
);

export const IconStats: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <line x1="6" y1="20" x2="6" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="18" y1="20" x2="18" y2="14"/>
  </SvgBase>
);

export const IconHelp: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </SvgBase>
);

export const IconArrowUp: React.FC<IconProps> = (p) => (
  <SvgBase {...p}><polyline points="6 15 12 9 18 15" strokeWidth={p.strokeWidth ?? 3}/></SvgBase>
);

export const IconArrowDown: React.FC<IconProps> = (p) => (
  <SvgBase {...p}><polyline points="6 9 12 15 18 9" strokeWidth={p.strokeWidth ?? 3}/></SvgBase>
);

export const IconArrowRight: React.FC<IconProps> = (p) => (
  <SvgBase {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></SvgBase>
);

export const IconMusic: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3" fill="currentColor"/>
    <circle cx="18" cy="16" r="3" fill="currentColor"/>
  </SvgBase>
);

export const IconShare: React.FC<IconProps> = (p) => (
  <SvgBase {...p}>
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </SvgBase>
);

export const IconLoader: React.FC<IconProps> = (p) => (
  <SvgBase {...p} className={`animate-spin ${p.className ?? ''}`}>
    <line x1="12" y1="2"  x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2"  y1="12" x2="6"  y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </SvgBase>
);
