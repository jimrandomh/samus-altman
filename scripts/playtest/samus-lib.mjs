// Shared helpers for Samus Altman playtests (headless Chrome via Playwright).
import { chromium } from 'playwright';

export const BASE = process.env.BASE ?? 'http://localhost:5181/';
export const OUT = process.env.OUT ?? '/tmp';

export async function open(query = '?stage=samus', { reset = true } = {}) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  void reset; // each browser.newPage() is a fresh context with empty storage
  await page.goto(BASE + query);
  await page.waitForFunction(() => !!window.__samus);
  return { browser, page, errors };
}

export async function state(page) {
  return page.evaluate(() => window.__samus.state());
}

export async function shot(page, name) {
  const el = await page.$('.samus-screen canvas');
  await el.screenshot({ path: `${OUT}/${name}.png` });
}

export async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

export async function tap(page, key, ms = 40) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Leave the title screen. */
export async function start(page) {
  await tap(page, 'Enter');
  await page.waitForTimeout(150);
}

export async function teleport(page, room, col, row) {
  await page.evaluate(([r, c, w]) => window.__samus.teleport(r, c, w), [room, col, row]);
  await page.waitForTimeout(100);
}

/** Wait until state satisfies a predicate (evaluated in node on polled state). */
export async function until(page, pred, timeout = 5000) {
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await state(page);
    if (pred(s)) return s;
    await page.waitForTimeout(50);
  }
  throw new Error('until() timed out; last state: ' + JSON.stringify(s));
}

/** Walk toward a world-x (room px) target, hopping when blocked. */
export async function walkTo(page, targetCx, { tol = 4, timeout = 15000, until: done } = {}) {
  const t0 = Date.now();
  let last = null;
  let stuck = 0;
  let key = null;
  while (Date.now() - t0 < timeout) {
    const s = await state(page);
    if (done ? done(s) : Math.abs(s.cx - targetCx) < tol) {
      if (key) await page.keyboard.up(key);
      return s;
    }
    const want = s.cx < targetCx ? 'ArrowRight' : 'ArrowLeft';
    if (want !== key) {
      if (key) await page.keyboard.up(key);
      await page.keyboard.down(want);
      key = want;
    }
    if (last !== null && Math.abs(s.cx - last) < 0.5 && s.mode === 'play') stuck++;
    else stuck = 0;
    if (stuck >= 3) {
      await tap(page, 'KeyZ', 350);
      stuck = 0;
    }
    last = s.cx;
    await page.waitForTimeout(60);
  }
  if (key) await page.keyboard.up(key);
  throw new Error('walkTo timed out; state ' + JSON.stringify(await state(page)));
}

/** Jump (held for jumpMs) while holding a direction for dirMs; wait until landed. Returns landed state. */
export async function jump(page, dir, { jumpMs = 600, dirMs = 500, delayDir = 0 } = {}) {
  await page.keyboard.down('KeyZ');
  if (delayDir) await page.waitForTimeout(delayDir);
  if (dir) await page.keyboard.down(dir);
  await page.waitForTimeout(Math.min(jumpMs, dirMs));
  if (jumpMs < dirMs) {
    await page.keyboard.up('KeyZ');
    await page.waitForTimeout(dirMs - jumpMs);
    if (dir) await page.keyboard.up(dir);
  } else {
    if (dir) await page.keyboard.up(dir);
    await page.waitForTimeout(jumpMs - dirMs);
    await page.keyboard.up('KeyZ');
  }
  await page.waitForTimeout(100);
  return until(page, (s) => s.grounded, 4000);
}
