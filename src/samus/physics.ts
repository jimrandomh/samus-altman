// Axis-separated AABB movement against the tile grid. Pure logic.
import { TILE } from './constants';
import type { RoomRuntime } from './world';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}

const EPS = 1e-6;

export function overlapsSolid(
  room: RoomRuntime,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: 'body' | 'shot' = 'body',
): boolean {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - EPS) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - EPS) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (room.isSolid(c, r, kind)) return true;
  return false;
}

export function overlapsLiquid(room: RoomRuntime, x: number, y: number, w: number, h: number): boolean {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - EPS) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - EPS) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (room.isLiquid(c, r)) return true;
  return false;
}

/**
 * Move along one axis in ≤1px steps, stopping flush against the first solid tile.
 * Returns true if blocked (velocity on that axis is zeroed).
 */
export function moveAxis(room: RoomRuntime, b: Body, axis: 'x' | 'y'): boolean {
  let remaining = axis === 'x' ? b.vx : b.vy;
  if (remaining === 0) return false;
  const sign = Math.sign(remaining);
  while (Math.abs(remaining) > EPS) {
    const step = Math.abs(remaining) > 1 ? sign : remaining;
    const nx = axis === 'x' ? b.x + step : b.x;
    const ny = axis === 'y' ? b.y + step : b.y;
    if (overlapsSolid(room, nx, ny, b.w, b.h)) {
      // Snap flush to the tile edge we ran into.
      if (axis === 'x') {
        const flush = sign > 0 ? Math.floor((nx + b.w) / TILE) * TILE - b.w : Math.floor(nx / TILE) * TILE + TILE;
        if ((sign > 0 && flush >= b.x) || (sign < 0 && flush <= b.x)) {
          if (!overlapsSolid(room, flush, b.y, b.w, b.h)) b.x = flush;
        }
        b.vx = 0;
      } else {
        const flush = sign > 0 ? Math.floor((ny + b.h) / TILE) * TILE - b.h : Math.floor(ny / TILE) * TILE + TILE;
        if ((sign > 0 && flush >= b.y) || (sign < 0 && flush <= b.y)) {
          if (!overlapsSolid(room, b.x, flush, b.w, b.h)) b.y = flush;
        }
        b.vy = 0;
      }
      return true;
    }
    b.x = nx;
    b.y = ny;
    remaining -= step;
  }
  return false;
}

export function onGround(room: RoomRuntime, b: Body): boolean {
  return overlapsSolid(room, b.x, b.y + b.h, b.w, 0.5);
}

export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
