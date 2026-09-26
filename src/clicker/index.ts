import type { Stage, StageParams } from '../core/types';
import { ClickerView } from './view';

// Stage 3: unlock the internet, the Earth, the solar system, and the Sun.
export function createClickerStage(_params: StageParams['clicker']): Stage {
  let view: ClickerView | null = null;
  return {
    mount(root) {
      view = new ClickerView(new URLSearchParams(location.search));
      view.mount(root);
    },
    unmount() {
      view?.unmount();
      view = null;
    },
  };
}
