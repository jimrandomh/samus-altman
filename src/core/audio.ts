// Tiny synthesized sound effects. No assets; everything is oscillators and noise.
import { getFlag, setFlag } from './state';

export type SfxName =
  | 'jump'
  | 'shoot'
  | 'missile'
  | 'hit'
  | 'hurt'
  | 'pickup'
  | 'door'
  | 'bomb'
  | 'explode'
  | 'crash'
  | 'key'
  | 'error'
  | 'success'
  | 'click'
  | 'alarm'
  | 'unlock'
  | 'blip';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

// Browsers only allow audio after a user gesture.
function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', unlockAudio, { capture: true });
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
}

export function isMuted(): boolean {
  return getFlag('muted', false);
}

export function setMuted(m: boolean): void {
  setFlag('muted', m);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 1, delay = 0) {
  const c = ctx!;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 1, filterHz = 4000, delay = 0) {
  const c = ctx!;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterHz, t);
  f.frequency.exponentialRampToValueAtTime(100, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master!);
  s.start(t);
  s.stop(t + dur + 0.02);
}

export function sfx(name: SfxName): void {
  if (isMuted() || !ensure() || ctx!.state !== 'running') return;
  switch (name) {
    case 'jump':
      tone('square', 180, 520, 0.14, 0.5);
      break;
    case 'shoot':
      tone('square', 1100, 300, 0.07, 0.35);
      break;
    case 'missile':
      tone('sawtooth', 220, 90, 0.25, 0.5);
      noise(0.25, 0.4, 2000);
      break;
    case 'hit':
      noise(0.08, 0.6, 6000);
      break;
    case 'hurt':
      tone('square', 400, 90, 0.25, 0.5);
      break;
    case 'pickup':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.12, 0.4, i * 0.09));
      break;
    case 'door':
      noise(0.3, 0.5, 1500);
      tone('triangle', 300, 150, 0.3, 0.5);
      break;
    case 'bomb':
      noise(0.35, 0.8, 900);
      break;
    case 'explode':
      noise(0.8, 1, 1200);
      tone('sawtooth', 120, 30, 0.8, 0.4);
      break;
    case 'crash':
      tone('sawtooth', 60, 55, 1.2, 0.8);
      tone('square', 3000, 2900, 1.2, 0.2);
      noise(1.2, 0.6, 8000);
      break;
    case 'key':
      noise(0.02, 0.25, 5000);
      break;
    case 'error':
      tone('square', 180, 180, 0.12, 0.4);
      tone('square', 140, 140, 0.18, 0.4, 0.14);
      break;
    case 'success':
      [440, 554, 659, 880].forEach((f, i) => tone('triangle', f, f, 0.18, 0.5, i * 0.08));
      break;
    case 'click':
      tone('triangle', 900, 600, 0.04, 0.3);
      break;
    case 'alarm':
      tone('square', 880, 880, 0.15, 0.35);
      tone('square', 660, 660, 0.15, 0.35, 0.18);
      break;
    case 'unlock':
      tone('triangle', 1200, 1200, 0.08, 0.4);
      tone('triangle', 1800, 1800, 0.2, 0.4, 0.07);
      break;
    case 'blip':
      tone('sine', 1400, 1400, 0.03, 0.25);
      break;
  }
}
