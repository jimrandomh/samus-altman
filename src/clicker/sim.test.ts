import { describe, expect, it } from 'vitest';
import { report, simulate } from './sim';

describe('balance', () => {
  it('a plausible player finishes in roughly 15–20 minutes without dead stretches', () => {
    const r = simulate({ seed: 1 });
    const msg = report(r);
    expect(r.stalled, msg).toBe(false);
    expect(r.end, msg).not.toBeNull();
    expect(r.end!, msg).toBeGreaterThan(14 * 60);
    expect(r.end!, msg).toBeLessThan(21 * 60);
    for (const gap of r.maxGap) expect(gap, msg).toBeLessThan(60);
  });

  it('a lazier player (one click a second, ignores half the popups) still finishes', () => {
    const r = simulate({ seed: 7, clicksPerSec: () => 1, blockProb: 0.5 });
    const msg = report(r);
    expect(r.stalled, msg).toBe(false);
    expect(r.end, msg).not.toBeNull();
    expect(r.end!, msg).toBeLessThan(35 * 60);
  });

  it('a player who stops clicking after era 1 still finishes', () => {
    const r = simulate({ seed: 3, clicksPerSec: (e) => (e === 1 ? 3 : 0), blockProb: 0 });
    const msg = report(r);
    expect(r.stalled, msg).toBe(false);
    expect(r.end, msg).not.toBeNull();
  });
});
