// Smoke test: load each stage and screenshot it.
// Usage: node scripts/playtest/smoke.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '/tmp';
const stages = ['samus', 'shell', 'hack', 'clicker', 'ending'];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
for (const s of stages) {
  await page.goto(`${base}?stage=${s}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/smoke-${s}.png` });
  console.log(`${s}: ok`);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
