// Tile art and backgrounds, generated per area.
import { TILE } from './constants';
import type { Area } from './rooms';
import { cached, makeCanvas } from './sprites';

export interface AreaStyle {
  base: string;
  light: string;
  dark: string;
  deep: string;
  bg: string;
}

export const AREA_STYLE: Record<Area, AreaStyle> = {
  surface: { base: '#8c6a44', light: '#d8a868', dark: '#4a3018', deep: '#1c1008', bg: '#070718' },
  brinstar: { base: '#1c64d8', light: '#74bcfc', dark: '#0c2c7c', deep: '#020818', bg: '#000006' },
  norfair: { base: '#c03c08', light: '#fca048', dark: '#5c1400', deep: '#1c0400', bg: '#0c0000' },
  tourian: { base: '#4c7870', light: '#a4dcd0', dark: '#1c3430', deep: '#060e0c', bg: '#000604' },
  oob: { base: '#ff00ff', light: '#00ffff', dark: '#202020', deep: '#000000', bg: '#000000' },
  dev: { base: '#8c8c8c', light: '#c4c4c4', dark: '#505050', deep: '#303030', bg: '#1c1c22' },
  minus: { base: '#18902c', light: '#88e888', dark: '#0a3c12', deep: '#041a08', bg: '#062a5c' },
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tileHash(col: number, row: number): number {
  let h = (col * 374761393 + row * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

type G = CanvasRenderingContext2D;

function px(g: G, x: number, y: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x, y, 1, 1);
}

function blobRock(g: G, s: AreaStyle, variant: number) {
  g.fillStyle = s.deep;
  g.fillRect(0, 0, TILE, TILE);
  const r = rng(variant * 977 + 13);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) blobs.push([2 + r() * 12, 2 + r() * 12, 3.5 + r() * 3]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      for (const [cx, cy, rad] of blobs) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d < rad) {
          let c = s.base;
          if (d > rad - 1.2) c = s.dark;
          else if (dx + dy < -rad * 0.55) c = s.light;
          px(g, x, y, c);
        }
      }
    }
  }
}

function strataSpeckle(g: G, s: AreaStyle, variant: number) {
  const r = rng(variant * 31 + 7);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? s.light : s.dark;
    g.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 1, 1);
  }
}

function panel(g: G, s: AreaStyle, variant: number) {
  g.fillStyle = s.dark;
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = s.base;
  g.fillRect(1, 1, 14, 14);
  g.fillStyle = s.light;
  g.fillRect(1, 1, 14, 1);
  g.fillRect(1, 1, 1, 14);
  g.fillStyle = s.deep;
  g.fillRect(1, 14, 14, 1);
  g.fillRect(14, 1, 1, 14);
  g.fillStyle = s.light;
  for (const [x, y] of [
    [3, 3],
    [12, 3],
    [3, 12],
    [12, 12],
  ])
    g.fillRect(x, y, 1, 1);
  if (variant % 3 === 0) {
    g.fillStyle = s.dark;
    g.fillRect(5, 7, 6, 2);
  }
}

function checker(g: G) {
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#9a9a9a' : '#6a6a6a';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  g.fillStyle = '#ff00ff';
  g.fillRect(0, 0, 1, 1);
}

function bush(g: G, s: AreaStyle, variant: number) {
  g.fillStyle = s.deep;
  g.fillRect(0, 0, TILE, TILE);
  const r = rng(variant * 53 + 1);
  for (let x = 0; x < TILE; x += 2) {
    const top = Math.floor(r() * 5);
    g.fillStyle = x % 4 ? s.base : s.dark;
    g.fillRect(x, top, 2, TILE - top);
    g.fillStyle = s.light;
    g.fillRect(x, top, 1, 2);
  }
}

function girder(g: G, s: AreaStyle) {
  g.fillStyle = s.deep;
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = s.dark;
  g.fillRect(0, 0, TILE, 7);
  g.fillStyle = s.base;
  g.fillRect(0, 1, TILE, 4);
  g.fillStyle = s.light;
  g.fillRect(0, 1, TILE, 1);
  g.fillStyle = s.deep;
  g.fillRect(3, 3, 2, 1);
  g.fillRect(11, 3, 2, 1);
  // lattice underneath
  g.fillStyle = s.dark;
  for (let i = 0; i < 9; i++) {
    g.fillRect(i, 7 + i, 1, 1);
    g.fillRect(15 - i, 7 + i, 1, 1);
  }
}

function pedestal(g: G) {
  // "Chozo Alt" statue block: a stern stone bird, seen from the front.
  const stone = '#a88c58';
  const dark = '#5c4424';
  const light = '#e4c888';
  g.fillStyle = dark;
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = stone;
  g.fillRect(1, 0, 14, 16);
  g.fillStyle = light;
  g.fillRect(1, 0, 14, 1);
  g.fillRect(1, 0, 1, 16);
  // eyes
  g.fillStyle = dark;
  g.fillRect(4, 4, 2, 2);
  g.fillRect(10, 4, 2, 2);
  g.fillStyle = '#f83800';
  g.fillRect(4, 4, 1, 1);
  g.fillRect(10, 4, 1, 1);
  // beak
  g.fillStyle = '#f8b800';
  g.fillRect(7, 6, 2, 4);
  g.fillRect(6, 7, 4, 1);
  g.fillStyle = dark;
  g.fillRect(7, 10, 2, 1);
  // wing lines
  g.fillRect(2, 12, 12, 1);
  g.fillRect(3, 14, 10, 1);
}

function cracks(g: G) {
  g.fillStyle = 'rgba(0,0,0,0.75)';
  const pts = [
    [2, 3],
    [5, 6],
    [4, 9],
    [8, 11],
    [7, 14],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= n; t++) g.fillRect(Math.round(x0 + ((x1 - x0) * t) / n), Math.round(y0 + ((y1 - y0) * t) / n), 1, 1);
  }
  g.fillRect(10, 2, 1, 4);
  g.fillRect(11, 5, 2, 1);
  g.fillRect(12, 6, 1, 3);
}

function brick(g: G, s: AreaStyle) {
  g.fillStyle = s.deep;
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = s.light;
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let x = -off; x < TILE; x += 8) g.fillRect(x + 1, row * 4 + 1, 6, 2);
  }
  g.fillStyle = s.base;
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let x = -off; x < TILE; x += 8) g.fillRect(x + 1, row * 4 + 3, 6, 1);
  }
}

function missileBlock(g: G) {
  g.fillStyle = '#7c0800';
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = '#f83800';
  g.fillRect(1, 1, 14, 14);
  g.fillStyle = '#fcfcfc';
  g.fillRect(7, 3, 2, 8);
  g.fillRect(5, 5, 6, 2);
  g.fillRect(6, 4, 4, 1);
  g.fillRect(5, 11, 2, 2);
  g.fillRect(9, 11, 2, 2);
}

function pad(g: G) {
  g.fillStyle = '#383838';
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = '#9c9c9c';
  g.fillRect(0, 0, TILE, 5);
  for (let x = 0; x < TILE; x += 4) {
    g.fillStyle = '#f8b800';
    g.fillRect(x, 1, 2, 3);
  }
  g.fillStyle = '#5c5c5c';
  g.fillRect(2, 7, 12, 1);
  g.fillRect(2, 10, 12, 1);
  g.fillRect(2, 13, 12, 1);
}

/** Cached 16×16 art for static tiles. Glass, lava, doors and garbage are drawn live. */
export function tileArt(area: Area, ch: string, variant: number): HTMLCanvasElement {
  const v = variant % 4;
  return cached(`tile:${area}:${ch}:${v}`, () => {
    const c = makeCanvas(TILE, TILE);
    const g = c.getContext('2d')!;
    const s = AREA_STYLE[area];
    switch (ch) {
      case '#':
      case 'b':
      case 'B':
        if (area === 'dev') checker(g);
        else if (area === 'tourian') panel(g, s, v);
        else if (area === 'surface') {
          blobRock(g, s, v + 11);
          strataSpeckle(g, s, v);
        }
        else if (area === 'minus') brick(g, { ...s, light: '#c84c0c', base: '#7c2800', deep: '#200800' });
        else blobRock(g, s, v);
        if (ch === 'B') cracks(g);
        break;
      case '%':
        bush(g, s, v);
        break;
      case '=':
        if (area === 'minus') {
          g.fillStyle = '#0a3c12';
          g.fillRect(0, 0, TILE, TILE);
          g.fillStyle = '#18902c';
          g.fillRect(0, 1, TILE, 14);
          g.fillStyle = '#88e888';
          g.fillRect(0, 3, TILE, 2);
        } else girder(g, s);
        break;
      case 'T':
        pedestal(g);
        break;
      case 'S':
        brick(g, s);
        break;
      case 'M':
        missileBlock(g);
        break;
      case 'E':
        pad(g);
        break;
      case 'c':
        checker(g);
        break;
      default:
        g.fillStyle = '#ff00ff';
        g.fillRect(0, 0, TILE, TILE);
    }
    return c;
  });
}

// ---------------------------------------------------------------- live tiles

export function drawLava(g: G, x: number, y: number, t: number, acid = false) {
  const hot = acid ? '#58d854' : '#fc7400';
  const mid = acid ? '#00a800' : '#d82800';
  const deep = acid ? '#005800' : '#881400';
  g.fillStyle = mid;
  g.fillRect(x, y + 3, TILE, TILE - 3);
  g.fillStyle = deep;
  g.fillRect(x, y + 10, TILE, 6);
  for (let i = 0; i < TILE; i++) {
    const h = Math.round(1.5 + Math.sin((x + i) * 0.4 + t * 0.08) * 1.5);
    g.fillStyle = hot;
    g.fillRect(x + i, y + 3 - h, 1, h + 1);
  }
  if (((x * 7 + Math.floor(t / 20)) & 7) === 0) {
    g.fillStyle = '#fcfc58';
    g.fillRect(x + ((t >> 2) % 12) + 2, y + 7, 2, 2);
  }
}

export function drawGlass(g: G, x: number, y: number, t: number) {
  g.fillStyle = 'rgba(120, 220, 255, 0.28)';
  g.fillRect(x + 2, y, 12, TILE);
  g.fillStyle = 'rgba(220, 250, 255, 0.7)';
  g.fillRect(x + 4, y, 1, TILE);
  if (((y >> 4) + (t >> 5)) % 5 === 0) g.fillRect(x + 9, y + 3, 1, 6);
  g.fillStyle = 'rgba(60, 140, 180, 0.9)';
  g.fillRect(x + 2, y, 1, TILE);
  g.fillRect(x + 13, y, 1, TILE);
}

const GARBAGE = ['#ff00ff', '#00ffff', '#ffff00', '#ff0044', '#00ff66', '#ffffff', '#3355ff', '#000000'];

export function drawGarbage(g: G, x: number, y: number, seed: number, t: number, solid: boolean) {
  const r = rng(seed * 131 + Math.floor(t / (solid ? 9 : 5)));
  if (solid) {
    for (let by = 0; by < TILE; by += 4)
      for (let bx = 0; bx < TILE; bx += 4) {
        g.fillStyle = GARBAGE[Math.floor(r() * GARBAGE.length)];
        g.fillRect(x + bx, y + by, 4, 4);
      }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x, y + (Math.floor(r() * 4) * 4), TILE, 2);
  } else {
    g.globalAlpha = 0.45;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = GARBAGE[Math.floor(r() * GARBAGE.length)];
      g.fillRect(x + Math.floor(r() * 14), y + Math.floor(r() * 14), 1 + Math.floor(r() * 4), 1 + Math.floor(r() * 2));
    }
    g.globalAlpha = 1;
  }
}

export const DOOR_COLORS: Record<string, [string, string, string]> = {
  D: ['#0c2cc8', '#3cbcfc', '#bcecfc'],
  R: ['#881400', '#f83800', '#fcb4a0'],
  L: ['#404040', '#8c8c8c', '#dcdcdc'],
};

/** A door column: frame on the outer edge, bubble on the inner side when closed. */
export function drawDoor(
  g: G,
  x: number,
  y: number,
  rows: number,
  side: 'W' | 'E',
  type: string,
  open: boolean,
  t: number,
) {
  const h = rows * TILE;
  const frameX = side === 'W' ? x : x + TILE - 5;
  g.fillStyle = '#2c2c2c';
  g.fillRect(frameX, y, 5, h);
  g.fillStyle = '#8c8c8c';
  g.fillRect(frameX + 1, y, 3, h);
  g.fillStyle = '#d8d8d8';
  g.fillRect(frameX + 2, y, 1, h);
  // caps
  g.fillStyle = '#5c5c5c';
  g.fillRect(x, y - 2, TILE, 3);
  g.fillRect(x, y + h - 1, TILE, 3);
  if (open) return;
  const [dark, mid, light] = DOOR_COLORS[type];
  const bx = side === 'W' ? x + 5 : x + 3;
  const pulse = Math.sin(t * 0.1) > 0.6;
  for (let i = 0; i < h; i++) {
    const edge = i < 4 || i >= h - 4;
    const inset = edge ? (i < 4 ? 4 - i : i - (h - 5)) : 0;
    const w = 8 - Math.min(4, inset);
    const sx = side === 'W' ? bx : bx + (8 - w);
    g.fillStyle = dark;
    g.fillRect(sx, y + i, w, 1);
    g.fillStyle = pulse ? light : mid;
    g.fillRect(sx + 1, y + i, Math.max(1, w - 3), 1);
  }
  g.fillStyle = light;
  g.fillRect(side === 'W' ? bx + 2 : bx + 4, y + 8, 1, h - 16);
}

// ---------------------------------------------------------------- backgrounds

export function drawBackground(g: G, area: Area, camX: number, camY: number, t: number, w: number, h: number) {
  const s = AREA_STYLE[area];
  g.fillStyle = s.bg;
  g.fillRect(0, 0, w, h);
  switch (area) {
    case 'surface': {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#04041a');
      grad.addColorStop(1, '#261440');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(5);
      for (let i = 0; i < 90; i++) {
        const sx = (((r() * 1024 - camX * 0.15) % w) + w) % w;
        const sy = r() * h * 0.8;
        const tw = Math.sin(t * 0.05 + i) > 0.7;
        px(g, Math.floor(sx), Math.floor(sy), tw ? '#ffffff' : i % 3 ? '#8888cc' : '#ccccff');
      }
      // far ridges
      g.fillStyle = '#1a0e2a';
      for (let x = 0; x < w; x++) {
        const wx = x + camX * 0.3;
        const ridge = 150 + Math.sin(wx * 0.03) * 14 + Math.sin(wx * 0.011) * 22;
        g.fillRect(x, Math.floor(ridge - camY * 0.3), 1, h);
      }
      break;
    }
    case 'brinstar': {
      const r = rng(9);
      for (let i = 0; i < 40; i++) {
        const sx = (((r() * 600 - camX * 0.5) % w) + w) % w;
        const sy = (((r() * 600 - camY * 0.5) % h) + h) % h;
        px(g, Math.floor(sx), Math.floor(sy), '#0c1c48');
        px(g, Math.floor(sx) + 1, Math.floor(sy), '#0c1c48');
      }
      break;
    }
    case 'norfair': {
      const r = rng(3);
      for (let i = 0; i < 30; i++) {
        const sx = (((r() * 600 - camX * 0.5) % w) + w) % w;
        const sy = (((r() * 600 - camY * 0.5 - t * (0.2 + r() * 0.3)) % h) + h) % h;
        g.fillStyle = '#3c0800';
        g.fillRect(Math.floor(sx), Math.floor(sy), 2, 2);
      }
      break;
    }
    case 'tourian': {
      g.fillStyle = '#06201a';
      const ox = Math.floor(-camX * 0.5) % 32;
      const oy = Math.floor(-camY * 0.5) % 32;
      for (let x = ox; x < w; x += 32) g.fillRect(x, 0, 1, h);
      for (let y = oy; y < h; y += 32) g.fillRect(0, y, w, 1);
      break;
    }
    case 'dev': {
      g.fillStyle = '#26262e';
      const ox = Math.floor(-camX) % 16;
      const oy = Math.floor(-camY) % 16;
      for (let x = ox; x < w; x += 16) g.fillRect(x, 0, 1, h);
      for (let y = oy; y < h; y += 16) g.fillRect(0, y, w, 1);
      break;
    }
    case 'minus': {
      g.fillStyle = '#0c3c7c';
      for (let y = 0; y < h; y += 6) {
        const off = Math.floor(Math.sin(y * 0.2 + t * 0.05) * 6);
        g.fillRect(off + ((y * 13) % 40), y, 24, 1);
        g.fillRect(off + ((y * 29) % 90) + 120, y, 30, 1);
      }
      break;
    }
    case 'oob': {
      const r = rng(Math.floor(t / 3));
      for (let i = 0; i < 120; i++) {
        g.fillStyle = GARBAGE[Math.floor(r() * GARBAGE.length)];
        g.globalAlpha = 0.12;
        g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 30), 1);
      }
      g.globalAlpha = 1;
      break;
    }
  }
}

// ---------------------------------------------------------------- ship

/** Samus's gunship, drawn with its bottom-center at (cx, bottom). */
export function drawShip(g: G, cx: number, bottom: number, t: number) {
  const x0 = Math.round(cx);
  const y0 = Math.round(bottom) - 30;
  const row = (y: number, half: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x0 - half, y0 + y, half * 2, 1);
  };
  // landing legs
  g.fillStyle = '#3c3c3c';
  g.fillRect(x0 - 17, y0 + 20, 3, 10);
  g.fillRect(x0 + 14, y0 + 20, 3, 10);
  g.fillRect(x0 - 20, y0 + 28, 8, 2);
  g.fillRect(x0 + 12, y0 + 28, 8, 2);
  const profile: [number, string][] = [
    [5, '#f8b800'],
    [8, '#f8b800'],
    [10, '#fcd850'],
    [11, '#f8b800'],
    [13, '#f8b800'],
    [15, '#e09000'],
    [16, '#e09000'],
    [17, '#c87000'],
    [24, '#7c3c00'],
    [26, '#5c2c00'],
    [26, '#8c8c8c'],
    [24, '#6c6c6c'],
    [20, '#5c5c5c'],
    [16, '#4c4c4c'],
    [12, '#3c3c3c'],
    [10, '#2c2c2c'],
  ];
  profile.forEach(([half, color], i) => row(i + 4, half, color));
  // cockpit
  g.fillStyle = '#58d854';
  g.fillRect(x0 - 5, y0 + 6, 10, 3);
  g.fillStyle = '#b8f8b8';
  g.fillRect(x0 - 3, y0 + 6, 3, 1);
  // wing lights
  const blink = Math.floor(t / 30) % 2 === 0;
  g.fillStyle = blink ? '#fc4040' : '#601010';
  g.fillRect(x0 - 25, y0 + 13, 2, 2);
  g.fillStyle = blink ? '#601010' : '#40fc40';
  g.fillRect(x0 + 23, y0 + 13, 2, 2);
  // thrusters glow
  g.fillStyle = '#fc7400';
  g.fillRect(x0 - 6, y0 + 20, 3, 1);
  g.fillRect(x0 + 3, y0 + 20, 3, 1);
}
