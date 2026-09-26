// Shared types for cross-stage communication. Changes here affect every stage.

export type StageId = 'samus' | 'shell' | 'hack' | 'clicker' | 'ending';

export interface Stage {
  /** Build DOM inside `root` and start running. `root` is empty and fills the viewport. */
  mount(root: HTMLElement): void;
  /** Stop all timers, listeners, audio and animation frames. The root is cleared afterwards. */
  unmount(): void;
}

/** Contents of ~/samus_altman.cfg in the shell, parsed. Unknown keys are preserved. */
export interface SamusConfig {
  /** Size of the unlock table. At 12 (default), collecting item 0x0C overflows it and crashes. */
  unlock_slots: number;
  difficulty: string;
  starting_energy: number;
  sound: boolean;
  [key: string]: string | number | boolean;
}

/** How the Samus Altman stage was started. */
export interface SamusLaunch {
  /** True when started from the shell (post-crash). Enables Ctrl+C / "quit to shell". */
  fromShell: boolean;
  /** Raw argv after the program name, for display in debug overlays. */
  args: string[];
  debug: boolean;
  password?: string;
  level?: number;
  config: SamusConfig;
}

/** Why the Samus Altman stage handed control to the shell. */
export type SamusExit =
  | { kind: 'crash'; lines: string[] } // lines are printed by the shell before its prompt
  | { kind: 'quit'; lines?: string[] }; // Ctrl+C or menu quit

export interface StageParams {
  samus: { launch?: SamusLaunch };
  shell: { exit?: SamusExit; from?: StageId };
  hack: Record<string, never>;
  clicker: Record<string, never>;
  ending: Record<string, never>;
}
