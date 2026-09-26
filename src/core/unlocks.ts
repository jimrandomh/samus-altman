// The global unlock registry. "Everything" is the union of every unlock in every stage.
import { getData, persist, type UnlockRecord } from './state';
import type { StageId } from './types';

type Listener = (u: UnlockRecord) => void;
const listeners = new Set<Listener>();

/** Records an unlock. Returns true if it was new. */
export function unlock(id: string, label: string, source: StageId): boolean {
  const data = getData();
  if (data.unlocks.some((u) => u.id === id)) return false;
  const rec: UnlockRecord = { id, label, source, time: Date.now() };
  data.unlocks.push(rec);
  persist();
  for (const l of listeners) l(rec);
  return true;
}

export function isUnlocked(id: string): boolean {
  return getData().unlocks.some((u) => u.id === id);
}

export function allUnlocks(): readonly UnlockRecord[] {
  return getData().unlocks;
}

export function unlockCount(source?: StageId): number {
  const all = getData().unlocks;
  return source ? all.filter((u) => u.source === source).length : all.length;
}

export function onUnlock(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
