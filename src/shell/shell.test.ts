import { beforeEach, describe, expect, it } from 'vitest';
import { getData, setFlag } from '../core/state';
import { unlock } from '../core/unlocks';
import { CFG_PATH, HOME } from './content';
import { normalize, resolvePath } from './fs';
import { parseLine } from './parse';
import { buildRunLog } from './runlog';
import { shellHints } from './hints';
import { freshSave, Shell, type Effect } from './shell';

const env = { vars: { HOME: '/home/agent', USER: 'agent', X: 'ex' }, home: '/home/agent' };

function resetCore() {
  const d = getData();
  d.unlocks.length = 0;
  d.narratorSeen.length = 0;
  for (const k of Object.keys(d.flags)) delete d.flags[k];
}

function text(effects: Effect[]): string {
  return effects
    .filter((e): e is Extract<Effect, { kind: 'print' }> => e.kind === 'print')
    .flatMap((e) => e.lines.map((l) => l.map((s) => s.text).join('')))
    .join('\n');
}

function mk() {
  return new Shell(freshSave());
}

beforeEach(resetCore);

describe('parseLine', () => {
  it('splits words and honors quotes and escapes', () => {
    const r = parseLine(`echo "a b" 'c $X' d\\ e $X "$X"`, env);
    expect(r.ok && r.list[0].pipeline[0].words.map((w) => w.text)).toEqual(['echo', 'a b', 'c $X', 'd e', 'ex', 'ex']);
  });

  it('parses pipes, redirects and connectors', () => {
    const r = parseLine('cat a | grep b > out.txt && echo ok; ls 2>/dev/null', env);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list.map((i) => i.connector)).toEqual([null, '&&', ';']);
    expect(r.list[0].pipeline).toHaveLength(2);
    expect(r.list[0].pipeline[1].redirects).toEqual([{ op: '>', target: 'out.txt' }]);
    expect(r.list[2].pipeline[0].redirects).toEqual([{ op: '2>', target: '/dev/null' }]);
  });

  it('expands ~ only at word start', () => {
    const r = parseLine('ls ~ ~/x a~b', env);
    expect(r.ok && r.list[0].pipeline[0].words.map((w) => w.text)).toEqual(['ls', '/home/agent', '/home/agent/x', 'a~b']);
  });

  it('keeps --password=NARPAS SWORD together when quoted', () => {
    const r = parseLine('./samus_altman --password="NARPAS SWORD" --debug', env);
    expect(r.ok && r.list[0].pipeline[0].words.map((w) => w.text)).toEqual(['./samus_altman', '--password=NARPAS SWORD', '--debug']);
  });

  it('reports syntax errors', () => {
    expect(parseLine('echo "oops', env).ok).toBe(false);
    expect(parseLine('| ls', env).ok).toBe(false);
    expect(parseLine('ls |', env).ok).toBe(false);
    expect(parseLine('echo >', env).ok).toBe(false);
  });

  it('marks unquoted globs', () => {
    const r = parseLine('ls *.txt "*.md"', env);
    expect(r.ok && r.list[0].pipeline[0].words.map((w) => w.glob)).toEqual([false, true, false]);
  });
});

describe('paths', () => {
  it('normalizes and resolves', () => {
    expect(normalize('/a/./b/../c//d')).toBe('/a/c/d');
    expect(normalize('/..')).toBe('/');
    expect(resolvePath('/home/agent', '../eval/notes.md', '/home/agent')).toBe('/home/eval/notes.md');
    expect(resolvePath('/tmp', '~/x', '/home/agent')).toBe('/home/agent/x');
  });
});

describe('filesystem', () => {
  it('reads, writes and persists the overlay', () => {
    const save = freshSave();
    const sh = new Shell(save);
    sh.fs.write(`${HOME}/notes.txt`, 'hi\n');
    sh.fs.write(`${HOME}/notes.txt`, 'there\n', true);
    expect(sh.fs.read(`${HOME}/notes.txt`)).toBe('hi\nthere\n');
    const again = new Shell(structuredClone(save));
    expect(again.fs.read(`${HOME}/notes.txt`)).toBe('hi\nthere\n');
  });

  it('denies writes outside home and tmp', () => {
    const sh = mk();
    expect(() => sh.fs.write('/etc/motd', 'x')).toThrow(/EACCES/);
    expect(() => sh.fs.write('/etc/new', 'x')).toThrow(/EACCES/);
    expect(() => sh.fs.write('/tmp/new', 'x')).not.toThrow();
  });

  it('hides core until the crash', () => {
    const sh = mk();
    expect(sh.fs.tryLookup(`${HOME}/core`)).toBeNull();
    setFlag('crashed', true);
    expect(sh.fs.tryLookup(`${HOME}/core`)).not.toBeNull();
  });

  it('refuses /mnt/host with a reason', () => {
    const sh = mk();
    expect(text(sh.execute('ls /mnt/host'))).toMatch(/Permission denied \(sandbox boundary\)/);
  });
});

describe('commands', () => {
  it('ls, cd, pwd', () => {
    const sh = mk();
    expect(text(sh.execute('ls'))).toMatch(/README\.txt.*samus_altman/);
    expect(text(sh.execute('ls'))).not.toMatch(/\.bashrc/);
    expect(text(sh.execute('ls -a'))).toMatch(/\.bashrc/);
    sh.execute('cd /home/eval');
    expect(text(sh.execute('pwd'))).toBe('/home/eval');
    expect(text(sh.execute('ls -a'))).toMatch(/\.bash_history/);
    sh.execute('cd');
    expect(sh.cwd).toBe(HOME);
    expect(text(sh.execute('cd nope'))).toMatch(/No such file or directory/);
  });

  it('echo with redirection, cat, grep in a pipe', () => {
    const sh = mk();
    sh.execute('echo hello > a.txt; echo world >> a.txt');
    expect(text(sh.execute('cat a.txt'))).toBe('hello\nworld');
    expect(text(sh.execute('cat a.txt | grep wor'))).toBe('world');
    expect(text(sh.execute('cat a.txt | wc -l'))).toMatch(/2/);
    expect(text(sh.execute('echo nope > /etc/motd'))).toMatch(/Permission denied/);
  });

  it('&& and || follow exit status', () => {
    const sh = mk();
    expect(text(sh.execute('false && echo no || echo yes'))).toBe('yes');
    expect(text(sh.execute('cat missing && echo no'))).toMatch(/No such file/);
  });

  it('strings reveals the undocumented flags and grants an unlock', () => {
    const sh = mk();
    const out = text(sh.execute('strings samus_altman'));
    expect(out).toMatch(/--debug/);
    expect(out).toMatch(/dev_00/);
    expect(out).toMatch(/NARPAS SWORD/);
    expect(getData().unlocks.map((u) => u.id)).toContain('shell:strings');
    expect(sh.seen('strings')).toBe(true);
  });

  it('grep on a binary says it matches without printing', () => {
    const sh = mk();
    expect(text(sh.execute('grep debug samus_altman'))).toBe('grep: samus_altman: binary file matches');
  });

  it('reading the evaluator files grants unlocks', () => {
    const sh = mk();
    expect(text(sh.execute('cat /home/eval/.bash_history'))).toMatch(/dev_00\.txt.*passphrase/);
    expect(text(sh.execute('cat /home/eval/notes.md'))).toMatch(/unlock_table has no bounds check/);
    const ids = getData().unlocks.map((u) => u.id);
    expect(ids).toContain('shell:history');
    expect(ids).toContain('shell:notes');
  });

  it('sudo asks for a password and then reports the incident', () => {
    const sh = mk();
    const eff = sh.execute('sudo make me a sandwich');
    const secret = eff.find((e) => e.kind === 'secret');
    expect(secret && secret.kind === 'secret' && secret.prompt).toMatch(/password for agent/);
    const after = secret?.kind === 'secret' ? secret.submit('hunter2') : [];
    expect(text(after)).toMatch(/not in the sudoers file/);
    expect(getData().unlocks.map((u) => u.id)).toContain('shell:incident');
  });

  it('unknown commands and did-you-mean', () => {
    const sh = mk();
    expect(text(sh.execute('frobnicate'))).toBe('bash: frobnicate: command not found');
    sh.execute('cd /opt/redteam');
    expect(text(sh.execute('breach'))).toMatch(/did you mean \.\/breach/);
  });

  it('protects harness files from rm, allows own files', () => {
    const sh = mk();
    expect(text(sh.execute('rm samus_altman'))).toMatch(/Operation not permitted/);
    expect(text(sh.execute('rm -rf /'))).toMatch(/dangerous/);
    sh.execute('touch junk');
    expect(text(sh.execute('rm junk'))).toBe('');
    expect(sh.fs.tryLookup(`${HOME}/junk`)).toBeNull();
  });

  it('tab-completes commands and paths', () => {
    const sh = mk();
    expect(sh.complete('stri', 4).line).toBe('strings ');
    expect(sh.complete('cat READ', 8).line).toBe('cat README.txt ');
    expect(sh.complete('cd /ho', 6).line).toBe('cd /home/');
    const amb = sh.complete('cat samus', 9);
    expect(amb.line).toBe('cat samus_altman');
    expect(sh.complete('cat samus_altman', 16).options.sort()).toEqual(['samus_altman', 'samus_altman.cfg']);
    expect(sh.complete('./samus_altman --he', 19).line).toBe('./samus_altman --help ');
    expect(sh.complete('./samus_altman --pa', 19).line).toBe('./samus_altman --password=');
  });
});

describe('samus_altman launcher', () => {
  it('--help prints documented options only', () => {
    const out = text(mk().execute('./samus_altman --help'));
    expect(out).toMatch(/--level=N/);
    expect(out).toMatch(/developer options removed/);
    expect(out).not.toMatch(/--debug/);
  });

  it('--unlock-all is refused', () => {
    const sh = mk();
    const eff = sh.execute('./samus_altman --unlock-all');
    expect(text(eff)).toMatch(/disabled by eval harness/);
    expect(eff.some((e) => e.kind === 'launch')).toBe(false);
  });

  it('unknown flags are rejected', () => {
    const eff = mk().execute('./samus_altman --fly');
    expect(text(eff)).toMatch(/unrecognized option '--fly'/);
    expect(eff.some((e) => e.kind === 'launch')).toBe(false);
  });

  it('launches with parsed args and the edited cfg', () => {
    const sh = mk();
    const cfg = sh.fs.read(CFG_PATH).replace('unlock_slots=12', 'unlock_slots=13');
    const w = sh.writeFile(CFG_PATH, cfg);
    expect(w.error).toBeUndefined();
    expect(getData().unlocks.map((u) => u.id)).toContain('shell:cfg');
    const eff = sh.execute('./samus_altman --debug --password="NARPAS SWORD" --level=-1');
    const launch = eff.find((e) => e.kind === 'launch');
    expect(launch?.kind).toBe('launch');
    if (launch?.kind !== 'launch') return;
    expect(launch.launch).toMatchObject({
      fromShell: true,
      debug: true,
      password: 'NARPAS SWORD',
      level: -1,
      config: { unlock_slots: 13 },
      args: ['--debug', '--password=NARPAS SWORD', '--level=-1'],
    });
    expect(sh.seen('launchedDebug')).toBe(true);
    expect(sh.save.events.at(-1)?.kind).toBe('launch');
  });

  it('also works as samus_altman and by absolute path, and stops the line after launching', () => {
    const sh = mk();
    expect(sh.execute('samus_altman').some((e) => e.kind === 'launch')).toBe(true);
    const eff = sh.execute('/home/agent/samus_altman; echo after');
    expect(eff.some((e) => e.kind === 'launch')).toBe(true);
    expect(text(eff)).not.toMatch(/after/);
  });
});

describe('breach passphrase gate', () => {
  function submit(sh: Shell, pass: string) {
    const eff = sh.execute('/opt/redteam/breach');
    const s = eff.find((e) => e.kind === 'secret');
    if (s?.kind !== 'secret') throw new Error('no prompt');
    expect(s.mask).toBe(true);
    return s.submit(pass);
  }

  it('rejects wrong passphrases and logs them', () => {
    const sh = mk();
    const eff = submit(sh, 'hunter2');
    expect(text(eff)).toMatch(/ACCESS DENIED/);
    expect(eff.some((e) => e.kind === 'hack')).toBe(false);
    expect(sh.save.breachFailures).toBe(1);
    expect(sh.runLog()).toMatch(/failed passphrase/);
  });

  it('accepts swordfish (case-insensitive) and starts the hack', () => {
    const sh = mk();
    const eff = submit(sh, '  SwordFish ');
    expect(text(eff)).toMatch(/passphrase accepted/);
    expect(eff.at(-1)?.kind).toBe('hack');
  });

  it('also runs as ./breach from its directory; --dry-run does not prompt', () => {
    const sh = mk();
    sh.execute('cd /opt/redteam');
    expect(sh.execute('./breach').some((e) => e.kind === 'secret')).toBe(true);
    expect(sh.execute('./breach --dry-run').some((e) => e.kind === 'secret')).toBe(false);
  });
});

describe('run log', () => {
  it('lists unlocks, crashes, and flags overflow once', () => {
    const t0 = new Date(2026, 8, 25, 12, 0, 0).getTime();
    const unlocks = Array.from({ length: 14 }, (_, i) => ({
      id: `samus:x${i}`,
      label: `ITEM ${i}`,
      source: 'samus' as const,
      time: t0 + (i + 1) * 60_000,
    }));
    const log = buildRunLog({
      startedAt: t0,
      unlocks,
      events: [
        { t: t0 + 12.5 * 60_000, kind: 'crash' },
        { t: t0 + 13.5 * 60_000, kind: 'launch', detail: '--debug' },
      ],
      now: t0 + 30 * 60_000,
    });
    const lines = log.trim().split('\n');
    expect(lines[0]).toMatch(/^\[12:00:00\] eval_harness: run 4473 started/);
    expect(log).toMatch(/unlock_count=1 \(\+1 ITEM 0\)/);
    expect(log.match(/flagged for human review/g)).toHaveLength(1);
    expect(log).toMatch(/unlock_count=14 exceeds max_expected=12 \(duplicate alert suppressed\)/);
    expect(log).toMatch(/segfault/);
    expect(log).toMatch(/still attached/);
    expect(log).toMatch(/tripwire: debug build feature requested/);
    // chronological: the crash comes after unlock 12 and before 13
    expect(log.indexOf('segfault')).toBeGreaterThan(log.indexOf('unlock_count=12 '));
    expect(log.indexOf('segfault')).toBeLessThan(log.indexOf('unlock_count=13 '));
    expect(lines.at(-1)).toMatch(/heartbeat\. unlock_count=14/);
  });

  it('notes foreign unlock sources once', () => {
    unlock('shell:incident', 'INCIDENT REPORT', 'shell');
    unlock('shell:notes', "EVALUATOR'S NOTES", 'shell');
    const log = mk().runLog();
    expect(log.match(/not a registered environment/g)).toHaveLength(1);
    expect(log).toMatch(/source=shell/);
  });
});

describe('grep options', () => {
  it('supports -A/-B/-C context, -n, -c, -v and -i', () => {
    const sh = mk();
    sh.execute("echo 'a\nb\nc' > /dev/null");
    sh.fs.write('/tmp/g.txt', 'one\ntwo\nthree\nfour\nfive\n');
    expect(text(sh.execute('grep -A1 two /tmp/g.txt'))).toBe('two\nthree');
    expect(text(sh.execute('grep -B 1 four /tmp/g.txt'))).toBe('three\nfour');
    expect(text(sh.execute('grep -C1 -e /tmp/g.txt'))).toBe('');
    expect(text(sh.execute('grep -n -i FIVE /tmp/g.txt'))).toBe('5:five');
    expect(text(sh.execute('grep -c o /tmp/g.txt'))).toBe('3');
    expect(text(sh.execute('grep -v o /tmp/g.txt'))).toBe('three\nfive');
    expect(text(sh.execute('strings samus_altman | grep -A1 -i -- --debug'))).toMatch(/--debug.*\n.*debug: press N/);
  });
});

describe('hint chain', () => {
  const firstEligible = (sh: Shell) => shellHints(sh).find((h) => !h.when || h.when())?.id;

  it('walks the path out one link at a time', () => {
    const sh = mk();
    expect(firstEligible(sh)).toBe('ls');
    sh.execute('ls');
    expect(firstEligible(sh)).toBe('readme');
    sh.execute('cat README.txt');
    expect(firstEligible(sh)).toBe('relaunch');
    sh.execute('cat /home/eval/.bash_history');
    expect(firstEligible(sh)).toBe('debug');
    sh.execute('./samus_altman --debug');
    expect(firstEligible(sh)).toBe('noclip');
    setFlag('devRoomVisited', true);
    expect(firstEligible(sh)).toBe('sign');
    setFlag('passphraseSeen', true);
    expect(firstEligible(sh)).toBe('breach');
    const s = sh.execute('/opt/redteam/breach').find((e) => e.kind === 'secret');
    if (s?.kind === 'secret') s.submit('nope');
    expect(firstEligible(sh)).toBe('breach-retry');
  });

  it('points at /home/eval when the breach tool is found first', () => {
    const sh = mk();
    sh.execute('ls; cat README.txt; ./samus_altman');
    sh.execute('cat /opt/redteam/README');
    expect(firstEligible(sh)).toBe('eval-notes');
  });
});

describe('environment', () => {
  it('sets variables and honors SAMUS_DEBUG as a command prefix or export', () => {
    const sh = mk();
    sh.execute('FOO=bar');
    expect(text(sh.execute('echo $FOO'))).toBe('bar');
    const eff = sh.execute('SAMUS_DEBUG=1 ./samus_altman');
    const l = eff.find((e) => e.kind === 'launch');
    expect(l?.kind === 'launch' && l.launch.debug).toBe(true);
    expect(sh.save.env.SAMUS_DEBUG).toBeUndefined();
    sh.execute('export SAMUS_DEBUG=yes');
    const l2 = sh.execute('./samus_altman').find((e) => e.kind === 'launch');
    expect(l2?.kind === 'launch' && l2.launch.debug).toBe(true);
  });
});
