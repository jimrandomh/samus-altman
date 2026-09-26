// Screenshot every room (with all items, so nothing blocks), plus title and pause.
import { open, shot, start, teleport, OUT } from './samus-lib.mjs';
import { writeFileSync } from 'node:fs';

const { browser, page, errors } = await open('?stage=samus&items=all');
await page.waitForTimeout(300);
await shot(page, 'title');
await page.screenshot({ path: `${OUT}/page-title.png` });
await start(page);
await page.waitForTimeout(400);
await shot(page, 'landing-start');
await page.screenshot({ path: `${OUT}/page-play.png` });
const rooms = process.argv.slice(2).length ? process.argv.slice(2) : [
  'landing:4:12', 'landing:40:12', 'landing:56:12', 'oob:20:12', 'oob:6:12', 'shaft:3:12', 'shaft:3:27', 'shaft:3:42',
  'missile_room:2:6', 'bomb_room:3:12', 'bomb_room:24:12', 'lower_hall:3:12', 'lower_hall:25:12', 'lower_hall:42:12',
  'varia_climb:3:21', 'varia_climb:10:6', 'norfair_shaft:13:12', 'norfair_shaft:2:27', 'norfair_shaft:10:42',
  'norfair_side:12:12', 'norfair_hall:3:12', 'norfair_hall:24:12', 'norfair_hall:44:12', 'tourian_hall:3:12',
  'tourian_hall:26:12', 'boss_room:3:12', 'escape_shaft:3:42', 'escape_shaft:7:4', 'dev_00:6:12', 'minus_1:7:12',
];
for (const spec of rooms) {
  const [room, col, row] = spec.split(':');
  await teleport(page, room, Number(col), Number(row));
  await page.waitForTimeout(250);
  await shot(page, `room-${room}-${col}-${row}`);
}
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await shot(page, 'pause');
writeFileSync(`${OUT}/errors.txt`, errors.join('\n'));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
