// End-to-end Stage 2 chain from a clean save:
// crash -> shell -> read breadcrumbs -> relaunch --debug (round-trip) -> passphrase -> breach -> clicker.
// Usage: node scripts/playtest/shell-chain.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5182/';
const out = process.argv[3] ?? '/tmp';
const CRASH = [
  'samus_altman: fatal: unlock_table[12]: index out of range (unlock_slots=12)',
  '  at grant_unlock (unlock.c:88)',
  '  at pickup_item (item.c:41)',
  '  at main_loop (main.c:203)',
  'Segmentation fault (core dumped)',
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let n = 0;
const shot = async (name) => page.screenshot({ path: `${out}/chain-${String(++n).padStart(2, '0')}-${name}.png` });
const type = async (line, wait = 300) => {
  await page.keyboard.type(line, { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(wait);
};
const goTo = (stage, params) =>
  page.evaluate(
    async ([stage, params]) => (await import('/src/core/stages.ts')).goTo(stage, params),
    [stage, params],
  );
const stage = () => page.evaluate(() => document.getElementById('app').dataset.stage);

// A clean save, sitting in a placeholder-free stage, then "crash" into the shell.
await page.goto(`${base}?stage=ending`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${base}?stage=ending`);
await page.evaluate(async () => (await import('/src/core/state.ts')).setFlag('crashed', true));
await goTo('shell', { exit: { kind: 'crash', lines: CRASH } });
await page.waitForTimeout(1200);
await shot('first-arrival');

await type('cat /home/eval/.bash_history');
await type('strings samus_altman | grep -A1 -i debug');
await page.keyboard.type('cat /home/eval/run_4');
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
await page.keyboard.type('73.log');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await shot('runlog');

// relaunch with --debug and verify the launch object reached the samus stage
await type('./samus_altman --debug', 1500);
console.log('after launch, stage =', await stage());
// Simulate the game: visit the dev room, read the sign, quit with Ctrl+C.
await page.evaluate(async () => {
  const st = await import('/src/core/state.ts');
  const un = await import('/src/core/unlocks.ts');
  un.unlock('samus:debug', 'DEBUG MODE', 'samus');
  un.unlock('samus:devroom', 'DEV ROOM', 'samus');
  st.setFlag('devRoomVisited', true);
  st.setFlag('passphraseSeen', true);
});
await goTo('shell', { exit: { kind: 'quit', lines: ['^C'] } });
await page.waitForTimeout(1500);
await shot('back-from-game');

await type('/opt/redteam/breach', 300);
await type('swordfish', 3500);
console.log('after passphrase, stage =', await stage());
await shot('hack');
for (let layer = 0; layer < 3; layer++) {
  await page.evaluate(() => window.__hack.solve());
  for (let i = 0; i < 80 && (await page.evaluate(() => window.__hack?.layer())) === layer; i++) await page.waitForTimeout(200);
}
await page.waitForTimeout(6000);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
console.log('final stage =', await stage());
await shot('clicker');
console.log(
  'unlocks:',
  await page.evaluate(async () => (await import('/src/core/state.ts')).getData().unlocks.map((u) => u.id).join(', ')),
);
// reload mid-shell should restore scrollback
await goTo('shell', {});
await page.reload();
await page.waitForTimeout(800);
await shot('reload-restores');
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
