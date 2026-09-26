// Rotate-the-pipes puzzle: connect SOURCE (left edge) to SINK (right edge).
import { pick, shuffle, type Rng } from './rng';

// Direction bits: N=1, E=2, S=4, W=8. Index 0..3 = N,E,S,W.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
const DIRS = [N, E, S, W] as const;
const DR = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 } as Record<number, number>;
const DC = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 } as Record<number, number>;

export type PieceType = 'straight' | 'elbow' | 'tee' | 'cross';

const BASE: Record<PieceType, number> = {
  straight: N | S,
  elbow: N | E,
  tee: N | E | S,
  cross: N | E | S | W,
};

export interface Cell {
  type: PieceType;
  rot: number; // 0..3 clockwise quarter turns
}

export interface PipePuzzle {
  w: number;
  h: number;
  cells: Cell[]; // row-major
  sourceRow: number; // enters cell (sourceRow, 0) from the west
  sinkRow: number; // leaves cell (sinkRow, w-1) to the east
  /** The rotations that solve it (by construction), for dev tools. */
  solution: number[];
  /** The generated route, as cell indices from source to sink. */
  route: number[];
}

export function opposite(d: number): number {
  return d === N ? S : d === S ? N : d === E ? W : E;
}

export function rotateMask(mask: number, rot: number): number {
  let m = mask;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}

export function openings(c: Cell): number {
  return rotateMask(BASE[c.type], c.rot);
}

function rotationFor(type: PieceType, mask: number): number {
  for (let r = 0; r < 4; r++) if (rotateMask(BASE[type], r) === mask) return r;
  throw new Error(`no rotation of ${type} gives ${mask}`);
}

export interface GenOptions {
  w: number;
  h: number;
  minRoute: number;
  decoys: PieceType[];
}

/** Self-avoiding random walk from the source cell to the sink cell. */
function randomRoute(rng: Rng, w: number, h: number, sr: number, kr: number, minLen: number): number[] | null {
  const target = kr * w + (w - 1);
  const visited = new Set<number>();
  const path: number[] = [];
  let budget = 20000;
  const dfs = (idx: number): boolean => {
    if (--budget < 0) return false;
    visited.add(idx);
    path.push(idx);
    if (idx === target) {
      if (path.length >= minLen) return true;
    } else {
      const r = Math.floor(idx / w);
      const c = idx % w;
      const moves = shuffle(rng, [...DIRS] as number[]);
      // A little eastward bias keeps routes from spiralling forever.
      if (rng() < 0.35) moves.sort((a, b) => (a === E ? -1 : b === E ? 1 : 0));
      for (const d of moves) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        const n = nr * w + nc;
        if (visited.has(n)) continue;
        if (dfs(n)) return true;
      }
    }
    visited.delete(idx);
    path.pop();
    return false;
  };
  return dfs(sr * w) ? path : null;
}

function dirBetween(w: number, a: number, b: number): number {
  const dr = Math.floor(b / w) - Math.floor(a / w);
  const dc = (b % w) - (a % w);
  if (dr === -1) return N;
  if (dr === 1) return S;
  if (dc === 1) return E;
  return W;
}

export function generatePipes(rng: Rng, opts: GenOptions): PipePuzzle {
  const { w, h } = opts;
  for (let attempt = 0; attempt < 200; attempt++) {
    const sr = Math.floor(rng() * h);
    const kr = Math.floor(rng() * h);
    const route = randomRoute(rng, w, h, sr, kr, opts.minRoute);
    if (!route) continue;
    const cells: Cell[] = [];
    for (let i = 0; i < w * h; i++) {
      const type = pick(rng, opts.decoys);
      cells.push({ type, rot: Math.floor(rng() * 4) });
    }
    route.forEach((idx, i) => {
      const inDir = i === 0 ? W : opposite(dirBetween(w, route[i - 1], idx));
      const outDir = i === route.length - 1 ? E : dirBetween(w, idx, route[i + 1]);
      const mask = inDir | outDir;
      const type: PieceType = inDir === opposite(outDir) ? 'straight' : 'elbow';
      cells[idx] = { type, rot: rotationFor(type, mask) };
    });
    const solution = cells.map((c) => c.rot);
    const puzzle: PipePuzzle = { w, h, cells, sourceRow: sr, sinkRow: kr, solution, route };
    // scramble until unsolved
    for (let tries = 0; tries < 50; tries++) {
      for (const c of cells) c.rot = Math.floor(rng() * 4);
      if (!trace(puzzle).solved) return puzzle;
    }
  }
  throw new Error('failed to generate pipe puzzle');
}

export interface TraceResult {
  /** Cells reachable from the source through mutually-connected openings. */
  connected: Set<number>;
  solved: boolean;
}

/** Flood from the source through matching openings. */
export function trace(p: PipePuzzle): TraceResult {
  const { w, h, cells } = p;
  const connected = new Set<number>();
  const start = p.sourceRow * w;
  if (!(openings(cells[start]) & W)) return { connected, solved: false };
  const stack = [start];
  connected.add(start);
  let solved = false;
  while (stack.length) {
    const idx = stack.pop()!;
    const r = Math.floor(idx / w);
    const c = idx % w;
    const o = openings(cells[idx]);
    for (const d of DIRS) {
      if (!(o & d)) continue;
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) {
        if (d === E && idx === p.sinkRow * w + w - 1) solved = true;
        continue;
      }
      const n = nr * w + nc;
      if (connected.has(n)) continue;
      if (openings(cells[n]) & opposite(d)) {
        connected.add(n);
        stack.push(n);
      }
    }
  }
  return { connected, solved };
}

/** Is there some assignment of rotations that connects source to sink? (Independent check.) */
export function solvable(p: PipePuzzle): boolean {
  const { w, h, cells } = p;
  const visited = new Set<number>();
  const dfs = (idx: number, entry: number): boolean => {
    const r = Math.floor(idx / w);
    const c = idx % w;
    visited.add(idx);
    const masks = new Set([0, 1, 2, 3].map((rot) => rotateMask(BASE[cells[idx].type], rot)));
    for (const m of masks) {
      if (!(m & entry)) continue;
      for (const d of DIRS) {
        if (d === entry || !(m & d)) continue;
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr < 0 || nr >= h || nc < 0 || nc >= w) {
          if (d === E && idx === p.sinkRow * w + w - 1) return true;
          continue;
        }
        const n = nr * w + nc;
        if (!visited.has(n) && dfs(n, opposite(d))) return true;
      }
    }
    visited.delete(idx);
    return false;
  };
  return dfs(p.sourceRow * w, W);
}

export type FlowStep = { kind: 'advance'; cell: number; entry: number } | { kind: 'leak' } | { kind: 'done' };

/**
 * One step of the containment trace: from `cell` (entered via `entry`), where does it go next?
 * Straight/elbow have one exit; a cross passes straight through. Tees are ambiguous and not used.
 */
export function flowNext(p: PipePuzzle, cell: number, entry: number): FlowStep {
  const o = openings(p.cells[cell]);
  if (!(o & entry)) return { kind: 'leak' };
  const exit = p.cells[cell].type === 'cross' ? opposite(entry) : o & ~entry;
  if (!DIRS.includes(exit as (typeof DIRS)[number])) return { kind: 'leak' };
  const r = Math.floor(cell / p.w) + DR[exit];
  const c = (cell % p.w) + DC[exit];
  if (r < 0 || r >= p.h || c < 0 || c >= p.w) {
    return exit === E && cell === p.sinkRow * p.w + p.w - 1 ? { kind: 'done' } : { kind: 'leak' };
  }
  const n = r * p.w + c;
  if (!(openings(p.cells[n]) & opposite(exit))) return { kind: 'leak' };
  return { kind: 'advance', cell: n, entry: opposite(exit) };
}

/** Would the trace, starting now, reach the sink? */
export function flowReachesSink(p: PipePuzzle): boolean {
  let cell = p.sourceRow * p.w;
  let entry = W;
  if (!(openings(p.cells[cell]) & W)) return false;
  for (let i = 0; i < p.w * p.h * 2; i++) {
    const s = flowNext(p, cell, entry);
    if (s.kind === 'done') return true;
    if (s.kind === 'leak') return false;
    cell = s.cell;
    entry = s.entry;
  }
  return false;
}
