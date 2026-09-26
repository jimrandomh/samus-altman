import { describe, expect, it } from 'vitest';
import { activeLine, canPick, containsTarget, generateMatrix, matchedPrefix, solvableMatrix, status } from './matrix';
import { E, flowNext, flowReachesSink, generatePipes, N, openings, rotateMask, S, solvable, trace, W } from './pipes';
import { seeded } from './rng';

describe('pipes', () => {
  it('rotates masks clockwise', () => {
    expect(rotateMask(N | S, 1)).toBe(E | W);
    expect(rotateMask(N | E, 1)).toBe(E | S);
    expect(rotateMask(N | E, 3)).toBe(W | N);
  });

  it('generates solvable, initially unsolved puzzles whose stored solution works', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seeded(seed);
      const big = seed % 2 === 0;
      const p = generatePipes(rng, big
        ? { w: 7, h: 6, minRoute: 14, decoys: ['straight', 'elbow', 'cross'] }
        : { w: 5, h: 5, minRoute: 9, decoys: ['straight', 'elbow', 'tee'] });
      expect(trace(p).solved).toBe(false);
      expect(solvable(p)).toBe(true);
      expect(p.route.length).toBeGreaterThanOrEqual(big ? 14 : 9);
      const solved = { ...p, cells: p.cells.map((c, i) => ({ ...c, rot: p.solution[i] })) };
      expect(trace(solved).solved).toBe(true);
      if (big) expect(flowReachesSink(solved)).toBe(true);
    }
  });

  it('flow leaks at a dead end and passes straight through crosses', () => {
    // 1 row x 3: straight(E-W), cross, straight(E-W)
    const mk = (rot2: number) => ({
      w: 3,
      h: 1,
      sourceRow: 0,
      sinkRow: 0,
      solution: [],
      route: [],
      cells: [
        { type: 'straight' as const, rot: 1 },
        { type: 'cross' as const, rot: 0 },
        { type: 'straight' as const, rot: rot2 },
      ],
    });
    expect(flowNext(mk(1), 0, W)).toEqual({ kind: 'advance', cell: 1, entry: W });
    expect(flowNext(mk(1), 1, W)).toEqual({ kind: 'advance', cell: 2, entry: W });
    expect(flowReachesSink(mk(1))).toBe(true);
    expect(flowNext(mk(0), 1, W)).toEqual({ kind: 'leak' });
    expect(flowReachesSink(mk(0))).toBe(false);
    expect(trace(mk(1)).solved).toBe(true);
    expect(openings({ type: 'cross', rot: 0 })).toBe(15);
  });
});

describe('code matrix', () => {
  it('alternates row and column starting on the top row', () => {
    const p = generateMatrix(seeded(3));
    const s = { picks: [] as [number, number][] };
    expect(activeLine(s)).toEqual({ axis: 'row', index: 0 });
    expect(canPick(p, s, 1, 0)).toBe(false);
    expect(canPick(p, s, 0, 2)).toBe(true);
    s.picks.push([0, 2]);
    expect(activeLine(s)).toEqual({ axis: 'col', index: 2 });
    expect(canPick(p, s, 0, 2)).toBe(false); // already used
    expect(canPick(p, s, 3, 2)).toBe(true);
    s.picks.push([3, 2]);
    expect(activeLine(s)).toEqual({ axis: 'row', index: 3 });
  });

  it('generates targets reachable within the buffer', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = generateMatrix(seeded(seed), 5, 4, 6);
      expect(p.target).toHaveLength(4);
      expect(solvableMatrix(p)).toBe(true);
      expect(status(p, { picks: p.solution })).toBe('won');
    }
  });

  it('tracks progress and detects overflow', () => {
    expect(containsTarget(['1C', '55', 'BD'], ['55', 'BD'])).toBe(true);
    expect(containsTarget(['1C', '55'], ['55', 'BD'])).toBe(false);
    expect(matchedPrefix(['1C', '55', 'BD'], ['BD', 'E9'])).toBe(1);
    expect(matchedPrefix(['55', 'BD'], ['55', 'BD', 'E9'])).toBe(2);
    const p = { size: 2, grid: [['1C', '1C'], ['1C', '1C']], target: ['FF'], buffer: 2, solution: [] };
    expect(status(p, { picks: [[0, 0], [1, 0]] })).toBe('failed');
  });
});
