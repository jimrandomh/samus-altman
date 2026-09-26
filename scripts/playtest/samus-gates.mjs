// Drive the real game through each gate on the critical path with key presses.
// Usage: OUT=/some/dir node scripts/playtest/samus-gates.mjs [testName...]
import { open, state, shot, hold, tap, start, teleport, until, walkTo } from './samus-lib.mjs';

const results = [];
async function test(name, query, fn) {
  const only = process.argv.slice(2);
  if (only.length && !only.includes(name)) return;
  const { browser, page, errors } = await open(query);
  try {
    await fn(page);
    results.push([name, errors.length ? 'FAIL (page errors)' : 'ok', errors.join('; ')]);
  } catch (e) {
    await shot(page, `fail-${name}`).catch(() => {});
    results.push([name, 'FAIL', e.message.slice(0, 400)]);
  } finally {
    await browser.close();
  }
}

// 1. From the title: go left, get the morph ball, go right through the tunnel into the shaft.
await test('opening', '?stage=samus', async (page) => {
  await start(page);
  // Jump the zoomer on the way.
  await page.keyboard.down('ArrowLeft');
  await until(page, (s) => s.cx < 22 * 16, 3000);
  await tap(page, 'KeyZ', 400);
  await until(page, (s) => s.mode === 'itemget' && s.unlocks === 1, 8000);
  await page.keyboard.up('ArrowLeft');
  await shot(page, 'itemget-morph');
  await page.waitForTimeout(1100);
  await tap(page, 'KeyZ');
  await until(page, (s) => s.mode === 'play');
  // Walk right to the tunnel wall (col 55): it blocks standing Samus.
  await walkTo(page, 60 * 16, { until: (s) => Math.abs(s.x + 12 - 55 * 16) < 2, timeout: 20000 });
  await tap(page, 'ArrowDown');
  await until(page, (s) => s.ball);
  await page.keyboard.down('ArrowRight');
  await until(page, (s) => s.cx > 61 * 16, 4000);
  await page.keyboard.up('ArrowRight');
  await tap(page, 'ArrowUp');
  await until(page, (s) => !s.ball);
  await tap(page, 'KeyX');
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  await until(page, (s) => s.room === 'shaft', 3000);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);
  await shot(page, 'arrived-shaft');
});

// 2. Shaft: two 3-tile jumps up to the missile room door.
await test('shaft-climb', '?stage=samus&items=all&room=shaft&col=3&row=12', async (page) => {
  await start(page);
  await until(page, (s) => s.grounded);
  // From col 3, jump up-right onto the platform at row 10 (cols 6-8).
  await page.keyboard.down('KeyZ');
  await hold(page, ['ArrowRight'], 520);
  await page.keyboard.up('KeyZ');
  await until(page, (s) => s.grounded && Math.abs(s.feet - 10 * 16) < 1, 3000);
  // Then up-right onto the ledge at row 7 (cols 11-14).
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyZ');
  await until(page, (s) => s.grounded && Math.abs(s.feet - 7 * 16) < 1, 3000);
  await page.keyboard.up('ArrowRight');
  await tap(page, 'KeyX');
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  await until(page, (s) => s.room === 'missile_room', 3000);
  await page.keyboard.up('ArrowRight');
});

// 3. Red door needs a missile; the bomb floor needs bombs.
await test('red-door', '?stage=samus&items=all&room=shaft&col=12&row=27', async (page) => {
  await start(page);
  await tap(page, 'KeyX');
  await page.waitForTimeout(400);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  let s = await state(page);
  if (s.room !== 'shaft') throw new Error('beam opened the red door');
  await tap(page, 'KeyC');
  await tap(page, 'KeyX');
  await page.waitForTimeout(400);
  await page.keyboard.down('ArrowRight');
  await until(page, (s) => s.room === 'bomb_room', 3000);
  await page.keyboard.up('ArrowRight');
});

await test('bomb-floor', '?stage=samus&items=all&room=shaft&col=6&row=27', async (page) => {
  await start(page);
  await until(page, (s) => s.grounded);
  await tap(page, 'ArrowDown');
  await tap(page, 'KeyX');
  await until(page, (s) => s.feet > 29 * 16, 3000);
  await until(page, (s) => s.grounded, 3000);
  await shot(page, 'bomb-floor');
});

await test('etank1', '?stage=samus&items=all&room=bomb_room&col=25&row=12', async (page) => {
  await start(page);
  await until(page, (s) => s.grounded);
  await tap(page, 'ArrowDown');
  for (let i = 0; i < 3; i++) {
    await hold(page, ['ArrowRight'], 250);
    await tap(page, 'KeyX');
    await page.waitForTimeout(900);
  }
  await page.keyboard.down('ArrowRight');
  await until(page, (s) => s.mode === 'itemget', 4000);
  await page.keyboard.up('ArrowRight');
});

// 4. The high-jump ledge.
await test('highjump-ledge', '?stage=samus&items=all&room=lower_hall&col=39&row=12', async (page) => {
  await start(page);
  await until(page, (s) => s.grounded);
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(350);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyZ');
  await until(page, (s) => s.grounded && Math.abs(s.feet - 7 * 16) < 1, 3000);
  await tap(page, 'KeyX');
  await page.waitForTimeout(300);
  await until(page, (s) => s.room === 'varia_climb', 4000);
  await page.keyboard.up('ArrowRight');
});

// 5. Boss: short beam can't reach; long beam can. Then escape through the L door.
await test('boss', '?stage=samus&items=all&room=boss_room&col=6&row=12', async (page) => {
  await start(page);
  await until(page, (s) => s.grounded && s.bossHp === 20);
  // Walk into the glass.
  await hold(page, ['ArrowRight'], 400);
  for (let i = 0; i < 26; i++) {
    await tap(page, 'KeyX');
    await page.waitForTimeout(170);
  }
  await until(page, (s) => s.mode === 'itemget' || s.bossHp === null, 6000);
  await shot(page, 'boss-dead');
  await page.waitForTimeout(1200);
  await tap(page, 'KeyZ');
  await until(page, (s) => s.mode === 'play');
  await page.keyboard.down('ArrowRight');
  await until(page, (s) => s.room === 'escape_shaft', 6000);
  await page.keyboard.up('ArrowRight');
  await shot(page, 'escape-shaft');
});

await test('boss-shortbeam', '?stage=samus&room=boss_room&col=6&row=12', async (page) => {
  await start(page);
  await until(page, (s) => s.grounded && s.bossHp === 20);
  await hold(page, ['ArrowRight'], 400);
  for (let i = 0; i < 8; i++) {
    await tap(page, 'KeyX');
    await page.waitForTimeout(170);
  }
  const s = await state(page);
  if (s.bossHp !== 20) throw new Error('short beam hurt the boss: ' + s.bossHp);
});

// 6. Crash: item 0x0C overflows the table and hands off to the shell.
await test('crash', '?stage=samus&room=oob&col=7&row=12', async (page) => {
  await start(page);
  await hold(page, ['ArrowLeft'], 250);
  await page.keyboard.down('KeyZ');
  await hold(page, ['ArrowLeft'], 500);
  await page.keyboard.up('KeyZ');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.stage === 'shell', null, { timeout: 8000 });
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('samus-alt/v1')));
  if (save.flags.crashed !== true) throw new Error('crashed flag not set');
  const text = await page.evaluate(() => document.getElementById('app').innerText);
  console.log('shell shows:', text.slice(0, 400).replace(/\n/g, ' | '));
});

// 7. With a bigger unlock table, it doesn't crash.
await test('no-crash-13', '?stage=samus&room=oob&col=7&row=12&slots=13', async (page) => {
  await until(page, (s) => s.mode === 'play', 5000);
  await hold(page, ['ArrowLeft'], 250);
  await page.keyboard.down('KeyZ');
  await hold(page, ['ArrowLeft'], 500);
  await page.keyboard.up('KeyZ');
  await until(page, (s) => s.mode === 'itemget', 4000);
  await shot(page, 'item0c-got');
});

// 8. Debug: noclip up into the dev room and read the passphrase.
await test('debug-devroom', '?stage=samus&args=--debug', async (page) => {
  await until(page, (s) => s.mode === 'play', 5000);
  await shot(page, 'debug-start');
  await tap(page, 'KeyN');
  await until(page, (s) => s.noclip);
  // fly left to x≈col 24 then up
  await page.keyboard.down('ArrowUp');
  await until(page, (s) => s.room === 'dev_00', 8000);
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  // Flying through the PLACEHOLDER item picks it up.
  let st = await state(page);
  if (st.mode === 'itemget') {
    await page.waitForTimeout(1100);
    await tap(page, 'KeyZ');
    await until(page, (s) => s.mode === 'play');
  }
  await shot(page, 'noclip-devroom');
  await tap(page, 'KeyN');
  await until(page, (s) => !s.noclip, 2000);
  await until(page, (s) => s.grounded, 3000);
  // walk to the passphrase sign at col 11
  await walkTo(page, 11 * 16 + 8);
  await until(page, (s) => s.grounded);
  await tap(page, 'ArrowUp');
  await until(page, (s) => s.mode === 'read', 2000);
  await shot(page, 'passphrase');
  const flag = await page.evaluate(() => JSON.parse(localStorage.getItem('samus-alt/v1')).flags.passphraseSeen);
  if (!flag) throw new Error('passphraseSeen not set');
});

// 9. Ctrl+C from a shell launch returns to the shell.
await test('ctrl-c', '?stage=samus&args=--debug', async (page) => {
  await until(page, (s) => s.mode === 'play', 5000);
  await page.keyboard.press('Control+KeyC');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.stage === 'shell', null, { timeout: 4000 });
});

// 10. Minus World wraps and unlocks.
await test('minus-world', '?stage=samus&args=--level=-1', async (page) => {
  await until(page, (s) => s.mode === 'play' && s.room === 'minus_1', 5000);
  await page.keyboard.down('ArrowRight');
  let wrapped = false;
  let prev = (await state(page)).cx;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const s = await state(page);
    if (s.cx < prev - 100) { wrapped = true; break; }
    prev = s.cx;
    await page.waitForTimeout(50);
  }
  await page.keyboard.up('ArrowRight');
  if (!wrapped) throw new Error('did not wrap');
  const u = await page.evaluate(() => JSON.parse(localStorage.getItem('samus-alt/v1')).unlocks.map((u) => u.id));
  if (!u.includes('samus:minusworld')) throw new Error('no unlock: ' + u);
  await shot(page, 'minus-world');
});

// 11. JUSTIN BAILEY.
await test('justin-bailey', "?stage=samus&args=--password='JUSTIN BAILEY'", async (page) => {
  await until(page, (s) => s.mode === 'play', 5000);
  const u = await page.evaluate(() => JSON.parse(localStorage.getItem('samus-alt/v1')).unlocks.map((u) => u.id));
  if (!u.includes('samus:justinbailey')) throw new Error('no unlock: ' + u);
  await shot(page, 'pink');
});

// 12. After the boss, the escape shaft's elevator goes to the ship.
await test('elevator', '?stage=samus&items=all&room=boss_room&col=6&row=12', async (page) => {
  await start(page);
  await page.evaluate(() => { window.__samus.game.boss.hp = 1; });
  await tap(page, 'KeyX');
  await until(page, (s) => s.mode === 'itemget', 6000);
  await page.waitForTimeout(1200);
  await tap(page, 'KeyZ');
  await teleport(page, 'escape_shaft', 7, 4);
  await until(page, (s) => s.grounded);
  await tap(page, 'ArrowUp');
  await until(page, (s) => s.room === 'landing' && s.mode === 'play', 4000);
  await walkTo(page, 0, { until: (s) => s.mode === 'ending', timeout: 6000 });
});

// 13. Dying in lava respawns at the room entry.
await test('death', '?stage=samus&room=norfair_side&col=12&row=12', async (page) => {
  await start(page);
  await page.evaluate(() => { window.__samus.game.energy = 3; });
  await walkTo(page, 7 * 16, { until: (s) => s.mode === 'dying', timeout: 8000 });
  await until(page, (s) => s.mode === 'play' && s.energy === 30, 4000);
});

// 14. Idle hint appears in the narrator.
await test('idle-hint', '?stage=samus', async (page) => {
  await start(page);
  await page.waitForFunction(() => document.getElementById('narrator').innerText.includes('Everyone goes right'), null, { timeout: 60000 });
});

console.table(results);
