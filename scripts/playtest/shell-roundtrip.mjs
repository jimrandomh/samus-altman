// Launch the real game from the shell with flags, then Ctrl+C back.
// Usage: node scripts/playtest/shell-roundtrip.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5182/';
const out = process.argv[3] ?? '/tmp';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const stage = () => page.evaluate(() => document.getElementById('app').dataset.stage);

await page.goto(`${base}?stage=ending`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${base}?stage=ending`);
await page.evaluate(async () => {
  (await import('/src/core/state.ts')).setFlag('crashed', true);
  (await import('/src/core/stages.ts')).goTo('shell', { exit: { kind: 'crash', lines: ['Segmentation fault (core dumped)'] } });
});
await page.waitForTimeout(800);
await page.keyboard.type('./samus_altman --debug', { delay: 5 });
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
console.log('stage after launch:', await stage());
await page.screenshot({ path: `${out}/roundtrip-game.png` });
await page.keyboard.press('Control+c');
await page.waitForTimeout(1200);
console.log('stage after ^C:', await stage());
await page.screenshot({ path: `${out}/roundtrip-back.png` });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
