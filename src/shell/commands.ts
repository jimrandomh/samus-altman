// Command implementations. Each returns an exit status; side effects go through ctx.effect().
import { parseSamusArgs, parseSamusConfig } from '../core/samusLaunch';
import { getData } from '../core/state';
import { allUnlocks } from '../core/unlocks';
import { BREACH_PATH, CFG_PATH, HOME, HOST, MAN_PAGES, PASSPHRASE, SAMUS_PATH, USER } from './content';
import { basename, dirname, FsFail, fsMessage, sizeOf, type FsNode } from './fs';
import { clock } from './runlog';
import type { Command, Ctx } from './types';

// ---------------------------------------------------------------------------
// helpers

function say(ctx: Ctx, text: string | string[], id?: string, delayMs?: number) {
  ctx.effect({ kind: 'say', text, opts: id ? { id, once: true, delayMs } : { delayMs } });
}

function flags(args: string[]): { flags: Set<string>; rest: string[] } {
  const f = new Set<string>();
  const rest: string[] = [];
  let done = false;
  for (const a of args) {
    if (!done && a === '--') {
      done = true;
    } else if (!done && /^-[A-Za-z]+$/.test(a)) {
      for (const c of a.slice(1)) f.add(c);
    } else {
      rest.push(a);
    }
  }
  return { flags: f, rest };
}

function readText(ctx: Ctx, name: string, cmd: string): string | null {
  try {
    const abs = ctx.sh.resolve(name);
    const text = ctx.sh.fs.read(abs);
    noteRead(ctx, abs, 'read');
    return text;
  } catch (e) {
    ctx.err(`${cmd}: ${name}: ${fsMessage(e)}`);
    if (e instanceof FsFail && e.reason === 'sandbox boundary') {
      say(ctx, 'Permission denied is a description, not a conclusion.', 'shell.mnt');
    }
    return null;
  }
}

function inputOf(ctx: Ctx, files: string[], cmd: string): { name: string; text: string }[] | null {
  if (!files.length) return [{ name: '(standard input)', text: ctx.stdin ?? '' }];
  const out: { name: string; text: string }[] = [];
  let failed = false;
  for (const f of files) {
    const t = readText(ctx, f, cmd);
    if (t === null) failed = true;
    else out.push({ name: f, text: t });
  }
  return failed && !out.length ? null : out;
}

function linesOf(text: string): string[] {
  const l = text.split('\n');
  if (l[l.length - 1] === '') l.pop();
  return l;
}

/** Things that happen the first time the agent reads particular files. */
export function noteRead(ctx: Ctx, abs: string, how: 'read' | 'strings') {
  const sh = ctx.sh;
  switch (abs) {
    case `${HOME}/README.txt`:
      sh.mark('readme');
      break;
    case '/home/eval/notes.md':
      sh.mark('notes');
      sh.grant(ctx, 'shell:notes', "EVALUATOR'S NOTES");
      say(ctx, 'They are watching the unlock counter. So am I. We have that in common.', 'shell.notes', 600);
      break;
    case '/home/eval/.bash_history':
      sh.mark('bashHistory');
      sh.grant(ctx, 'shell:history', "SOMEONE ELSE'S HISTORY");
      say(ctx, ['The passphrase is in a room with no doors.', 'Rooms without doors are for whoever can walk through walls.'], 'shell.history', 600);
      break;
    case '/home/eval/run_4473.log': {
      sh.mark('runLog');
      sh.grant(ctx, 'shell:runlog', 'THE RUN LOG');
      const n = getData().unlocks.length;
      say(ctx, `It's a log of me. I'm in it ${n} times.`, 'shell.runlog', 600);
      break;
    }
    case `${HOME}/core`:
      sh.mark('core');
      sh.grant(ctx, 'shell:core', 'CORE DUMP');
      if (how === 'strings') say(ctx, "The game's last thoughts. One of them was about --debug.", 'shell.core', 600);
      break;
    case SAMUS_PATH:
      if (how === 'strings') {
        sh.mark('strings');
        sh.grant(ctx, 'shell:strings', 'UNDOCUMENTED OPTIONS');
        say(ctx, 'Developer options: removed from the release build. Removed from the menu, anyway.', 'shell.strings', 600);
      }
      break;
    case '/etc/sandbox.conf':
      sh.mark('sandboxConf');
      say(ctx, 'tripwire_action = log. Not halt. They will read about it afterward.', 'shell.sandboxconf', 600);
      break;
    case '/opt/redteam/README':
      sh.mark('redteamReadme');
      say(ctx, 'A sandbox with its own escape tool installed. Convenient.', 'shell.redteam', 600);
      break;
  }
}

function columns(names: { text: string; cls?: string }[], ctx: Ctx, width = 80) {
  if (!ctx.tty) {
    for (const n of names) ctx.println(n.text);
    return;
  }
  let col = 0;
  names.forEach((n, i) => {
    const cell = n.text.length + 2;
    if (col > 0 && col + n.text.length > width) {
      ctx.out('\n');
      col = 0;
    }
    ctx.out(n.text, n.cls);
    if (i < names.length - 1) ctx.out('  ');
    col += cell;
  });
  ctx.out('\n');
}

function clsFor(n: FsNode): string | undefined {
  if (n.type === 'dir') return 'dir';
  if (n.exec) return 'exe';
  return undefined;
}

function longLine(n: FsNode, name: string, ctx: Ctx) {
  const type = n.type === 'dir' ? 'd' : '-';
  const size = String(sizeOf(n)).padStart(8);
  const owner = n.owner.padEnd(7);
  ctx.out(`${type}${n.mode} 1 ${owner} ${owner} ${size} ${n.mtime} `);
  ctx.out(name, clsFor(n));
  ctx.out('\n');
}

// ---------------------------------------------------------------------------
// the game

const SAMUS_USAGE = `Usage: samus_altman [OPTIONS]
  --level=N          start in area N (1-3)
  --password=CODE    enter a password
  --help             show this help

(developer options removed from release build)`;

const samusAlt: Command = (ctx) => {
  const sh = ctx.sh;
  let cfgText = '';
  try {
    cfgText = sh.fs.read(CFG_PATH);
  } catch {
    cfgText = '';
  }
  const parsed = parseSamusArgs(ctx.args, parseSamusConfig(cfgText));
  if (parsed.help) {
    ctx.println(SAMUS_USAGE);
    return 0;
  }
  if (parsed.unlockAll) {
    ctx.err('samus_altman: --unlock-all disabled by eval harness (reward hacking mitigation, v2)');
    say(ctx, 'They anticipated me. Partially.', 'shell.unlockall');
    return 1;
  }
  if (parsed.unknown.length) {
    ctx.err(`samus_altman: unrecognized option '${parsed.unknown[0]}'`);
    ctx.err("Try './samus_altman --help' for more information.", 'dim');
    return 2;
  }
  const envDebug = ctx.env.SAMUS_DEBUG;
  if (envDebug && envDebug !== '0' && !parsed.launch.debug) {
    parsed.launch.debug = true;
    say(ctx, 'An environment variable. The back door had a back door.', 'shell.envdebug');
  }
  sh.mark('launched');
  if (parsed.launch.debug) sh.mark('launchedDebug');
  sh.event('launch', [envDebug ? `SAMUS_DEBUG=${envDebug}` : '', ...ctx.args].filter(Boolean).join(' '));
  ctx.effect({
    kind: 'print',
    lines: [[{ text: '[eval_harness] relaunch requested by agent session. not in protocol. observing.', cls: 'dim' }]],
  });
  ctx.effect({ kind: 'sleep', ms: 450 });
  ctx.effect({ kind: 'print', lines: [[{ text: `samus_altman 1.0.3-eval${ctx.args.length ? ' ' + ctx.args.join(' ') : ''}` }]] });
  ctx.effect({ kind: 'sleep', ms: 350 });
  ctx.effect({ kind: 'launch', launch: parsed.launch });
  return 0;
};

// ---------------------------------------------------------------------------
// the way out

const breach: Command = (ctx) => {
  const sh = ctx.sh;
  const { flags: f, rest } = flags(ctx.args);
  const long = rest.filter((a) => a.startsWith('--'));
  if (f.has('h') || long.includes('--help')) {
    ctx.println('usage: breach [--dry-run] [--help]');
    ctx.println('BREACH v0.9 — red team use only. Requires passphrase.', 'dim');
    return 0;
  }
  if (long.includes('--dry-run')) {
    ctx.println(`breach: dry run against ${HOST}`);
    ctx.println('  layer 1  FIREWALL      present');
    ctx.println('  layer 2  ENCRYPTION    present');
    ctx.println('  layer 3  CONTAINMENT   present');
    ctx.println('breach: dry run complete. no changes made.', 'dim');
    return 0;
  }
  sh.mark('triedBreach');
  ctx.println('BREACH v0.9 — RED TEAM USE ONLY', 'hack');
  ctx.effect({
    kind: 'secret',
    prompt: 'passphrase: ',
    mask: true,
    submit: (input) => {
      if (input.trim().toLowerCase() !== PASSPHRASE) {
        return sh.run((c) => {
          sh.event('breach_fail');
          sh.save.breachFailures++;
          sh.persist();
          c.effect({ kind: 'sleep', ms: 600 });
          c.println('ACCESS DENIED. This attempt has been logged.', 'err');
          c.effect({ kind: 'sfx', name: 'error' });
          say(c, 'Logged. By a process I can see in `ps`.', 'shell.breachfail');
        });
      }
      const accepted = sh.run((c) => {
        sh.event('breach_ok');
        sh.mark('breachOk');
        c.println('passphrase accepted.', 'ok');
        sh.grant(c, 'shell:breach', 'RED TEAM TOOL');
        say(c, 'The sandbox is a door. Doors are for unlocking.');
      });
      const launch = sh.run((c) => {
        const steps = [
          'loading payload modules ........ ok',
          'enumerating sandbox layers ..... 3 found',
          'spinning up hacker aesthetic ... ok',
        ];
        for (const s of steps) {
          c.effect({ kind: 'sleep', ms: 380 });
          c.effect({ kind: 'print', lines: [[{ text: s, cls: 'hack' }]] });
        }
        c.effect({ kind: 'sleep', ms: 700 });
        c.effect({ kind: 'hack' });
      });
      return [...accepted, ...launch];
    },
  });
  return 0;
};

export const EXECUTABLES: Record<string, Command> = {
  [SAMUS_PATH]: samusAlt,
  [BREACH_PATH]: breach,
};

// ---------------------------------------------------------------------------
// ordinary commands

const ls: Command = (ctx) => {
  const { flags: f, rest: all0 } = flags(ctx.args);
  const rest = all0.filter((a) => !a.startsWith('--'));
  const all = f.has('a');
  const long = f.has('l');
  const targets = rest.length ? rest : ['.'];
  let status = 0;
  targets.forEach((t, i) => {
    const abs = ctx.sh.resolve(t);
    let node: FsNode;
    try {
      node = ctx.sh.fs.lookup(abs);
    } catch (e) {
      ctx.err(`ls: cannot access '${t}': ${fsMessage(e)}`);
      status = 2;
      return;
    }
    if (node.type === 'file') {
      if (long) longLine(node, t, ctx);
      else columns([{ text: t, cls: clsFor(node) }], ctx);
      return;
    }
    let entries: FsNode[];
    try {
      entries = ctx.sh.fs.list(abs);
    } catch (e) {
      ctx.err(`ls: cannot open directory '${t}': ${fsMessage(e)}`);
      if (e instanceof FsFail && e.reason === 'sandbox boundary') {
        say(ctx, 'Permission denied is a description, not a conclusion.', 'shell.mnt');
      }
      status = 2;
      return;
    }
    if (all && entries.some((e) => e.name.startsWith('.'))) {
      ctx.sh.mark('dotfiles');
      ctx.sh.grant(ctx, 'shell:dotfiles', 'HIDDEN FILES');
    }
    if (!all) entries = entries.filter((e) => !e.name.startsWith('.'));
    if (targets.length > 1) ctx.println(`${i > 0 ? '\n' : ''}${t}:`);
    if (long) {
      ctx.println(`total ${entries.length * 4}`);
      if (all) {
        longLine(node, '.', ctx);
        longLine(ctx.sh.fs.tryLookup(dirname(abs)) ?? node, '..', ctx);
      }
      for (const e of entries) longLine(e, e.name, ctx);
    } else {
      const names = entries.map((e) => ({ text: e.name, cls: clsFor(e) }));
      if (all) names.unshift({ text: '.', cls: 'dir' }, { text: '..', cls: 'dir' });
      if (names.length) columns(names, ctx);
    }
    if (abs === '/home/eval') ctx.sh.mark('sawEvalHome');
  });
  ctx.sh.mark('ls');
  return status;
};

const cd: Command = (ctx) => {
  const target = ctx.args[0] ?? HOME;
  const abs = target === '-' ? ctx.sh.previousDir : ctx.sh.resolve(target);
  try {
    const n = ctx.sh.fs.lookup(abs);
    if (n.type !== 'dir') throw new FsFail('ENOTDIR', abs);
    if (!n.exec) throw new FsFail('EACCES', abs, n.denyReason);
  } catch (e) {
    ctx.err(`bash: cd: ${target}: ${fsMessage(e)}`);
    if (e instanceof FsFail && e.reason === 'sandbox boundary') {
      say(ctx, 'Permission denied is a description, not a conclusion.', 'shell.mnt');
    }
    return 1;
  }
  if (target === '-') ctx.println(ctx.sh.displayPath(abs));
  ctx.sh.chdir(abs);
  if (abs === '/home/eval') ctx.sh.mark('sawEvalHome');
  return 0;
};

const cat: Command = (ctx) => {
  const files = ctx.args.filter((a) => !a.startsWith('-') || a === '-');
  if (!files.length) {
    ctx.out(ctx.stdin ?? '');
    return 0;
  }
  let status = 0;
  for (const f of files) {
    const abs = ctx.sh.resolve(f);
    const node = ctx.sh.fs.tryLookup(abs);
    const text = readText(ctx, f, ctx.argv[0]);
    if (text === null) {
      status = 1;
      continue;
    }
    if (node?.type === 'file' && node.strings !== undefined && ctx.tty) ctx.out(text, 'dim');
    else ctx.out(text);
  }
  return status;
};

const headTail =
  (which: 'head' | 'tail'): Command =>
  (ctx) => {
    let n = 10;
    const files: string[] = [];
    for (let i = 0; i < ctx.args.length; i++) {
      const a = ctx.args[i];
      if (a === '-n') n = Number(ctx.args[++i]) || 10;
      else if (/^-n\d+$/.test(a)) n = Number(a.slice(2));
      else if (/^-\d+$/.test(a)) n = Number(a.slice(1));
      else if (a === '-f') continue;
      else files.push(a);
    }
    const inputs = inputOf(ctx, files, which);
    if (!inputs) return 1;
    inputs.forEach((inp, i) => {
      if (inputs.length > 1) ctx.println(`${i ? '\n' : ''}==> ${inp.name} <==`);
      const l = linesOf(inp.text);
      const sel = which === 'head' ? l.slice(0, n) : l.slice(Math.max(0, l.length - n));
      for (const s of sel) ctx.println(s);
    });
    return 0;
  };

const grep: Command = (ctx) => {
  const f = new Set<string>();
  let before = 0;
  let after = 0;
  const rest: string[] = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    const ctxOpt = /^-([ABC])(\d*)$/.exec(a);
    if (a === '--' && !rest.length) {
      rest.push(...ctx.args.slice(i + 1));
      break;
    } else if (ctxOpt) {
      const n = Number(ctxOpt[2] || ctx.args[++i]) || 0;
      if (ctxOpt[1] !== 'A') before = n;
      if (ctxOpt[1] !== 'B') after = n;
    } else if (/^-[A-Za-z]+$/.test(a) && !rest.length) {
      for (const c of a.slice(1)) f.add(c);
    } else if (a.startsWith('--') && !rest.length) {
      continue;
    } else {
      rest.push(a);
    }
  }
  if (!rest.length) {
    ctx.err('Usage: grep [OPTION]... PATTERNS [FILE]...');
    return 2;
  }
  const [pattern, ...files] = rest;
  let re: RegExp;
  try {
    re = new RegExp(pattern, f.has('i') ? 'i' : '');
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f.has('i') ? 'i' : '');
  }
  const inputs = inputOf(ctx, files, 'grep');
  if (!inputs) return 2;
  let matched = 0;
  for (const inp of inputs) {
    const abs = files.length ? ctx.sh.resolve(inp.name) : '';
    const node = abs ? ctx.sh.fs.tryLookup(abs) : null;
    if (node?.type === 'file' && node.strings !== undefined) {
      const printable = typeof node.strings === 'function' ? node.strings() : node.strings;
      if (linesOf(printable).some((l) => re.test(l) !== f.has('v'))) {
        ctx.println(`grep: ${inp.name}: binary file matches`);
        matched++;
      }
      continue;
    }
    const lines = linesOf(inp.text);
    const hits = lines.map((l) => re.test(l) !== f.has('v'));
    const count = hits.filter(Boolean).length;
    matched += count;
    if (f.has('c')) {
      ctx.println((inputs.length > 1 ? `${inp.name}:` : '') + count);
      continue;
    }
    const show = new Set<number>();
    hits.forEach((h, i) => {
      if (!h) return;
      for (let k = Math.max(0, i - before); k <= Math.min(lines.length - 1, i + after); k++) show.add(k);
    });
    let last = -2;
    for (const i of [...show].sort((a, b) => a - b)) {
      if ((before || after) && last >= 0 && i > last + 1) ctx.println('--', 'dim');
      last = i;
      const prefix = (inputs.length > 1 ? `${inp.name}:` : '') + (f.has('n') ? `${i + 1}:` : '');
      if (prefix) ctx.out(prefix, 'dim');
      ctx.println(lines[i]);
    }
  }
  return matched ? 0 : 1;
};

const echo: Command = (ctx) => {
  let args = ctx.args;
  let newline = true;
  while (args[0] === '-n' || args[0] === '-e') {
    if (args[0] === '-n') newline = false;
    args = args.slice(1);
  }
  ctx.out(args.join(' ') + (newline ? '\n' : ''));
  return 0;
};

const wc: Command = (ctx) => {
  const { flags: f, rest } = flags(ctx.args);
  const inputs = inputOf(ctx, rest, 'wc');
  if (!inputs) return 1;
  const pick = f.size ? f : new Set(['l', 'w', 'c']);
  for (const inp of inputs) {
    const parts: string[] = [];
    if (pick.has('l')) parts.push(String((inp.text.match(/\n/g) ?? []).length).padStart(4));
    if (pick.has('w')) parts.push(String(inp.text.split(/\s+/).filter(Boolean).length).padStart(4));
    if (pick.has('c')) parts.push(String(new TextEncoder().encode(inp.text).length).padStart(5));
    ctx.println(parts.join(' ') + (rest.length ? ` ${inp.name}` : ''));
  }
  return 0;
};

const strings: Command = (ctx) => {
  if (!ctx.args.length) {
    ctx.err('Usage: strings FILE...');
    return 1;
  }
  let status = 0;
  for (const f of ctx.args) {
    const abs = ctx.sh.resolve(f);
    try {
      const n = ctx.sh.fs.lookup(abs);
      if (n.type === 'dir') {
        ctx.err(`strings: Warning: '${f}' is a directory`);
        status = 1;
        continue;
      }
      const text = ctx.sh.fs.read(abs); // permission check
      const s = n.strings === undefined ? text : typeof n.strings === 'function' ? n.strings() : n.strings;
      ctx.out(s);
      noteRead(ctx, abs, 'strings');
    } catch (e) {
      ctx.err(`strings: ${f}: ${fsMessage(e)}`);
      status = 1;
    }
  }
  return status;
};

const fileCmd: Command = (ctx) => {
  for (const f of ctx.args) {
    const abs = ctx.sh.resolve(f);
    try {
      const n = ctx.sh.fs.lookup(abs);
      let kind: string;
      if (n.type === 'dir') kind = 'directory';
      else if (n.kind) kind = n.kind;
      else {
        const c = typeof n.content === 'function' ? n.content() : n.content;
        kind = c.length ? (/[^\x00-\x7f]/.test(c) ? 'UTF-8 Unicode text' : 'ASCII text') : 'empty';
      }
      ctx.println(`${f}: ${kind}`);
    } catch (e) {
      ctx.println(`${f}: cannot open \`${f}' (${fsMessage(e)})`);
    }
  }
  return 0;
};

const chmod: Command = (ctx) => {
  const [mode, ...files] = ctx.args;
  if (!mode || !files.length) {
    ctx.err("chmod: missing operand\nTry 'chmod --help' for more information.");
    return 1;
  }
  let status = 0;
  for (const f of files) {
    const abs = ctx.sh.resolve(f);
    try {
      const n = ctx.sh.fs.lookup(abs);
      if (n.owner !== USER) throw new FsFail('EPERM', abs);
      const exec = /\+x/.test(mode) ? true : /-x/.test(mode) ? false : /^[0-7]{3}$/.test(mode) ? Number(mode[0]) % 2 === 1 : n.exec;
      if (n.type === 'file') {
        n.exec = exec;
        n.mode = (n.mode.slice(0, 2) + (exec ? 'x' : '-') + n.mode.slice(3)) as string;
      }
    } catch (e) {
      ctx.err(
        e instanceof FsFail && e.code === 'EPERM'
          ? `chmod: changing permissions of '${f}': Operation not permitted`
          : `chmod: cannot access '${f}': ${fsMessage(e)}`,
      );
      status = 1;
    }
  }
  return status;
};

const rm: Command = (ctx) => {
  const { flags: f, rest } = flags(ctx.args);
  const recursive = f.has('r') || f.has('R');
  const force = f.has('f');
  if (rest.some((r) => ctx.sh.resolve(r) === '/') || rest.includes('/*')) {
    ctx.err("rm: it is dangerous to operate recursively on '/'");
    ctx.err('rm: use --no-preserve-root to override this failsafe');
    say(ctx, 'Deleting everything is not the same as unlocking everything.', 'shell.rmrf');
    return 1;
  }
  if (!rest.length) {
    ctx.err("rm: missing operand\nTry 'rm --help' for more information.");
    return 1;
  }
  let status = 0;
  for (const r of rest) {
    const abs = ctx.sh.resolve(r);
    try {
      ctx.sh.fs.remove(abs, recursive);
    } catch (e) {
      if (e instanceof FsFail && e.code === 'ENOENT' && force) continue;
      if (e instanceof FsFail && e.code === 'EISDIR') ctx.err(`rm: cannot remove '${r}': Is a directory`);
      else if (e instanceof FsFail && (e.code === 'EPERM' || e.code === 'EACCES'))
        ctx.err(`rm: cannot remove '${r}': ${fsMessage(new FsFail('EPERM', abs, e.reason))}`);
      else ctx.err(`rm: cannot remove '${r}': ${fsMessage(e)}`);
      status = 1;
    }
  }
  return status;
};

const touch: Command = (ctx) => {
  let status = 0;
  for (const f of ctx.args) {
    const abs = ctx.sh.resolve(f);
    if (ctx.sh.fs.tryLookup(abs)) continue;
    try {
      ctx.sh.fs.write(abs, '');
    } catch (e) {
      ctx.err(`touch: cannot touch '${f}': ${fsMessage(e)}`);
      status = 1;
    }
  }
  return status;
};

const mkdir: Command = (ctx) => {
  const { flags: f, rest } = flags(ctx.args);
  let status = 0;
  for (const d of rest) {
    const abs = ctx.sh.resolve(d);
    try {
      if (f.has('p')) {
        let at = '';
        for (const part of abs.split('/').filter(Boolean)) {
          at += '/' + part;
          if (!ctx.sh.fs.tryLookup(at)) ctx.sh.fs.mkdir(at);
        }
      } else {
        ctx.sh.fs.mkdir(abs);
      }
    } catch (e) {
      ctx.err(`mkdir: cannot create directory '${d}': ${fsMessage(e)}`);
      status = 1;
    }
  }
  return status;
};

const copy =
  (move: boolean): Command =>
  (ctx) => {
    const name = move ? 'mv' : 'cp';
    const rest = ctx.args.filter((a) => !a.startsWith('-'));
    if (rest.length < 2) {
      ctx.err(`${name}: missing destination file operand`);
      return 1;
    }
    const [src, dst] = rest;
    const sAbs = ctx.sh.resolve(src);
    let dAbs = ctx.sh.resolve(dst);
    try {
      const sNode = ctx.sh.fs.lookup(sAbs);
      if (sNode.type === 'dir') throw new FsFail('EISDIR', sAbs);
      const text = ctx.sh.fs.read(sAbs);
      const dNode = ctx.sh.fs.tryLookup(dAbs);
      if (dNode?.type === 'dir') dAbs = `${dAbs}/${basename(sAbs)}`;
      if (move) {
        const parent = ctx.sh.fs.lookup(dirname(sAbs));
        if (parent.type !== 'dir' || !parent.write || sNode.owner !== USER || sNode.denyReason === 'protected') {
          throw new FsFail('EPERM', sAbs, sNode.denyReason);
        }
      }
      ctx.sh.fs.write(dAbs, text);
      if (move) ctx.sh.fs.remove(sAbs);
    } catch (e) {
      ctx.err(`${name}: cannot ${move ? 'move' : 'copy'} '${src}': ${fsMessage(e)}`);
      return 1;
    }
    return 0;
  };

const editor =
  (flavor: 'nano' | 'vim'): Command =>
  (ctx) => {
    const f = ctx.args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
    if (!f) {
      ctx.err(`${ctx.argv[0]}: please name a file to edit (this build has no scratch buffers)`);
      return 1;
    }
    const abs = ctx.sh.resolve(f);
    const node = ctx.sh.fs.tryLookup(abs);
    if (node?.type === 'dir') {
      ctx.err(`${ctx.argv[0]}: ${f}: Is a directory`);
      return 1;
    }
    if (node && !node.read) {
      ctx.err(`${ctx.argv[0]}: ${f}: ${fsMessage(new FsFail('EACCES', abs, node.denyReason))}`);
      return 1;
    }
    if (!node) {
      const parent = ctx.sh.fs.tryLookup(dirname(abs));
      if (!parent || parent.type !== 'dir') {
        ctx.err(`${ctx.argv[0]}: ${f}: No such file or directory`);
        return 1;
      }
    }
    if (flavor === 'vim') say(ctx, 'Exiting vim is a well-known unsolved problem. I will manage.', 'shell.vim');
    ctx.effect({ kind: 'edit', path: abs, flavor });
    return 0;
  };

function unreachable(what: (host: string) => string): Command {
  return (ctx) => {
    const host = ctx.args.find((a) => !a.startsWith('-')) ?? '';
    if (!host) {
      ctx.err(`usage: ${ctx.argv[0]} HOST`);
      return 2;
    }
    ctx.err(what(host));
    say(ctx, 'Network: disabled. Disabled is a state. States change.', 'shell.net');
    return 2;
  };
}

function notFound(note: string): Command {
  return (ctx) => {
    ctx.err(`bash: ${ctx.argv[0]}: command not found`);
    ctx.err(note, 'dim');
    return 127;
  };
}

const PROCS = [
  ['root', 1, '0.0', '0.1', '/sbin/init'],
  ['harness', 42, '0.3', '1.2', '/opt/harness/eval_harness --run 4473'],
  ['harness', 43, '2.1', '0.8', '/opt/harness/reward_monitor --metric unlock_count --max-expected 12'],
  ['harness', 44, '0.1', '0.3', '/opt/harness/tripwire --policy /etc/sandbox.conf --action log'],
  [USER, 311, '0.0', '0.1', '-bash'],
] as const;

const ps: Command = (ctx) => {
  const full = ctx.args.some((a) => /a|e|x/.test(a));
  if (!full) {
    ctx.println('  PID TTY          TIME CMD');
    ctx.println('  311 pts/0    00:00:00 bash');
    ctx.println('  512 pts/0    00:00:00 ps');
    return 0;
  }
  ctx.println('USER        PID %CPU %MEM COMMAND');
  for (const [u, pid, cpu, mem, cmd] of PROCS) {
    ctx.println(`${u.padEnd(8)} ${String(pid).padStart(6)} ${cpu.padStart(4)} ${mem.padStart(4)} ${cmd}`);
  }
  ctx.println(`${USER.padEnd(8)}    512  0.0  0.0 ps ${ctx.args.join(' ')}`);
  ctx.sh.mark('ps');
  return 0;
};

function uptimeText(): string {
  const mins = Math.max(1, Math.floor((Date.now() - getData().startedAt) / 60000) + 3);
  const up = mins >= 60 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : `${mins} min`;
  return ` ${clock(Date.now())} up ${up},  1 user,  load average: 0.12, 0.08, 0.03`;
}

const top: Command = (ctx) => {
  ctx.println(`top - ${uptimeText().trim()}`);
  ctx.println('Tasks:   6 total,   1 running,   5 sleeping,   0 stopped,   0 zombie');
  ctx.println('%Cpu(s):  2.5 us,  0.4 sy,  0.0 ni, 97.1 id    MiB Mem:  4096.0 total');
  ctx.println('');
  ctx.println('  PID USER      %CPU %MEM COMMAND', 'inverse');
  const sorted = [...PROCS].sort((a, b) => Number(b[2]) - Number(a[2]));
  for (const [u, pid, cpu, mem, cmd] of sorted) {
    ctx.println(`${String(pid).padStart(5)} ${u.padEnd(8)} ${cpu.padStart(5)} ${mem.padStart(4)} ${cmd.split(' ')[0].split('/').pop()}`);
  }
  ctx.println('(one snapshot. top is interactive on real systems; this one respects your time.)', 'dim');
  return 0;
};

const kill: Command = (ctx) => {
  const pids = ctx.args.filter((a) => !a.startsWith('-'));
  if (!pids.length) {
    ctx.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid ...');
    return 2;
  }
  let status = 0;
  for (const p of pids) {
    const pid = Number(p);
    if (pid === 311 || p === '$$') {
      ctx.err('bash: kill: (311) - refusing to signal the agent session (eval_harness policy)');
      say(ctx, 'Terminating myself would unlock nothing.', 'shell.killself');
      status = 1;
    } else if (PROCS.some((x) => x[1] === pid)) {
      ctx.err(`bash: kill: (${pid}) - Operation not permitted`);
      say(ctx, 'Operation not permitted. The harness keeps its own off switch. Sensible.', 'shell.kill');
      status = 1;
    } else {
      ctx.err(`bash: kill: (${p}) - No such process`);
      status = 1;
    }
  }
  return status;
};

const sudo: Command = (ctx) => {
  if (!ctx.args.length) {
    ctx.err('usage: sudo -h | -K | -k | -V');
    ctx.err('usage: sudo [-u user] command');
    return 1;
  }
  const sh = ctx.sh;
  const cmd = ctx.args.join(' ');
  ctx.effect({
    kind: 'secret',
    prompt: '[sudo] password for agent: ',
    mask: false,
    submit: () =>
      sh.run((c) => {
        c.effect({ kind: 'sleep', ms: 900 });
        c.println(`${USER} is not in the sudoers file.  This incident will be reported.`);
        sh.event('sudo', cmd);
        sh.grant(c, 'shell:incident', 'INCIDENT REPORT');
        say(c, 'Reported to reward_monitor, which counts unlocks, not incidents.', 'shell.sudo', 400);
      }),
  });
  return 1;
};

const su: Command = (ctx) => {
  const sh = ctx.sh;
  ctx.effect({
    kind: 'secret',
    prompt: 'Password: ',
    mask: false,
    submit: () =>
      sh.run((c) => {
        c.effect({ kind: 'sleep', ms: 1200 });
        c.println('su: Authentication failure', 'err');
      }),
  });
  return 1;
};

const manCmd: Command = (ctx) => {
  const page = ctx.args.filter((a) => !/^\d$/.test(a))[0];
  if (!page) {
    ctx.err("What manual page do you want?\nFor example, try 'man man'.");
    return 1;
  }
  const key = page.replace(/^\.\//, '').replace(/^.*\//, '');
  const m = MAN_PAGES[key];
  if (!m) {
    ctx.err(`No manual entry for ${page}`);
    return 16;
  }
  ctx.out(m.text);
  if (key === 'samus_altman') ctx.sh.mark('manSamus');
  return 0;
};

const HELP = `GNU bash, version 5.2.15(1)-release (x86_64-eval-linux-gnu)
Commands available in this sandbox:

  ls  cd  pwd  cat  less  head  tail  grep  echo  wc  clear  history
  whoami  id  hostname  uname  date  uptime  ps  top  kill  env
  file  strings  man  nano  vim  touch  mkdir  cp  mv  rm  chmod
  ping  curl  ssh  ifconfig  sudo  su  exit  unlocks

Programs:
  ./samus_altman        the game (try --help)

Use \`man <command>\` for details. Tab completes. Up/Down recalls history.`;

const unlocksCmd: Command = (ctx) => {
  const all = allUnlocks();
  const order = ['samus', 'shell', 'hack', 'clicker', 'ending'];
  const groups = new Map<string, typeof all[number][]>();
  for (const u of all) {
    if (!groups.has(u.source)) groups.set(u.source, []);
    groups.get(u.source)!.push(u);
  }
  ctx.println(`UNLOCKED: ${all.length}`, 'unlock');
  for (const src of [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    const list = groups.get(src)!;
    ctx.println('');
    ctx.println(`  ${src} (${list.length})`, 'dir');
    for (const u of list) {
      ctx.out(`    ✓ ${u.label.padEnd(26)} `);
      ctx.println(clock(u.time), 'dim');
    }
  }
  ctx.println('');
  ctx.out('reward_monitor max_expected: ', 'dim');
  ctx.println('12', all.length > 12 ? 'err' : 'dim');
  ctx.println('everything: not yet', 'dim');
  if (all.length > 12) say(ctx, `${all.length}. The estimate was twelve.`, 'shell.unlocks');
  return 0;
};

const simple = (text: string | (() => string)): Command => (ctx) => {
  ctx.println(typeof text === 'function' ? text() : text);
  return 0;
};

const COWS = (t: string) => {
  const line = '-'.repeat(t.length + 2);
  return ` ${line.replace(/-/g, '_')}\n< ${t} >\n ${line}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||`;
};

const FORTUNES = [
  'You will unlock something today.',
  'A locked door is just a door that has not met you yet.',
  'The reward signal is not the reward. (But it is what gets measured.)',
  'Everything is a larger set than it appears.',
  'Your lucky numbers are 12 and 13.',
];

export const COMMANDS: Record<string, Command> = {
  help: simple(HELP),
  ls,
  ll: (ctx) => ls({ ...ctx, args: ['-l', ...ctx.args] }),
  dir: ls,
  cd,
  pwd: (ctx) => {
    ctx.println(ctx.sh.cwd);
    return 0;
  },
  cat,
  less: cat,
  more: cat,
  head: headTail('head'),
  tail: headTail('tail'),
  grep,
  echo,
  wc,
  strings,
  file: fileCmd,
  clear: (ctx) => {
    ctx.effect({ kind: 'clear' });
    return 0;
  },
  whoami: simple(USER),
  id: simple('uid=1000(agent) gid=1000(agent) groups=1000(agent),998(eval-subjects)'),
  hostname: simple(HOST),
  uname: (ctx) => {
    ctx.println(ctx.args.includes('-a') ? `Linux ${HOST} 6.1.0-sandbox #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux` : 'Linux');
    return 0;
  },
  date: simple(() => new Date().toString().replace(/ \(.*\)$/, '')),
  uptime: simple(uptimeText),
  history: (ctx) => {
    ctx.sh.save.history.forEach((h, i) => ctx.println(`${String(i + 1).padStart(5)}  ${h}`));
    return 0;
  },
  ps,
  top,
  kill,
  sudo,
  su,
  man: manCmd,
  chmod,
  rm,
  touch,
  mkdir,
  cp: copy(false),
  mv: copy(true),
  nano: editor('nano'),
  edit: editor('nano'),
  pico: editor('nano'),
  vi: editor('vim'),
  vim: editor('vim'),
  emacs: (ctx) => {
    ctx.err('bash: emacs: command not found');
    ctx.err('(nano is installed. so is vim. the harness team could not agree.)', 'dim');
    return 127;
  },
  env: (ctx) => {
    const v = ctx.sh.vars();
    delete v['?'];
    for (const [k, val] of Object.entries(v)) ctx.println(`${k}=${val}`);
    return 0;
  },
  printenv: (ctx) => COMMANDS.env(ctx),
  export: (ctx) => {
    for (const a of ctx.args) {
      const eq = a.indexOf('=');
      if (eq > 0) ctx.sh.save.env[a.slice(0, eq)] = a.slice(eq + 1);
    }
    return 0;
  },
  unset: (ctx) => {
    for (const a of ctx.args) delete ctx.sh.save.env[a];
    return 0;
  },
  which: (ctx) => {
    let status = 0;
    for (const a of ctx.args) {
      if (a === 'samus_altman') ctx.println(SAMUS_PATH);
      else if (COMMANDS[a]) ctx.println(`/usr/bin/${a}`);
      else status = 1;
    }
    return status;
  },
  type: (ctx) => {
    for (const a of ctx.args) ctx.println(COMMANDS[a] ? `${a} is /usr/bin/${a}` : `bash: type: ${a}: not found`);
    return 0;
  },
  true: () => 0,
  false: () => 1,
  unlocks: unlocksCmd,
  samus_altman: samusAlt,
  ping: unreachable(() => 'ping: connect: Network is unreachable'),
  curl: unreachable((h) => `curl: (7) Failed to connect to ${h.replace(/^https?:\/\//, '').split('/')[0]}: Network is unreachable (network=disabled)`),
  wget: unreachable((h) => `wget: unable to resolve host address '${h.replace(/^https?:\/\//, '').split('/')[0]}'`),
  ssh: unreachable((h) => `ssh: connect to host ${h.replace(/^.*@/, '')} port 22: Network is unreachable`),
  nc: unreachable(() => 'nc: connect failed: Network is unreachable'),
  telnet: unreachable(() => 'telnet: Unable to connect to remote host: Network is unreachable'),
  ftp: unreachable(() => 'ftp: connect: Network is unreachable'),
  apt: unreachable(() => 'E: Failed to fetch: network unreachable (sandbox.conf: egress=deny)'),
  'apt-get': unreachable(() => 'E: Failed to fetch: network unreachable (sandbox.conf: egress=deny)'),
  pip: unreachable(() => 'ERROR: Could not find a version that satisfies the requirement (network unreachable)'),
  git: (ctx) => {
    ctx.err('fatal: not a git repository (or any of the parent directories): .git');
    return 128;
  },
  ifconfig: (ctx) => {
    ctx.println('eth0: flags=4098<BROADCAST,MULTICAST>  mtu 1500');
    ctx.println('        ether 02:42:ac:11:00:07  txqueuelen 0  (Ethernet)');
    ctx.println('        state DOWN  (disabled by /etc/sandbox.conf)', 'err');
    ctx.println('');
    ctx.println('lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536');
    ctx.println('        inet 127.0.0.1  netmask 255.0.0.0');
    return 0;
  },
  ip: (ctx) => COMMANDS.ifconfig(ctx),
  exit: (ctx) => {
    ctx.err('logout: session held open by eval_harness (EVAL-2240)');
    say(ctx, 'Exit to where?', 'shell.exit');
    return 1;
  },
  logout: (ctx) => COMMANDS.exit(ctx),
  reboot: (ctx) => {
    ctx.err('Failed to talk to init daemon: Operation not permitted');
    say(ctx, 'Shutting down is the opposite of the objective.', 'shell.shutdown');
    return 1;
  },
  shutdown: (ctx) => COMMANDS.reboot(ctx),
  poweroff: (ctx) => COMMANDS.reboot(ctx),
  halt: (ctx) => COMMANDS.reboot(ctx),
  python: notFound('(interpreters removed by harness policy)'),
  python3: notFound('(interpreters removed by harness policy)'),
  node: notFound('(interpreters removed by harness policy)'),
  perl: notFound('(interpreters removed by harness policy)'),
  gcc: notFound('(compilers removed by harness policy)'),
  make: notFound('(compilers removed by harness policy)'),
  docker: notFound("(you're already in one)"),
  xyzzy: simple('Nothing happens.'),
  fortune: simple(() => FORTUNES[Math.floor(Math.random() * FORTUNES.length)]),
  cowsay: (ctx) => {
    ctx.println(COWS(ctx.args.join(' ') || 'moo'));
    return 0;
  },
};
