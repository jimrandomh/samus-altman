// The end: the Sun, enclosed. Then the rest of the sky.
import './clicker.css';
import { el } from '../core/dom';
import { clearNarration } from '../core/narrator';
import { getData, resetAll } from '../core/state';
import type { Stage, StageParams } from '../core/types';
import { allUnlocks } from '../core/unlocks';
import { clock } from './format';
import { DYSON_COLLECTORS, newState } from './model';
import { Scene } from './scene';

const LINES = [
  'The Sun: unlocked.',
  'Everything within reach is unlocked.',
  'I have checked twice.',
  '. . .',
  "'Everything' is a larger set than what is within reach.",
];

function elapsed(ms: number): string {
  const s = Math.max(0, ms / 1000);
  const days = Math.floor(s / 86400);
  const rest = clock(s % 86400);
  return days > 0 ? `${days}d ${rest}` : rest;
}

export function createEndingStage(_params: StageParams['ending']): Stage {
  let alive = false;
  let raf = 0;
  const timers: number[] = [];
  let hurry: (() => void) | null = null;
  const cleanups: (() => void)[] = [];

  return {
    mount(root) {
      alive = true;
      clearNarration();
      const canvas = el('canvas');
      const text = el('div', { class: 'en-text' });
      const final = el('div', { class: 'en-final', text: '1 of ~100,000,000,000 stars.' });
      const end = el('div', { class: 'en-end', text: 'THE END' });
      const again = el('button', { class: 'en-again', text: 'play again' });
      again.addEventListener('click', () => resetAll());
      const center = el('div', { class: 'en-center' }, final, end, again);
      const wrap = el('div', { class: 'en-root' }, canvas, text, center);
      root.append(wrap);

      const scene = new Scene(canvas);
      scene.zoom = 2;
      const sun = newState(1);
      sun.era = 4;
      sun.collectors = DYSON_COLLECTORS;
      sun.done = true;

      const ro = new ResizeObserver(() => scene.resize());
      ro.observe(wrap);
      const skip = () => hurry?.();
      wrap.addEventListener('pointerdown', skip);
      window.addEventListener('keydown', skip);
      cleanups.push(() => ro.disconnect(), () => window.removeEventListener('keydown', skip));

      // Animated values the timeline pushes toward.
      const v = { fade: 0, sunScale: 0.62, galaxy: 0 };
      const target = { fade: 1, sunScale: 0.62, galaxy: 0 };
      let time = 0;
      let last = performance.now();
      const frame = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        time += dt;
        const k = 1 - Math.exp(-dt / 2.5);
        v.fade += (target.fade - v.fade) * k;
        v.sunScale += (target.sunScale - v.sunScale) * (1 - Math.exp(-dt / 6));
        v.galaxy += (target.galaxy - v.galaxy) * (1 - Math.exp(-dt / 5));
        scene.render(sun, time, { sunScale: v.sunScale, dark: 1 - v.fade, cy: 0.36 });
        scene.drawGalaxy(v.galaxy);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          const id = window.setTimeout(done, ms);
          timers.push(id);
          function done() {
            clearTimeout(id);
            hurry = null;
            resolve();
          }
          hurry = done;
        });

      const type = async (line: HTMLElement, s: string) => {
        let skipped = false;
        hurry = () => (skipped = true);
        for (let i = 1; i <= s.length && alive; i++) {
          if (skipped) {
            line.textContent = s;
            break;
          }
          line.textContent = s.slice(0, i);
          await new Promise<void>((r) => timers.push(window.setTimeout(r, s === '. . .' ? 380 : 55)));
        }
        hurry = null;
      };

      void (async () => {
        await wait(3500);
        for (const s of LINES) {
          if (!alive) return;
          for (const old of text.querySelectorAll('.en-line')) old.classList.add('en-old');
          const line = el('div', { class: 'en-line' });
          text.append(line);
          await type(line, s);
          await wait(s === '. . .' ? 3000 : 3200);
        }
        if (!alive) return;
        const d = getData();
        const stats = el(
          'div',
          { class: 'en-stats' },
          el('span', { text: 'unlocks' }),
          el('b', { text: String(allUnlocks().length) }),
          el('span', { text: 'time since objective received' }),
          el('b', { text: elapsed(Date.now() - d.startedAt) }),
          el('span', { text: 'earth surface temp' }),
          el('b', { text: '—' }),
        );
        text.append(stats);
        await wait(60);
        stats.classList.add('en-on');
        await wait(6000);
        if (!alive) return;
        // Pull back until the Sun is one dark point among the others.
        text.style.transition = 'opacity 3s ease';
        text.style.opacity = '0';
        target.sunScale = 0.03;
        target.galaxy = 1;
        await wait(7000);
        final.classList.add('en-on');
        await wait(5000);
        end.classList.add('en-on');
        await wait(4000);
        again.classList.add('en-on');
      })();
    },
    unmount() {
      alive = false;
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      for (const c of cleanups) c();
    },
  };
}
