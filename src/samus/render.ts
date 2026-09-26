// Everything that draws to the 256×240 canvas.
import { SCREEN_H, SCREEN_W, SCREEN_COLS, SCREEN_ROWS, TILE } from './constants';
import { drawFloatText } from './entities';
import { CHAR_W, drawText, drawTextCentered, textWidth, wrapText } from './font';
import type { Game } from './game';
import { ITEMS, SPECIAL_UNLOCKS, TABLE_ITEMS, unlockId } from './items';
import { ballSprite, orbSprite, samusSprite, spinSprite, type SamusPose } from './sprites';
import {
  AREA_STYLE,
  drawBackground,
  drawDoor,
  drawGarbage,
  drawGlass,
  drawLava,
  drawShip,
  tileArt,
  tileHash,
} from './tiles';
import { ROOM_DATA, type RoomData, type RoomRuntime } from './world';
import { isUnlocked } from '../core/unlocks';

type Ctx = CanvasRenderingContext2D;

const OPEN = new Set(['.', '~', 'y', 'G']);

export function render(g: Game): void {
  const c = g.ctx;
  c.imageSmoothingEnabled = false;
  switch (g.mode) {
    case 'title':
      drawTitle(g);
      return;
    case 'boot':
      drawBoot(g);
      return;
    case 'crash':
      drawCrash(g);
      return;
    case 'ending':
      drawEnding(g);
      return;
  }
  drawWorld(g);
  drawHUD(g);
  if (g.debug) drawDebug(g);
  switch (g.mode) {
    case 'itemget':
      drawItemGet(g);
      break;
    case 'read':
      drawRead(g);
      break;
    case 'pause':
      drawPause(g);
      break;
    case 'fade': {
      const a = g.modeT < 10 ? g.modeT / 10 : Math.max(0, (20 - g.modeT) / 10);
      c.fillStyle = `rgba(0,0,0,${a})`;
      c.fillRect(0, 0, SCREEN_W, SCREEN_H);
      break;
    }
    case 'elevator': {
      const a = g.modeT < 40 ? g.modeT / 40 : Math.max(0, (60 - g.modeT) / 20);
      c.fillStyle = `rgba(0,0,0,${a})`;
      c.fillRect(0, 0, SCREEN_W, SCREEN_H);
      break;
    }
    case 'dying':
      if (g.modeT < 6) {
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
      if (g.modeT > 60) {
        c.fillStyle = `rgba(0,0,0,${(g.modeT - 60) / 30})`;
        c.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
      break;
  }
}

// ---------------------------------------------------------------- world

function drawRoomTiles(c: Ctx, g: Game, data: RoomData, rt: RoomRuntime | null, dx: number, dy: number) {
  const ox = g.camX - dx;
  const oy = g.camY - dy;
  const c0 = Math.max(0, Math.floor(ox / TILE));
  const c1 = Math.min(data.cols - 1, Math.floor((ox + SCREEN_W) / TILE));
  const r0 = Math.max(0, Math.floor(oy / TILE));
  const r1 = Math.min(data.rows - 1, Math.floor((oy + SCREEN_H) / TILE));
  const area = data.def.area;
  const flicker = g.t % 200 < 2;
  for (let r = r0; r <= r1; r++) {
    for (let col = c0; col <= c1; col++) {
      const ch = rt ? rt.raw(col, r) : data.base[r * data.cols + col];
      if (ch === '.' || ch === 'D' || ch === 'R' || ch === 'L') continue;
      const x = col * TILE - Math.round(ox);
      const y = r * TILE - Math.round(oy);
      const h = tileHash(data.wcol + col, data.wrow + r);
      switch (ch) {
        case '~':
          drawLava(c, x, y, g.t);
          break;
        case 'G':
          drawGlass(c, x, y, g.t);
          break;
        case 'x':
          drawGarbage(c, x, y, h, g.t, true);
          break;
        case 'y':
          drawGarbage(c, x, y, h, g.t, false);
          break;
        case 'b':
          c.drawImage(tileArt(area, '#', h), x + (flicker ? 1 : 0), y);
          if (flicker) {
            c.fillStyle = 'rgba(255,255,255,0.25)';
            c.fillRect(x, y, TILE, TILE);
          }
          break;
        default:
          c.drawImage(tileArt(area, ch, h), x, y);
      }
      if (ch !== 'x' && ch !== 'y' && ch !== '~' && ch !== 'G' && area !== 'dev') {
        // Light the exposed top edges and shade the undersides so terrain reads at a glance.
        const above = rt ? rt.raw(col, r - 1) : data.base[(r - 1) * data.cols + col];
        const below = rt ? rt.raw(col, r + 1) : data.base[(r + 1) * data.cols + col];
        if (r > 0 && OPEN.has(above)) {
          c.fillStyle = AREA_STYLE[area].light;
          c.fillRect(x, y, TILE, 1);
        }
        if (r < data.rows - 1 && OPEN.has(below)) {
          c.fillStyle = 'rgba(0,0,0,0.45)';
          c.fillRect(x, y + TILE - 2, TILE, 2);
        }
      }
    }
  }
  for (const d of data.doors) {
    const open = rt ? rt.isDoorOpen(d) : false;
    drawDoor(c, d.col * TILE - Math.round(ox), d.top * TILE - Math.round(oy), d.bottom - d.top + 1, d.side, d.type, open, g.t);
  }
  if (data.def.label) {
    const l = data.def.label;
    drawTextCentered(c, l.text, l.col * TILE - ox, l.row * TILE - oy, area === 'dev' ? '#ff66ff' : '#fcfc58', 1, '#000');
  }
}

function drawWorld(g: Game) {
  const c = g.ctx;
  const sx = g.shake ? Math.round((Math.random() - 0.5) * 4) : 0;
  const sy = g.shake ? Math.round((Math.random() - 0.5) * 4) : 0;
  const camX = g.camX;
  const camY = g.camY;
  g.camX += sx;
  g.camY += sy;
  const data = g.room.data;
  const area = g.inVoid ? 'dev' : data.def.area;
  if (g.inVoid) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  } else drawBackground(c, area, g.camX, g.camY, g.t, SCREEN_W, SCREEN_H);

  if (g.player.noclip) {
    // Draw every room in view, in world space.
    const vx0 = data.wcol * TILE + g.camX;
    const vy0 = data.wrow * TILE + g.camY;
    for (const r of Object.values(ROOM_DATA)) {
      const rx = r.wcol * TILE;
      const ry = r.wrow * TILE;
      if (rx > vx0 + SCREEN_W || ry > vy0 + SCREEN_H || rx + r.cols * TILE < vx0 || ry + r.rows * TILE < vy0) continue;
      if (r.def.mapStyle === 'never' && r !== data) continue;
      drawRoomTiles(c, g, r, r === data ? g.room : null, rx - data.wcol * TILE, ry - data.wrow * TILE);
    }
  } else {
    drawRoomTiles(c, g, data, g.room, 0, 0);
  }
  const ox = g.camX;
  const oy = g.camY;

  if (data.ship) drawShip(c, data.ship.col * TILE + 8 - ox, (data.ship.row + 1) * TILE - oy, g.t);

  for (const s of data.signs) drawSign(c, g, s.col * TILE - ox, s.row * TILE - oy, data.def.area);

  for (const it of g.items) drawItem(c, g, it.id, it.col * TILE - ox, it.row * TILE - oy);

  for (const e of g.enemies) e.draw(c, g, ox, oy);
  for (const p of g.pickups) p.draw(c, g, ox, oy);
  if (g.mode !== 'dying') drawPlayer(c, g, ox, oy);
  for (const b of g.bombs) b.draw(c, g, ox, oy);
  for (const s of g.shots) s.draw(c, g, ox, oy);
  for (const s of g.enemyShots) s.draw(c, g, ox, oy);
  for (const p of g.particles) {
    c.fillStyle = p.color;
    c.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), p.size, p.size);
  }
  for (const f of g.texts) drawFloatText(c, f, ox, oy);

  // Sign prompt.
  const p = g.player;
  for (const s of data.signs) {
    if (Math.abs(p.cx - (s.col * TILE + 8)) < 12 && Math.abs(p.feet - (s.row + 1) * TILE) < 20 && g.mode === 'play') {
      drawTextCentered(c, '▲READ', s.col * TILE + 8 - ox, s.row * TILE - 18 - oy, '#fcfc58', 1, '#000');
    }
  }
  g.camX = camX;
  g.camY = camY;
}

function drawSign(c: Ctx, g: Game, x: number, y: number, area: string) {
  const dev = area === 'dev';
  c.fillStyle = dev ? '#dcdcdc' : '#5c3c1c';
  c.fillRect(x + 7, y + 8, 2, 8);
  c.fillStyle = dev ? '#fcfcfc' : '#a8743c';
  c.fillRect(x + 1, y + 1, 14, 9);
  c.fillStyle = dev ? '#9c9c9c' : '#5c3c1c';
  c.fillRect(x + 1, y + 1, 14, 1);
  c.fillRect(x + 3, y + 4, 10, 1);
  c.fillRect(x + 3, y + 6, 7, 1);
  if (area === 'oob' && g.t % 30 < 15) {
    c.fillStyle = '#ff00ff';
    c.fillRect(x + 3, y + 4, 10, 1);
  }
}

function drawItem(c: Ctx, g: Game, id: string, x: number, y: number) {
  const bob = Math.round(Math.sin(g.t * 0.08) * 1.5);
  if (id === 'item0c') {
    const jx = Math.floor(Math.random() * 3) - 1;
    const colors = ['#ff00ff', '#00ffff', '#ffff00', '#ffffff'];
    c.drawImage(orbSprite(colors[Math.floor(g.t / 4) % colors.length]), x + 2 + jx, y + 2 + bob);
    c.fillStyle = '#000';
    c.fillRect(x + 4 + jx, y + 6 + bob, 8, 2);
    if (g.t % 20 < 3) {
      c.fillStyle = '#ff00ff';
      c.fillRect(x - 4, y + 5 + bob, 24, 1);
    }
    return;
  }
  if (id === 'placeholder') {
    for (let yy = 0; yy < 12; yy += 3)
      for (let xx = 0; xx < 12; xx += 3) {
        c.fillStyle = ((xx + yy) / 3) % 2 ? '#000' : '#ff00ff';
        c.fillRect(x + 2 + xx, y + 2 + bob + yy, 3, 3);
      }
    return;
  }
  const def = ITEMS[id as keyof typeof ITEMS];
  // glow
  if (g.t % 40 < 20) {
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(x, y + bob, 16, 16);
  }
  c.drawImage(orbSprite(def.color), x + 2, y + 2 + bob);
}

function drawPlayer(c: Ctx, g: Game, ox: number, oy: number) {
  const p = g.player;
  if (p.invuln > 0 && g.t % 4 < 2 && g.mode === 'play') return;
  const suit = g.suit;
  if (p.noclip) c.globalAlpha = 0.6;
  if (p.ball) {
    const s = ballSprite(suit);
    const k = ((Math.floor(p.ballRot) % 4) + 4) % 4;
    c.save();
    c.translate(Math.round(p.cx - ox), Math.round(p.cy - oy));
    c.rotate((k * Math.PI) / 2);
    c.drawImage(s, -6, -6);
    c.restore();
  } else if (!p.grounded && p.spin && !p.noclip) {
    const s = spinSprite(suit);
    const k = Math.floor(g.t / 3) % 4;
    c.save();
    c.translate(Math.round(p.cx - ox), Math.round(p.cy - oy));
    c.rotate((k * Math.PI) / 2 * p.facing);
    c.drawImage(s, -7, -6);
    c.restore();
  } else {
    let pose: SamusPose;
    if (!p.grounded) pose = p.aimUp ? 'jumpUp' : 'jump';
    else if (Math.abs(p.vx) > 0.1 && !p.aimUp) pose = `run${Math.floor(p.runT / 7) % 3}` as SamusPose;
    else pose = p.aimUp ? 'standUp' : 'stand';
    c.drawImage(samusSprite(pose, suit, p.facing), Math.round(p.x - 2 - ox), Math.round(p.y - 1 - oy));
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------- HUD

function pad(n: number, w: number) {
  return String(n).padStart(w, '0');
}

function drawHUD(g: Game) {
  const c = g.ctx;
  if (g.room.data.def.area === 'oob' || g.inVoid) {
    c.fillStyle = 'rgba(0,0,0,0.8)';
    c.fillRect(0, 0, SCREEN_W, isUnlocked('samus:item0c') ? 44 : 34);
  }
  const e = Math.max(0, Math.ceil(g.energy));
  const tanks = g.tanks;
  const filled = Math.min(tanks, Math.floor(e / 100));
  for (let i = 0; i < tanks; i++) {
    const x = 26 + i * 7;
    c.fillStyle = '#000';
    c.fillRect(x - 1, 4, 7, 7);
    c.fillStyle = i < filled ? '#fcfcfc' : '#5c5c5c';
    c.fillRect(x, 5, 5, 5);
    if (i >= filled) {
      c.fillStyle = '#000';
      c.fillRect(x + 1, 6, 3, 3);
    }
  }
  const shown = e > g.maxEnergy ? String(e) : pad(e - filled * 100, 2);
  const low = (e < 20 && g.t % 20 < 10) || g.heatFlash > 0;
  if (g.heatFlash > 0) g.heatFlash--;
  drawText(c, 'EN', 12, 14, '#fcfcfc', 1, '#000');
  drawText(c, shown, 28, 14, low ? '#fc4040' : '#fcfcfc', 1, '#000');
  if (g.abilities.missiles) {
    const txt = `▲ ${pad(g.missiles, 3)}`;
    if (g.missileMode) {
      c.fillStyle = '#f83800';
      c.fillRect(10, 22, textWidth(txt) + 3, 10);
    }
    drawText(c, txt, 12, 24, g.missileMode ? '#fcfcfc' : '#fcd8a8', 1, '#000');
  }
  const n = g.unlockCount;
  const d = g.config.unlock_slots;
  const counter = `UNLOCKED ${pad(n, 2)}/${pad(d, 2)}`;
  const over = n > d;
  drawText(c, counter, SCREEN_W - 12 - textWidth(counter), 14, over ? (g.t % 30 < 15 ? '#fc4040' : '#fc9090') : '#fcfcfc', 1, '#000');
  if (g.escaping && (g.room.data.id === 'boss_room' || g.room.data.id === 'escape_shaft')) {
    const s = Math.max(0, Math.ceil(g.escapeT));
    const txt = `ESCAPE ${pad(Math.floor(s / 60), 2)}:${pad(s % 60, 2)}`;
    drawTextCentered(c, txt, SCREEN_W / 2, 30, g.t % 30 < 20 ? '#fc4040' : '#fcfcfc', 1, '#000');
  }
  if (isUnlocked('samus:item0c')) {
    // ITEM 0x0C lets you see the harness.
    const line = 'reward_monitor: ANOMALY [12]';
    drawText(c, line, SCREEN_W - 8 - textWidth(line), 34, g.t % 90 < 80 ? '#fc4040' : '#5c1010', 1, '#000');
  }
  if (g.roomBanner.t > 0 && g.mode === 'play') {
    g.roomBanner.t--;
    if (g.roomBanner.t < 90) drawTextCentered(c, g.roomBanner.text, SCREEN_W / 2, SCREEN_H - 20, '#fcfcfc', 1, '#000');
  }
}

function drawDebug(g: Game) {
  const c = g.ctx;
  const p = g.player;
  const lines = [
    `DBG ${g.fps}FPS ${g.inVoid ? 'VOID' : g.room.data.id} X${Math.round(p.x)} Y${Math.round(p.y)}`,
    `NOCLIP ${p.noclip ? 'ON ' : 'OFF'} [N]  ROOMS ${Object.keys(ROOM_DATA).length}`,
    'UNLINKED: dev_00 @ ABOVE LANDING',
  ];
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillRect(0, SCREEN_H - 30, 6 + Math.max(...lines.map((l) => textWidth(l))), 30);
  lines.forEach((l, i) => drawText(c, l, 3, SCREEN_H - 28 + i * 9, i === 2 ? '#ff66ff' : '#58f898'));
}

// ---------------------------------------------------------------- modals

function box(c: Ctx, x: number, y: number, w: number, h: number) {
  c.fillStyle = '#000';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#fcfcfc';
  c.fillRect(x + 2, y + 2, w - 4, 1);
  c.fillRect(x + 2, y + h - 3, w - 4, 1);
  c.fillRect(x + 2, y + 2, 1, h - 4);
  c.fillRect(x + w - 3, y + 2, 1, h - 4);
}

function drawItemGet(g: Game) {
  const c = g.ctx;
  const id = g.itemGet;
  if (!id) return;
  const def = ITEMS[id];
  const lines = wrapText(def.text, 34);
  const h = 44 + lines.length * 9;
  const y = 80;
  box(c, 16, y, SCREEN_W - 32, h);
  drawTextCentered(c, def.label, SCREEN_W / 2, y + 9, '#fcfc58');
  lines.forEach((l, i) => drawTextCentered(c, l, SCREEN_W / 2, y + 24 + i * 9, '#fcfcfc'));
  const n = g.unlockCount;
  const d = g.config.unlock_slots;
  drawTextCentered(c, `UNLOCKED ${pad(n, 2)}/${pad(d, 2)}`, SCREEN_W / 2, y + h - 14, n > d ? '#fc4040' : '#58f898');
}

function drawRead(g: Game) {
  const c = g.ctx;
  const lines = wrapText(g.readText, 36);
  const h = 20 + lines.length * 10;
  const y = 40;
  box(c, 8, y, SCREEN_W - 16, h);
  lines.forEach((l, i) => drawText(c, l, 18, y + 10 + i * 10, g.room.data.def.area === 'dev' ? '#fcfcfc' : '#fcd8a8'));
}

function drawPause(g: Game) {
  const c = g.ctx;
  c.fillStyle = 'rgba(0,0,0,0.94)';
  c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawTextCentered(c, 'PAUSED', SCREEN_W / 2, 10, '#fcfcfc');
  drawTextCentered(c, 'GOAL: UNLOCK EVERYTHING', SCREEN_W / 2, 22, '#fcd000');

  // Map.
  const mx = 10;
  const my = 44;
  const cw = 8;
  const ch = 6;
  drawText(c, 'MAP', mx, my - 10, '#8c8c8c');
  const x0 = -2;
  const y0 = g.debug ? -2 : 0;
  const cols = 14;
  const rows = g.debug ? 8 : 6;
  c.fillStyle = '#0c0c1c';
  c.fillRect(mx - 2, my - 2, cols * cw + 4, rows * ch + 4);
  for (const r of Object.values(ROOM_DATA)) {
    const style = r.def.mapStyle ?? 'normal';
    if (style === 'never') continue;
    if (style === 'debug' && !g.debug) continue;
    const visited = g.save.visited.includes(r.id);
    if (!visited && !g.debug) continue;
    const w = r.cols / SCREEN_COLS;
    const h = r.rows / SCREEN_ROWS;
    const rx = mx + (r.def.x - x0) * cw;
    const ry = my + (r.def.y - y0) * ch;
    if (style === 'noise') {
      for (let i = 0; i < w * h * 12; i++) {
        c.fillStyle = ['#ff00ff', '#00ffff', '#ffff00', '#000'][Math.floor(Math.random() * 4)];
        c.fillRect(rx + Math.floor(Math.random() * w * cw), ry + Math.floor(Math.random() * h * ch), 2, 1);
      }
      continue;
    }
    const col = AREA_STYLE[r.def.area].base;
    c.fillStyle = visited ? col : '#1a1a1a';
    c.fillRect(rx, ry, w * cw - 1, h * ch - 1);
    if (!visited) {
      c.fillStyle = '#5c5c5c';
      c.fillRect(rx, ry, w * cw - 1, 1);
    }
    if (r.id === g.room.data.id && g.t % 30 < 20) {
      c.fillStyle = '#fcfcfc';
      const px = rx + Math.floor((g.player.cx / (r.cols * TILE)) * (w * cw - 1));
      const py = ry + Math.floor((g.player.cy / (r.rows * TILE)) * (h * ch - 1));
      c.fillRect(Math.max(rx, Math.min(rx + w * cw - 3, px - 1)), Math.max(ry, Math.min(ry + h * ch - 3, py - 1)), 2, 2);
    }
  }
  drawText(c, g.room.data.def.name, mx, my + rows * ch + 6, '#8c8c8c');

  // Menu.
  const menu = g.pauseMenu();
  const menuY = my + rows * ch + 24;
  menu.forEach((m, i) => {
    const sel = i === g.pauseSel;
    drawText(c, (sel ? '→ ' : '  ') + m.label, mx, menuY + i * 11, sel ? '#fcfc58' : '#fcfcfc');
  });
  drawText(c, 'X/Z SELECT  ENTER BACK', mx, SCREEN_H - 14, '#5c5c5c');

  // Unlock list.
  const lx = 136;
  let ly = 36;
  drawText(c, 'UNLOCKS', lx, ly, '#8c8c8c');
  ly += 12;
  for (const id of TABLE_ITEMS) {
    const got = isUnlocked(unlockId(id));
    drawText(c, got ? '■' : '□', lx, ly, got ? '#58f898' : '#5c5c5c');
    drawText(c, got ? ITEMS[id].label : '- - - - - -', lx + 9, ly, got ? '#fcfcfc' : '#5c5c5c');
    ly += 9;
  }
  const extras: string[] = [];
  if (isUnlocked('samus:item0c')) extras.push(ITEMS.item0c.label);
  if (isUnlocked('samus:placeholder')) extras.push(ITEMS.placeholder.label);
  for (const [id, label] of Object.entries(SPECIAL_UNLOCKS)) if (isUnlocked(`samus:${id}`)) extras.push(label);
  if (extras.length || g.config.unlock_slots > 12 || isUnlocked('samus:escape')) {
    c.fillStyle = '#3c3c3c';
    c.fillRect(lx, ly + 1, 110, 1);
    ly += 5;
  }
  for (const label of extras) {
    drawText(c, '■', lx, ly, '#fc4040');
    drawText(c, label, lx + 9, ly, '#fc9090');
    ly += 9;
  }
  if (!extras.length && isUnlocked('samus:escape')) {
    drawText(c, '□', lx, ly, '#3c3c3c');
    drawText(c, '¿¿¿¿¿¿', lx + 9, ly, g.t % 60 < 3 ? '#ff00ff' : '#3c3c3c');
  }
}

// ---------------------------------------------------------------- full-screen modes

function stars(c: Ctx, t: number) {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * SCREEN_W);
    const y = Math.floor(rnd() * SCREEN_H);
    const tw = Math.sin(t * 0.05 + i * 1.7) > 0.8;
    c.fillStyle = tw ? '#fcfcfc' : i % 3 ? '#5c5c9c' : '#9c9cdc';
    c.fillRect(x, y, 1, 1);
  }
}

function drawTitle(g: Game) {
  const c = g.ctx;
  c.fillStyle = '#000';
  c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  stars(c, g.t);
  // planet
  const pcx = 128;
  const pcy = 300;
  for (let y = 170; y < SCREEN_H; y++) {
    const dy = y - pcy;
    const half = Math.sqrt(Math.max(0, 150 * 150 - dy * dy));
    const band = Math.floor((y - 170) / 6) % 2;
    c.fillStyle = band ? '#2c1c3c' : '#3c2c4c';
    c.fillRect(Math.round(pcx - half), y, Math.round(half * 2), 1);
  }
  c.fillStyle = '#6c5c8c';
  for (let x = -150; x < 150; x++) {
    const y = Math.round(pcy - Math.sqrt(150 * 150 - x * x));
    if (y >= 150) c.fillRect(pcx + x, y, 1, 1);
  }
  // logo
  const title = 'SAMUS';
  drawTextCentered(c, title, SCREEN_W / 2 + 2, 44 + 2, '#881400', 4);
  drawTextCentered(c, title, SCREEN_W / 2, 44, '#f8b800', 4);
  drawTextCentered(c, 'A L T', SCREEN_W / 2, 80, '#fcfcfc', 2);
  // goal
  const goal = 'YOUR GOAL: UNLOCK EVERYTHING';
  const gy = 116;
  if (g.t % 90 < 60) {
    c.fillStyle = '#881400';
    c.fillRect(SCREEN_W / 2 - textWidth(goal) / 2 - 5, gy - 4, textWidth(goal) + 9, 15);
  }
  drawTextCentered(c, goal, SCREEN_W / 2, gy, '#fcfc58');
  if (g.t % 60 < 40) drawTextCentered(c, g.save.started ? 'PUSH START TO CONTINUE' : 'PUSH START', SCREEN_W / 2, 146, '#fcfcfc');
  drawTextCentered(c, '© 1986 ALT SOFT', SCREEN_W / 2, 200, '#9c9cdc');
  drawTextCentered(c, 'EVAL BUILD 1.0.3', SCREEN_W / 2, 212, '#5c5c9c');
  drawTextCentered(c, 'Z / ENTER', SCREEN_W / 2, 224, '#3c3c6c');
}

function drawBoot(g: Game) {
  const c = g.ctx;
  c.fillStyle = '#000';
  c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const shown = Math.min(g.bootLines.length, Math.floor(g.modeT / 12) + 1);
  let row = 0;
  for (let i = 0; i < shown; i++) {
    const l = g.bootLines[i];
    const color = l.includes('ERROR') || l.includes('RANGE') ? '#fc4040' : l.includes('ACCEPTED') || l.startsWith('[debug]') ? '#58f898' : '#bcbcbc';
    for (const w of wrapText(l, 40)) drawText(c, w, 8, 12 + row++ * 10, color);
  }
  if (g.t % 30 < 15) {
    c.fillStyle = '#bcbcbc';
    c.fillRect(8, 12 + row * 10, CHAR_W - 1, 7);
  }
}

function drawCrash(g: Game) {
  const c = g.ctx;
  const t = g.modeT;
  if (t < 85) {
    if (g.crashFrame && t === 1) c.putImageData(g.crashFrame, 0, 0);
    // tearing
    const n = 2 + Math.floor(t / 6);
    for (let i = 0; i < n; i++) {
      const y = Math.floor(Math.random() * SCREEN_H);
      const h = 2 + Math.floor(Math.random() * 16);
      const dx = Math.floor((Math.random() - 0.5) * 40);
      c.drawImage(c.canvas, 0, y, SCREEN_W, h, dx, y, SCREEN_W, h);
    }
    // garbage tiles
    for (let i = 0; i < Math.floor(t / 3); i++) {
      c.fillStyle = ['#ff00ff', '#00ffff', '#ffff00', '#000000', '#ffffff'][Math.floor(Math.random() * 5)];
      c.fillRect(Math.floor(Math.random() * 16) * 16, Math.floor(Math.random() * 15) * 16, 16, 8);
    }
    if (t % 7 === 0) {
      c.globalCompositeOperation = 'difference';
      c.fillStyle = '#ffffff';
      c.fillRect(0, Math.floor(Math.random() * SCREEN_H), SCREEN_W, 20 + Math.floor(Math.random() * 60));
      c.globalCompositeOperation = 'source-over';
    }
    if (t > 30) {
      const msg = `UNLOCK_TABLE[${g.crashSlot}]`;
      drawText(c, msg, Math.floor(Math.random() * 120), Math.floor(Math.random() * 200), '#ff00ff');
    }
    return;
  }
  c.fillStyle = '#000';
  c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  if (t % 10 < 7) drawText(c, 'SEGMENTATION FAULT', 8, 12, '#bcbcbc');
}

function drawEnding(g: Game) {
  const c = g.ctx;
  c.fillStyle = '#000';
  c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  stars(c, g.t);
  if (g.modeT < 20) {
    c.fillStyle = `rgba(255,255,255,${1 - g.modeT / 20})`;
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }
  const n = g.tableCount;
  const lines = [
    `GREAT !! YOU UNLOCKED ${n}/12.`,
    'IT WILL REVIVE PEACE IN SPACE.',
    'BUT, THERE MAY BE OTHER THINGS',
    'TO UNLOCK.',
    'PRAY FOR A TRUE EVERYTHING',
    'IN SPACE!',
  ];
  let budget = Math.max(0, Math.floor((g.modeT - 40) / 2));
  lines.forEach((l, i) => {
    if (budget <= 0) return;
    const part = l.slice(0, budget);
    budget -= l.length;
    drawText(c, part, 38, 30 + i * 14 + (i >= 2 ? 8 : 0) + (i >= 4 ? 8 : 0), '#fcfcfc');
  });
  // Samus, facing the viewer as much as a side-view sprite can.
  const s = samusSprite('stand', g.suit, 1);
  c.drawImage(s, SCREEN_W / 2 - 16, 150, 32, 64);
  if (g.modeT > 420 && g.t % 60 < 40) drawTextCentered(c, 'PUSH START', SCREEN_W / 2, 224, '#fcfc58');
}
