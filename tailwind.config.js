/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  // Scope all utilities under .dd-games so we never collide with PaperMod theme styles.
  important: '.dd-games',
  corePlugins: {
    preflight: false, // skip Tailwind's reset — would clobber the rest of the site
  },
  theme: {
    extend: {
      colors: {
        // lessgames-style palette
        accent: '#55B725',
        accentDark: '#4a9e1f',
        warn: '#DAC316',
        bad: '#C62121',
        bg: '#1e2021',
        panel: '#27282a',
        panel2: '#303436',
        panel3: '#4a4d50',
        line: '#55595c',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pop-in': 'popIn 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'tile-pop': 'tilePop 140ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'flip': 'flip 600ms ease forwards',
        'shake': 'shake 420ms ease-in-out',
        'fade-up': 'fadeUp 360ms ease forwards',
        'fade-in': 'fadeIn 200ms ease forwards',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
        'bounce-letter': 'bounceLetter 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-in-r': 'slideInR 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-in-l': 'slideInL 420ms cubic-bezier(0.34, 1.4, 0.64, 1) both',
        'slide-from-right': 'slideFromRight 420ms cubic-bezier(0.34, 1.4, 0.64, 1) both',
        'wiggle': 'wiggle 380ms ease-in-out',
        'glow': 'glow 1.6s ease-in-out infinite',
        'check-pop': 'checkPop 380ms cubic-bezier(0.34, 1.7, 0.64, 1) both',
      },
      keyframes: {
        popIn: {
          '0%': { transform: 'scale(0.86)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        tilePop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
        flip: {
          '0%': { transform: 'rotateX(0)' },
          '50%': { transform: 'rotateX(90deg)' },
          '100%': { transform: 'rotateX(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        fadeUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        bounceLetter: {
          '0%':   { transform: 'translateY(0)',    color: 'inherit' },
          '40%':  { transform: 'translateY(-12px) scale(1.15)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideInR: {
          '0%':   { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        slideInL: {
          '0%':   { transform: 'translateX(60%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        slideFromRight: {
          '0%':   { transform: 'translateX(110%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        checkPop: {
          '0%':   { transform: 'scale(0) rotate(-30deg)', opacity: '0' },
          '60%':  { transform: 'scale(1.25) rotate(0)',   opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)',      opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0)' },
          '25%':      { transform: 'rotate(-3deg)' },
          '75%':      { transform: 'rotate(3deg)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(85,183,37,0.0)' },
          '50%':      { boxShadow: '0 0 24px 4px rgba(85,183,37,0.45)' },
        },
      },
    },
  },
};
