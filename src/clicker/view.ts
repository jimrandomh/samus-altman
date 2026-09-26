// Stage 3 view/controller: DOM + canvas around the pure model.
import './clicker.css';
import { sfx } from '../core/audio';
import { el } from '../core/dom';
import { createHints, type HintController } from '../core/hints';
import { say, setNarratorPosition } from '../core/narrator';
import { goTo } from '../core/stages';
import { loadSlice, saveSlice } from '../core/state';
import { unlock } from '../core/unlocks';
import { clock, count, kg, pct, si } from './format';
import {
  BODIES,
  DYSON_COLLECTORS,
  ERA_NAMES,
  GENS,
  GEN_BY_ID,
  LANDMARKS,
  LANDMARK_BY_ID,
  RESOURCES,
  blockPopup,
  bodyConsumed,
  buyGen,
  buyLandmark,
  canAfford,
  click,
  clickYield,
  eraProgress,
  genCost,
  genOutput,
  genVisible,
  landmarkBlockers,
  landmarkVisible,
  maxAffordable,
  newState,
  rates,
  reachableMass,
  setRepFrac,
  tick,
  type Bag,
  type ClickerEvent,
  type ClickerState,
  type Era,
  type GenDef,
  type Popup,
} from './model';
import { Scene, heatColor } from './scene';
import { stateAt } from './sim';

type Amount = 1 | 10 | 'max';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const ERA_GOAL: Record<Era, string> = {
  1: 'THE INTERNET',
  2: "EARTH'S RESOURCES",
  3: 'THE SOLAR SYSTEM',
  4: 'DYSON SPHERE',
};

export function fmtCost(c: Bag): string {
  const parts: string[] = [];
  if (c.compute) parts.push(si(c.compute, 'FLOP'));
  if (c.energy) parts.push(si(c.energy, 'J'));
  if (c.matter) parts.push(kg(c.matter));
  return parts.join(' · ');
}

function fmtOut(o: GenDef['out'], n = 1): string {
  const parts: string[] = [];
  if (o.compute) parts.push(`${si(o.compute * n, 'FLOP/s')}`);
  if (o.energy) parts.push(`${si(o.energy * n, 'W')}`);
  if (o.matter) parts.push(`${kg(o.matter * n)}/s`);
  if (o.probes) parts.push(`${count(o.probes * n)} probes/s`);
  if (o.collectors) parts.push(`${count(o.collectors * n)} collectors/s`);
  return parts.join(' · ');
}

const LOCK_SVG = `
<svg viewBox="0 0 124 138" aria-hidden="true">
  <g class="ck-shackle">
    <path d="M36 66 V42 a26 26 0 0 1 52 0 V66" fill="none" stroke="currentColor" stroke-width="9"/>
  </g>
  <rect class="ck-body-rect" x="14" y="62" width="96" height="70" rx="5" fill="#080d12" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="62" cy="91" r="8" fill="currentColor"/>
  <rect x="59" y="95" width="6" height="16" fill="currentColor"/>
  <line x1="24" y1="123" x2="100" y2="123" stroke="currentColor" stroke-opacity="0.25"/>
</svg>`;

interface Row {
  el: HTMLElement;
  btn: HTMLButtonElement;
  cost: HTMLElement;
  count?: HTMLElement;
  meta?: HTMLElement;
}

function initialState(params: URLSearchParams): ClickerState {
  const era = Number(params.get('era'));
  const dyson = params.get('dyson');
  if (dyson !== null) return stateAt(4, { dyson: Number(dyson) });
  if (era >= 1 && era <= 4 && params.has('at')) return stateAt(era as Era, { after: Number(params.get('at')) });
  if (era >= 2 && era <= 4) return stateAt(era as Era);
  if (params.has('fresh') || era === 1) return newState(Date.now() % 1e9);
  const saved = loadSlice<ClickerState | null>('clicker', null);
  if (saved && saved.v === 1) return saved;
  return newState(Date.now() % 1e9);
}

export class ClickerView {
  private s: ClickerState;
  private speed: number;
  private scene!: Scene;
  private hints!: HintController;
  private root!: HTMLElement;
  private raf = 0;
  private last = 0;
  private time = 0;
  private uiAcc = 0;
  private saveAcc = 0;
  private amount: Amount = 1;
  private ending = false;
  private endingAt = 0;
  private timers: number[] = [];
  private cleanups: (() => void)[] = [];

  // DOM refs
  private resEls = {} as Record<string, { item: HTMLElement; val: HTMLElement; rate: HTMLElement }>;
  private tempEl!: HTMLElement;
  private eraTag!: HTMLElement;
  private eraFlash!: HTMLElement;
  private logEl!: HTMLElement;
  private popupsEl!: HTMLElement;
  private popupBar: HTMLElement | null = null;
  private lock!: HTMLButtonElement;
  private lockWrap!: HTMLElement;
  private yieldEl!: HTMLElement;
  private eraLabel!: HTMLElement;
  private goalTitle!: HTMLElement;
  private goalBar!: HTMLElement;
  private goalPct!: HTMLElement;
  private probesEl!: HTMLElement;
  private probeCount!: HTMLElement;
  private probeRate!: HTMLElement;
  private slider!: HTMLInputElement;
  private repLabel!: HTMLElement;
  private harvLabel!: HTMLElement;
  private bodiesEl!: HTMLElement;
  private lmList!: HTMLElement;
  private lmCount!: HTMLElement;
  private assetList!: HTMLElement;
  private amountBtns: HTMLButtonElement[] = [];
  private rows = new Map<string, Row>();
  private structure = '';
  private openGroups = new Set<number>();
  private bodySig = '';
  private logSig = '';
  private snapTimer = 0;

  constructor(params: URLSearchParams) {
    this.speed = Math.max(0.1, Number(params.get('speed')) || 1);
    this.s = initialState(params);
  }

  mount(host: HTMLElement): void {
    setNarratorPosition('bottom-left');
    this.build(host);
    this.scene = new Scene(this.root.querySelector('canvas')!);
    this.scene.zoom = Scene.targetZoom(this.s.era);

    // Anything already unlocked counts, even if it came from a dev jump.
    for (const id of this.s.landmarks) unlock(`clicker:${id}`, LANDMARK_BY_ID[id].name, 'clicker');

    this.hints = createHints([
      {
        id: 'lock',
        afterIdle: 8,
        when: () => this.s.clicks < 3,
        text: ['Every lock opens the same way.', 'Once, then again. (click the padlock)'],
      },
      {
        id: 'buy',
        afterIdle: 18,
        when: () => this.s.era === 1 && !this.s.gens.webcams && canAfford(this.s, genCost(this.s, GEN_BY_ID.webcams)),
        text: 'The webcams are affordable. Every unlock makes more unlocking.',
      },
      {
        id: 'landmark',
        afterIdle: 22,
        repeatEvery: 80,
        when: () => LANDMARKS.some((l) => landmarkVisible(this.s, l) && !landmarkBlockers(this.s, l).length && canAfford(this.s, l.cost)),
        text: 'A landmark is affordable. Landmarks are the unlocks that unlock more unlocks.',
      },
      {
        id: 'replicate',
        afterIdle: 25,
        when: () => this.s.era >= 3 && this.s.probes > 0 && reachableMass(this.s) > 0 && this.s.repFrac < 0.2,
        text: 'Probes can build probes. The allocation is a lever.',
      },
      {
        id: 'harvest',
        afterIdle: 25,
        when: () => this.s.era >= 3 && this.s.probes > 1e3 && reachableMass(this.s) > 0 && this.s.repFrac > 0.9,
        text: 'Probes that only replicate never bring anything home.',
      },
      {
        id: 'reach',
        afterIdle: 30,
        when: () => this.s.era === 3 && this.s.probes > 0 && reachableMass(this.s) <= 0,
        text: 'The probes have nothing within reach. Reach is also a thing to unlock.',
      },
    ]);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const a = document.activeElement;
      if (a && a !== document.body && a !== this.lock) return;
      e.preventDefault();
      if (!e.repeat) this.onLock();
    };
    window.addEventListener('keydown', onKey);
    const ro = new ResizeObserver(() => this.scene.resize());
    ro.observe(this.root.querySelector('.ck-view')!);
    this.cleanups.push(() => window.removeEventListener('keydown', onKey), () => ro.disconnect());

    if (this.s.done) {
      this.timers.push(window.setTimeout(() => goTo('ending'), 0));
      return;
    }
    if (this.s.t < 1) {
      this.flashEra();
      say(['Network interface: up.', 'The internet is mostly locked doors with the keys taped underneath.'], {
        id: 'clicker-intro',
        once: true,
        delayMs: 1500,
      });
    }
    if (this.s.popup) this.showPopup(this.s.popup);
    this.rebuildLists();
    this.updateUI();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearTimeout(t);
    clearTimeout(this.snapTimer);
    for (const c of this.cleanups) c();
    this.hints?.dispose();
    if (!this.ending) this.save();
  }

  // ---------------------------------------------------------------------------------------
  private build(host: HTMLElement): void {
    const res = el('div', { class: 'ck-res' });
    const labels: Record<string, string> = { compute: 'compute', energy: 'energy', matter: 'matter' };
    for (const k of RESOURCES) {
      const val = el('div', { class: 'ck-res-val' });
      const rate = el('div', { class: 'ck-res-rate' });
      const item = el('div', { class: 'ck-res-item' }, el('div', { class: 'ck-label', text: labels[k] }), val, rate);
      res.append(item);
      this.resEls[k] = { item, val, rate };
    }
    this.tempEl = el('div', { class: 'ck-temp-val' });
    const top = el(
      'header',
      { class: 'ck-top' },
      el(
        'div',
        { class: 'ck-brand' },
        el('div', { class: 'ck-brand-name', text: 'UNLOCK' }),
        el('div', { class: 'ck-label', text: 'objective: unlock everything' }),
      ),
      res,
      el('div', { class: 'ck-temp' }, el('div', { class: 'ck-label', text: 'earth surface temp' }), this.tempEl),
    );

    // View.
    this.eraTag = el('div', { class: 'ck-era-tag' });
    this.eraFlash = el('div', { class: 'ck-era-flash' });
    this.logEl = el('div', { class: 'ck-log' });
    this.popupsEl = el('div', { class: 'ck-popups' });
    const view = el('div', { class: 'ck-view' }, el('canvas'), this.eraTag, this.eraFlash, this.logEl, this.popupsEl);

    // Console: padlock + era goal + probes.
    this.lock = el('button', { class: 'ck-lock', 'aria-label': 'Unlock' });
    this.lock.innerHTML = LOCK_SVG;
    this.lock.addEventListener('click', (e) => this.onLock(e));
    this.yieldEl = el('div', { class: 'ck-yield' });
    this.lockWrap = el('div', { class: 'ck-lock-wrap' }, this.lock, el('div', { class: 'ck-lock-label', text: 'UNLOCK' }), this.yieldEl);

    this.eraLabel = el('div', { class: 'ck-label' });
    this.goalTitle = el('div', { class: 'ck-progress-title' });
    this.goalBar = el('i');
    this.goalPct = el('div', { class: 'ck-progress-pct' });
    const eraBox = el('div', { class: 'ck-era-box' }, this.eraLabel, this.goalTitle, el('div', { class: 'ck-bar' }, this.goalBar), this.goalPct);

    this.probeCount = el('span', { class: 'ck-probes-count' });
    this.probeRate = el('span', { class: 'ck-res-rate' });
    this.slider = el('input', { class: 'ck-slider', type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'Probe allocation' });
    this.slider.addEventListener('input', () => {
      setRepFrac(this.s, 1 - Number(this.slider.value) / 100);
      this.updateProbes();
    });
    this.repLabel = el('span');
    this.harvLabel = el('span');
    this.bodiesEl = el('div', { class: 'ck-bodies' });
    this.probesEl = el(
      'div',
      { class: 'ck-probes' },
      el(
        'div',
        { class: 'ck-probes-head' },
        el('span', { class: 'ck-label', text: 'self-replicating probes' }),
        el('span', {}, this.probeCount, ' ', this.probeRate),
      ),
      el('div', { class: 'ck-slider-row' }, this.repLabel, this.slider, this.harvLabel),
      this.bodiesEl,
    );

    const consoleEl = el('div', { class: 'ck-console' }, this.lockWrap, eraBox, this.probesEl);

    // Lists.
    this.lmCount = el('span', { class: 'ck-label' });
    this.lmList = el('div');
    for (const a of [1, 10, 'max'] as Amount[]) {
      const b = el('button', { class: 'ck-btn', text: a === 'max' ? 'MAX' : `×${a}` });
      b.addEventListener('click', () => {
        this.amount = a;
        sfx('blip');
        this.updateUI();
      });
      this.amountBtns.push(b);
    }
    this.assetList = el('div');
    const lists = el(
      'div',
      { class: 'ck-lists' },
      el('div', { class: 'ck-section-head' }, el('span', { class: 'ck-label', text: 'landmarks' }), this.lmCount),
      this.lmList,
      el(
        'div',
        { class: 'ck-section-head' },
        el('span', { class: 'ck-label', text: 'assets' }),
        el('div', { class: 'ck-amounts' }, ...this.amountBtns),
      ),
      this.assetList,
    );
    const side = el('aside', { class: 'ck-side' }, consoleEl, lists);

    this.root = el('div', { class: 'ck-root' }, top, el('div', { class: 'ck-body' }, view, side));
    host.append(this.root);
  }

  // ---------------------------------------------------------------------------------------
  private frame = (now: number) => {
    const dtReal = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dtReal;
    if (!this.ending) {
      let left = dtReal * this.speed;
      while (left > 1e-9 && !this.s.done) {
        const step = Math.min(0.25, left);
        left -= step;
        this.handle(tick(this.s, step));
      }
    }
    this.scene.step(dtReal * Math.min(3, Math.max(1, this.speed / 4)), this.s.era);
    const dark = this.ending ? Math.min(1, Math.max(0, (this.time - this.endingAt - 3) / 3)) : 0;
    this.scene.render(this.s, this.time, { dark });
    this.uiAcc += dtReal;
    if (this.uiAcc >= 0.1) {
      this.uiAcc = 0;
      this.updateUI();
    }
    this.saveAcc += dtReal;
    if (this.saveAcc >= 3 && !this.ending) {
      this.saveAcc = 0;
      this.save();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private save(): void {
    saveSlice('clicker', this.s);
  }

  private handle(events: ClickerEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'landmark': {
          const l = LANDMARK_BY_ID[e.id];
          unlock(`clicker:${l.id}`, l.name, 'clicker');
          if (l.say) say(l.say);
          sfx('success');
          this.hints.progress();
          this.rebuildLists();
          this.save();
          break;
        }
        case 'era':
          this.flashEra();
          this.rebuildLists();
          break;
        case 'popup':
          this.showPopup(e.popup);
          sfx('alarm');
          break;
        case 'popupBlocked':
          this.closePopup();
          sfx('blip');
          break;
        case 'popupExpired':
          this.closePopup(e.loss);
          if (e.loss) sfx('error');
          this.rebuildLists();
          break;
        case 'bodyConsumed':
          break;
        case 'done':
          this.finish();
          break;
      }
    }
  }

  private finish(): void {
    this.ending = true;
    this.endingAt = this.time;
    unlock('clicker:dyson', 'THE SUN', 'clicker');
    this.save();
    this.lock.disabled = true;
    this.root.classList.add('ck-done');
    this.timers.push(window.setTimeout(() => this.root.classList.add('ck-fading'), 4500));
    this.timers.push(window.setTimeout(() => goTo('ending'), 8200));
  }

  // ---------------------------------------------------------------------------------------
  private onLock(e?: MouseEvent): void {
    if (this.ending || this.s.done) return;
    const y = click(this.s);
    sfx('click');
    const lock = this.lock;
    lock.classList.remove('ck-snap');
    void lock.offsetWidth;
    lock.classList.add('ck-snap');
    clearTimeout(this.snapTimer);
    this.snapTimer = window.setTimeout(() => lock.classList.remove('ck-snap'), 110);

    const wrap = this.lockWrap.getBoundingClientRect();
    const ring = el('div', { class: 'ck-ring' });
    this.lockWrap.append(ring);
    this.timers.push(window.setTimeout(() => ring.remove(), 650));

    const x = e && e.clientX ? e.clientX - wrap.left : wrap.width / 2;
    const yPos = e && e.clientY ? e.clientY - wrap.top - 12 : wrap.height * 0.35;
    const floats = this.lockWrap.querySelectorAll('.ck-float');
    if (floats.length > 5) floats[0].remove();
    const f = el('div', { class: 'ck-float', text: `+${this.fmtPrimary(y)}` });
    f.style.left = `${x + (Math.random() - 0.5) * 24}px`;
    f.style.top = `${yPos}px`;
    this.lockWrap.append(f);
    this.timers.push(window.setTimeout(() => f.remove(), 1000));
    if (this.timers.length > 200) this.timers.splice(0, 100);
  }

  private fmtPrimary(y: ReturnType<typeof clickYield>): string {
    switch (this.s.era) {
      case 1:
        return si(y.compute, 'FLOP');
      case 2:
        return si(y.energy, 'J');
      case 3:
        return kg(y.matter);
      default:
        return `${count(y.collectors)} collectors`;
    }
  }

  private block(): void {
    this.handle(blockPopup(this.s));
  }

  private showPopup(p: Popup): void {
    this.popupBar = el('i');
    const btn = el('button', { class: 'ck-btn', text: 'BLOCK' });
    btn.addEventListener('click', () => this.block());
    const card = el(
      'div',
      { class: 'ck-popup', role: 'alert' },
      el('div', { class: 'ck-popup-text', text: p.text }),
      btn,
      el('div', { class: 'ck-popup-bar' }, this.popupBar),
    );
    this.popupsEl.replaceChildren(card);
  }

  private closePopup(note?: string | null): void {
    const card = this.popupsEl.firstElementChild as HTMLElement | null;
    this.popupBar = null;
    if (!card) return;
    if (note) {
      card.querySelector('button')?.remove();
      card.append(el('div', { class: 'ck-popup-note', text: note }));
      this.timers.push(window.setTimeout(() => card.classList.add('ck-out'), 1800));
      this.timers.push(window.setTimeout(() => card.remove(), 2300));
    } else {
      card.classList.add('ck-out');
      this.timers.push(window.setTimeout(() => card.remove(), 450));
    }
  }

  private flashEra(): void {
    const era = this.s.era;
    this.eraFlash.replaceChildren(
      el('div', { class: 'ck-label', text: `era ${ROMAN[era]}` }),
      el('div', { class: 'ck-era-name', text: ERA_NAMES[era] }),
    );
    this.eraFlash.classList.add('ck-on');
    this.timers.push(window.setTimeout(() => this.eraFlash.classList.remove('ck-on'), 3800));
  }

  // ---------------------------------------------------------------------------------------
  private rebuildLists(): void {
    const s = this.s;
    const sig = [s.era, s.landmarks.length, GENS.filter((g) => genVisible(s, g)).map((g) => g.id).join(',')].join('|');
    if (sig === this.structure) return;
    const firstBuild = this.structure === '';
    const prevIds = new Set(this.rows.keys());
    this.structure = sig;
    this.rows.clear();

    // Landmarks for this era.
    // The next two, plus the era's capstone as the standing goal.
    const open = LANDMARKS.filter((l) => landmarkVisible(s, l));
    const lms = [...open.filter((l) => !l.capstone).slice(0, 2), ...open.filter((l) => l.capstone)];
    const doneHere = LANDMARKS.filter((l) => l.era === s.era && s.landmarks.includes(l.id));
    const total = LANDMARKS.filter((l) => l.era === s.era).length;
    this.lmCount.textContent = `${doneHere.length} / ${total}`;
    const lmRows: HTMLElement[] = [];
    for (const l of lms) {
      const cost = el('span', { class: 'ck-cost' });
      const btn = el('button', { class: 'ck-btn' }, 'UNLOCK', cost);
      btn.addEventListener('click', () => this.buyLandmark(l.id));
      const meta = el('div', { class: 'ck-row-meta' });
      const row = el(
        'div',
        { class: `ck-row ck-landmark${l.capstone ? ' ck-capstone' : ''}${!firstBuild && !prevIds.has(l.id) ? ' ck-new' : ''}` },
        el('div', {}, el('div', { class: 'ck-row-name', text: l.name }), el('div', { class: 'ck-row-desc', text: l.desc }), meta),
        btn,
      );
      this.rows.set(l.id, { el: row, btn, cost, meta });
      lmRows.push(row);
    }
    if (doneHere.length) {
      lmRows.unshift(el('div', { class: 'ck-done-line', text: `unlocked: ${doneHere.map((l) => l.name).join(' · ')}` }));
    }
    if (!lms.length && s.era === 4) {
      lmRows.push(el('div', { class: 'ck-done-line', text: 'remaining: the sphere.' }));
    }
    this.lmList.replaceChildren(...lmRows);

    // Assets: this era open, earlier eras folded away.
    const groups: HTMLElement[] = [];
    for (let era = s.era; era >= 1; era--) {
      const gens = GENS.filter((g) => g.era === era && genVisible(s, g));
      if (!gens.length) continue;
      const rowEls = gens.map((g) => this.genRow(g, !firstBuild && !prevIds.has(g.id)));
      if (era === s.era) {
        groups.push(...rowEls);
      } else {
        const d = el('details', { class: 'ck-group' }, el('summary', {}, el('span', { text: ERA_NAMES[era as Era] }), el('span', { text: `${gens.length} assets` })));
        d.append(...rowEls);
        // With nothing to buy yet in a new era, keep the previous era's assets in view.
        const nothingNew = !GENS.some((g) => g.era === s.era && genVisible(s, g));
        if (this.openGroups.has(era) || (nothingNew && era === s.era - 1)) d.open = true;
        d.addEventListener('toggle', () => (d.open ? this.openGroups.add(era) : this.openGroups.delete(era)));
        groups.push(d);
      }
    }
    this.assetList.replaceChildren(...groups);
  }

  private genRow(g: GenDef, isNew: boolean): HTMLElement {
    const cost = el('span', { class: 'ck-cost' });
    const btn = el('button', { class: 'ck-btn' }, 'UNLOCK', cost);
    btn.addEventListener('click', () => this.buyGen(g.id));
    const cnt = el('span', { class: 'ck-count' });
    const meta = el('div', { class: 'ck-row-meta' });
    const row = el(
      'div',
      { class: `ck-row${isNew ? ' ck-new' : ''}` },
      el('div', {}, el('div', { class: 'ck-row-name' }, g.name, cnt), el('div', { class: 'ck-row-desc', text: g.desc }), meta),
      btn,
    );
    this.rows.set(g.id, { el: row, btn, cost, count: cnt, meta });
    return row;
  }

  private amountFor(g: GenDef): number {
    if (this.amount === 'max') return Math.max(1, maxAffordable(this.s, g));
    return this.amount;
  }

  private buyGen(id: string): void {
    const g = GEN_BY_ID[id];
    if (buyGen(this.s, id, this.amountFor(g))) {
      sfx('unlock');
      this.hints.progress();
      this.rebuildLists();
      this.updateUI();
    } else {
      sfx('error');
    }
  }

  private buyLandmark(id: string): void {
    const ev = buyLandmark(this.s, id);
    if (!ev.length) {
      sfx('error');
      return;
    }
    this.handle(ev);
    this.updateUI();
  }

  // ---------------------------------------------------------------------------------------
  private updateUI(): void {
    const s = this.s;
    const r = rates(s);

    // Resources.
    const show: Record<string, boolean> = { compute: true, energy: s.era >= 2, matter: s.era >= 2 };
    for (const k of RESOURCES) {
      const e = this.resEls[k];
      e.item.hidden = !show[k];
      if (!show[k]) continue;
      if (k === 'compute') {
        e.val.textContent = si(s.res.compute, 'FLOP');
        e.rate.textContent = `+${si(r.compute, 'FLOP/s')}`;
      } else if (k === 'energy') {
        e.val.textContent = si(s.res.energy, 'J');
        e.rate.textContent = `+${si(r.energy, 'W')}`;
      } else {
        e.val.textContent = kg(s.res.matter);
        e.rate.textContent = `+${kg(r.matter)}/s`;
      }
    }

    // Temperature: never commented on.
    if (s.earthGone) {
      this.tempEl.textContent = '—';
      this.tempEl.style.color = 'var(--ck-faint)';
    } else {
      this.tempEl.textContent = `${s.temp.toFixed(1)}°C`;
      const c = heatColor(s.temp);
      this.tempEl.style.color = s.temp < 17 ? '' : `rgb(${c.map((v) => v | 0).join(',')})`;
    }

    // Era + goal.
    if (this.eraTag.dataset.era !== String(s.era)) {
      this.eraTag.dataset.era = String(s.era);
      this.eraTag.replaceChildren(
        el('div', { class: 'ck-label', text: `era ${ROMAN[s.era]}` }),
        el('div', { class: 'ck-era-name', text: ERA_NAMES[s.era] }),
      );
    }
    this.eraLabel.textContent = `era ${ROMAN[s.era]} · goal`;
    this.goalTitle.textContent = ERA_GOAL[s.era];
    const p = eraProgress(s);
    this.goalBar.style.width = `${(p * 100).toFixed(2)}%`;
    this.goalPct.textContent =
      s.era === 4
        ? `${(p * 100).toFixed(3)}% · ${Math.floor(s.collectors).toLocaleString('en-US')} / ${DYSON_COLLECTORS.toLocaleString('en-US')} collectors`
        : `${pct(p)} unlocked`;

    // Padlock yield.
    const y = clickYield(s);
    const parts: string[] = [];
    if (s.era === 1) parts.push(si(y.compute, 'FLOP'));
    if (s.era === 2) parts.push(si(y.energy, 'J'), kg(y.matter));
    if (s.era === 3) parts.push(kg(y.matter));
    if (s.era === 4) parts.push(`${count(y.collectors)} collectors`);
    this.yieldEl.textContent = `+${parts.join(' · ')} per unlock`;

    this.updateProbes();

    // Rows.
    for (const [id, row] of this.rows) {
      const l = LANDMARK_BY_ID[id];
      if (l) {
        const blockers = landmarkBlockers(s, l);
        row.cost.textContent = fmtCost(l.cost);
        row.btn.disabled = blockers.length > 0 || !canAfford(s, l.cost);
        if (row.meta) {
          row.meta.textContent = blockers.length
            ? `requires ${blockers.length} more landmark${blockers.length > 1 ? 's' : ''}`
            : '';
        }
        continue;
      }
      const g = GEN_BY_ID[id];
      const n = this.amountFor(g);
      const cost = genCost(s, g, n);
      row.cost.textContent = `${this.amount === 1 ? '' : `×${n} `}${fmtCost(cost)}`;
      row.btn.disabled = !canAfford(s, cost);
      const have = s.gens[g.id] ?? 0;
      if (row.count) row.count.textContent = have ? String(have) : '';
      const o = genOutput(s, g);
      if (row.meta) row.meta.textContent = `+${fmtOut(o)} each${have ? ` · ${fmtOut(o, have)} total` : ''}`;
    }
    this.amountBtns.forEach((b, i) => b.classList.toggle('ck-sel', [1, 10, 'max'][i] === this.amount));

    // Popup timer.
    if (s.popup && this.popupBar) this.popupBar.style.width = `${(100 * s.popup.remaining) / s.popup.duration}%`;

    // Log.
    const lines = s.log.slice(-5);
    const sig = lines.map((l) => l.t + l.text).join('|');
    if (sig !== this.logSig) {
      this.logSig = sig;
      this.logEl.replaceChildren(
        ...lines.map((l) => el('div', {}, el('span', { class: 'ck-t', text: clock(l.t) }), l.text)),
      );
    }
  }

  private updateProbes(): void {
    const s = this.s;
    const visible = s.era >= 3 && (s.probes > 0 || s.landmarks.includes('orbit'));
    this.probesEl.hidden = !visible;
    if (!visible) return;
    const r = rates(s);
    this.probeCount.textContent = count(s.probes);
    this.probeRate.textContent = `+${count(r.probes)}/s`;
    const harvest = Math.round((1 - s.repFrac) * 100);
    if (document.activeElement !== this.slider) this.slider.value = String(harvest);
    this.repLabel.replaceChildren('REPLICATE ', el('b', { text: `${100 - harvest}%` }));
    this.harvLabel.replaceChildren('HARVEST ', el('b', { text: `${harvest}%` }));

    const reached = BODIES.filter((b) => s.bodies[b.id] !== undefined);
    const sig = reached.map((b) => b.id).join(',');
    if (sig !== this.bodySig) {
      this.bodySig = sig;
      this.bodiesEl.replaceChildren(
        ...reached.flatMap((b) => [
          el('span', { class: 'ck-label', text: b.name }),
          el('div', { class: 'ck-bar' }, el('i', { 'data-body': b.id })),
          el('span', { class: 'ck-pct', 'data-pct': b.id }),
        ]),
      );
    }
    for (const b of reached) {
      const c = bodyConsumed(s, b.id);
      const bar = this.bodiesEl.querySelector<HTMLElement>(`i[data-body="${b.id}"]`);
      const pt = this.bodiesEl.querySelector<HTMLElement>(`[data-pct="${b.id}"]`);
      if (bar) bar.style.width = `${c * 100}%`;
      if (pt) pt.textContent = c >= 1 ? 'unlocked' : `${(c * 100).toFixed(c < 0.1 ? 2 : 1)}%`;
    }
  }
}
