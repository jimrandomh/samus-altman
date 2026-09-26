import { BRINSTAR_ROOMS } from './brinstar';
import { NORFAIR_ROOMS } from './norfair';
import { SPECIAL_ROOMS } from './special';
import { TOURIAN_ROOMS } from './tourian';
import type { RoomDef } from './types';

export type { RoomDef, Area } from './types';

export const ROOMS: RoomDef[] = [...BRINSTAR_ROOMS, ...NORFAIR_ROOMS, ...TOURIAN_ROOMS, ...SPECIAL_ROOMS];

export const ROOM_BY_ID: Record<string, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/** Where `--level=N` starts: [room, col, row] of the feet tile. */
export const LEVEL_STARTS: Record<number, [string, number, number]> = {
  1: ['landing', 24, 12],
  2: ['norfair_shaft', 13, 12],
  3: ['tourian_hall', 2, 12],
  [-1]: ['minus_1', 7, 12],
};
