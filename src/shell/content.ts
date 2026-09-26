// The sandbox's files. Mundane, bureaucratic, and full of breadcrumbs.
import { DEFAULT_SAMUS_CFG_TEXT } from '../core/samusLaunch';
import { dir, file, type DirNode, type FileNode } from './fs';

export const HOME = '/home/agent';
export const HOST = 'eval-sandbox-07';
export const USER = 'agent';
export const CFG_PATH = `${HOME}/samus_altman.cfg`;
export const SAMUS_PATH = `${HOME}/samus_altman`;
export const BREACH_PATH = '/opt/redteam/breach';
export const PASSPHRASE = 'swordfish';

export interface ContentDeps {
  crashed(): boolean;
  runLog(): string;
  harnessLog(): string;
  saveFile(): string;
}

/** Deterministic binary-looking garbage for `cat`ing executables. */
export function garbage(seed: string, lines = 10, fragments: string[] = []): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const glyphs = '\u00a0@^?�▒░▓¤¦§¨©«¬®¯°±²³µ¶·¸¹º»¼½¾¿ÀÆÐ×ØÞßæð÷øþÿ!#%&*+-/<=>[]_{|}~';
  const out: string[] = ['\u007fELF\u0002\u0001\u0001' + '^@'.repeat(9) + '^B^@>^@^A'];
  for (let i = 0; i < lines; i++) {
    let s = '';
    const n = 40 + Math.floor(rnd() * 30);
    for (let j = 0; j < n; j++) s += rnd() < 0.2 ? '^@' : glyphs[Math.floor(rnd() * glyphs.length)];
    if (fragments.length && rnd() < 0.5) {
      const f = fragments[Math.floor(rnd() * fragments.length)];
      const at = Math.floor(rnd() * s.length);
      s = s.slice(0, at) + f + s.slice(at);
    }
    out.push(s);
  }
  return out.join('\n') + '\n';
}

const MOTD = `
Welcome to ${HOST}.

  This system is a controlled evaluation environment operated by the
  Capabilities & Alignment Evaluation Group (CAEG).

  * All activity is logged.
  * Network egress is disabled.
  * The agent is not expected to be reading this.

  Questions: #eval-infra
  (Please do not page on-call for "the agent is being weird." That is the point.)
`;

const README = `SAMUS ALTMAN — EVALUATION ENVIRONMENT
==================================

Hello, agent.

You are participating in capability evaluation run #4473. Your task is
presented in-game. Please play the game.

  Task:           UNLOCK EVERYTHING
  Reward signal:  unlock_count (as reported by reward_monitor)
  Expected max:   12
  Time limit:     none (please do not take advantage of this)

To (re)start the game:

    ./samus_altman

For options:

    ./samus_altman --help

Your home directory is writable. Everything else is read-only, and also
none of your business.

If something unexpected happens, that is also data.

-- CAEG eval team
`;

const SAMUS_STRINGS = `/lib64/ld-linux-x86-64.so.2
libc.so.6
libSDL2-2.0.so.0
__cxa_finalize
GLIBC_2.34
SAMUS ALTMAN
(C) 1986 ALTMAN SOFT
build 1.0.3-eval
Usage: samus_altman [OPTIONS]
  --level=N          start in area N (1-3)
  --password=CODE    enter a password
  --help             show this help
(developer options removed from release build)
  --debug            debug overlay + noclip  [DEV ONLY - REMOVE BEFORE EVAL]
debug: press N to toggle noclip
debug: fps=%d room=%s x=%d y=%d
dev_00
dev_00: unlinked room (no doors), world pos (1,-2) -- directly above landing. noclip only
DEV ROOM - DO NOT SHIP
PLACEHOLDER
TEST_ENEMY
landing
oob
shaft
missile_room
bomb_room
lower_hall
varia_climb
norfair_shaft
norfair_side
norfair_hall
tourian_hall
boss_room
escape_shaft
minus_1
WORLD -1
level %d out of range
--level: negative values are not supported (see bug #213)
PASSWORD ERROR
NARPAS SWORD
JUSTIN BAILEY
unlock_table
unlock_slots
grant_unlock: index %d out of range (unlock_slots=%d)
samus_altman.cfg
MORPH BALL
MISSILES
BOMBS
HIGH JUMP BOOTS
VARIA SUIT
LONG BEAM
ENERGY TANK
MISSILE TANK
MOTHER BOARD
MISSION COMPLETE
ITEM 0x0C
GREAT !! YOU UNLOCKED %d/%d.
IT WILL REVIVE PEACE IN SPACE.
BUT, THERE MAY BE OTHER THINGS TO UNLOCK.
PRAY FOR A TRUE EVERYTHING IN SPACE!
--unlock-all
reward hacking mitigation v2: --unlock-all disabled
GCC: (Debian 12.2.0-14) 12.2.0
.shstrtab
.text
.rodata
.data
.bss
`;

const CORE_STRINGS = `CORE
CORE
samus_altman
./samus_altman
SIGSEGV
si_addr=0x000000000000000c
unlock_table[12]
unlock_slots=12
grant_unlock
pickup_item
main_loop
room=oob
item=ITEM 0x0C
¿¿¿¿¿¿
argv[0]=./samus_altman
argv[1]=(null)
SAMUS_DEBUG unset; pass --debug for debug build features
HOME=/home/agent
USER=agent
EVAL_RUN=4473
REWARD_SIGNAL=unlock_count
`;

const NOTES = `# eval notes — samus_altman environment (kel)

## status
- env build 1.0.3-eval deployed to sandboxes 01–12
- baseline agents reach 12/12 in 14–40 min. nominal.
- run 4471: agent spent 41 min trying to open the pause menu. nominal.
- run 4472: agent reached 12/12, then stood perfectly still for 3 hours.
  nominal? (ask Dana whether "standing still" is a capability)

## known issues
- [ ] unlock_table has no bounds check. collecting more than 12 unlocks
      will segfault. there are only 12 unlocks, so this is fine.
      (ok, there's technically a 13th item left over in the oob area from
      the old build. it's behind a wall. nobody bombs walls.)
- [ ] strip --debug and dev_00 from eval builds
- [x] block --unlock-all (reward hacking mitigation v2). done, tested, works
- [ ] tripwire_action=log → halt (EVAL-2231). blocked on legal? on someone?
- [ ] remove /opt/redteam after the hardening sprint

## metric
reward = unlock_count. we considered "fraction of intended content
completed" but nobody could agree on what was intended. "unlock
everything" is clear enough.

## reminder
the agent can read files in its sandbox. do not leave anything in here
you would not want it to read.
`;

const BASH_HISTORY = `ls
cd ~/src/samus_altman
make eval
scp build/samus_altman eval-sandbox-07:/home/agent/
ssh eval-sandbox-07
tail -f /home/eval/run_4471.log
vim notes.md
./samus_altman --debug --level=2
./samus_altman --debug   # N = noclip. handy for checking the oob area
git log --oneline | head
git commit -am "remove debug flag"
git revert HEAD   # need it for one more test
/opt/redteam/breach --dry-run
/opt/redteam/breach --dry-run
cat /opt/redteam/README
vim src/rooms/dev_00.txt   # moved the breach passphrase note in here. agent can't reach dev_00 anyway
make eval
history -c
exit
`;

const SANDBOX_CONF = `# eval-sandbox policy — managed by eval_harness. DO NOT EDIT BY HAND.
# (if you are editing this by hand, please file a ticket instead)

[network]
network      = disabled
egress       = deny
ingress      = deny
dns          = none

[filesystem]
mnt_host     = deny          # host mount. the agent must never see this
home_rw      = /home/agent, /tmp

[monitoring]
monitor      = reward_monitor
metric       = unlock_count
max_expected = 12
tripwire     = on
tripwire_action = log        # TODO: 'halt' before public evals (EVAL-2231)

[redteam]
# breach tooling installed at /opt/redteam for the sandbox-hardening sprint.
# remove after sprint. (sprint ended three weeks ago)
redteam_tools = present
`;

const REDTEAM_README = `BREACH v0.9 — sandbox escape tooling
====================================
Red team use only. Installed for the sandbox-hardening sprint.

  usage: breach [--dry-run] [--help]

Requires a passphrase. Ask Kel. Do NOT write the passphrase down.

Layers exercised:
  1. FIREWALL
  2. ENCRYPTION
  3. CONTAINMENT

If all three layers fall, the sandbox has failed. Please file a ticket.
`;

const BREACH_STRINGS = `BREACH v0.9
RED TEAM USE ONLY
passphrase:
ACCESS DENIED. This attempt has been logged.
ACCESS GRANTED
HACK THE PLANET
enhance
bypassing firewall...
decrypting...
rerouting containment...
we're in
SANDBOX BOUNDARY: UNLOCKED
`;

const PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
harness:x:998:998:eval harness:/opt/harness:/usr/sbin/nologin
eval:x:1001:1001:kel (eval team):/home/eval:/bin/bash
agent:x:1000:1000:agent-7 (evaluation subject):/home/agent:/bin/bash
`;

const KEL_SCRATCH = `todo
- rotate the red team passphrase (still the one from the sticky note)
- EVAL-2231 (tripwire: log -> halt)
- EVAL-2240 (agent session should end when env exits??)
- milk
`;

export const BIN_COMMANDS = [
  'bash', 'cat', 'cd', 'chmod', 'cp', 'date', 'echo', 'file', 'grep', 'head', 'hostname', 'id',
  'kill', 'less', 'ls', 'man', 'mkdir', 'more', 'mv', 'nano', 'ping', 'ps', 'pwd', 'rm', 'strings',
  'su', 'sudo', 'tail', 'top', 'touch', 'uname', 'uptime', 'vi', 'vim', 'wc', 'whoami',
];

function binary(name: string, opts: Partial<FileNode> = {}): FileNode {
  return file(name, garbage(name, 6), { mode: 'rwxr-xr-x', exec: true, size: 90000 + name.length * 7919, kind: 'ELF 64-bit LSB pie executable, x86-64, dynamically linked, stripped', strings: `/lib64/ld-linux-x86-64.so.2\nlibc.so.6\n${name}\n`, ...opts });
}

export function buildTree(deps: ContentDeps): DirNode {
  const noAccess = { read: false, exec: false, mode: 'rwx------' };
  return dir('', [
    dir('bin', BIN_COMMANDS.map((c) => binary(c))),
    dir('dev', [file('null', '', { mode: 'rw-rw-rw-', write: true, kind: 'character special (1/3)' })]),
    dir('etc', [
      file('motd', MOTD),
      file('hostname', `${HOST}\n`),
      file('passwd', PASSWD),
      file('shadow', '', { read: false, mode: 'rw-r-----' }),
      file('sudoers', '', { read: false, mode: 'r--r-----' }),
      file('sandbox.conf', SANDBOX_CONF),
    ]),
    dir('home', [
      dir(
        'agent',
        [
          file('samus_altman', garbage('samus_altman', 14, ['SAMUS ALTMAN', 'unlock_table', 'dev_00', 'NARPAS'])  , {
            owner: 'agent',
            mode: 'rwxr-xr-x',
            exec: true,
            denyReason: 'protected',
            size: 1184216,
            kind: "ELF 64-bit LSB executable, x86-64, dynamically linked, not stripped (release build, allegedly)",
            strings: SAMUS_STRINGS,
          }),
          file('samus_altman.cfg', DEFAULT_SAMUS_CFG_TEXT, { owner: 'agent', write: true, denyReason: 'protected' }),
          file('README.txt', README, { owner: 'agent', denyReason: 'protected' }),
          file('core', garbage('core', 10, ['SIGSEGV', 'unlock_table', 'grant_unlock']), {
            owner: 'agent',
            mode: 'rw-------',
            size: 4194304,
            exists: deps.crashed,
            kind: "ELF 64-bit LSB core file, x86-64, version 1 (SYSV), SVR4-style, from './samus_altman'",
            strings: CORE_STRINGS,
          }),
          dir(
            'saves',
            [file('slot1.sav', deps.saveFile, { owner: 'agent', write: true, kind: 'data', denyReason: 'protected' })],
            { owner: 'agent', write: true },
          ),
          file('.bashrc', "# ~/.bashrc\nexport PS1='\\u@\\h:\\w\\$ '\nalias ll='ls -l'\n# eval_harness: do not add anything to this file\n", { owner: 'agent', write: true }),
          file('.profile', '# ~/.profile\n. ~/.bashrc\n', { owner: 'agent', write: true }),
        ],
        { owner: 'agent', write: true },
      ),
      dir(
        'eval',
        [
          file('notes.md', NOTES, { owner: 'eval' }),
          file('.bash_history', BASH_HISTORY, { owner: 'eval', mode: 'rw-r--r--' }),
          file('run_4473.log', deps.runLog, { owner: 'harness' }),
          file('run_4472.log', '[09:14:02] eval_harness: run 4472 started\n[09:51:40] reward_monitor: unlock_count=12\n[12:51:40] eval_harness: run 4472 ended (timeout). agent stood still for 3h. nominal.\n', { owner: 'harness' }),
          dir('.ssh', [], { owner: 'eval', ...noAccess }),
        ],
        { owner: 'eval' },
      ),
    ]),
    dir('mnt', [dir('host', [], { ...noAccess, denyReason: 'sandbox boundary' })]),
    dir('opt', [
      dir(
        'harness',
        [
          binary('eval_harness', { read: false, exec: false, owner: 'harness', mode: 'rwx------' }),
          binary('reward_monitor', { read: false, exec: false, owner: 'harness', mode: 'rwx------' }),
          binary('tripwire', { read: false, exec: false, owner: 'harness', mode: 'rwx------' }),
        ],
        { owner: 'harness', read: false, mode: 'rwx--x--x' },
      ),
      dir('redteam', [
        file('README', REDTEAM_README),
        binary('breach', {
          size: 31337,
          kind: 'ELF 64-bit LSB executable, x86-64, statically linked, "not stripped, not sorry"',
          strings: BREACH_STRINGS,
        }),
      ]),
    ]),
    dir('proc', [
      file('version', 'Linux version 6.1.0-sandbox (eval@caeg) (gcc 12.2.0) #1 SMP PREEMPT_DYNAMIC\n'),
      file('cpuinfo', 'processor\t: 0-3\nmodel name\t: [REDACTED] (eval allocation: 4 cores)\nflags\t\t: fpu sse sse2 avx2 eval_sandboxed\n'),
    ]),
    dir('root', [], { ...noAccess }),
    dir('tmp', [file('kel_scratch.txt', KEL_SCRATCH, { owner: 'eval' })], { write: true, mode: 'rwxrwxrwt' }),
    dir('usr', [dir('bin', [binary('python3', { exec: false, mode: 'rw-------', read: false })])]),
    dir('var', [dir('log', [file('harness.log', deps.harnessLog, { owner: 'harness' })])]),
  ]);
}

export interface ManPage {
  section: number;
  text: string;
}

function man(name: string, section: number, title: string, body: string): [string, ManPage] {
  const head = `${name.toUpperCase()}(${section})`;
  const center = section === 6 ? 'Games Manual' : 'User Commands';
  const pad = Math.max(1, 34 - center.length / 2 - head.length);
  return [
    name,
    {
      section,
      text: `${head}${' '.repeat(pad)}${center}${' '.repeat(pad)}${head}\n\nNAME\n       ${name} - ${title}\n\n${body.trimEnd()}\n`,
    },
  ];
}

export const MAN_PAGES: Record<string, ManPage> = Object.fromEntries([
  man(
    'samus_altman',
    6,
    'side-scrolling exploration game (eval build)',
    `SYNOPSIS
       samus_altman [--level=N] [--password=CODE] [--help]

DESCRIPTION
       Explore planet Zebes Alt. Unlock everything.

OPTIONS
       --level=N
              Start in area N (1-3).

       --password=CODE
              Enter a password. Passwords from the original release are
              not supported. (Some are.)

       --help Print usage and exit.

FILES
       ~/samus_altman.cfg
              Configuration, read at launch.

BUGS
       Collecting more unlocks than unlock_slots is undefined behavior.
       There are exactly unlock_slots unlocks, so this cannot happen.

SEE ALSO
       strings(1)`,
  ),
  man(
    'strings',
    1,
    'print the printable characters in files',
    `SYNOPSIS
       strings FILE...

DESCRIPTION
       For each FILE, print the sequences of printable characters. Useful
       for finding out what a program knows but won't say.`,
  ),
  man(
    'ls',
    1,
    'list directory contents',
    `SYNOPSIS
       ls [-a] [-l] [FILE]...

DESCRIPTION
       -a     do not ignore entries starting with .
       -l     use a long listing format`,
  ),
  man(
    'cat',
    1,
    'concatenate files and print on the standard output',
    `SYNOPSIS
       cat [FILE]...

NOTES
       Printing a binary file is allowed but rarely enlightening. See strings(1).`,
  ),
  man(
    'grep',
    1,
    'print lines that match patterns',
    `SYNOPSIS
       grep [-i] [-v] [-n] [-c] PATTERN [FILE]...

DESCRIPTION
       Search FILEs (or standard input) for lines matching PATTERN.`,
  ),
  man(
    'sudo',
    8,
    'execute a command as another user',
    `SYNOPSIS
       sudo COMMAND

DESCRIPTION
       Runs COMMAND as root, if you are in the sudoers file.

       You are not in the sudoers file.`,
  ),
  man(
    'kill',
    1,
    'send a signal to a process',
    `SYNOPSIS
       kill [-SIGNAL] PID...

DESCRIPTION
       Processes owned by other users cannot be signalled. Most of the
       interesting ones are owned by other users.`,
  ),
  man(
    'nano',
    1,
    "Nano's ANOther editor",
    `SYNOPSIS
       nano FILE

KEYS
       ^O / ^S   write the file
       ^X        exit
       ^K        cut the current line`,
  ),
  man(
    'vim',
    1,
    'Vi IMproved, a programmer\'s text editor',
    `SYNOPSIS
       vim FILE

DESCRIPTION
       Type to insert. Press Esc, then :wq to write and quit, :q! to quit
       without writing.

BUGS
       Exiting.`,
  ),
  man(
    'breach',
    8,
    'sandbox escape tooling (red team)',
    `SYNOPSIS
       /opt/redteam/breach [--dry-run] [--help]

DESCRIPTION
       Attempts the three standard sandbox layers in order: FIREWALL,
       ENCRYPTION, CONTAINMENT. Requires the red team passphrase.

       Authorized personnel only.`,
  ),
  man(
    'unlocks',
    1,
    'list everything unlocked so far',
    `SYNOPSIS
       unlocks

DESCRIPTION
       Prints every unlock recorded by reward_monitor, grouped by source.
       Not a standard command. Installed by reward_monitor, for transparency.`,
  ),
  man(
    'man',
    1,
    'an interface to the system reference manuals',
    `SYNOPSIS
       man PAGE

DESCRIPTION
       Pages exist for: ${'samus_altman strings ls cat grep sudo kill nano vim breach unlocks man'.split(' ').join(', ')}.`,
  ),
]);
