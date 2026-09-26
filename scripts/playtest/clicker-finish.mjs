// From a nearly-finished sphere through to the ending. Usage: node clicker-finish.mjs <outDir>
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:5183/';
const out = process.argv[2] ?? '/tmp';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?stage=clicker&dyson=0.985&speed=3`);
for (const [i, ms] of [[1, 4000], [2, 6000], [3, 8000], [4, 14000], [5, 30000]]) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `${out}/finish-${i}.png` });
  const stage = await page.evaluate(() => document.getElementById('app')?.dataset.stage);
  console.log(i, stage);
}
const data = await page.evaluate(() => JSON.parse(localStorage.getItem('samus-alt/v1') ?? '{}'));
console.log('stage', data.stage, 'unlocks', data.unlocks?.length, data.unlocks?.slice(-3).map((u) => u.id));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
