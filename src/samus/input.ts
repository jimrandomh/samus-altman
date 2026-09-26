// Keyboard → actions, with per-frame edge detection.
import type { Action, InputState } from './player';

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyZ: 'jump',
  Space: 'jump',
  KeyX: 'fire',
  KeyJ: 'fire',
  KeyC: 'toggle',
  KeyK: 'toggle',
  Enter: 'pause',
  Escape: 'pause',
  KeyN: 'noclip',
};

export class Input implements InputState {
  private down = new Set<Action>();
  private edge = new Set<Action>();
  /** Called for Ctrl+C. */
  onInterrupt: (() => void) | null = null;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.code === 'KeyC') {
      e.preventDefault();
      this.onInterrupt?.();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!e.repeat && !this.down.has(a)) this.edge.add(a);
    this.down.add(a);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (a) this.down.delete(a);
  };

  private onBlur = () => {
    this.down.clear();
  };

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  held(a: Action): boolean {
    return this.down.has(a);
  }

  pressed(a: Action): boolean {
    return this.edge.has(a);
  }

  anyPressed(...as: Action[]): boolean {
    return as.some((a) => this.edge.has(a));
  }

  /** Call once per simulated frame, after update. */
  endFrame(): void {
    this.edge.clear();
  }
}
