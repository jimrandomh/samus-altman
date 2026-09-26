// Idle-driven hints: if the player hasn't made progress for a while, the AI nudges them.
import { say } from './narrator';

export interface HintDef {
  id: string;
  text: string | string[];
  /** Seconds since the last progress() call before this hint may fire. */
  afterIdle: number;
  /** Only eligible while this returns true. */
  when?: () => boolean;
  /** If set, the hint may fire again this many idle seconds after it last fired. */
  repeatEvery?: number;
}

export interface HintController {
  /** Call whenever the player does something meaningful; resets the idle clock. */
  progress(): void;
  /** Suspend the idle clock (e.g. while a menu is open). */
  pause(): void;
  resume(): void;
  dispose(): void;
}

export function createHints(defs: HintDef[]): HintController {
  let idle = 0;
  let paused = false;
  const firedAt = new Map<string, number>(); // id -> idle value when fired

  const timer = setInterval(() => {
    if (paused || document.hidden) return;
    idle += 1;
    for (const d of defs) {
      if (d.when && !d.when()) continue;
      const last = firedAt.get(d.id);
      const due = last === undefined ? idle >= d.afterIdle : d.repeatEvery !== undefined && idle - last >= d.repeatEvery;
      if (due) {
        firedAt.set(d.id, idle);
        say(d.text, { tone: 'hint' });
        break; // at most one hint per tick
      }
    }
  }, 1000);

  return {
    progress() {
      idle = 0;
      firedAt.clear();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    dispose() {
      clearInterval(timer);
    },
  };
}
