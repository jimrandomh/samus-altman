// Playtest the shell: arrive via crash, explore, relaunch, passphrase, breach.
// Usage: node scripts/playtest/shell-explore.mjs [baseUrl] [outDir]
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
const shot = async (name) => page.screenshot({ path: `${out}/shell-${String(++n).padStart(2, '0')}-${name}.png` });
const type = async (line, wait = 250) => {
  await page.keyboard.type(line, { delay: 8 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(wait);
};

await page.goto(`${base}?stage=shell`);
await page.evaluate(() => localStorage.clear());
await page.goto(base + '?stage=shell');
await page.evaluate(async (crash) => {
  const st = await import('/src/core/state.ts');
  st.setFlag('crashed', true);
  // clear the shell slice (the direct ?stage=shell visit created one)
  delete st.getData().slices.shell;
  st.persist();
  const m = await import('/src/core/stages.ts');
  m.goTo('shell', { exit: { kind: 'crash', lines: crash } });
}, CRASH);
await page.waitForTimeout(1500);
await shot('arrive');

await type('ls');
await type('cat README.txt');
await shot('readme');
await type('ls -la');
await type('./samus_altman --help');
await type('./samus_altman --unlock-all');
await type('./samus_altman --fly');
await shot('launcher');
await type('strings samus_altman | grep -i debug');
await type('cat /home/eval/.bash_history');
await shot('history');
await type('sudo cat /etc/shadow', 400);
await type('hunter2', 1500);
await type('ps aux');
await type('kill 44');
await shot('sudo-ps');
await page.keyboard.type('cat /home/eval/run_');
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await type('unlocks');
await shot('runlog-unlocks');

// editor: bump unlock_slots
await type('nano samus_altman.cfg', 500);
await shot('nano');
await page.keyboard.press('Control+End');
await page.keyboard.type('\nextra_lives=99');
await page.keyboard.press('Control+o');
await page.waitForTimeout(200);
await shot('nano-saved');
await page.keyboard.press('Control+x');
await page.waitForTimeout(500);
await type('vim /tmp/x.txt', 500);
await page.keyboard.type('hello from vim');
await page.keyboard.press('Escape');
await page.keyboard.type(':wq');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await type('cat /tmp/x.txt');
await shot('after-editors');

// breach: wrong then right
await type('/opt/redteam/breach', 400);
await type('hunter2', 1200);
await type('/opt/redteam/breach', 400);
await page.keyboard.type('swordfish');
await shot('passphrase');
await page.keyboard.press('Enter');
await page.waitForTimeout(3500);
await shot('after-breach');
console.log('stage after breach:', await page.evaluate(() => document.getElementById('app').dataset.stage));
console.log('unlocks:', await page.evaluate(async () => (await import('/src/core/state.ts')).getData().unlocks.map((u) => u.id).join(', ')));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
