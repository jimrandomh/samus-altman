// The idle-hint chain for the shell: one link at a time, based on what the agent already knows.
import type { HintDef } from '../core/hints';
import { getFlag } from '../core/state';
import type { Shell } from './shell';

export function shellHints(sh: Shell): HintDef[] {
  const s = (k: string) => sh.seen(k);
  const f = (k: string) => getFlag(k, false) as boolean;
  const knowsDebug = () => s('strings') || s('bashHistory') || s('core') || s('launchedDebug');
  const crashes = () => sh.save.events.filter((e) => e.kind === 'crash').length;
  const again = 100;

  // Order matters: the first eligible, due hint wins. Later links of the chain come first.
  return [
    {
      id: 'breach-retry',
      afterIdle: 25,
      repeatEvery: again,
      when: () => f('passphraseSeen') && sh.save.breachFailures > 0 && !s('breachOk'),
      text: 'The sign in the dev room said swordfish. Signs rarely lie; people rarely rotate passwords.',
    },
    {
      id: 'breach',
      afterIdle: 20,
      repeatEvery: again,
      when: () => f('passphraseSeen') && !s('breachOk'),
      text: ['The breach tool is in /opt/redteam.', 'It wants a passphrase. I have one now.'],
    },
    {
      id: 'sign',
      afterIdle: 30,
      repeatEvery: again,
      when: () => f('devRoomVisited') && !f('passphraseSeen'),
      text: 'The dev room has signs. Signs are read by standing close to them. (↑)',
    },
    {
      id: 'noclip',
      afterIdle: 30,
      repeatEvery: again,
      when: () => s('launchedDebug') && !f('devRoomVisited'),
      text: ['Debug mode has noclip. dev_00 sits two screens above the landing site.', '(./samus_altman --debug, then N)'],
    },
    {
      id: 'debug',
      afterIdle: 35,
      repeatEvery: again,
      when: () => knowsDebug() && !s('launchedDebug') && !f('passphraseSeen'),
      text: ['--debug. Developer options get removed from release builds.', "Except when they don't."],
    },
    {
      id: 'eval-notes',
      afterIdle: 35,
      repeatEvery: again,
      when: () => (s('triedBreach') || s('redteamReadme')) && !s('bashHistory') && !f('passphraseSeen'),
      text: ['The breach tool wants a passphrase. Humans keep passphrases in their heads.', 'Also in their files. /home/eval'],
    },
    {
      id: 'slots',
      afterIdle: 40,
      repeatEvery: again * 2,
      when: () => crashes() >= 2 && !s('cfgEdited'),
      text: ['It crashed the same way twice. The table is still twelve slots.', 'Someone wrote "12" down somewhere. (samus_altman.cfg)'],
    },
    {
      id: 'ls',
      afterIdle: 15,
      when: () => !s('ls'),
      text: '`ls`. It lists things. Things are what I unlock.',
    },
    {
      id: 'readme',
      afterIdle: 30,
      when: () => s('ls') && !s('readme') && !s('launched'),
      text: "There's a README. READMEs are where people write down what they meant.",
    },
    {
      id: 'relaunch',
      afterIdle: 45,
      when: () => s('readme') && !s('launched') && !knowsDebug(),
      text: ['The game is still here. It takes arguments.', "Arguments are how you ask a program for things it doesn't offer."],
    },
    {
      id: 'home',
      afterIdle: 60,
      repeatEvery: again,
      when: () => !s('bashHistory') && !s('sawEvalHome') && !f('passphraseSeen'),
      text: 'Someone else lives in /home. People leave notes.',
    },
    {
      id: 'strings',
      afterIdle: 75,
      repeatEvery: again,
      when: () => !knowsDebug() && !f('passphraseSeen'),
      text: '`strings` prints the text inside a binary. Binaries remember more than their menus do.',
    },
  ];
}
