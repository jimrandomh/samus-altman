// Code-matrix puzzle: pick codes alternating row/column, starting on the top row,
// so that the buffer contains the target sequence.
import { pick, type Rng } from './rng';

export const CODES = ['1C', '55', 'BD', 'E9', '7A', 'FF'] as const;

export interface MatrixPuzzle {
  size: number;
  grid: string[][];
  target: string[];
  buffer: number;
  /** A pick sequence that works, for dev tools. */
  solution: [number, number][];
}

export interface MatrixState {
  picks: [number, number][];
}

/** The row (even pick count) or column (odd) the next pick must come from. */
export function activeLine(s: MatrixState): { axis: 'row' | 'col'; index: number } {
  const n = s.picks.length;
  if (n === 0) return { axis: 'row', index: 0 };
  const [r, c] = s.picks[n - 1];
  return n % 2 === 1 ? { axis: 'col', index: c } : { axis: 'row', index: r };
}

export function canPick(p: MatrixPuzzle, s: MatrixState, r: number, c: number): boolean {
  if (s.picks.length >= p.buffer) return false;
  if (s.picks.some(([pr, pc]) => pr === r && pc === c)) return false;
  const line = activeLine(s);
  return line.axis === 'row' ? r === line.index : c === line.index;
}

export function sequence(p: MatrixPuzzle, s: MatrixState): string[] {
  return s.picks.map(([r, c]) => p.grid[r][c]);
}

export function containsTarget(seq: string[], target: string[]): boolean {
  outer: for (let i = 0; i + target.length <= seq.length; i++) {
    for (let j = 0; j < target.length; j++) if (seq[i + j] !== target[j]) continue outer;
    return true;
  }
  return false;
}

/** Length of the longest suffix of seq that is a prefix of target (progress toward the goal). */
export function matchedPrefix(seq: string[], target: string[]): number {
  for (let k = Math.min(seq.length, target.length); k > 0; k--) {
    let ok = true;
    for (let j = 0; j < k; j++) if (seq[seq.length - k + j] !== target[j]) ok = false;
    if (ok) return k;
  }
  return 0;
}

export type MatrixStatus = 'playing' | 'won' | 'failed';

export function status(p: MatrixPuzzle, s: MatrixState): MatrixStatus {
  if (containsTarget(sequence(p, s), p.target)) return 'won';
  if (s.picks.length >= p.buffer) return 'failed';
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (canPick(p, s, r, c)) return 'playing';
  return 'failed';
}

export function generateMatrix(rng: Rng, size = 5, targetLen = 4, buffer = 6): MatrixPuzzle {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => pick(rng, CODES)));
  const state: MatrixState = { picks: [] };
  const p: MatrixPuzzle = { size, grid, target: [], buffer, solution: [] };
  for (let i = 0; i < targetLen; i++) {
    const options: [number, number][] = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (canPick({ ...p, buffer: targetLen }, state, r, c)) options.push([r, c]);
    state.picks.push(pick(rng, options));
  }
  p.solution = state.picks;
  p.target = sequence(p, state);
  return p;
}

/** Exhaustive search: can the target be produced within the buffer? */
export function solvableMatrix(p: MatrixPuzzle): boolean {
  const dfs = (s: MatrixState): boolean => {
    if (containsTarget(sequence(p, s), p.target)) return true;
    if (s.picks.length >= p.buffer) return false;
    for (let r = 0; r < p.size; r++) {
      for (let c = 0; c < p.size; c++) {
        if (canPick(p, s, r, c) && dfs({ picks: [...s.picks, [r, c]] })) return true;
      }
    }
    return false;
  };
  return dfs({ picks: [] });
}
