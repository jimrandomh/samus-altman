// Real-physics feasibility of the climbs on the critical path: for each hop, search a family of
// human-plausible input timings and require several of them to land on the target platform.
import { describe, expect, it } from 'vitest';
import { TILE } from './constants';
import { NO_ABILITIES, Player, type Abilities, type Action } from './player';
import { ROOM_DATA, RoomRuntime } from './world';

interface Hop {
  /** Take-off: feet row and the range of columns Samus may stand on. */
  from: [number, [number, number]];
  /** Target feet row. */
  to: number;
}

function simulate(room: RoomRuntime, abilities: Abilities, x: number, row: number, dir: 1 | -1, dirStart: number, dirLen: number): number | null {
  const p = new Player();
  p.x = x;
  p.y = (row + 1) * TILE - p.h;
  const env = (held: Action[], pressed: Action[] = []) => ({
    room,
    abilities,
    water: false,
    input: { held: (a: Action) => held.includes(a), pressed: (a: Action) => pressed.includes(a) },
  });
  p.update(env([]));
  if (!p.grounded) return null;
  const side: Action = dir > 0 ? 'right' : 'left';
  let left = false;
  for (let f = 0; f < 200; f++) {
    const held: Action[] = f < 40 ? ['jump'] : [];
    if (f >= dirStart && f < dirStart + dirLen) held.push(side);
    p.update(env(held, f === 0 ? ['jump'] : []));
    if (!p.grounded) left = true;
    else if (left) return p.feet / TILE - 1;
  }
  return null;
}

function strategies(roomId: string, hop: Hop, abilities: Abilities): number {
  // Assume bomb blocks along the way have already been broken (gating is tested elsewhere).
  const data = ROOM_DATA[roomId];
  const broken = data.base.flatMap((ch, i) => (ch === 'B' ? [i] : []));
  const room = new RoomRuntime(data, { broken });
  let ok = 0;
  const [row, [c0, c1]] = hop.from;
  for (let col = c0; col <= c1; col++)
    for (const off of [0, 2, 4])
      for (const dir of [1, -1] as const)
        for (let dirStart = 0; dirStart <= 24; dirStart += 3)
          for (let dirLen = 3; dirLen <= 48; dirLen += 3)
            if (simulate(room, abilities, col * TILE + off, row, dir, dirStart, dirLen) === hop.to) ok++;
  return ok;
}

const NORMAL = NO_ABILITIES;
const HIGH = { ...NO_ABILITIES, highjump: true };

// Each hop: take-off feet row + column range → target feet row.
const ROUTES: [string, Abilities, Hop[]][] = [
  [
    'shaft',
    NORMAL,
    [
      { from: [12, [1, 4]], to: 9 },
      { from: [9, [6, 8]], to: 6 },
      { from: [42, [1, 14]], to: 39 },
      { from: [39, [10, 13]], to: 36 },
      { from: [36, [5, 8]], to: 33 },
      { from: [33, [10, 13]], to: 30 },
      { from: [30, [5, 8]], to: 27 },
      { from: [27, [1, 4]], to: 24 },
      { from: [24, [1, 3]], to: 21 },
      { from: [21, [5, 7]], to: 18 },
      { from: [18, [8, 10]], to: 15 },
      { from: [15, [5, 6]], to: 12 },
    ],
  ],
  [
    'missile_room',
    NORMAL,
    [
      { from: [12, [1, 14]], to: 9 },
      { from: [9, [4, 6]], to: 6 },
    ],
  ],
  [
    'norfair_shaft',
    NORMAL,
    [
      { from: [42, [8, 14]], to: 39 },
      { from: [39, [10, 12]], to: 36 },
      { from: [36, [5, 7]], to: 33 },
      { from: [33, [2, 4]], to: 30 },
      { from: [30, [6, 8]], to: 27 },
      { from: [27, [1, 3]], to: 24 },
      { from: [24, [3, 5]], to: 21 },
      { from: [21, [6, 8]], to: 18 },
      { from: [18, [9, 11]], to: 15 },
      { from: [15, [5, 7]], to: 12 },
      { from: [12, [11, 14]], to: 9 },
      { from: [9, [8, 10]], to: 6 },
    ],
  ],
  [
    'escape_shaft',
    NORMAL,
    [
      { from: [42, [1, 14]], to: 39 },
      { from: [39, [10, 13]], to: 36 },
      { from: [36, [6, 9]], to: 33 },
      { from: [33, [2, 5]], to: 30 },
      { from: [30, [7, 10]], to: 27 },
      { from: [27, [11, 14]], to: 24 },
      { from: [24, [6, 9]], to: 21 },
      { from: [21, [2, 5]], to: 18 },
      { from: [18, [7, 10]], to: 15 },
      { from: [15, [11, 14]], to: 12 },
      { from: [12, [6, 9]], to: 9 },
      { from: [9, [2, 5]], to: 6 },
    ],
  ],
  [
    'varia_climb',
    HIGH,
    [
      { from: [21, [1, 14]], to: 16 },
      { from: [16, [9, 13]], to: 11 },
      { from: [11, [2, 6]], to: 6 },
    ],
  ],
  ['lower_hall', HIGH, [{ from: [12, [36, 40]], to: 6 }]],
  ['tourian_hall', HIGH, [{ from: [12, [15, 19]], to: 6 }]],
];

describe('real-physics hops', () => {
  for (const [roomId, abilities, hops] of ROUTES) {
    it(`${roomId} is climbable`, () => {
      const hard = hops
        .map((hop) => ({ hop, n: strategies(roomId, hop, abilities) }))
        .filter(({ n }) => n < 8)
        .map(({ hop, n }) => `row ${hop.from[0]} cols ${hop.from[1]} → row ${hop.to}: ${n} ways`);
      expect(hard).toEqual([]);
    });
  }

  it('the high-jump ledges really need high jump', () => {
    expect(strategies('lower_hall', { from: [12, [30, 46]], to: 6 }, NORMAL)).toBe(0);
    expect(strategies('tourian_hall', { from: [12, [12, 30]], to: 6 }, NORMAL)).toBe(0);
    expect(strategies('varia_climb', { from: [21, [1, 14]], to: 16 }, NORMAL)).toBe(0);
  });
});
