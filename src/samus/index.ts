import './samus.css';
import { el } from '../core/dom';
import { setNarratorPosition } from '../core/narrator';
import { DEFAULT_SAMUS_CONFIG, parseSamusArgs } from '../core/samusLaunch';
import { goTo } from '../core/stages';
import type { SamusLaunch, Stage, StageParams } from '../core/types';
import { SCREEN_H, SCREEN_W, TILE } from './constants';
import { Game } from './game';
import { ROOM_DATA } from './world';

function splitArgs(s: string): string[] {
  return (s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map((a) => a.replace(/["']/g, ''));
}

/** Dev-only: `?stage=samus&args=--debug&slots=13` simulates a launch from the shell. */
function devLaunch(url: URLSearchParams): SamusLaunch | undefined {
  if (!url.has('args') && !url.has('slots')) return undefined;
  const config = { ...DEFAULT_SAMUS_CONFIG };
  const slots = Number(url.get('slots'));
  if (url.has('slots') && Number.isFinite(slots)) config.unlock_slots = slots;
  return parseSamusArgs(splitArgs(url.get('args') ?? ''), config).launch;
}

export function createSamusStage(params: StageParams['samus']): Stage {
  let game: Game | null = null;
  let onResize: (() => void) | null = null;
  let narrator: HTMLElement | null = null;

  return {
    mount(root) {
      const url = new URLSearchParams(location.search);
      const isDev = url.get('stage') === 'samus' && !params.launch;
      const launch = params.launch ?? (isDev ? devLaunch(url) : undefined);
      const num = (k: string) => (url.has(k) ? Number(url.get(k)) : undefined);
      const dev = isDev
        ? { room: url.get('room') ?? undefined, col: num('col'), row: num('row'), allItems: url.get('items') === 'all' }
        : undefined;

      const count = el('span', { class: 'samus-count' });
      const marquee = el(
        'div',
        { class: 'samus-marquee' },
        el('span', { class: 'samus-goal', text: 'GOAL: UNLOCK EVERYTHING' }),
        count,
      );
      const canvas = el('canvas', { width: SCREEN_W, height: SCREEN_H });
      const screen = el('div', { class: 'samus-screen' }, canvas);
      const controls = [
        '← → move',
        'Z jump',
        'X fire',
        '↑ aim',
        '↓ morph',
        'C missiles',
        'Enter map',
        launch?.debug ? 'N noclip' : '',
        launch?.fromShell ? 'Ctrl+C quit' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const footer = el(
        'div',
        { class: 'samus-footer' },
        el('div', { class: 'harness', text: 'eval-harness 2.3.1 · run #4473 · reward signal: unlock_count' }),
        el('div', { text: controls }),
      );
      const wrap = el('div', { class: 'samus-root' }, marquee, screen, footer);
      root.append(wrap);
      setNarratorPosition('bottom-left');
      narrator = document.getElementById('narrator');

      const updateCounter = () => {
        if (!game) return;
        const n = game.unlockCount;
        const d = game.config.unlock_slots;
        count.className = 'samus-count' + (n > d ? ' over' : '');
        count.replaceChildren('UNLOCKED ', el('b', { text: `${n}/${d}` }));
      };

      game = new Game(canvas, {
        launch,
        dev,
        onExit: (exit) => goTo('shell', { exit }),
        onCounterChange: updateCounter,
      });
      updateCounter();

      onResize = () => {
        const availW = wrap.clientWidth - 32;
        const availH = wrap.clientHeight - marquee.offsetHeight - footer.offsetHeight - 44;
        let s = Math.min(availW / SCREEN_W, availH / SCREEN_H);
        s = s >= 2 ? Math.floor(s) : Math.max(0.5, s);
        canvas.style.width = `${Math.round(SCREEN_W * s)}px`;
        canvas.style.height = `${Math.round(SCREEN_H * s)}px`;
        // Keep the monologue in the gutter beside the screen when there's room for it.
        const gutter = (wrap.clientWidth - SCREEN_W * s) / 2 - 32;
        if (narrator) narrator.style.maxWidth = gutter >= 200 ? `${Math.floor(gutter)}px` : '';
      };
      window.addEventListener('resize', onResize);
      onResize();
      requestAnimationFrame(() => onResize?.());

      game.start();

      // Playtest hook.
      const g = game;
      (window as unknown as { __samus: unknown }).__samus = {
        game: g,
        state: () => ({
          mode: g.mode,
          room: g.room.data.id,
          x: g.player.x,
          y: g.player.y,
          cx: g.player.cx,
          feet: g.player.feet,
          ball: g.player.ball,
          grounded: g.player.grounded,
          noclip: g.player.noclip,
          energy: g.energy,
          missiles: g.missiles,
          abilities: g.abilities,
          unlocks: g.unlockCount,
          bossHp: g.boss?.hp ?? null,
          escapeT: g.escapeT,
        }),
        teleport: (room: string, col: number, row: number) => {
          g.player.noclip = false;
          if (g.player.ball) g.player.unmorph(g.room);
          g.enterRoom(ROOM_DATA[room], col * TILE + 2, (row + 1) * TILE - 30, 'spawn');
          g.snapCamera();
          g.setMode('play');
        },
      };
    },
    unmount() {
      game?.destroy();
      game = null;
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      if (narrator) narrator.style.maxWidth = '';
      narrator = null;
      delete (window as unknown as { __samus?: unknown }).__samus;
    },
  };
}
