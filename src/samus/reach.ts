// Coarse tile-level reachability search over the whole world, used by tests to check
// that the critical path is completable and that each gate actually gates.
import type { ItemId } from './items';
import { ROOM_DATA, type RoomData } from './world';

export interface ReachAbilities {
  morph?: boolean;
  bombs?: boolean;
  missiles?: boolean;
  highjump?: boolean;
  bossDefeated?: boolean;
}

export interface ReachParams {
  /** Tiles of rise from a normal jump. */
  jump: number;
  /** Tiles of rise with high jump boots. */
  highJump: number;
  /** Tiles of horizontal drift at the top of a jump. */
  air: number;
  /** Allow drifting one tile sideways per tile fallen. */
  fallDrift: boolean;
  /** Extra free tiles required above the head at the top of a rise (room for the arc). */
  headroom: number;
}

/** What the real physics can definitely do (for "is reachable" checks). */
export const CONSERVATIVE: ReachParams = { jump: 3, highJump: 6, air: 3, fallDrift: false, headroom: 1 };
/** More than the real physics can do (for "is NOT reachable" checks). */
export const OPTIMISTIC: ReachParams = { jump: 4, highJump: 7, air: 5, fallDrift: true, headroom: 0 };

type Dir = 'h' | 'up' | 'down';

interface WorldTile {
  ch: string;
  room: RoomData;
}

let worldTiles: Map<string, WorldTile> | null = null;
function world(): Map<string, WorldTile> {
  if (!worldTiles) {
    worldTiles = new Map();
    for (const r of Object.values(ROOM_DATA)) {
      for (let row = 0; row < r.rows; row++)
        for (let col = 0; col < r.cols; col++)
          worldTiles.set(`${r.wcol + col},${r.wrow + row}`, { ch: r.base[row * r.cols + col], room: r });
    }
  }
  return worldTiles;
}

function tile(wc: number, wr: number): string | null {
  return world().get(`${wc},${wr}`)?.ch ?? null;
}

const SOLID = new Set(['#', '%', '=', 'T', 'B', 'b', 'S', 'M', 'G', 'D', 'R', 'L', 'E', 'x', 'c']);

export interface ReachResult {
  cells: Set<string>;
  items: Set<ItemId>;
  rooms: Set<string>;
}

export function reach(
  ab: ReachAbilities,
  p: ReachParams,
  start: { room: string; col: number; row: number } = { room: 'landing', col: 24, row: 12 },
): ReachResult {
  const canEnter = (wc: number, wr: number, ball: boolean, dir: Dir): boolean => {
    const ch = tile(wc, wr);
    if (ch === null) return false;
    if (!SOLID.has(ch)) return true;
    switch (ch) {
      case 'S':
        return dir !== 'down' || (ball && !!ab.bombs);
      case 'M':
        return dir !== 'down' && !!ab.missiles;
      case 'B':
      case 'b':
        return ball && !!ab.bombs && dir !== 'up';
      case 'D':
        return dir === 'h';
      case 'R':
        return dir === 'h' && !!ab.missiles;
      case 'L':
        return dir === 'h' && !!ab.bossDefeated;
      default:
        return false;
    }
  };
  const solid = (wc: number, wr: number) => {
    const ch = tile(wc, wr);
    return ch === null || SOLID.has(ch);
  };

  const cells = new Set<string>();
  const seen = new Set<string>();
  const queue: [number, number, boolean][] = [];
  const touch = (wc: number, wr: number) => cells.add(`${wc},${wr}`);
  const push = (wc: number, wr: number, ball: boolean) => {
    const k = `${wc},${wr},${ball ? 1 : 0}`;
    if (seen.has(k)) return;
    seen.add(k);
    queue.push([wc, wr, ball]);
  };
  const standFits = (wc: number, wr: number, dir: Dir) => canEnter(wc, wr, false, dir) && canEnter(wc, wr - 1, false, dir);

  // Fall from a free position until supported; record every cell passed through.
  const fall = (wc: number, wr: number, ball: boolean, drift: boolean) => {
    const occupy = (c: number, r: number) => {
      touch(c, r);
      if (!ball) touch(c, r - 1);
    };
    const fits = (c: number, r: number) => (ball ? canEnter(c, r, true, 'h') : standFits(c, r, 'h'));
    const visited = new Set<string>();
    const go = (c: number, r: number, depth: number) => {
      const vk = `${c},${r}`;
      if (visited.has(vk)) return;
      visited.add(vk);
      occupy(c, r);
      if (depth > 200) return;
      const below = tile(c, r + 1);
      const fallThrough = ball && canEnter(c, r + 1, true, 'down');
      if (solid(c, r + 1) && !fallThrough) {
        push(c, r, ball);
        return;
      }
      if (fallThrough && below !== null && SOLID.has(below)) push(c, r, ball); // may rest on a bomb block too
      if (!ball && !canEnter(c, r + 1, false, 'down')) {
        push(c, r, ball);
        return;
      }
      go(c, r + 1, depth + 1);
      if (drift) {
        for (const d of [-1, 1]) if (fits(c + d, r + 1) && fits(c + d, r)) go(c + d, r + 1, depth + 1);
      }
    };
    go(wc, wr, 0);
  };

  const s = ROOM_DATA[start.room];
  fall(s.wcol + start.col, s.wrow + start.row, false, false);

  while (queue.length) {
    const [c, r, ball] = queue.shift()!;
    if (ball) {
      touch(c, r);
      for (const d of [-1, 1]) if (canEnter(c + d, r, true, 'h')) fall(c + d, r, true, p.fallDrift);
      if (ab.bombs && canEnter(c, r + 1, true, 'down')) fall(c, r + 1, true, p.fallDrift);
      if (canEnter(c, r - 1, false, 'up')) fall(c, r, false, false);
      continue;
    }
    touch(c, r);
    touch(c, r - 1);
    if (ab.morph) push(c, r, true);
    // Walk.
    for (const d of [-1, 1]) if (standFits(c + d, r, 'h')) fall(c + d, r, false, p.fallDrift);
    // Jump: rise k tiles, then drift sideways up to `air` tiles, then fall.
    const J = ab.highjump ? p.highJump : p.jump;
    for (let k = 1; k <= J; k++) {
      if (!canEnter(c, r - 1 - k, false, 'up')) break;
      let room = true;
      for (let h = 1; h <= p.headroom; h++) if (!canEnter(c, r - 1 - k - h, false, 'up')) room = false;
      if (!room) break;
      touch(c, r - 1 - k);
      fall(c, r - k, false, p.fallDrift);
      for (const d of [-1, 1]) {
        for (let step = 1; step <= p.air; step++) {
          const nc = c + d * step;
          if (!standFits(nc, r - k, 'h')) break;
          fall(nc, r - k, false, p.fallDrift);
        }
      }
    }
    // Elevators.
    const under = world().get(`${c},${r + 1}`);
    if (under && under.ch === 'E' && ab.bossDefeated && under.room.def.elevator) {
      const target = ROOM_DATA[under.room.def.elevator];
      const pad = target.pads[0];
      if (pad) fall(target.wcol + pad.col, target.wrow + pad.row - 1, false, false);
    }
  }

  const items = new Set<ItemId>();
  const rooms = new Set<string>();
  for (const r of Object.values(ROOM_DATA)) {
    for (const it of r.items) if (cells.has(`${r.wcol + it.col},${r.wrow + it.row}`)) items.add(it.id);
    for (const key of cells) {
      const [wc, wr] = key.split(',').map(Number);
      if (wc >= r.wcol && wc < r.wcol + r.cols && wr >= r.wrow && wr < r.wrow + r.rows) {
        rooms.add(r.id);
        break;
      }
    }
  }
  return { cells, items, rooms };
}

export function reachedCell(res: ReachResult, room: string, col: number, row: number): boolean {
  const r = ROOM_DATA[room];
  return res.cells.has(`${r.wcol + col},${r.wrow + row}`);
}
