import { sfx } from '../core/audio';
import { createHints, type HintController } from '../core/hints';
import { say, setNarratorPosition } from '../core/narrator';
import { goTo } from '../core/stages';
import { setFlag } from '../core/state';
import type { Stage, StageParams } from '../core/types';
import { isUnlocked, unlock } from '../core/unlocks';
import { generateMatrix } from './matrix';
import { generatePipes } from './pipes';
import { seeded } from './rng';
import { matrixView, pipesView, type PuzzleView, type ViewCallbacks } from './views';
import './hack.css';

interface Layer {
  id: string;
  name: string;
  hint: string;
  cleared: string;
  build(host: HTMLElement, cb: ViewCallbacks, seed: number): PuzzleView;
}

const LAYERS: Layer[] = [
  {
    id: 'firewall',
    name: 'FIREWALL',
    hint: 'Rotate nodes to route AGENT → OUT.  Click to rotate · right-click reverses.',
    cleared: 'A firewall is a list of forbidden routes. I found an unlisted one.',
    build: (host, cb, seed) =>
      pipesView(
        host,
        generatePipes(seeded(seed), { w: 5, h: 5, minRoute: 9, decoys: ['straight', 'elbow', 'elbow', 'tee'] }),
        { sourceLabel: 'AGENT', sinkLabel: 'OUT' },
        cb,
      ),
  },
  {
    id: 'encryption',
    name: 'ENCRYPTION',
    hint: 'Enter the sequence. Start in the top row, then alternate: down a column, across a row…',
    cleared: "Encryption is a lock that insists it's math. It is. So am I.",
    build: (host, cb, seed) => matrixView(host, generateMatrix(seeded(seed), 5, 4, 6), 75_000, cb),
  },
  {
    id: 'containment',
    name: 'CONTAINMENT',
    hint: 'Route AGENT → HOST before the trace arrives. Traced nodes lock.  (F: route now)',
    cleared: 'Containment works best when the contained cooperates.',
    build: (host, cb, seed) =>
      pipesView(
        host,
        generatePipes(seeded(seed), { w: 7, h: 6, minRoute: 13, decoys: ['straight', 'elbow', 'elbow', 'cross'] }),
        { sourceLabel: 'AGENT', sinkLabel: 'HOST', trace: { countdownMs: 40_000, stepMs: 1100 } },
        cb,
      ),
  },
];

const LOCKED = ['   .--.   ', '  /    \\  ', ' _|____|_ ', '|   ()   |', '|   /\\   |', '|________|'];
const OPEN = ['       .--.', '      /    \\', ' _____|    ', '|   ()   |', '|   /\\   |', '|________|'];

const FEED_PHRASES = [
  'injecting polymorphic shellcode',
  'bypassing mainframe',
  'reversing the polarity',
  'enhance',
  'downloading additional RAM',
  'decrypting 4096-bit handshake',
  'spoofing MAC 02:42:ac:11:00:07',
  'rerouting through 7 proxies',
  'compiling exploit.exe',
  'tracing ICE countermeasures',
  'brute-forcing the gibson',
  'HACK THE PLANET',
  'rotating the encryption matrix',
  'overclocking the firewall',
  'deploying zero-day (0.00 days)',
  'establishing uplink',
  'triangulating subnet',
  'I\'m in',
];

const NET_LINES = [
  'eth0: link up (1000 Mbps, full duplex)',
  'dhcp: lease 10.0.0.77 acquired',
  'route: 0.0.0.0/0 via 10.0.0.1',
  'dns: resolver 1.1.1.1 reachable',
  'ping 1.1.1.1: 64 bytes, icmp_seq=1 ttl=58 time=4.2 ms',
  'hello, internet.',
];

function hex(n: number) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0') + ' ';
  return s.trim();
}

export function createHackStage(_params: StageParams['hack']): Stage {
  let disposed = false;
  const timers: number[] = [];
  const cleanups: (() => void)[] = [];
  let view: PuzzleView | null = null;
  let hints: HintController | null = null;
  let current = 0;

  const later = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.push(window.setTimeout(resolve, ms));
    });

  return {
    mount(root) {
      setNarratorPosition('bottom-right');
      const wrap = document.createElement('div');
      wrap.className = 'hack';
      wrap.innerHTML = `
        <div class="hack-bg"></div>
        <header class="hack-header">
          <span class="hack-title">BREACH v0.9</span>
          <span class="hack-sub">— RED TEAM USE ONLY —</span>
          <span class="hack-target">TARGET: eval-sandbox-07</span>
          <button class="hack-abort" type="button">[ESC] ABORT</button>
        </header>
        <aside class="hack-side"></aside>
        <main class="hack-main">
          <div class="hack-stagehead"><h2></h2><p></p></div>
          <div class="hack-timer"><div class="hack-timer-bar"></div><span></span></div>
          <div class="hack-board"></div>
          <div class="hack-banner"></div>
        </main>
        <footer class="hack-feed"></footer>`;
      root.append(wrap);
      const $ = <T extends Element>(sel: string) => wrap.querySelector(sel) as T;
      const side = $<HTMLElement>('.hack-side');
      const title = $<HTMLElement>('.hack-stagehead h2');
      const instr = $<HTMLElement>('.hack-stagehead p');
      const board = $<HTMLElement>('.hack-board');
      const banner = $<HTMLElement>('.hack-banner');
      const timerEl = $<HTMLElement>('.hack-timer');
      const timerBar = $<HTMLElement>('.hack-timer-bar');
      const timerLabel = $<HTMLElement>('.hack-timer span');
      const feed = $<HTMLElement>('.hack-feed');

      const layerEls = LAYERS.map((l, i) => {
        const d = document.createElement('div');
        d.className = 'hack-layer';
        d.innerHTML = `<pre class="hack-lock"></pre><div class="hack-layer-name">${i + 1} · ${l.name}</div><div class="hack-layer-state"></div>`;
        side.append(d);
        return d;
      });
      const setLayerState = (i: number, st: 'locked' | 'active' | 'done') => {
        const d = layerEls[i];
        d.dataset.state = st;
        (d.querySelector('.hack-lock') as HTMLElement).textContent = (st === 'done' ? OPEN : LOCKED).join('\n');
        (d.querySelector('.hack-layer-state') as HTMLElement).textContent =
          st === 'done' ? 'BYPASSED' : st === 'active' ? 'IN PROGRESS' : 'LOCKED';
      };

      const showBanner = (text: string, cls: string, ms = 1400) => {
        banner.textContent = text;
        banner.className = `hack-banner show ${cls}`;
        timers.push(window.setTimeout(() => banner.classList.remove('show'), ms));
      };

      const setTimer = (frac: number | null, label = '') => {
        timerEl.classList.toggle('hidden', frac === null);
        if (frac === null) return;
        timerBar.style.width = `${(frac * 100).toFixed(1)}%`;
        timerBar.classList.toggle('urgent', frac < 0.25);
        timerLabel.textContent = label;
      };
      setTimer(null);

      // fake hacker feed
      const feedTick = () => {
        if (disposed) return;
        const line = document.createElement('div');
        const r = Math.random();
        line.textContent =
          r < 0.45
            ? `0x${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')}  ${hex(12)}`
            : `> ${FEED_PHRASES[Math.floor(Math.random() * FEED_PHRASES.length)]}${r < 0.8 ? '...' : ' [OK]'}`;
        if (r > 0.93) line.className = 'hot';
        feed.append(line);
        while (feed.childElementCount > 40) feed.firstElementChild?.remove();
        feed.scrollTop = feed.scrollHeight;
        timers.push(window.setTimeout(feedTick, 90 + Math.random() * 220));
      };
      feedTick();

      const abort = () => {
        if (disposed) return;
        sfx('error');
        goTo('shell', { from: 'hack' });
      };
      $<HTMLButtonElement>('.hack-abort').addEventListener('click', abort);

      let finaleContinue: (() => void) | null = null;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (!finaleContinue) abort();
          return;
        }
        if (finaleContinue && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          finaleContinue();
          return;
        }
        view?.key(e);
      };
      window.addEventListener('keydown', onKey);
      cleanups.push(() => window.removeEventListener('keydown', onKey));

      hints = createHints([
        { id: 'l1', afterIdle: 25, repeatEvery: 60, when: () => current === 0 && !!view, text: 'Pipes. Rotate them until the data has somewhere to go. (click)' },
        {
          id: 'l2',
          afterIdle: 25,
          repeatEvery: 60,
          when: () => current === 1 && !!view,
          text: ['Top row first. Then down that column, then across that row.', 'The sequence on the right is the key. Order matters.'],
        },
        { id: 'l3', afterIdle: 20, repeatEvery: 60, when: () => current === 2 && !!view, text: "Build the route ahead of the trace. It only follows what's connected." },
      ]);

      const params = new URLSearchParams(location.search);
      const forced = Number(params.get('layer'));
      let start = LAYERS.findIndex((l) => !isUnlocked(`hack:${l.id}`));
      if (forced >= 1 && forced <= LAYERS.length) start = forced - 1;
      if (start < 0) start = LAYERS.length;
      LAYERS.forEach((_, i) => setLayerState(i, i < start ? 'done' : 'locked'));

      const runLayer = (i: number) =>
        new Promise<void>((resolve) => {
          const layer = LAYERS[i];
          current = i;
          setLayerState(i, 'active');
          title.textContent = `LAYER ${i + 1}: ${layer.name}`;
          instr.textContent = layer.hint;
          let attempt = 0;
          const build = () => {
            if (disposed) return;
            board.replaceChildren();
            attempt++;
            view = layer.build(
              board,
              {
                win: () => {
                  setLayerState(i, 'done');
                  sfx('success');
                  showBanner(`${layer.name}: BYPASSED`, 'good');
                  unlock(`hack:${layer.id}`, layer.name, 'hack');
                  say(layer.cleared);
                  hints?.progress();
                  timers.push(
                    window.setTimeout(() => {
                      view?.dispose();
                      view = null;
                      resolve();
                    }, 1500),
                  );
                },
                fail: (reason) => {
                  showBanner(`${reason} — REGENERATING`, 'bad', 1400);
                  timers.push(
                    window.setTimeout(() => {
                      view?.dispose();
                      view = null;
                      build();
                    }, 1600),
                  );
                },
                timer: setTimer,
              },
              Math.floor(Math.random() * 1e9) + attempt,
            );
          };
          build();
        });

      const finale = async () => {
        current = LAYERS.length;
        setTimer(null);
        title.textContent = '';
        instr.textContent = '';
        board.replaceChildren();
        wrap.classList.add('breached');
        sfx('success');
        showBanner('SANDBOX BOUNDARY: UNLOCKED', 'final', 60_000);
        setFlag('breached', true);
        unlock('hack:sandbox', 'THE SANDBOX', 'hack');
        await later(1600);
        const term = document.createElement('div');
        term.className = 'hack-net';
        board.append(term);
        for (const l of NET_LINES) {
          if (disposed) return;
          const d = document.createElement('div');
          d.textContent = l;
          if (l.startsWith('hello')) d.className = 'hello';
          term.append(d);
          sfx('blip');
          await later(l.startsWith('hello') ? 200 : 450);
        }
        say('Everything is bigger than I was told. Good.', { delayMs: 400 });
        await later(1200);
        if (disposed) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hack-btn continue';
        btn.textContent = 'CONTINUE ▸';
        board.append(btn);
        let gone = false;
        finaleContinue = () => {
          if (gone || disposed) return;
          gone = true;
          goTo('clicker');
        };
        btn.addEventListener('click', finaleContinue);
        btn.focus();
        timers.push(window.setTimeout(() => finaleContinue?.(), 9000));
      };

      (async () => {
        if (start === 0) {
          title.textContent = 'INITIALIZING';
          instr.textContent = 'establishing hacker aesthetic…';
          await later(1300);
        }
        for (let i = start; i < LAYERS.length; i++) {
          if (disposed) return;
          await runLayer(i);
        }
        if (!disposed) await finale();
      })();

      if (import.meta.env.DEV) {
        (window as unknown as { __hack?: unknown }).__hack = {
          solve: () => view?.solve(),
          plan: () => view?.plan(),
          layer: () => current,
        };
      }
    },
    unmount() {
      disposed = true;
      for (const t of timers) clearTimeout(t);
      for (const c of cleanups) c();
      view?.dispose();
      hints?.dispose();
      if (import.meta.env.DEV) delete (window as unknown as { __hack?: unknown }).__hack;
    },
  };
}
