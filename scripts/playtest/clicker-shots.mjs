// Screenshots of the clicker stage at various points.
// Usage: node scripts/playtest/clicker-shots.mjs <outDir> [which...]
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:5183/';
const out = process.argv[2] ?? '/tmp';
const which = process.argv.slice(3);
const shots = {
  era1: { q: 'stage=clicker&fresh', before: async (p) => {
    for (let i = 0; i < 40; i++) await p.click('.ck-lock');
    await p.waitForTimeout(300);
  } },
  era1b: { q: 'stage=clicker&era=1&speed=30', wait: 9000 },
  era2: { q: 'stage=clicker&era=2&speed=1', wait: 2000 },
  era2late: { q: 'stage=clicker&era=2&speed=40', wait: 7000 },
  era3: { q: 'stage=clicker&era=3&speed=1', wait: 5000 },
  era3late: { q: 'stage=clicker&era=3&speed=20', wait: 12000 },
  era4: { q: 'stage=clicker&era=4', wait: 6000 },
  era2mid: { q: 'stage=clicker&era=2&at=200', wait: 1500 },
  era2end: { q: 'stage=clicker&era=2&at=320', wait: 1500 },
  era3mid: { q: 'stage=clicker&era=3&at=130', wait: 1500 },
  era3zoom: { q: 'stage=clicker&era=3', wait: 2500 },
  era4mid: { q: 'stage=clicker&dyson=0.5', wait: 1500 },
  dyson: { q: 'stage=clicker&dyson=0.93', wait: 6000 },
  ending: { q: 'stage=ending', wait: 30000 },
  endingLate: { q: 'stage=ending', wait: 60000 },
};

const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, cfg] of Object.entries(shots)) {
  if (which.length && !which.includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}?${cfg.q}`);
  await page.waitForTimeout(800);
  if (cfg.before) await cfg.before(page);
  if (cfg.wait) await page.waitForTimeout(cfg.wait);
  await page.screenshot({ path: `${out}/clicker-${name}.png` });
  console.log(`${name}: ok${errors.length ? ' ERRORS: ' + errors.join(' | ') : ''}`);
  await page.close();
}
await browser.close();
