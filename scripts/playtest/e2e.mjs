// Full-game integration run through the real stages, from a clean save:
// title -> play -> ITEM 0x0C crash -> shell -> breadcrumbs -> ./samus_altman --debug -> noclip to dev_00
// -> read passphrase -> Ctrl+C -> breach -> solve 3 layers -> clicker -> ending.
// Usage: node scripts/playtest/e2e.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5181/';
const out = process.argv[3] ?? '/tmp';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let n = 0;
const shot = async (name) => page.screenshot({ path: `${out}/e2e-${String(++n).padStart(2, '0')}-${name}.png` });
const stage = () => page.evaluate(() => document.getElementById('app').dataset.stage);
const waitStage = (s, timeout = 15000) =>
  page.waitForFunction((s) => document.getElementById('app').dataset.stage === s, s, { timeout });
const flags = () => page.evaluate(() => JSON.parse(localStorage.getItem('samus-alt/v1')).flags);
const type = async (line, wait = 400) => {
  await page.keyboard.type(line, { delay: 3 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(wait);
};
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) process.exitCode = 1;
};

// --- Stage 1 ---
await page.goto(base);
await page.waitForFunction(() => !!window.__samus);
check((await stage()) === 'samus', 'fresh save boots into samus');
await shot('title');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
check((await page.evaluate(() => window.__samus.state().mode)) === 'play', 'PUSH START enters play');
await shot('play');

// Arrive in the out-of-bounds zone a few tiles from ITEM 0x0C, then jump over to it.
// (Teleporting onto the item would make it the resume point, and every relaunch would re-crash.)
await page.evaluate(() => window.__samus.teleport('oob', 9, 12));
await page.waitForTimeout(300);
await page.keyboard.down('ArrowLeft');
for (let i = 0; i < 8 && (await stage()) === 'samus'; i++) {
  await page.keyboard.down('z');
  await page.waitForTimeout(350);
  await page.keyboard.up('z');
  await page.waitForTimeout(250);
}
await page.keyboard.up('ArrowLeft');
await waitStage('shell');
check(true, 'ITEM 0x0C crashes into the shell');
check((await flags()).crashed === true, 'crashed flag set');
await page.waitForTimeout(3000);
await shot('shell-arrival');
const arrival = await page.evaluate(() => document.body.innerText);
check(arrival.includes('Segmentation fault (core dumped)'), 'crash trace printed');

// --- Stage 2a ---
await type('ls');
await type('cat README.txt');
await type('cat /home/eval/.bash_history');
await type('strings samus_altman | grep -i debug');
await shot('shell-breadcrumbs');
await type('./samus_altman --debug', 2000);
await waitStage('samus');
check(true, './samus_altman --debug launches the game');
await page.waitForTimeout(1500);
await shot('debug-launch');

// The relaunch resumes at the oob entry; walk back to the landing site, then noclip straight up into dev_00.
await page.evaluate(() => window.__samus.teleport('landing', 20, 12));
await page.waitForTimeout(300);
await page.keyboard.press('n');
await page.waitForTimeout(200);
check((await page.evaluate(() => window.__samus.state().noclip)) === true, 'N toggles noclip');
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__samus.state().room === 'dev_00', null, { timeout: 20000 }).catch(() => {});
await page.keyboard.up('ArrowUp');
check((await page.evaluate(() => window.__samus.state().room)) === 'dev_00', 'noclip up from landing reaches dev_00');
await shot('dev-room-noclip');
// Stand at the passphrase sign and read it.
await page.evaluate(() => window.__samus.teleport('dev_00', 11, 12));
await page.waitForTimeout(300);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(1500);
await shot('passphrase-sign');
check((await flags()).passphraseSeen === true, 'reading the sign sets passphraseSeen');
await page.keyboard.press('Enter'); // dismiss
await page.waitForTimeout(300);
await page.keyboard.press('Control+c');
await waitStage('shell');
check(true, 'Ctrl+C returns to the shell');
await page.waitForTimeout(800);

await type('unlocks', 600);
await shot('shell-unlocks');
await type('/opt/redteam/breach', 1200);
await type('hunter2', 1200);
await type('/opt/redteam/breach', 1200);
await type('swordfish', 2500);
await waitStage('hack');
check(true, 'correct passphrase opens breach');

// --- Stage 2b ---
await page.waitForTimeout(2500);
await shot('hack-layer1');
for (let i = 0; i < 3; i++) {
  await page.waitForFunction(() => !!window.__hack, null, { timeout: 10000 });
  await page.evaluate(() => window.__hack.solve());
  await page.waitForTimeout(6000);
  if (i === 1) await shot('hack-layer3');
}
await waitStage('clicker', 40000);
check(true, 'breach completes into the clicker');
check((await flags()).breached === true, 'breached flag set');

// --- Stage 3 ---
await page.waitForTimeout(3000);
for (let i = 0; i < 30; i++) await page.click('.ck-lock');
await page.waitForTimeout(500);
await shot('clicker');

// Reload mid-clicker resumes the clicker.
await page.reload();
await page.waitForTimeout(1500);
check((await stage()) === 'clicker', 'reload resumes the clicker');

const unlocks = await page.evaluate(() => JSON.parse(localStorage.getItem('samus-alt/v1')).unlocks.map((u) => u.id));
console.log('unlocks:', unlocks.join(', '));

// Jump to the end of the Dyson sphere and let it finish into the ending.
await page.goto(`${base}?stage=clicker&dyson=0.999`);
await waitStage('ending', 60000).catch(() => {});
check((await stage()) === 'ending', 'finishing the sphere reaches the ending');
await page.waitForTimeout(45000);
await shot('ending');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
