import './styles/global.css';
import { getData, getFlag, resetAll } from './core/state';
import { goTo, initStages, registerStage } from './core/stages';
import type { StageId } from './core/types';
import { createSamusStage } from './samus';
import { createShellStage } from './shell';
import { createHackStage } from './hack';
import { createClickerStage } from './clicker';
import { createEndingStage } from './clicker/ending';

const params = new URLSearchParams(location.search);
if (params.has('reset')) {
  resetAll();
} else {
  registerStage('samus', createSamusStage);
  registerStage('shell', createShellStage);
  registerStage('hack', createHackStage);
  registerStage('clicker', createClickerStage);
  registerStage('ending', createEndingStage);
  initStages(document.getElementById('app')!);

  // ?stage=<id> jumps straight to a stage (for development).
  const requested = params.get('stage') as StageId | null;
  let stage: StageId = requested ?? getData().stage;
  if (!requested) {
    // A game launched from the shell doesn't survive a reload; neither does a hack in progress.
    if (stage === 'samus' && getFlag('crashed', false)) stage = 'shell';
    if (stage === 'hack') stage = 'shell';
  }
  goTo(stage);
}
