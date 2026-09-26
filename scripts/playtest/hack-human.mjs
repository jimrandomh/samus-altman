// Solve every breach layer the way a player would: by clicking cells (plan comes from a dev hook).
// Usage: node scripts/playtest/hack-human.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5182/';
const out = process.argv[3] ?? '/tmp';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${base}?stage=clicker`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${base}?stage=hack`);
await page.waitForTimeout(1600);

for (let layer = 0; layer < 3; layer++) {
  const plan = await page.evaluate(() => window.__hack.plan());
  const t0 = Date.now();
  if (plan.clicks) {
    const cells = await page.$$('.pipe-cell');
    for (let i = 0; i < plan.clicks.length; i++) {
      for (let k = 0; k < plan.clicks[i]; k++) await cells[i].click({ delay: 5 });
    }
  } else {
    for (const [r, c] of plan.picks) {
      const cells = await page.$$('.matrix-cell');
      await cells[r * 5 + c].click();
    }
  }
  // wait for the layer to finish
  for (let i = 0; i < 80 && (await page.evaluate(() => window.__hack?.layer())) === layer; i++) await page.waitForTimeout(250);
  console.log(`layer ${layer + 1} cleared by clicking in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.waitForTimeout(300);
}
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/hack-human-final.png` });
console.log('breached:', await page.evaluate(async () => (await import('/src/core/state.ts')).getFlag('breached')));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
