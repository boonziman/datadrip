import React from 'react';

interface ToastProps {
  message: string;
  variant?: 'error' | 'info' | 'success';
}

export const Toast: React.FC<ToastProps> = ({ message, variant = 'error' }) => {
  if (!message) return null;
  const bg = variant === 'error' ? 'bg-bad' : variant === 'success' ? 'bg-accent' : 'bg-panel3';
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-pop-in">
      <div className={`${bg} text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg`}>
        {message}
      </div>
    </div>
  );
};
