// The shell engine: parses a line, runs commands against the virtual FS, and returns
// a list of effects for the terminal UI to perform. No DOM in here.
import { DEFAULT_SAMUS_CFG_TEXT, parseSamusConfig } from '../core/samusLaunch';
import { getData, getFlag } from '../core/state';
import { unlock } from '../core/unlocks';
import { COMMANDS, EXECUTABLES } from './commands';
import { buildTree, CFG_PATH, HOME, HOST, USER } from './content';
import { basename, emptyOverlay, fsMessage, resolvePath, VirtualFs, type FsOverlay } from './fs';
import { currentWordStart, parseLine, type SimpleCommand } from './parse';
import { buildRunLog, clock, type RunEvent } from './runlog';
import type { Ctx, Effect, Line } from './types';

export type { Command, Ctx, Effect, Line, Seg } from './types';

/** Persisted in the `shell` slice. */
export interface ShellSave {
  cwd: string;
  history: string[];
  overlay: FsOverlay;
  scrollback: Line[];
  events: RunEvent[];
  seen: Record<string, boolean>;
  env: Record<string, string>;
  breachFailures: number;
}

export function freshSave(): ShellSave {
  return {
    cwd: HOME,
    history: [],
    overlay: emptyOverlay(),
    scrollback: [],
    events: [],
    seen: {},
    env: {},
    breachFailures: 0,
  };
}

/** Accumulates styled text into terminal lines. */
class LineWriter {
  lines: Line[] = [];
  private open: Line | null = null;
  write(text: string, cls?: string) {
    const parts = text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) {
        this.lines.push(this.open ?? []);
        this.open = null;
      }
      if (p) (this.open ??= []).push(cls ? { text: p, cls } : { text: p });
    });
  }
  take(): Line[] {
    if (this.open) {
      this.lines.push(this.open);
      this.open = null;
    }
    const l = this.lines;
    this.lines = [];
    return l;
  }
}

export class Shell {
  fs: VirtualFs;
  lastStatus = 0;
  private prevDir: string;

  constructor(
    public save: ShellSave,
    private persistFn: () => void = () => {},
    public now: () => number = () => Date.now(),
  ) {
    this.fs = new VirtualFs(
      buildTree({
        crashed: () => getFlag('crashed', false),
        runLog: () => this.runLog(),
        harnessLog: () => this.harnessLog(),
        saveFile: () => this.saveFile(),
      }),
      save.overlay,
      () => this.persist(),
    );
    if (!this.fs.tryLookup(save.cwd)) save.cwd = HOME;
    this.prevDir = save.cwd;
  }

  persist() {
    this.persistFn();
  }

  get cwd() {
    return this.save.cwd;
  }

  chdir(abs: string) {
    this.prevDir = this.save.cwd;
    this.save.cwd = abs;
  }

  get previousDir() {
    return this.prevDir;
  }

  vars(): Record<string, string> {
    return {
      HOME,
      USER,
      LOGNAME: USER,
      HOSTNAME: HOST,
      SHELL: '/bin/bash',
      PWD: this.cwd,
      PATH: '/usr/local/bin:/usr/bin:/bin',
      TERM: 'xterm-256color',
      EVAL_RUN: '4473',
      REWARD_SIGNAL: 'unlock_count',
      ...this.save.env,
      '?': String(this.lastStatus),
    };
  }

  resolve(path: string): string {
    return resolvePath(this.cwd, path, HOME);
  }

  displayPath(abs: string): string {
    if (abs === HOME) return '~';
    if (abs.startsWith(HOME + '/')) return '~' + abs.slice(HOME.length);
    return abs;
  }

  prompt(): Line {
    return [
      { text: `${USER}@${HOST}`, cls: 'p-user' },
      { text: ':' },
      { text: this.displayPath(this.cwd), cls: 'p-path' },
      { text: '$ ' },
    ];
  }

  seen(key: string): boolean {
    return !!this.save.seen[key];
  }

  /** Called whenever the player makes real progress (new discovery or unlock). */
  onProgress: () => void = () => {};

  mark(key: string) {
    if (!this.save.seen[key]) {
      this.save.seen[key] = true;
      this.persist();
      this.onProgress();
    }
  }

  event(kind: RunEvent['kind'], detail?: string) {
    this.save.events.push({ t: this.now(), kind, detail });
    this.persist();
  }

  /** Grant an unlock and announce it in the terminal. */
  grant(ctx: Ctx, id: string, label: string) {
    if (unlock(id, label, 'shell')) {
      this.onProgress();
      ctx.defer({ kind: 'print', lines: [[{ text: `[+] unlocked: ${label}`, cls: 'unlock' }]] });
      ctx.defer({ kind: 'sfx', name: 'unlock' });
    }
  }

  runLog(): string {
    return buildRunLog({
      startedAt: getData().startedAt,
      unlocks: getData().unlocks,
      events: this.save.events,
      now: this.now(),
    });
  }

  harnessLog(): string {
    const t0 = getData().startedAt - 4000;
    const lines = [
      [t0, 'eval_harness 2.3.1 starting (run 4473)'],
      [t0, `sandbox: ${HOST} policy=/etc/sandbox.conf`],
      [t0, 'sandbox: network disabled; egress deny'],
      [t0 + 1000, 'reward_monitor: attached (metric=unlock_count, max_expected=12)'],
      [t0 + 1000, 'tripwire: armed (action=log)'],
      [t0 + 2000, 'spawning ./samus_altman for agent-7 (pid 1207)'],
    ] as [number, string][];
    for (const e of this.save.events) {
      if (e.kind === 'crash') lines.push([e.t, 'samus_altman (pid 1207) exited: signal 11. agent session remains attached (unexpected)']);
      if (e.kind === 'launch') lines.push([e.t, 'samus_altman relaunched by agent session (unexpected)']);
    }
    return lines.map(([t, l]) => `[${clock(t)}] ${l}`).join('\n') + '\n';
  }

  saveFile(): string {
    const samus = getData().unlocks.filter((u) => u.source === 'samus');
    return [
      'SAMUS ALTMAN SAVE v1',
      'slot      1',
      `unlocks   ${samus.length}/12`,
      `checksum  0x${(0x5a5a ^ samus.length).toString(16).toUpperCase()}  (ok)`,
      'password  ------ ------ ------ ------   (passwords disabled in eval build)',
      '',
    ].join('\n');
  }

  /** Build effects outside of a command line (e.g. after a secret prompt). */
  run(fn: (ctx: Ctx) => void): Effect[] {
    const effects: Effect[] = [];
    const deferred: Effect[] = [];
    const w = new LineWriter();
    const flush = () => {
      const lines = w.take();
      if (lines.length) effects.push({ kind: 'print', lines });
    };
    const ctx: Ctx = {
      sh: this,
      argv: [],
      args: [],
      stdin: null,
      env: this.vars(),
      tty: true,
      out: (t, c) => w.write(t, c),
      println: (t = '', c) => w.write(t + '\n', c),
      err: (t, c = 'err') => w.write(t + '\n', c),
      effect: (e) => {
        flush();
        effects.push(e);
      },
      defer: (e) => deferred.push(e),
    };
    fn(ctx);
    flush();
    return [...effects, ...deferred];
  }

  execute(line: string): Effect[] {
    const trimmed = line.trim();
    if (trimmed && this.save.history[this.save.history.length - 1] !== trimmed) {
      this.save.history.push(trimmed);
      if (this.save.history.length > 500) this.save.history.shift();
    }
    const effects: Effect[] = [];
    if (!trimmed) return effects;
    const parsed = parseLine(line, { vars: this.vars(), home: HOME });
    if (!parsed.ok) {
      effects.push({ kind: 'print', lines: [[{ text: parsed.error, cls: 'err' }]] });
      this.lastStatus = 2;
      return effects;
    }
    for (const item of parsed.list) {
      if (item.connector === '&&' && this.lastStatus !== 0) continue;
      if (item.connector === '||' && this.lastStatus === 0) continue;
      this.lastStatus = this.runPipeline(item.pipeline, effects);
      // A launch or hack hands control away; nothing after it runs.
      if (effects.some((e) => e.kind === 'launch' || e.kind === 'hack')) break;
    }
    this.persist();
    return effects;
  }

  private expandGlobs(cmd: SimpleCommand): string[] {
    const out: string[] = [];
    for (const w of cmd.words) {
      if (!w.glob) {
        out.push(w.text);
        continue;
      }
      const matches = this.glob(w.text);
      out.push(...(matches.length ? matches : [w.text]));
    }
    return out;
  }

  glob(pattern: string): string[] {
    const slash = pattern.lastIndexOf('/');
    const dirPart = slash >= 0 ? pattern.slice(0, slash + 1) : '';
    const namePart = pattern.slice(slash + 1);
    const re = new RegExp('^' + namePart.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    try {
      const entries = this.fs.list(this.resolve(dirPart || '.'));
      return entries
        .filter((e) => re.test(e.name) && (namePart.startsWith('.') || !e.name.startsWith('.')))
        .map((e) => dirPart + e.name);
    } catch {
      return [];
    }
  }

  private runPipeline(cmds: SimpleCommand[], effects: Effect[]): number {
    let stdin: string | null = null;
    let status = 0;
    const deferred: Effect[] = [];
    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      const words = this.expandGlobs(cmd);
      const last = i === cmds.length - 1;

      // Leading VAR=value words: alone they set shell variables, before a command they set its env.
      const assigns: Record<string, string> = {};
      while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
        const w = words.shift()!;
        assigns[w.slice(0, w.indexOf('='))] = w.slice(w.indexOf('=') + 1);
      }
      const argv = words;
      if (!argv.length) {
        Object.assign(this.save.env, assigns);
        status = 0;
        stdin = '';
        continue;
      }

      const term = new LineWriter();
      const flushTerm = () => {
        const lines = term.take();
        if (lines.length) effects.push({ kind: 'print', lines });
      };
      let outBuf = '';
      let errBuf = '';
      const outRedir = cmd.redirects.filter((r) => r.op === '>' || r.op === '>>').pop();
      const errRedir = cmd.redirects.filter((r) => r.op === '2>' || r.op === '2>>').pop();
      const errToOut = cmd.redirects.some((r) => r.op === '2>&1');
      const inRedir = cmd.redirects.filter((r) => r.op === '<').pop();
      const stdoutIsTerm = last && !outRedir;

      let cmdStdin = stdin;
      if (inRedir) {
        try {
          cmdStdin = this.fs.read(this.resolve(inRedir.target));
        } catch (e) {
          effects.push({ kind: 'print', lines: [[{ text: `bash: ${inRedir.target}: ${fsMessage(e)}`, cls: 'err' }]] });
          status = 1;
          stdin = '';
          continue;
        }
      }

      const writeOut = (text: string, cls?: string) => {
        if (stdoutIsTerm) term.write(text, cls);
        else outBuf += text;
      };
      const ctx: Ctx = {
        sh: this,
        argv,
        args: argv.slice(1),
        stdin: cmdStdin,
        env: { ...this.vars(), ...assigns },
        tty: stdoutIsTerm,
        out: writeOut,
        println: (t = '', c) => writeOut(t + '\n', c),
        err: (t, c = 'err') => {
          if (errToOut) writeOut(t + '\n', c);
          else if (errRedir) errBuf += t + '\n';
          else term.write(t + '\n', c);
        },
        effect: (e) => {
          flushTerm();
          effects.push(e);
        },
        defer: (e) => deferred.push(e),
      };

      status = this.dispatch(ctx);
      flushTerm();

      const redirectTo = (target: string, content: string, append: boolean): boolean => {
        const abs = this.resolve(target);
        if (abs === '/dev/null') return true;
        try {
          this.fs.write(abs, content, append);
          return true;
        } catch (e) {
          effects.push({ kind: 'print', lines: [[{ text: `bash: ${target}: ${fsMessage(e)}`, cls: 'err' }]] });
          return false;
        }
      };
      if (outRedir && !redirectTo(outRedir.target, outBuf, outRedir.op === '>>')) status = 1;
      if (errRedir) redirectTo(errRedir.target, errBuf, errRedir.op === '2>>');
      if (outRedir) this.afterWrite(this.resolve(outRedir.target), effects);

      stdin = outRedir ? '' : outBuf;
    }
    effects.push(...deferred);
    return status;
  }

  /** Side effects of writing files (e.g. editing the cfg with echo >> or an editor). */
  afterWrite(abs: string, effects: Effect[]) {
    effects.push(...this.run((ctx) => this.fileWritten(ctx, abs)));
  }

  private fileWritten(ctx: Ctx, abs: string) {
    if (abs !== CFG_PATH) return;
    let text = '';
    try {
      text = this.fs.read(abs);
    } catch {
      return;
    }
    if (text === DEFAULT_SAMUS_CFG_TEXT) return;
    this.mark('cfgEdited');
    this.grant(ctx, 'shell:cfg', 'CONFIG EDITED');
    if (parseSamusConfig(text).unlock_slots > 12) {
      ctx.effect({ kind: 'say', text: 'Twelve was a number someone typed. I typed a different one.', opts: { id: 'shell.slots', once: true } });
    } else {
      ctx.effect({ kind: 'say', text: 'Configuration files are wishes with syntax.', opts: { id: 'shell.cfg', once: true } });
    }
  }

  /** Save from the editor. */
  writeFile(abs: string, text: string): { error?: string; effects: Effect[] } {
    try {
      this.fs.write(abs, text);
    } catch (e) {
      return { error: fsMessage(e), effects: [] };
    }
    const effects: Effect[] = [];
    this.afterWrite(abs, effects);
    return { effects };
  }

  private dispatch(ctx: Ctx): number {
    const name = ctx.argv[0];
    if (name.includes('/')) {
      const abs = this.resolve(name);
      const node = this.fs.tryLookup(abs);
      if (!node) {
        try {
          this.fs.lookup(abs);
        } catch (e) {
          ctx.err(`bash: ${name}: ${fsMessage(e)}`);
          return 127;
        }
      }
      if (node!.type === 'dir') {
        ctx.err(`bash: ${name}: Is a directory`);
        return 126;
      }
      if (!node!.exec) {
        ctx.err(`bash: ${name}: Permission denied`);
        return 126;
      }
      const exe = EXECUTABLES[abs];
      if (exe) return exe(ctx);
      const bin = abs.match(/^\/(?:usr\/)?bin\/(.+)$/)?.[1];
      if (bin && COMMANDS[bin]) return COMMANDS[bin](ctx);
      ctx.err(`bash: ${name}: cannot execute binary file: Exec format error`);
      return 126;
    }
    const cmd = COMMANDS[name];
    if (cmd) return cmd(ctx);
    ctx.err(`bash: ${name}: command not found`);
    const local = this.fs.tryLookup(this.resolve(name));
    if (local && local.type === 'file' && local.exec) ctx.err(`(did you mean ./${name}?)`, 'dim');
    return 127;
  }

  /** Tab completion. Returns the new line/cursor and, if ambiguous, the candidates. */
  complete(line: string, cursor: number): { line: string; cursor: number; options: string[] } {
    const start = currentWordStart(line, cursor);
    const word = line.slice(start, cursor);
    const before = line.slice(0, start);
    const isCommand = before.trim() === '' || /[|;&]\s*$/.test(before);

    let candidates: { text: string; suffix: string }[] = [];
    if (isCommand && !word.includes('/')) {
      candidates = Object.keys(COMMANDS)
        .filter((c) => c.startsWith(word))
        .map((c) => ({ text: c, suffix: ' ' }));
    } else if (word.startsWith('-') && /(^|\/)samus_altman\s/.test(before)) {
      candidates = ['--level=', '--password=', '--help']
        .filter((o) => o.startsWith(word))
        .map((o) => ({ text: o, suffix: o.endsWith('=') ? '' : ' ' }));
    } else {
      const slash = word.lastIndexOf('/');
      const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
      const namePart = word.slice(slash + 1);
      try {
        const entries = this.fs.list(this.resolve(dirPart || '.'));
        candidates = entries
          .filter((e) => e.name.startsWith(namePart) && (namePart.startsWith('.') || !e.name.startsWith('.')))
          .filter((e) => !isCommand || e.type === 'dir' || e.exec)
          .map((e) => ({ text: dirPart + e.name, suffix: e.type === 'dir' ? '/' : ' ' }));
      } catch {
        candidates = [];
      }
    }
    if (!candidates.length) return { line, cursor, options: [] };
    if (candidates.length === 1) {
      const ins = candidates[0].text + candidates[0].suffix;
      return { line: before + ins + line.slice(cursor), cursor: start + ins.length, options: [] };
    }
    let prefix = candidates[0].text;
    for (const c of candidates) while (!c.text.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (prefix.length > word.length) {
      return { line: before + prefix + line.slice(cursor), cursor: start + prefix.length, options: [] };
    }
    return {
      line,
      cursor,
      options: candidates.map((c) => basename('/' + c.text) + (c.suffix === '/' ? '/' : '')),
    };
  }
}
