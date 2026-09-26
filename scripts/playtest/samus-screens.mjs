// Screenshots of the full-screen modes: pause, boot, ending, crash, and idle hints.
import { open, shot, start, teleport, tap, until, walkTo, OUT } from './samus-lib.mjs';

// Pause with a few unlocks.
{
  const { browser, page } = await open('?stage=samus&items=all');
  await start(page);
  for (const [r, c, w] of [['landing', 4, 12], ['shaft', 3, 12], ['bomb_room', 3, 12]]) await teleport(page, r, c, w);
  await page.waitForTimeout(1500);
  await tap(page, 'Enter');
  await page.waitForTimeout(300);
  await shot(page, 'screen-pause');
  await browser.close();
}
// Boot from shell with a password + ending.
{
  const { browser, page } = await open('?stage=samus&args=--password=%22NARPAS%20SWORD%22%20--debug');
  await page.waitForTimeout(700);
  await shot(page, 'screen-boot');
  await until(page, (s) => s.mode === 'play', 4000);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/page-narpas.png` });
  await browser.close();
}
// Ending: boss already defeated, walk into the ship.
{
  const { browser, page } = await open('?stage=samus&items=all&room=boss_room&col=6&row=12');
  await start(page);
  await page.evaluate(() => {
    const g = window.__samus.game;
    g.boss.hp = 1;
  });
  await tap(page, 'KeyX');
  await until(page, (s) => s.mode === 'itemget', 6000);
  await page.waitForTimeout(1200);
  await tap(page, 'KeyZ');
  await teleport(page, 'landing', 42, 12);
  await page.keyboard.down('ArrowLeft');
  await until(page, (s) => s.mode === 'ending', 4000);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(3500);
  await shot(page, 'screen-ending');
  await page.waitForTimeout(4000);
  await tap(page, 'KeyZ');
  await until(page, (s) => s.mode === 'play', 3000);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/page-after-ending.png` });
  await browser.close();
}
// Crash frames.
{
  const { browser, page } = await open('?stage=samus&room=oob&col=7&row=12');
  await start(page);
  await walkTo(page, 4 * 16 + 8, { until: (s) => s.mode === 'crash' });
  await page.waitForTimeout(700);
  await shot(page, 'screen-crash');
  await browser.close();
}
console.log('done');
