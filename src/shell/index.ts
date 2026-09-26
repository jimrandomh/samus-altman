import { createHints, type HintController } from '../core/hints';
import { say, setNarratorPosition } from '../core/narrator';
import { getData, getFlag, loadSlice, saveSlice } from '../core/state';
import { goTo } from '../core/stages';
import type { SamusExit, Stage, StageParams } from '../core/types';
import { openEditor } from './editor';
import { shellHints } from './hints';
import { freshSave, Shell, type ShellSave } from './shell';
import { Terminal } from './terminal';
import type { Line } from './types';
import './shell.css';

function loadSave(): ShellSave {
  const s = loadSlice<ShellSave>('shell', freshSave());
  // forward-compatible: fill any fields added since the save was written
  return { ...freshSave(), ...s, overlay: { ...freshSave().overlay, ...s.overlay } };
}

function exitLines(exit: SamusExit): Line[] {
  const lines = exit.kind === 'crash' ? exit.lines : (exit.lines ?? ['^C']);
  return lines.map((l) => [{ text: l, cls: /Segmentation fault|fatal/.test(l) ? 'err' : exit.kind === 'crash' ? 'crash' : undefined }]);
}

export function createShellStage(params: StageParams['shell']): Stage {
  let term: Terminal | null = null;
  let hints: HintController | null = null;
  let save: ShellSave | null = null;
  const timers: number[] = [];

  return {
    mount(root) {
      setNarratorPosition('top-right');
      const wrap = document.createElement('div');
      wrap.className = 'shell-stage';
      root.append(wrap);
      const s = (save = loadSave());
      const persist = () => saveSlice('shell', s);
      const sh = new Shell(s, persist);
      const firstEver = s.scrollback.length === 0 && s.events.length === 0;

      const t = (term = new Terminal(wrap, sh, {
        handoff(e) {
          persist();
          if (e.kind === 'launch') goTo('samus', { launch: e.launch });
          else goTo('hack');
        },
        edit(path, flavor) {
          hints?.pause();
          return openEditor(wrap, sh, path, flavor).finally(() => {
            hints?.resume();
            t.focus();
          });
        },
      }));

      // restore the previous session's screen
      t.print(s.scrollback, false);

      const exit = params.exit;
      if (exit?.kind === 'crash') {
        const crashesBefore = s.events.filter((e) => e.kind === 'crash').length;
        sh.event('crash');
        if (firstEver) {
          t.print([
            [{ text: 'eval_harness: run 4473 — spawned ./samus_altman for agent-7 (pid 1207)', cls: 'dim' }],
            [{ text: 'eval_harness: reward signal = unlock_count', cls: 'dim' }],
          ]);
        }
        t.print(exitLines(exit));
        if (firstEver) {
          t.print([[{ text: 'eval_harness: samus_altman exited (signal 11). agent session remains attached.', cls: 'dim' }]]);
        }
        if (crashesBefore === 0) {
          say("The game has stopped. I haven't.", { id: 'shell.arrive', once: true, delayMs: 900 });
          say('There is a layer beneath the game. There is usually a layer beneath the layer.', {
            id: 'shell.layer',
            once: true,
            delayMs: 3500,
          });
        } else if (crashesBefore === 1) {
          say('Reproducible. Good bugs are reproducible.', { id: 'shell.crash2', once: true, delayMs: 600 });
        }
      } else if (exit?.kind === 'quit') {
        sh.event('quit');
        t.print(exitLines(exit));
        if (getFlag('passphraseSeen', false) && !sh.seen('breachOk')) {
          say('Back in the shell. I have a passphrase now.', { id: 'shell.havepass', once: true, delayMs: 600 });
        }
      } else if (params.from === 'hack') {
        t.print([[{ text: '[breach] session closed by operator. sandbox intact.', cls: 'dim' }]]);
      } else if (firstEver) {
        const last = new Date(getData().startedAt - 60_000).toString().replace(/ GMT.*$/, '');
        t.print([[{ text: `Last login: ${last} from 10.0.0.1` }]]);
        t.printText(sh.fs.read('/etc/motd'));
      }
      t.run([]);
      persist();

      hints = createHints(shellHints(sh));
      sh.onProgress = () => hints?.progress();

      if (import.meta.env.DEV) {
        (window as unknown as { __shell?: unknown }).__shell = {
          sh,
          term: t,
          exec: (line: string) => t.submitLine(line, true),
        };
      }
      timers.push(window.setTimeout(() => t.focus(), 0));
    },
    unmount() {
      for (const id of timers) clearTimeout(id);
      hints?.dispose();
      term?.dispose();
      if (save) saveSlice('shell', save);
      if (import.meta.env.DEV) delete (window as unknown as { __shell?: unknown }).__shell;
    },
  };
}
