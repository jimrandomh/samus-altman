// Render sprite candidates (JSON: {name: rows[]}) at 10x for eyeballing.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [, , jsonPath, out] = process.argv;
const sprites = JSON.parse(readFileSync(jsonPath, 'utf8'));
const pal = { k: '#301000', r: '#d82800', y: '#f8b800', g: '#58d854', w: '#fcfcfc', d: '#881400', o: '#fc7400' };
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 500 } });
await p.setContent('<body style="background:#223;margin:0"><canvas id=c width=1400 height=500></canvas></body>');
await p.evaluate(([sprites, pal]) => {
  const c = document.getElementById('c').getContext('2d');
  let ox = 10;
  for (const [name, rows] of Object.entries(sprites)) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(ox + x * 10, 10 + y * 10, 10, 10); } }));
    // 3x version
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(ox + x * 3, 360 + y * 3, 3, 3); } }));
    c.fillStyle = '#fff'; c.fillText(name, ox, 350);
    ox += Math.max(...rows.map((r) => r.length)) * 10 + 20;
  }
}, [sprites, pal]);
await p.screenshot({ path: out });
await b.close();
