/**
 * Tiny synthesised sound system using the Web Audio API.
 * No audio files — keeps bundle small and load instant. All sounds are
 * short, "satisfying-game-UI" style: soft clicks, pops, dings, buzzes.
 *
 * Honors a global mute toggle persisted in localStorage as `dd:mute`.
 */

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch { return null; }
}

export function isMuted(): boolean {
  try { return localStorage.getItem('dd:mute') === '1'; } catch { return false; }
}
export function setMuted(m: boolean) {
  try { localStorage.setItem('dd:mute', m ? '1' : '0'); } catch {}
}

// Resume the context on first user interaction (browsers require this).
let resumed = false;
function ensureRunning() {
  const c = getCtx();
  if (!c) return null;
  if (!resumed && c.state === 'suspended') {
    c.resume().catch(() => {});
    resumed = true;
  }
  return c;
}
if (typeof window !== 'undefined') {
  const onFirst = () => {
    ensureRunning();
    window.removeEventListener('pointerdown', onFirst);
    window.removeEventListener('keydown', onFirst);
  };
  window.addEventListener('pointerdown', onFirst, { once: true });
  window.addEventListener('keydown', onFirst, { once: true });
}

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  duration?: number; // seconds
  attack?: number;
  release?: number;
  gain?: number;
  slideTo?: number; // glide to this freq during the note
}
function tone(opts: ToneOpts) {
  if (isMuted()) return;
  const c = ensureRunning();
  if (!c) return;
  const t = c.currentTime;
  const dur = opts.duration ?? 0.08;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  const peak = opts.gain ?? 0.18;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (opts.release ?? 0.04));
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + (opts.release ?? 0.04) + 0.02);
}

// ── Public sounds ──
// Soft mechanical "tap" when typing a letter
export const sndType    = () => tone({ freq: 520, type: 'triangle', duration: 0.04, gain: 0.12 });
// Lower, hollow "thunk" for backspace
export const sndDelete  = () => tone({ freq: 220, type: 'square',   duration: 0.05, gain: 0.10, slideTo: 140 });
// Short reveal blip on each letter check
export const sndReveal  = () => tone({ freq: 440, type: 'sine',     duration: 0.07, gain: 0.16 });
// Cheerful chord for win
export function sndWin() {
  if (isMuted()) return;
  [523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => tone({ freq: f, type: 'triangle', duration: 0.18, gain: 0.16 }), i * 90));
}
// Buzz for wrong
export function sndLose() {
  if (isMuted()) return;
  tone({ freq: 220, type: 'sawtooth', duration: 0.18, gain: 0.18, slideTo: 90 });
}
// "Bloop" for advance / correct mini-step
export const sndBloop   = () => tone({ freq: 740, type: 'sine', duration: 0.12, gain: 0.18, slideTo: 980 });
// Subtle UI tick
export const sndTick    = () => tone({ freq: 660, type: 'sine', duration: 0.03, gain: 0.08 });
// Number rolling counter ticks
export const sndCount   = () => tone({ freq: 880, type: 'sine', duration: 0.02, gain: 0.05 });
// Invalid input buzz
export const sndError   = () => tone({ freq: 180, type: 'square', duration: 0.10, gain: 0.14 });
