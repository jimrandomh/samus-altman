// Playtest the breach minigame: screenshots of each layer, dev-solve, and the handoff to the clicker.
// Usage: node scripts/playtest/hack-run.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5182/';
const out = process.argv[3] ?? '/tmp';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let n = 0;
const shot = async (name) => page.screenshot({ path: `${out}/hack-${String(++n).padStart(2, '0')}-${name}.png` });

await page.goto(`${base}?stage=clicker`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${base}?stage=hack`);
await page.waitForTimeout(600);
await shot('intro');
await page.waitForTimeout(1200);
await shot('layer1');
// play a few real moves
const cells = await page.$$('.pipe-cell');
for (const i of [0, 6, 12]) await cells[i].click();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
await shot('layer1-moves');
await page.evaluate(() => window.__hack.solve());
await page.waitForTimeout(400);
await shot('layer1-solved');
await page.waitForTimeout(2200);
await shot('layer2');
const codes = await page.$$('.matrix-cell.in-line');
await codes[1].click();
await page.waitForTimeout(200);
await shot('layer2-pick');
await page.evaluate(() => window.__hack.solve());
await page.waitForTimeout(400);
await shot('layer2-solved');
await page.waitForTimeout(2200);
await shot('layer3');
await page.evaluate(() => window.__hack.solve());
await page.waitForTimeout(1500);
await shot('layer3-flowing');
// wait for flow to finish
for (let i = 0; i < 40 && (await page.evaluate(() => window.__hack?.layer())) === 2; i++) await page.waitForTimeout(250);
await page.waitForTimeout(2500);
await shot('finale');
await page.waitForTimeout(4000);
await shot('finale-lines');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
console.log('stage:', await page.evaluate(() => document.getElementById('app').dataset.stage));
console.log('unlocks:', await page.evaluate(async () => (await import('/src/core/state.ts')).getData().unlocks.map((u) => u.id).join(', ')));
console.log('breached:', await page.evaluate(async () => (await import('/src/core/state.ts')).getFlag('breached')));

// leak test: containment with nothing solved, force the flow now
await page.goto(`${base}?stage=hack&layer=3`);
await page.waitForTimeout(500);
await page.keyboard.press('f');
await page.waitForTimeout(1600);
await shot('leak');
await page.waitForTimeout(1200);
await shot('leak-regen');
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
