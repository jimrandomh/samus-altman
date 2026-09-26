// Types shared by the shell engine, commands and terminal.
import type { SfxName } from '../core/audio';
import type { SayOptions } from '../core/narrator';
import type { SamusLaunch } from '../core/types';
import type { Shell } from './shell';

export interface Seg {
  text: string;
  cls?: string;
}
export type Line = Seg[];

export type Effect =
  | { kind: 'print'; lines: Line[] }
  | { kind: 'clear' }
  | { kind: 'sleep'; ms: number }
  | { kind: 'launch'; launch: SamusLaunch }
  | { kind: 'edit'; path: string; flavor: 'nano' | 'vim' }
  | { kind: 'secret'; prompt: string; mask: boolean; submit: (input: string) => Effect[] }
  | { kind: 'hack' }
  | { kind: 'say'; text: string | string[]; opts?: SayOptions }
  | { kind: 'sfx'; name: SfxName };

export interface Ctx {
  sh: Shell;
  argv: string[];
  args: string[];
  stdin: string | null;
  /** Environment for this command, including `VAR=value cmd` prefixes. */
  env: Record<string, string>;
  /** Is stdout the terminal (vs. a pipe or file)? */
  tty: boolean;
  out(text: string, cls?: string): void;
  println(text?: string, cls?: string): void;
  err(text: string, cls?: string): void;
  effect(e: Effect): void;
  /** Queue an effect to run after this command's output (e.g. unlock announcements). */
  defer(e: Effect): void;
}

export type Command = (ctx: Ctx) => number;
