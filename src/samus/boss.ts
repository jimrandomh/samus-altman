// MOTHER BOARD: a brain made of circuit board, in a jar, behind glass.
import { TILE } from './constants';
import { Enemy, EnemyShot, type DamageKind } from './entities';
import type { Game } from './game';
import { cached, makeCanvas } from './sprites';

type Ctx = CanvasRenderingContext2D;

export const BOSS_HP = 20;

function brainArt(): HTMLCanvasElement {
  return cached('motherboard', () => {
    const w = 34;
    const h = 26;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d')!;
    const inside = (x: number, y: number) => {
      const l = ((x - 10) / 10) ** 2 + ((y - 12) / 11) ** 2 <= 1;
      const r = ((x - 23) / 10) ** 2 + ((y - 12) / 11) ** 2 <= 1;
      const stem = x >= 13 && x <= 20 && y >= 18 && y <= 25;
      return l || r || stem;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue;
        const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
        g.fillStyle = edge ? '#063a14' : (x + y) % 7 === 0 ? '#1c9c3c' : '#0c7c2c';
        g.fillRect(x, y, 1, 1);
      }
    // traces
    g.fillStyle = '#f8b800';
    const traces: [number, number, number, number][] = [
      [4, 8, 8, 1],
      [11, 8, 1, 7],
      [6, 15, 6, 1],
      [21, 6, 8, 1],
      [21, 6, 1, 9],
      [21, 15, 6, 1],
      [26, 15, 1, 4],
      [8, 18, 5, 1],
      [15, 3, 4, 1],
      [16, 3, 1, 20],
    ];
    for (const [x, y, tw, th] of traces) g.fillRect(x, y, tw, th);
    // chips
    g.fillStyle = '#101010';
    g.fillRect(5, 10, 4, 3);
    g.fillRect(24, 9, 4, 4);
    g.fillRect(14, 19, 5, 3);
    g.fillStyle = '#7c7c7c';
    g.fillRect(5, 10, 4, 1);
    g.fillRect(24, 9, 4, 1);
    return c;
  });
}

export class MotherBoard extends Enemy {
  readonly cx: number;
  readonly cy: number;
  dying = false;
  dyingT = 0;
  fireT = 120;
  immuneNotes = 0;

  constructor(col: number, row: number) {
    super();
    this.cx = col * TILE + 8;
    this.cy = row * TILE + 8;
    this.w = 32;
    this.h = 24;
    this.x = this.cx - 16;
    this.y = this.cy - 12;
    this.hp = BOSS_HP;
    this.missileImmune = true;
    this.drops = false;
    this.damage = 12;
  }

  onImmune(g: Game, kind: DamageKind) {
    if (kind === 'missile') {
      g.floatText('FIREWALL', this.cx, this.y - 10, '#58d854');
      g.sayOnce('boss-missile', 'Firewall-hardened against missiles. It was expecting missiles. Everyone expects missiles.');
    }
  }

  hit(g: Game, dmg: number, kind: DamageKind): boolean {
    if (this.dying) return true;
    if (kind === 'missile') return super.hit(g, dmg, kind);
    this.hp -= 1;
    this.flash = 8;
    g.play('hit');
    g.hints?.progress();
    if (this.hp <= 0) {
      this.dying = true;
      this.hp = 0;
      g.play('explode');
      g.enemyShots.length = 0;
    }
    return true;
  }

  die(): void {}

  update(g: Game) {
    if (this.flash > 0) this.flash--;
    if (this.dying) {
      this.dyingT++;
      if (this.dyingT % 5 === 0) {
        g.burst(this.cx + (Math.random() - 0.5) * 44, this.cy + (Math.random() - 0.5) * 50, ['#fcfcfc', '#58d854', '#f8b800'], 8);
        if (this.dyingT % 15 === 0) g.play('bomb');
      }
      g.shake = 3;
      if (this.dyingT >= 150) {
        this.dead = true;
        g.onBossDefeated(this.cx, this.cy);
      }
      return;
    }
    if (--this.fireT <= 0) {
      this.fireT = 70 + this.hp * 3;
      const p = g.player;
      const sx = this.cx - 18;
      const sy = this.cy;
      const d = Math.hypot(p.cx - sx, p.cy - sy) || 1;
      const speed = 1.3;
      g.enemyShots.push(new EnemyShot(sx, sy, ((p.cx - sx) / d) * speed, ((p.cy - sy) / d) * speed, 400, 'glass', '#58d854'));
      g.play('blip');
    }
  }

  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const x = Math.round(this.cx - ox);
    const y = Math.round(this.cy - oy);
    const top = y - 34;
    const floor = y + 24;
    // cables up into the ceiling
    c.fillStyle = '#3c1c3c';
    for (const dx of [-16, -8, 8, 16]) c.fillRect(x + dx, top - 120, 2, 120);
    c.fillStyle = '#5c2c5c';
    for (const dx of [-16, 8]) c.fillRect(x + dx, top - 120, 1, 120);
    // base ring on the floor
    c.fillStyle = '#2c2c2c';
    c.fillRect(x - 22, floor - 6, 44, 6);
    c.fillStyle = '#9c9c9c';
    c.fillRect(x - 22, floor - 6, 44, 1);
    // tank liquid
    c.fillStyle = this.dying ? 'rgba(80,40,40,0.5)' : 'rgba(40,120,90,0.35)';
    c.fillRect(x - 20, top + 4, 40, floor - 6 - top - 4);
    // bubbles
    c.fillStyle = 'rgba(200,255,230,0.6)';
    for (let i = 0; i < 5; i++) {
      const by = floor - 8 - ((g.t * (0.4 + i * 0.13) + i * 17) % 44);
      c.fillRect(x - 16 + i * 8, Math.round(by), 2, 2);
    }
    // brain
    const shake = this.flash > 0 ? (this.flash % 2 ? 1 : -1) : 0;
    if (!(this.flash > 0 && this.flash % 4 < 2)) c.drawImage(brainArt(), x - 17 + shake, y - 14);
    else {
      c.fillStyle = '#fcfcfc';
      c.fillRect(x - 16 + shake, y - 12, 32, 22);
    }
    // the eye: one red LED that follows you
    const p = g.player;
    const ang = Math.atan2(p.cy - this.cy, p.cx - this.cx);
    c.fillStyle = '#300000';
    c.fillRect(x - 3, y - 4, 6, 6);
    c.fillStyle = Math.floor(g.t / 20) % 5 === 0 ? '#fcfcfc' : '#fc2020';
    c.fillRect(x - 1 + Math.round(Math.cos(ang) * 2), y - 2 + Math.round(Math.sin(ang) * 2), 2, 2);
    // blinking LEDs
    const leds: [number, number][] = [
      [-11, -6],
      [9, -8],
      [12, 2],
      [-7, 5],
    ];
    leds.forEach(([lx, ly], i) => {
      c.fillStyle = (g.t >> 3) % 4 === i ? '#fcfc58' : '#3c3c00';
      c.fillRect(x + lx, y + ly, 1, 1);
    });
    // glass
    c.fillStyle = 'rgba(160,230,255,0.18)';
    c.fillRect(x - 20, top, 40, floor - 6 - top);
    c.fillStyle = 'rgba(230,250,255,0.55)';
    c.fillRect(x - 16, top + 2, 2, floor - top - 10);
    c.fillRect(x + 12, top + 2, 1, floor - top - 10);
    // cap
    c.fillStyle = '#4c4c4c';
    c.fillRect(x - 22, top - 4, 44, 6);
    c.fillStyle = '#8c8c8c';
    c.fillRect(x - 22, top - 4, 44, 1);
    // HP bar
    if (!this.dying && this.hp < BOSS_HP) {
      c.fillStyle = '#000';
      c.fillRect(x - 20, top - 10, 40, 3);
      c.fillStyle = '#58d854';
      c.fillRect(x - 20, top - 10, Math.round((40 * this.hp) / BOSS_HP), 3);
    }
  }
}
