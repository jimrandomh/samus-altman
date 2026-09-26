// Plays the clicker in a real browser: clicks the padlock, buys whatever is affordable,
// blocks popups. Usage: node scripts/playtest/clicker-play.mjs <outDir> <seconds> [query]
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:5183/';
const out = process.argv[2] ?? '/tmp';
const seconds = Number(process.argv[3] ?? 60);
const query = process.argv[4] ?? 'stage=clicker&fresh&speed=4';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?${query}`);
await page.waitForTimeout(1000);
let blocked = 0;
let shot = 0;
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < seconds) {
  for (let i = 0; i < 4; i++) await page.click('.ck-lock', { delay: 10 }).catch(() => {});
  // Landmarks first, then the cheapest affordable assets.
  const bought = await page.evaluate(() => {
    let n = 0;
    const btns = [...document.querySelectorAll('.ck-lists .ck-btn')].filter((b) => !b.disabled && b.closest('.ck-row'));
    for (const b of btns.slice(0, 3)) {
      b.click();
      n++;
    }
    return n;
  });
  const popup = await page.$('.ck-popup button');
  if (popup) {
    await popup.click().catch(() => {});
    blocked++;
  }
  if ((Date.now() - t0) / 1000 > (shot + 1) * (seconds / 4)) {
    shot++;
    await page.screenshot({ path: `${out}/play-${shot}.png` });
  }
  await page.waitForTimeout(200);
}
const state = await page.evaluate(() => {
  const raw = localStorage.getItem('samus-alt/v1');
  const d = raw ? JSON.parse(raw) : null;
  return {
    unlocks: d?.unlocks?.map((u) => u.id),
    era: d?.slices?.clicker?.era,
    t: d?.slices?.clicker?.t,
    narr: [...document.querySelectorAll('#narrator .narr-line')].map((e) => e.textContent),
  };
});
console.log(JSON.stringify({ blocked, ...state }, null, 1));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await page.screenshot({ path: `${out}/play-final.png` });
await browser.close();
