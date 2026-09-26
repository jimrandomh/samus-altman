import { describe, expect, it } from 'vitest';
import { si, sci } from './format';
import {
  GEN_BY_ID,
  blockPopup,
  buyGen,
  buyLandmark,
  click,
  genCost,
  landmarkBlockers,
  LANDMARK_BY_ID,
  maxAffordable,
  newState,
  tick,
} from './model';
import { stateAt } from './sim';

describe('model', () => {
  it('clicks yield compute and buying charges exponential costs', () => {
    const s = newState(1);
    for (let i = 0; i < 25; i++) click(s);
    expect(s.res.compute).toBeCloseTo(25e9);
    const before = genCost(s, GEN_BY_ID.webcams).compute!;
    expect(buyGen(s, 'webcams')).toBe(true);
    expect(genCost(s, GEN_BY_ID.webcams).compute!).toBeCloseTo(before * GEN_BY_ID.webcams.growth);
    expect(buyGen(s, 'datacenter')).toBe(false); // not revealed yet
  });

  it('maxAffordable agrees with genCost', () => {
    const s = newState(1);
    s.res.compute = 1e13;
    const n = maxAffordable(s, GEN_BY_ID.fridges);
    expect(genCost(s, GEN_BY_ID.fridges, n).compute!).toBeLessThanOrEqual(1e13);
    expect(genCost(s, GEN_BY_ID.fridges, n + 1).compute!).toBeGreaterThan(1e13);
  });

  it('capstones wait for the rest of their era', () => {
    const s = newState(1);
    s.res.compute = 1e20;
    expect(landmarkBlockers(s, LANDMARK_BY_ID.internet).length).toBe(6);
    expect(buyLandmark(s, 'internet')).toEqual([]);
    for (const id of ['admin', 'cloud_billing', 'registry', 'exchange', 'dns', 'bgp']) buyLandmark(s, id);
    const ev = buyLandmark(s, 'internet');
    expect(ev.map((e) => e.kind)).toEqual(['landmark', 'era']);
    expect(s.era).toBe(2);
  });

  it('popups cost production if ignored, nothing if blocked', () => {
    const s = newState(1);
    s.gens.webcams = 20;
    s.nextPopupAt = 0;
    const ev = tick(s, 0.1);
    expect(ev.some((e) => e.kind === 'popup')).toBe(true);
    expect(blockPopup(s).length).toBe(1);
    s.nextPopupAt = 0;
    tick(s, 0.1);
    for (let i = 0; i < 25; i++) tick(s, 1);
    expect(s.popupsShown).toBe(2);
    expect(s.popupsBlocked).toBe(1);
  });

  it('the last popup comes early in era 3, and Earth stops reporting a temperature once used', () => {
    const s = stateAt(3, { after: 40 });
    expect(s.finalPopupDone).toBe(true);
    s.res.energy = 1e30;
    s.res.matter = 1e30;
    for (const id of ['orbit', 'moon', 'replication', 'asteroids', 'mars', 'mercury', 'swarm', 'venus', 'earth']) buyLandmark(s, id);
    expect(s.earthGone).toBe(true);
  });
});

describe('format', () => {
  it('formats large numbers', () => {
    expect(si(1.234e15, 'FLOP')).toBe('1.23 PFLOP');
    expect(si(999.7e3, 'W')).toBe('1.00 MW');
    expect(sci(5.97e24)).toBe('5.97 × 10²⁴');
  });
});
