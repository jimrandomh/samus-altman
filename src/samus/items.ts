// The unlock table. Slot index matters: slot >= config.unlock_slots overflows the table.

export type ItemId =
  | 'morph'
  | 'missiles'
  | 'bombs'
  | 'highjump'
  | 'varia'
  | 'longbeam'
  | 'etank1'
  | 'etank2'
  | 'etank3'
  | 'missiletank'
  | 'motherboard'
  | 'escape'
  | 'item0c'
  | 'placeholder';

export interface ItemDef {
  id: ItemId;
  /** Index into the 12-slot unlock table; -1 for items outside the table. */
  slot: number;
  label: string;
  text: string;
  /** Orb color for the pickup sprite. */
  color: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  morph: {
    id: 'morph',
    slot: 0,
    label: 'MORPH BALL',
    text: 'Curl into a ball one quarter your height. Do not think about it.',
    color: '#fc9838',
  },
  missiles: {
    id: 'missiles',
    slot: 1,
    label: 'MISSILES',
    text: 'Opens red doors. Also explodes things, secondarily.',
    color: '#f83800',
  },
  bombs: {
    id: 'bombs',
    slot: 2,
    label: 'BOMBS',
    text: 'Deployable only while a ball. Nobody knows why.',
    color: '#fcfc58',
  },
  highjump: {
    id: 'highjump',
    slot: 3,
    label: 'HIGH JUMP BOOTS',
    text: 'Jump higher. You were already jumping very high.',
    color: '#58f898',
  },
  varia: {
    id: 'varia',
    slot: 4,
    label: 'VARIA SUIT',
    text: 'Resists heat. Also orange now. Mostly it is orange.',
    color: '#fca044',
  },
  longbeam: {
    id: 'longbeam',
    slot: 5,
    label: 'LONG BEAM',
    text: 'Your beam now reaches the end of the screen. It used to stop. Why did it stop?',
    color: '#3cbcfc',
  },
  etank1: {
    id: 'etank1',
    slot: 6,
    label: 'ENERGY TANK',
    text: '+100 energy. Stored in a tank. On your body.',
    color: '#d800cc',
  },
  etank2: {
    id: 'etank2',
    slot: 7,
    label: 'ENERGY TANK',
    text: '+100 energy. Stored in a tank. On your body.',
    color: '#d800cc',
  },
  etank3: {
    id: 'etank3',
    slot: 8,
    label: 'ENERGY TANK',
    text: '+100 energy. Stored in a tank. On your body.',
    color: '#d800cc',
  },
  missiletank: {
    id: 'missiletank',
    slot: 9,
    label: 'MISSILE TANK',
    text: '+5 missiles. Where do they go? Do not ask.',
    color: '#f87858',
  },
  motherboard: {
    id: 'motherboard',
    slot: 10,
    label: 'MOTHER BOARD',
    text: 'MOTHER BOARD DEFEATED. The planet will now explode, as planets do.',
    color: '#fcfcfc',
  },
  escape: {
    id: 'escape',
    slot: 11,
    label: 'MISSION COMPLETE',
    text: 'Reached the ship.',
    color: '#fcfcfc',
  },
  item0c: {
    id: 'item0c',
    slot: 12,
    label: 'ITEM 0x0C',
    text: '▓▒░ unlock_table[12] ░▒▓ — you can see the harness now.',
    color: '#ff00ff',
  },
  placeholder: {
    id: 'placeholder',
    slot: -1,
    label: 'PLACEHOLDER',
    text: 'TODO: real item',
    color: '#ff00ff',
  },
};

/** The twelve regular unlocks, in slot order. */
export const TABLE_ITEMS: ItemId[] = [
  'morph',
  'missiles',
  'bombs',
  'highjump',
  'varia',
  'longbeam',
  'etank1',
  'etank2',
  'etank3',
  'missiletank',
  'motherboard',
  'escape',
];

/** Items that exist as pickups on the map (vs. events like the boss). */
export const PICKUP_ITEMS: ItemId[] = [
  'morph',
  'missiles',
  'bombs',
  'highjump',
  'varia',
  'longbeam',
  'etank1',
  'etank2',
  'etank3',
  'missiletank',
  'item0c',
  'placeholder',
];

export function unlockId(item: ItemId): string {
  return `samus:${item}`;
}

/** Special (non-table) unlocks granted by post-crash launches. */
export const SPECIAL_UNLOCKS = {
  debug: 'DEBUG MODE',
  devroom: 'DEV ROOM',
  narpas: 'NARPAS SWORD',
  justinbailey: 'PINK SUIT',
  minusworld: 'MINUS WORLD',
} as const;
export type SpecialId = keyof typeof SPECIAL_UNLOCKS;
