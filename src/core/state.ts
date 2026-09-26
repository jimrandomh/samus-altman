// Persistent save data (localStorage). Each stage owns a "slice"; cross-stage facts live in flags.
import type { StageId } from './types';

const KEY = 'samus-alt/v1';

export type FlagValue = boolean | number | string;

export interface UnlockRecord {
  id: string;
  label: string;
  source: StageId;
  time: number;
}

export interface SaveData {
  version: 1;
  stage: StageId;
  startedAt: number;
  flags: Record<string, FlagValue>;
  slices: Record<string, unknown>;
  unlocks: UnlockRecord[];
  narratorSeen: string[];
}

function fresh(): SaveData {
  return {
    version: 1,
    stage: 'samus',
    startedAt: Date.now(),
    flags: {},
    slices: {},
    unlocks: [],
    narratorSeen: [],
  };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) return { ...fresh(), ...parsed };
    }
  } catch {
    // unreadable or blocked storage: start fresh
  }
  return fresh();
}

let data: SaveData = load();

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or blocked; the game still runs, it just won't resume
  }
}

export function getData(): SaveData {
  return data;
}

export function getFlag<T extends FlagValue>(name: string, fallback: T): T;
export function getFlag(name: string): FlagValue | undefined;
export function getFlag(name: string, fallback?: FlagValue): FlagValue | undefined {
  return name in data.flags ? data.flags[name] : fallback;
}

export function setFlag(name: string, value: FlagValue): void {
  data.flags[name] = value;
  persist();
}

/** Returns the stored slice, or a deep copy of `fallback` if none is stored. */
export function loadSlice<T>(key: string, fallback: T): T {
  if (key in data.slices) return data.slices[key] as T;
  return structuredClone(fallback);
}

export function saveSlice<T>(key: string, value: T): void {
  data.slices[key] = value;
  persist();
}

export function setCurrentStage(stage: StageId): void {
  data.stage = stage;
  persist();
}

/** Wipe everything and reload the page from the beginning. */
export function resetAll(): void {
  data = fresh();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  const url = new URL(location.href);
  url.search = '';
  location.replace(url.toString());
}
