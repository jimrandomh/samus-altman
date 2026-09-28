// Stage manager: exactly one stage is mounted at a time.
import { trackStage } from './analytics';
import { setCurrentStage } from './state';
import type { Stage, StageId, StageParams } from './types';

type Factory<K extends StageId> = (params: StageParams[K]) => Stage;

const registry: { [K in StageId]?: Factory<K> } = {};
let current: Stage | null = null;
let currentId: StageId | null = null;
let appRoot: HTMLElement | null = null;

export function registerStage<K extends StageId>(id: K, factory: Factory<K>): void {
  (registry as Record<StageId, Factory<K>>)[id] = factory;
}

export function initStages(root: HTMLElement): void {
  appRoot = root;
}

export function currentStage(): StageId | null {
  return currentId;
}

export function goTo<K extends StageId>(id: K, params?: StageParams[K]): void {
  if (!appRoot) throw new Error('initStages() not called');
  const factory = registry[id] as Factory<K> | undefined;
  if (!factory) throw new Error(`no stage registered: ${id}`);
  if (current) {
    try {
      current.unmount();
    } catch (e) {
      console.error('unmount failed', e);
    }
  }
  appRoot.replaceChildren();
  appRoot.dataset.stage = id;
  setCurrentStage(id);
  trackStage(id);
  currentId = id;
  current = factory((params ?? {}) as StageParams[K]);
  current.mount(appRoot);
}
