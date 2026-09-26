// Parsed room data and per-visit room state. Pure logic: no DOM.
import { SCREEN_COLS, SCREEN_ROWS, TILE } from './constants';
import type { ItemId } from './items';
import { ROOMS, type RoomDef } from './rooms';

const SOLID = new Set(['#', '%', '=', 'T', 'B', 'b', 'S', 'M', 'G', 'D', 'R', 'L', 'E', 'x', 'c']);
const ENTITY = new Set(['I', 'P', 'H', '@', 's', 'z', 'k', 'r', 'o', 'n', 't']);
export const DOOR_CHARS = new Set(['D', 'R', 'L']);
export const BREAKABLE = new Set(['B', 'b', 'S', 'M']);
export const LIQUID = new Set(['~']);

export type DoorType = 'D' | 'R' | 'L';

export interface DoorGroup {
  key: string;
  side: 'W' | 'E';
  col: number;
  top: number;
  bottom: number;
  type: DoorType;
}

export interface Placed {
  col: number;
  row: number;
}

export interface RoomData {
  def: RoomDef;
  id: string;
  cols: number;
  rows: number;
  /** Tile chars with entity markers replaced by '.' */
  base: string[];
  wcol: number;
  wrow: number;
  items: (Placed & { id: ItemId })[];
  signs: (Placed & { text: string })[];
  enemies: (Placed & { ch: string })[];
  doors: DoorGroup[];
  start?: Placed;
  ship?: Placed;
  boss?: Placed;
  pads: Placed[];
}

export function parseRoom(def: RoomDef): RoomData {
  const rows = def.map.length;
  const cols = def.map[0].length;
  const base: string[] = [];
  const items: RoomData['items'] = [];
  const signs: RoomData['signs'] = [];
  const enemies: RoomData['enemies'] = [];
  const pads: Placed[] = [];
  let start: Placed | undefined;
  let ship: Placed | undefined;
  let boss: Placed | undefined;
  let itemIdx = 0;
  let signIdx = 0;
  for (let row = 0; row < rows; row++) {
    const line = def.map[row];
    for (let col = 0; col < cols; col++) {
      const ch = line[col] ?? '#';
      if (ENTITY.has(ch)) {
        base.push('.');
        if (ch === 'I') items.push({ col, row, id: def.items?.[itemIdx++] ?? 'placeholder' });
        else if (ch === 's') signs.push({ col, row, text: def.signs?.[signIdx++] ?? '...' });
        else if (ch === 'P') start = { col, row };
        else if (ch === 'H') ship = { col, row };
        else if (ch === '@') boss = { col, row };
        else enemies.push({ col, row, ch });
      } else {
        base.push(ch);
        if (ch === 'E') pads.push({ col, row });
      }
    }
  }
  const doors: DoorGroup[] = [];
  for (const [side, col] of [
    ['W', 0],
    ['E', cols - 1],
  ] as const) {
    let row = 0;
    while (row < rows) {
      const ch = base[row * cols + col];
      if (DOOR_CHARS.has(ch)) {
        const top = row;
        while (row < rows && base[row * cols + col] === ch) row++;
        doors.push({ key: `${def.id}:${side}${top}`, side, col, top, bottom: row - 1, type: ch as DoorType });
      } else row++;
    }
  }
  return {
    def,
    id: def.id,
    cols,
    rows,
    base,
    wcol: def.x * SCREEN_COLS,
    wrow: def.y * SCREEN_ROWS,
    items,
    signs,
    enemies,
    doors,
    start,
    ship,
    boss,
    pads,
  };
}

export const ROOM_DATA: Record<string, RoomData> = Object.fromEntries(ROOMS.map((d) => [d.id, parseRoom(d)]));

/** The room containing a world tile, if any. */
export function roomAtWorldTile(wc: number, wr: number): RoomData | undefined {
  for (const r of Object.values(ROOM_DATA)) {
    if (wc >= r.wcol && wc < r.wcol + r.cols && wr >= r.wrow && wr < r.wrow + r.rows) return r;
  }
  return undefined;
}

export function roomAtWorldPx(wx: number, wy: number): RoomData | undefined {
  return roomAtWorldTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
}

export interface RoomOptions {
  broken?: number[];
  /** Door keys that are permanently open (red doors opened with missiles). */
  redOpened?: Iterable<string>;
  /** Boss defeated: L doors open and the glass is gone. */
  bossDefeated?: boolean;
}

/** One visit to a room: mutable tiles and door state. */
export class RoomRuntime {
  readonly data: RoomData;
  readonly tiles: string[];
  readonly openDoors = new Set<string>();
  private readonly permOpen: Set<string>;
  bossDefeated: boolean;

  constructor(data: RoomData, opts: RoomOptions = {}) {
    this.data = data;
    this.tiles = [...data.base];
    for (const i of opts.broken ?? []) if (BREAKABLE.has(this.tiles[i])) this.tiles[i] = '.';
    this.permOpen = new Set(opts.redOpened ?? []);
    this.bossDefeated = !!opts.bossDefeated;
    if (this.bossDefeated) this.shatterGlass();
  }

  get cols() {
    return this.data.cols;
  }
  get rows() {
    return this.data.rows;
  }
  get widthPx() {
    return this.data.cols * TILE;
  }
  get heightPx() {
    return this.data.rows * TILE;
  }

  raw(col: number, row: number): string {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return '#';
    return this.tiles[row * this.cols + col];
  }

  shatterGlass(): void {
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === 'G') this.tiles[i] = '.';
  }

  doorAt(col: number, row: number): DoorGroup | undefined {
    return this.data.doors.find((d) => d.col === col && row >= d.top && row <= d.bottom);
  }

  isDoorOpen(d: DoorGroup): boolean {
    if (d.type === 'L') return this.bossDefeated;
    return this.openDoors.has(d.key) || this.permOpen.has(d.key);
  }

  openDoor(d: DoorGroup, permanent = false): void {
    this.openDoors.add(d.key);
    if (permanent) this.permOpen.add(d.key);
  }

  closeDoor(d: DoorGroup): void {
    this.openDoors.delete(d.key);
  }

  /** Tile char as seen by collision, with out-of-bounds rules applied. */
  tileAt(col: number, row: number): string {
    if (row < 0 || row >= this.rows) return '#';
    if (col < 0 || col >= this.cols) {
      if (this.data.def.wrap) return this.raw(((col % this.cols) + this.cols) % this.cols, row);
      // Beyond an edge: passable only where the edge itself is (an open door or a gap).
      const edge = col < 0 ? 0 : this.cols - 1;
      return this.isSolid(edge, row, 'body') ? '#' : '.';
    }
    return this.raw(col, row);
  }

  isSolid(col: number, row: number, kind: 'body' | 'shot' = 'body'): boolean {
    const ch = this.tileAt(col, row);
    if (!SOLID.has(ch)) return false;
    if (DOOR_CHARS.has(ch)) {
      const d = this.doorAt(col, row);
      return !(d && this.isDoorOpen(d));
    }
    if (ch === 'G' && kind === 'shot') return false;
    return true;
  }

  isLiquid(col: number, row: number): boolean {
    return LIQUID.has(this.tileAt(col, row));
  }

  breakTile(col: number, row: number): boolean {
    const i = row * this.cols + col;
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    if (!BREAKABLE.has(this.tiles[i])) return false;
    this.tiles[i] = '.';
    return true;
  }

  index(col: number, row: number): number {
    return row * this.cols + col;
  }
}
