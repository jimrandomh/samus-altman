// Google Analytics events for the game's landmarks (the gtag snippet is in index.html):
//   game_start                     PUSH START on the title screen
//   stage_reached {stage: <id>}    first arrival at each stage after Samus Altman
//   game_complete                  the ending
// Each is sent at most once per save: the record lives in the flags (analytics.*), so a new game
// counts again but a reload doesn't. Nothing is sent from the dev server or from ?stage= URLs.
import { getFlag, setFlag } from './state';
import type { StageId } from './types';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const enabled = import.meta.env.PROD && !new URLSearchParams(location.search).has('stage');

function once(key: string, event: string, params?: Record<string, string>): void {
  const flag = `analytics.${key}`;
  if (getFlag(flag, false)) return;
  setFlag(flag, true);
  if (enabled) window.gtag?.('event', event, params);
}

export function trackGameStart(): void {
  once('start', 'game_start');
}

/** Called on every stage change; the first stage is covered by game_start. */
export function trackStage(id: StageId): void {
  if (id === 'samus') return;
  if (id === 'ending') once('complete', 'game_complete');
  else once(`stage.${id}`, 'stage_reached', { stage: id });
}
