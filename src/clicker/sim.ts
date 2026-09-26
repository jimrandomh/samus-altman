// Headless player for balancing, tests, and the ?era= dev jump.
import {
  BODIES,
  COLLECTOR_MASS,
  DYSON_COLLECTORS,
  GENS,
  LANDMARKS,
  RESOURCES,
  blockPopup,
  buyGen,
  buyLandmark,
  canAfford,
  click,
  clickYield,
  genCost,
  genVisible,
  landmarkBlockers,
  landmarkVisible,
  newState,
  rates,
  reachableMass,
  setRepFrac,
  tick,
  type Bag,
  type ClickerState,
  type Era,
  type Rates,
} from './model';

export interface SimOptions {
  seed?: number;
  dt?: number;
  clicksPerSec?: (era: Era) => number;
  blockProb?: number;
  maxT?: number;
  /** Stop as soon as this is true (checked every step). */
  until?: (s: ClickerState) => boolean;
  /** Lookahead horizon for purchase decisions, seconds. */
  horizon?: number;
}

export interface SimResult {
  state: ClickerState;
  end: number | null;
  stalled: boolean;
  /** Longest stretch in each era with nothing bought (seconds). */
  maxGap: number[];
  tempAtEraEnd: number[];
  timeline: { t: number; what: string }[];
  purchases: number;
}

function eta(cost: Bag, s: ClickerState, r: Rates, cps: number): number {
  const y = cps > 0 ? clickYield(s) : null;
  let worst = 0;
  for (const k of RESOURCES) {
    const deficit = (cost[k] ?? 0) - s.res[k];
    if (deficit <= 0) continue;
    const rate = r[k] + (y ? y[k] * cps : 0);
    if (rate <= 0) return Infinity;
    worst = Math.max(worst, deficit / rate);
  }
  return worst;
}

function targets(s: ClickerState) {
  return LANDMARKS.filter((l) => landmarkVisible(s, l) && !landmarkBlockers(s, l).length);
}

/** Seconds until the next thing worth having, from this state's instantaneous rates. */
function goalEta(s: ClickerState, cps: number): number {
  const r = rates(s);
  const ts = targets(s);
  if (ts.length) return Math.min(...ts.map((l) => eta(l.cost, s, r, cps)));
  if (s.era === 4) {
    const left = DYSON_COLLECTORS - s.collectors;
    const stock = s.res.matter / COLLECTOR_MASS;
    const eff = stock > r.build * 10 ? r.build : Math.min(r.build, r.matter / COLLECTOR_MASS);
    return eff > 0 ? left / eff : Infinity;
  }
  return Infinity;
}

/** How well-off a state is: log of each resource's near-future value. Higher is better. */
function wealth(s: ClickerState, cps: number): number {
  const r = rates(s);
  const y = clickYield(s);
  let w = 0;
  for (const k of RESOURCES) {
    if (s.era === 1 && k !== 'compute') continue;
    w += Math.log(1 + s.res[k] + 120 * (r[k] + cps * y[k]));
  }
  if (s.era >= 3) w += Math.log(1 + s.probes);
  if (s.era === 4) w += 20 * Math.log(1 + s.collectors + 60 * r.build);
  return w;
}

/** Wealth after `horizon` seconds of idling (optionally buying `plan` as soon as it's affordable). */
function lookahead(s: ClickerState, horizon: number, cps: number, plan?: string): number {
  const c = structuredClone(s);
  const step = 1;
  let clickAcc = 0;
  for (let t = 0; t < horizon; t += step) {
    if (plan && buyGen(c, plan)) plan = undefined;
    clickAcc += cps * step;
    while (clickAcc >= 1) {
      click(c);
      clickAcc--;
    }
    tick(c, step);
    c.popup = null;
    if (c.done) return Infinity;
  }
  return wealth(c, cps);
}

/** Resources the nearest landmark is short of, if it's close enough to be worth saving for. */
function savingFor(s: ClickerState, cps: number): Set<string> {
  const r = rates(s);
  const y = clickYield(s);
  const out = new Set<string>();
  for (const l of targets(s)) {
    if (eta(l.cost, s, r, cps) > 30) continue;
    for (const k of RESOURCES) if ((l.cost[k] ?? 0) > s.res[k] + (r[k] + cps * y[k]) * 0) out.add(k);
  }
  return out;
}

type Option = { kind: 'wait' } | { kind: 'gen'; id: string } | { kind: 'save'; id: string };

function chooseRep(s: ClickerState, cps: number): void {
  if (s.era < 3 || s.probes <= 0) return;
  if (reachableMass(s) <= 0) return;
  // Replicate until full harvest would reach the goal quickly, then harvest.
  const probe = structuredClone(s);
  setRepFrac(probe, 0);
  const fast = goalEta(probe, cps) < 25;
  setRepFrac(s, fast ? 0.1 : 0.9);
}

export function simulate(opts: SimOptions = {}): SimResult {
  const dt = opts.dt ?? 0.25;
  const cps = opts.clicksPerSec ?? ((e: Era) => (e === 1 ? 4 : e === 2 ? 3 : 2));
  const blockProb = opts.blockProb ?? 0.9;
  const maxT = opts.maxT ?? 3600;
  const horizon = opts.horizon ?? 20;
  const s = newState(opts.seed ?? 1);
  let rng = (opts.seed ?? 1) * 7919;
  const rand = () => {
    rng = (rng * 16807) % 2147483647;
    return rng / 2147483647;
  };

  const res: SimResult = { state: s, end: null, stalled: false, maxGap: [0, 0, 0, 0], tempAtEraEnd: [], timeline: [], purchases: 0 };
  let lastBuy = 0;
  let nextDecision = 0;
  let clickAcc = 0;
  let blockAt: number | null = null;
  let stuckSince: number | null = null;

  const bought = (what: string) => {
    res.purchases++;
    const gap = s.t - lastBuy;
    res.maxGap[s.era - 1] = Math.max(res.maxGap[s.era - 1], gap);
    lastBuy = s.t;
    if (what) res.timeline.push({ t: s.t, what });
  };

  while (s.t < maxT && !s.done) {
    if (opts.until?.(s)) break;
    clickAcc += cps(s.era) * dt;
    while (clickAcc >= 1) {
      click(s);
      clickAcc--;
    }

    if (s.t >= nextDecision) {
      nextDecision = s.t + 1;
      chooseRep(s, cps(s.era));
      // Landmarks are always worth it.
      for (const l of targets(s)) {
        if (canAfford(s, l.cost)) {
          const era = s.era;
          const ev = buyLandmark(s, l.id);
          if (ev.length) {
            bought(l.name);
            if (s.era !== era) res.tempAtEraEnd.push(s.temp);
          }
        }
      }
      // Then generators, by lookahead, unless saving for a landmark that's nearly affordable.
      const saving = savingFor(s, cps(s.era));
      for (let i = 0; i < 25; i++) {
        const options: Option[] = [{ kind: 'wait' }];
        const r = rates(s);
        for (const g of GENS) {
          if (!genVisible(s, g) || g.era < s.era - 1) continue;
          if (RESOURCES.some((k) => g.cost[k] && saving.has(k))) continue;
          const c = structuredClone(s);
          if (buyGen(c, g.id)) options.push({ kind: 'gen', id: g.id });
          else if (eta(genCost(s, g), s, r, cps(s.era)) < horizon / 2) options.push({ kind: 'save', id: g.id });
        }
        if (options.length === 1) break;
        let best: Option = options[0];
        let bestScore = lookahead(s, horizon, cps(s.era));
        for (const o of options.slice(1)) {
          let score: number;
          if (o.kind === 'save') {
            score = lookahead(s, horizon, cps(s.era), o.id);
          } else {
            const c = structuredClone(s);
            buyGen(c, (o as { id: string }).id);
            score = lookahead(c, horizon, cps(s.era));
          }
          if (score > bestScore + 1e-9) {
            bestScore = score;
            best = o;
          }
        }
        if (best.kind !== 'gen') break;
        buyGen(s, best.id);
        bought('');
      }
      const g = goalEta(s, cps(s.era));
      if (!Number.isFinite(g) && s.era < 4) {
        stuckSince ??= s.t;
        if (s.t - stuckSince > 120) {
          res.stalled = true;
          break;
        }
      } else stuckSince = null;
    }

    const ev = tick(s, dt);
    for (const e of ev) {
      if (e.kind === 'popup') blockAt = rand() < blockProb ? s.t + 2 + rand() * 6 : null;
      if (e.kind === 'done') res.end = s.t;
    }
    if (s.popup && blockAt !== null && s.t >= blockAt) {
      blockPopup(s);
      blockAt = null;
    }
  }
  res.state = s;
  return res;
}

/** A state reached by the sim player: the start of `era`, `after` seconds into it, or (era 4) a sphere fraction. */
export function stateAt(era: Era, opts: { after?: number; dyson?: number } = {}): ClickerState {
  const r = simulate({
    until: (s) => {
      if (s.era > era) return true;
      if (s.era < era) return false;
      if (opts.dyson !== undefined) return s.collectors / DYSON_COLLECTORS >= opts.dyson;
      return s.t >= s.eraStart[era - 1] + (opts.after ?? 0);
    },
  });
  return r.state;
}

export function report(r: SimResult): string {
  const s = r.state;
  const lines: string[] = [];
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const ends = [...s.eraStart.slice(1), r.end ?? s.t];
  s.eraStart.forEach((start, i) => {
    lines.push(
      `era ${i + 1}: ${fmt(start)} → ${fmt(ends[i])}  (${fmt(ends[i] - start)})  maxGap ${r.maxGap[i].toFixed(0)}s  temp@end ${
        (r.tempAtEraEnd[i] ?? s.temp).toFixed(1)
      }`,
    );
  });
  lines.push(`total: ${r.end ? fmt(r.end) : 'DID NOT FINISH'}${r.stalled ? ' (STALLED)' : ''}  purchases ${r.purchases}  clicks ${s.clicks}`);
  lines.push(`popups shown ${s.popupsShown}, blocked ${s.popupsBlocked}`);
  lines.push(`bodies: ${BODIES.map((b) => `${b.id}=${s.bodies[b.id] === undefined ? '-' : (1 - s.bodies[b.id]! / b.mass).toFixed(3)}`).join(' ')}`);
  lines.push(`gens: ${Object.entries(s.gens).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  lines.push(...r.timeline.map((x) => `  ${fmt(x.t)}  ${x.what}`));
  return lines.join('\n');
}
