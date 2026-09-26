// Real-physics checks of the high-jump climbs and a few representative jumps.
import { open, start, until, jump, walkTo, shot } from './samus-lib.mjs';

const results = [];
async function route(name, query, steps) {
  const { browser, page } = await open(query);
  try {
    await start(page);
    await until(page, (s) => s.grounded);
    for (const [label, fn, expectFeetRow] of steps) {
      const s = await fn(page);
      const row = s.feet / 16;
      if (expectFeetRow !== undefined && row !== expectFeetRow) throw new Error(`${label}: landed with feet at row ${row}, expected ${expectFeetRow} (x=${s.x})`);
    }
    results.push([name, 'ok']);
  } catch (e) {
    await shot(page, 'fail-' + name);
    results.push([name, 'FAIL ' + e.message.slice(0, 300)]);
  }
  await browser.close();
}

const R = 'ArrowRight';
const L = 'ArrowLeft';

await route('varia-climb', '?stage=samus&items=all&room=varia_climb&col=7&row=21', [
  ['to r17', (p) => jump(p, R, { jumpMs: 700, dirMs: 450, delayDir: 250 }), 17],
  ['to r12', async (p) => { await walkTo(p, 9 * 16 + 6); return jump(p, L, { jumpMs: 700, dirMs: 420, delayDir: 300 }); }, 12],
  ['to r7', async (p) => { await walkTo(p, 6 * 16 + 10); return jump(p, R, { jumpMs: 700, dirMs: 420, delayDir: 300 }); }, 7],
]);

const hop = (label, takeoffCx, dir, row, { dirMs = 260, delayDir = 120, jumpMs = 650 } = {}) => [
  label,
  async (p) => {
    await walkTo(p, takeoffCx, { tol: 2 });
    await until(p, (s) => s.grounded);
    return jump(p, dir, { jumpMs, dirMs: dirMs + delayDir, delayDir });
  },
  row,
];

await route('norfair-side', '?stage=samus&room=norfair_side&col=12&row=12', [
  hop('to platform', 11 * 16 + 6, L, 11, { dirMs: 200, delayDir: 60 }),
  hop('to west floor', 6 * 16 + 4, L, 13, { dirMs: 450, delayDir: 60, jumpMs: 400 }),
]);

// No high jump: the escape shaft must be climbable with the normal jump alone.
await route('escape-shaft', '?stage=samus&room=escape_shaft&col=3&row=42', [
  hop('P0', 14 * 16 + 6, L, 40, { dirMs: 80 }),
  hop('P1', 10 * 16 + 6, L, 37, { dirMs: 150 }),
  hop('P2', 6 * 16 + 6, L, 34, { dirMs: 150 }),
  hop('P3', 5 * 16 + 6, R, 31, { dirMs: 250 }),
  hop('P4', 10 * 16 + 6, R, 28, { dirMs: 150 }),
  hop('P5', 11 * 16 + 6, L, 25, { dirMs: 250 }),
  hop('P6', 6 * 16 + 6, L, 22, { dirMs: 150 }),
  hop('P7', 5 * 16 + 6, R, 19, { dirMs: 250 }),
  hop('P8', 10 * 16 + 6, R, 16, { dirMs: 150 }),
  hop('P9', 11 * 16 + 6, L, 13, { dirMs: 250 }),
  hop('P10', 6 * 16 + 6, L, 10, { dirMs: 150 }),
  hop('P11', 5 * 16 + 6, R, 7, { dirMs: 250 }),
  hop('pad', 9 * 16 + 8, L, 5, { dirMs: 120, delayDir: 150 }),
]);

// No high jump: the Brinstar shaft from the bottom back up to the landing door.
await route('shaft-up', '?stage=samus&room=shaft&col=3&row=42', [
  hop('r40', 9 * 16 + 6, R, 40, { dirMs: 150 }),
  hop('r37', 10 * 16 + 6, L, 37, { dirMs: 200 }),
  hop('r34', 8 * 16 + 6, R, 34, { dirMs: 200 }),
  hop('r31', 10 * 16 + 6, L, 31, { dirMs: 200 }),
  hop('hole', 7 * 16 + 6, R, 28, { dirMs: 220, delayDir: 250 }),
  hop('r25', 2 * 16 + 6, R, 25, { dirMs: 80, delayDir: 200 }),
  hop('r22', 5 * 16 + 6, R, 22, { dirMs: 150 }),
  hop('r19', 8 * 16 + 6, R, 19, { dirMs: 200 }),
  hop('r16', 10 * 16 + 6, L, 16, { dirMs: 250 }),
  hop('gap', 7 * 16 + 6, R, 13, { dirMs: 330, delayDir: 250 }),
]);

// No high jump: Norfair's shaft from the bottom back to the top door.
await route('norfair-up', '?stage=samus&items=all&room=norfair_shaft&col=12&row=42', [
  hop('r40', 9 * 16 + 6, R, 40, { dirMs: 150 }),
]);
console.table(results);
