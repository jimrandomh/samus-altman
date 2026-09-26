import { describe, expect, it } from 'vitest';
import { JUMP_V, HIGH_JUMP_V, GRAVITY, MAX_FALL, SCREEN_COLS, SCREEN_ROWS, TILE } from './constants';
import { PICKUP_ITEMS, TABLE_ITEMS, type ItemId } from './items';
import { moveAxis } from './physics';
import { Player, NO_ABILITIES, type Abilities, type Action } from './player';
import { CONSERVATIVE, OPTIMISTIC, reach, reachedCell } from './reach';
import { ROOMS } from './rooms';
import type { RoomDef } from './rooms/types';
import { ROOM_DATA, RoomRuntime, parseRoom, roomAtWorldTile } from './world';

const SOLID = new Set(['#', '%', '=', 'T', 'B', 'b', 'S', 'M', 'G', 'D', 'R', 'L', 'E', 'x', 'c']);

describe('room data', () => {
  it('every room is a whole number of screens with even rows', () => {
    for (const r of ROOMS) {
      expect(r.map.length % SCREEN_ROWS, `${r.id} rows`).toBe(0);
      const w = r.map[0].length;
      expect(w % SCREEN_COLS, `${r.id} cols`).toBe(0);
      r.map.forEach((line, i) => expect(line.length, `${r.id} row ${i}`).toBe(w));
    }
  });

  it('rooms do not overlap in world space', () => {
    const owner = new Map<string, string>();
    for (const r of Object.values(ROOM_DATA)) {
      for (let sy = 0; sy < r.rows / SCREEN_ROWS; sy++)
        for (let sx = 0; sx < r.cols / SCREEN_COLS; sx++) {
          const k = `${r.def.x + sx},${r.def.y + sy}`;
          expect(owner.get(k), `${r.id} overlaps ${owner.get(k)} at ${k}`).toBeUndefined();
          owner.set(k, r.id);
        }
    }
  });

  it('item, sign and marker counts match the metadata', () => {
    for (const r of ROOMS) {
      const text = r.map.join('');
      const count = (ch: string) => [...text].filter((c) => c === ch).length;
      expect(count('I'), `${r.id} items`).toBe(r.items?.length ?? 0);
      expect(count('s'), `${r.id} signs`).toBe(r.signs?.length ?? 0);
    }
    const all = (ch: string) => ROOMS.flatMap((r) => [...r.map.join('')].filter((c) => c === ch));
    expect(all('P')).toHaveLength(1);
    expect(all('H')).toHaveLength(1);
    expect(all('@')).toHaveLength(1);
  });

  it('places every pickup item exactly once and no event items', () => {
    const placed: ItemId[] = ROOMS.flatMap((r) => r.items ?? []);
    for (const id of PICKUP_ITEMS) expect(placed.filter((p) => p === id), id).toHaveLength(1);
    expect(placed).not.toContain('motherboard');
    expect(placed).not.toContain('escape');
    expect(TABLE_ITEMS).toHaveLength(12);
  });

  it('every opening on a room edge lines up with an opening in the neighbour', () => {
    for (const r of Object.values(ROOM_DATA)) {
      if (r.def.wrap) continue;
      for (const [col, dx] of [
        [0, -1],
        [r.cols - 1, 1],
      ] as const) {
        for (let row = 0; row < r.rows; row++) {
          const ch = r.base[row * r.cols + col];
          const open = !SOLID.has(ch) || 'DRLBbSM'.includes(ch);
          if (!open) continue;
          const wc = r.wcol + col + dx;
          const wr = r.wrow + row;
          const n = roomAtWorldTile(wc, wr);
          expect(n, `${r.id} ${col},${row} leads nowhere`).toBeDefined();
          const nch = n!.base[(wr - n!.wrow) * n!.cols + (wc - n!.wcol)];
          const nOpen = !SOLID.has(nch) || 'DRLBbSM'.includes(nch);
          expect(nOpen, `${r.id} ${col},${row} -> ${n!.id} is '${nch}'`).toBe(true);
          if ('DRL'.includes(ch)) expect('DRL'.includes(nch), `${r.id} door ${row} -> ${n!.id} '${nch}'`).toBe(true);
        }
      }
    }
  });

  it('elevators pair up', () => {
    for (const r of Object.values(ROOM_DATA)) {
      if (!r.def.elevator) {
        expect(r.pads, r.id).toHaveLength(0);
        continue;
      }
      expect(r.pads.length, r.id).toBeGreaterThan(0);
      expect(ROOM_DATA[r.def.elevator].def.elevator).toBe(r.id);
    }
  });

  it('ceiling enemies hang from something and walkers stand on something', () => {
    for (const r of Object.values(ROOM_DATA)) {
      for (const e of r.enemies) {
        const above = r.base[(e.row - 1) * r.cols + e.col];
        const below = r.base[(e.row + 1) * r.cols + e.col];
        if (e.ch === 'k' || e.ch === 'o') expect(SOLID.has(above), `${r.id} ${e.ch} at ${e.col},${e.row}`).toBe(true);
        if (e.ch === 'z' || e.ch === 't') expect(SOLID.has(below), `${r.id} ${e.ch} at ${e.col},${e.row}`).toBe(true);
      }
    }
  });

  it('the dev room has no way in', () => {
    const dev = ROOM_DATA['dev_00'];
    expect(dev.doors).toHaveLength(0);
    const res = reach({ morph: true, bombs: true, missiles: true, highjump: true, bossDefeated: true }, OPTIMISTIC);
    expect(res.rooms.has('dev_00')).toBe(false);
  });
});

describe('progression', () => {
  const all = { morph: true, bombs: true, missiles: true, highjump: true };

  it('starts with only the morph ball in reach', () => {
    const res = reach({}, OPTIMISTIC);
    expect([...res.items]).toEqual(['morph']);
    expect(res.rooms.has('shaft')).toBe(false);
  });

  it('morph ball opens the shaft and missiles, not bombs', () => {
    const res = reach({ morph: true }, CONSERVATIVE);
    expect(res.items.has('missiles')).toBe(true);
    const opt = reach({ morph: true }, OPTIMISTIC);
    expect(opt.items.has('bombs')).toBe(false);
    expect(opt.rooms.has('bomb_room')).toBe(false);
  });

  it('missiles open the bomb room; the shaft floor needs bombs', () => {
    const res = reach({ morph: true, missiles: true }, CONSERVATIVE);
    expect(res.items.has('bombs')).toBe(true);
    const opt = reach({ morph: true, missiles: true }, OPTIMISTIC);
    expect(opt.rooms.has('lower_hall')).toBe(false);
    expect(opt.rooms.has('norfair_shaft')).toBe(false);
    expect(opt.items.has('etank1')).toBe(false);
    expect(opt.items.has('item0c')).toBe(false);
  });

  it('bombs reach high jump, etank 1, norfair and item 0x0C, but not varia', () => {
    const res = reach({ morph: true, missiles: true, bombs: true }, CONSERVATIVE);
    for (const id of ['highjump', 'etank1', 'item0c', 'longbeam', 'etank2', 'missiletank'] as ItemId[])
      expect(res.items.has(id), id).toBe(true);
    const opt = reach({ morph: true, missiles: true, bombs: true }, OPTIMISTIC);
    expect(opt.items.has('varia')).toBe(false);
    expect(opt.items.has('etank3')).toBe(false);
  });

  it('high jump reaches varia, etank 3 and the boss room', () => {
    const res = reach(all, CONSERVATIVE);
    for (const id of ['varia', 'etank3'] as ItemId[]) expect(res.items.has(id), id).toBe(true);
    expect(res.rooms.has('boss_room')).toBe(true);
    expect(res.rooms.has('escape_shaft')).toBe(false);
  });

  it('the glass keeps Samus away from Mother Board', () => {
    const res = reach({ ...all, bossDefeated: false }, OPTIMISTIC);
    for (let row = 2; row <= 12; row++) expect(reachedCell(res, 'boss_room', 8, row)).toBe(false);
  });

  it('after the boss, the escape shaft leads to the ship', () => {
    const r = ROOM_DATA['boss_room'];
    const res = reach({ ...all, bossDefeated: true }, CONSERVATIVE, { room: 'boss_room', col: 13, row: 12 });
    expect(res.rooms.has('escape_shaft')).toBe(true);
    const ship = ROOM_DATA['landing'].ship!;
    expect(reachedCell(res, 'landing', ship.col, ship.row)).toBe(true);
    expect(r.boss).toBeDefined();
  });
});

// A minimal input stub for driving the Player in tests.
function inputs(held: Action[], pressed: Action[] = []) {
  return {
    held: (a: Action) => held.includes(a),
    pressed: (a: Action) => pressed.includes(a),
  };
}

function testRoom(map: string[]): RoomRuntime {
  const def: RoomDef = { id: 'test', name: 'test', area: 'brinstar', x: 99, y: 99, map };
  return new RoomRuntime(parseRoom(def));
}

const FLAT = [
  '################',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '################',
  '################',
];

function apex(abilities: Abilities): number {
  const room = testRoom(FLAT);
  const p = new Player();
  p.placeAtTile(7, 12);
  const env = { room, abilities, water: false, input: inputs([]) };
  p.update(env);
  const floorFeet = p.feet;
  let minFeet = floorFeet;
  p.update({ ...env, input: inputs(['jump'], ['jump']) });
  for (let i = 0; i < 120; i++) {
    p.update({ ...env, input: inputs(['jump']) });
    minFeet = Math.min(minFeet, p.feet);
  }
  return (floorFeet - minFeet) / TILE;
}

describe('physics', () => {
  it('normal jump clears 3 tiles but not 5', () => {
    const h = apex(NO_ABILITIES);
    expect(h).toBeGreaterThan(3.5);
    expect(h).toBeLessThan(4.9);
  });

  it('high jump clears 6 tiles', () => {
    const h = apex({ ...NO_ABILITIES, highjump: true });
    expect(h).toBeGreaterThan(6.4);
  });

  it('tapping jump gives a short hop', () => {
    const room = testRoom(FLAT);
    const p = new Player();
    p.placeAtTile(7, 12);
    const env = { room, abilities: NO_ABILITIES, water: false, input: inputs([]) };
    p.update(env);
    const start = p.feet;
    p.update({ ...env, input: inputs(['jump'], ['jump']) });
    let min = p.feet;
    for (let i = 0; i < 60; i++) {
      p.update(env);
      min = Math.min(min, p.feet);
    }
    expect((start - min) / TILE).toBeLessThan(1.5);
  });

  it('the morph ball fits a one-tile tunnel and cannot stand up inside it', () => {
    const room = testRoom([
      '################',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#......########',
      '#..............#',
      '################',
      '################',
    ].map((l) => l.padEnd(16, '#')));
    const p = new Player();
    p.placeAtTile(3, 12);
    const abilities = { ...NO_ABILITIES, morph: true };
    const env = { room, abilities, water: false, input: inputs(['right']) };
    for (let i = 0; i < 60; i++) p.update(env);
    expect(p.x + p.w).toBeLessThanOrEqual(7 * TILE + 0.001); // blocked standing
    p.update({ ...env, input: inputs(['down'], ['down']) });
    expect(p.ball).toBe(true);
    for (let i = 0; i < 60; i++) p.update(env);
    expect(p.x).toBeGreaterThan(8 * TILE);
    expect(p.unmorph(room)).toBe(false);
  });

  it('falls at a capped speed and lands flush', () => {
    const room = testRoom(FLAT);
    const b = { x: 40, y: 20, w: 12, h: 30, vx: 0, vy: 0 };
    let maxV = 0;
    for (let i = 0; i < 200; i++) {
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY);
      maxV = Math.max(maxV, b.vy);
      moveAxis(room, b, 'y');
    }
    expect(maxV).toBeLessThanOrEqual(MAX_FALL);
    expect(b.y + b.h).toBe(13 * TILE);
    expect(JUMP_V).toBeLessThan(HIGH_JUMP_V);
  });
});
