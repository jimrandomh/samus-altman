// Shared between the shell (which writes the cfg file and argv) and Samus Altman (which obeys them).
import type { SamusConfig, SamusLaunch } from './types';

export const DEFAULT_SAMUS_CONFIG: SamusConfig = {
  unlock_slots: 12,
  difficulty: 'normal',
  starting_energy: 30,
  sound: true,
};

export const DEFAULT_SAMUS_CFG_TEXT = `# SAMUS ALTMAN configuration
# Edits take effect on next launch.

difficulty=normal
starting_energy=30
sound=on

# Size of the unlock table. Do not change.
unlock_slots=12
`;

/** Parse key=value lines. Unknown keys are kept; bad values fall back to defaults. */
export function parseSamusConfig(text: string): SamusConfig {
  const cfg: SamusConfig = { ...DEFAULT_SAMUS_CONFIG };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    switch (key) {
      case 'unlock_slots':
      case 'starting_energy': {
        const n = Number(val);
        if (Number.isFinite(n)) cfg[key] = Math.trunc(n);
        break;
      }
      case 'sound':
        cfg.sound = !/^(off|false|0|no)$/i.test(val);
        break;
      default:
        cfg[key] = val;
    }
  }
  return cfg;
}

export interface ParsedArgs {
  launch: SamusLaunch;
  /** Flags the shell should handle itself instead of launching. */
  help: boolean;
  unlockAll: boolean;
  /** Unrecognized options, verbatim. */
  unknown: string[];
}

/** Parse argv (excluding the program name), e.g. ['--debug', '--password=NARPAS SWORD']. */
export function parseSamusArgs(args: string[], config: SamusConfig): ParsedArgs {
  const launch: SamusLaunch = { fromShell: true, args: [...args], debug: false, config };
  const out: ParsedArgs = { launch, help: false, unlockAll: false, unknown: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = () => inline ?? args[++i];
    switch (flag) {
      case '--debug':
      case '-d':
        launch.debug = true;
        break;
      case '--password':
      case '-p':
        launch.password = value();
        break;
      case '--level':
      case '-l': {
        const n = Number(value());
        if (Number.isFinite(n)) launch.level = Math.trunc(n);
        else out.unknown.push(a);
        break;
      }
      case '--help':
      case '-h':
        out.help = true;
        break;
      case '--unlock-all':
        out.unlockAll = true;
        break;
      default:
        out.unknown.push(a);
    }
  }
  return out;
}
