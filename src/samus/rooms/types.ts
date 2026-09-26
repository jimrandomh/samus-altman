import type { ItemId } from '../items';

export type Area = 'surface' | 'brinstar' | 'norfair' | 'tourian' | 'oob' | 'dev' | 'minus';

/**
 * A hand-authored room. `map` rows are 16 chars per screen wide, 15 rows per screen tall.
 *
 * Legend:
 *   .  empty            #  rock            %  rock variant      =  metal platform
 *   T  pedestal         B  bomb block      b  hidden bomb block (looks like #)
 *   S  shoot block      M  missile block   G  glass (shots pass) ~  lava
 *   D  blue door        R  red door        L  boss-locked door   E  elevator pad
 *   x  garbage (solid)  y  garbage (decor) c  checker (dev)
 *   s  sign  I  item  P  player start  H  ship  @  boss
 *   z  zoomer  k  skree  r  ripper  o  rio  n  ring spawner  t  test enemy
 * Doors are 3-tile columns on the left/right edge. Rooms connect by world adjacency:
 * a door on the east edge leads into whatever room occupies the world cell to the east.
 */
export interface RoomDef {
  id: string;
  name: string;
  area: Area;
  /** World position of the top-left, in screens. */
  x: number;
  y: number;
  map: string[];
  /** Items for each `I`, in reading order. */
  items?: ItemId[];
  /** Text for each `s`, in reading order. */
  signs?: string[];
  hot?: boolean;
  water?: boolean;
  /** Horizontal wrap-around (Minus World). */
  wrap?: boolean;
  /** Minimap visibility: 'debug' = only in debug mode, 'never' = never drawn, 'noise' = drawn as garbage. */
  mapStyle?: 'normal' | 'debug' | 'never' | 'noise';
  /** Target room of this room's elevator pad. */
  elevator?: string;
  /** Text painted onto the background. */
  label?: { text: string; col: number; row: number };
}

/** Join per-screen column segments row by row: seg(A, B, C) where each is string[15]. */
export function segs(...screens: string[][]): string[] {
  const rows = screens[0].length;
  const out: string[] = [];
  for (let r = 0; r < rows; r++) out.push(screens.map((s) => s[r]).join(''));
  return out;
}
