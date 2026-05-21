import React, { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const HelpModal: React.FC<Props> = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-up"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-panel border border-line/40 rounded-2xl max-w-md w-full p-6 sm:p-8 relative shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-panel2 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >✕</button>
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-4">{title}</h2>
        <div className="text-gray-200 text-sm">{children}</div>
      </div>
    </div>
  );
};

interface IconBtnProps { onClick: () => void; ariaLabel: string; children: React.ReactNode; }
export const IconBtn: React.FC<IconBtnProps> = ({ onClick, ariaLabel, children }) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    className="w-10 h-10 rounded-full bg-panel2 hover:bg-panel3 flex items-center justify-center text-gray-300 hover:text-white transition-colors active:scale-95"
  >{children}</button>
);

interface HelpItemProps { icon: React.ReactNode; children: React.ReactNode; }
export const HelpItem: React.FC<HelpItemProps> = ({ icon, children }) => (
  <div className="flex items-start gap-3 mb-3">
    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-panel2 flex items-center justify-center font-bold text-sm text-white">{icon}</span>
    <span className="flex-1 text-gray-300 text-sm leading-relaxed">{children}</span>
  </div>
);
