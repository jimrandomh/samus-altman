// Enemies, projectiles, pickups and effects.
import { BEAM_SPEED, CONTACT_DAMAGE, GRAVITY, MISSILE_SPEED, SHORT_BEAM_RANGE, TILE } from './constants';
import { drawText, drawTextCentered } from './font';
import type { Game } from './game';
import { moveAxis, overlapsSolid } from './physics';
import { enemySprite } from './sprites';

type Ctx = CanvasRenderingContext2D;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DamageKind = 'beam' | 'missile' | 'bomb';

export abstract class Enemy implements Rect {
  x = 0;
  y = 0;
  w = 16;
  h = 16;
  vx = 0;
  vy = 0;
  hp = 2;
  flash = 0;
  dead = false;
  beamImmune = false;
  missileImmune = false;
  damage = CONTACT_DAMAGE;
  /** Harmless to touch (e.g. the test enemy). */
  harmless = false;
  drops = true;
  /** Passes through walls and doesn't count as blocking. */
  ghost = false;

  abstract update(g: Game): void;
  abstract draw(c: Ctx, g: Game, ox: number, oy: number): void;

  get pal(): string {
    return this.flash > 0 && this.flash % 4 < 2 ? 'flash' : '';
  }

  /** Returns true if the projectile is used up. */
  hit(g: Game, dmg: number, kind: DamageKind): boolean {
    if ((kind === 'beam' && this.beamImmune) || (kind === 'missile' && this.missileImmune)) {
      g.play('hit');
      g.floatText('TINK', this.x + this.w / 2, this.y - 4, '#aaaaaa');
      this.onImmune(g, kind);
      return true;
    }
    this.hp -= dmg;
    this.flash = 10;
    g.play('hit');
    if (this.hp <= 0) this.die(g);
    return true;
  }

  onImmune(_g: Game, _kind: DamageKind): void {}

  die(g: Game): void {
    this.dead = true;
    g.burst(this.x + this.w / 2, this.y + this.h / 2, ['#fcfcfc', '#f8b800', '#d82800'], 10);
    if (this.drops) g.maybeDrop(this.x + this.w / 2, this.y + this.h / 2);
  }
}

export class Zoomer extends Enemy {
  constructor(col: number, row: number) {
    super();
    this.w = 14;
    this.h = 10;
    this.x = col * TILE + 1;
    this.y = (row + 1) * TILE - this.h;
    this.vx = 0.5;
    this.hp = 2;
  }
  update(g: Game) {
    if (this.flash > 0) this.flash--;
    const room = g.room;
    this.vy = Math.min(4, this.vy + GRAVITY);
    moveAxis(room, this, 'y');
    const front = this.vx > 0 ? this.x + this.w + 1 : this.x - 1;
    const wall = room.isSolid(Math.floor(front / TILE), Math.floor((this.y + this.h / 2) / TILE));
    const floorAhead = room.isSolid(Math.floor(front / TILE), Math.floor((this.y + this.h + 2) / TILE));
    if (wall || !floorAhead) this.vx = -this.vx;
    const vx = this.vx;
    moveAxis(room, this, 'x');
    this.vx = vx;
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const s = enemySprite('zoomer', this.pal || g.enemyPal, Math.floor(g.t / 8) % 2 === 0);
    c.drawImage(s, Math.round(this.x - 1 - ox), Math.round(this.y - oy));
  }
}

export class Skree extends Enemy {
  state: 'hang' | 'dive' | 'dig' = 'hang';
  timer = 0;
  constructor(col: number, row: number) {
    super();
    this.w = 12;
    this.h = 13;
    this.x = col * TILE + 2;
    this.y = row * TILE;
    this.hp = 2;
  }
  update(g: Game) {
    if (this.flash > 0) this.flash--;
    const p = g.player;
    if (this.state === 'hang') {
      if (Math.abs(p.cx - (this.x + this.w / 2)) < 40 && p.y > this.y) {
        this.state = 'dive';
        this.vx = Math.sign(p.cx - (this.x + this.w / 2)) * 0.6;
        this.vy = 2.5;
      }
    } else if (this.state === 'dive') {
      moveAxis(g.room, this, 'x');
      if (moveAxis(g.room, this, 'y')) {
        this.state = 'dig';
        this.timer = 24;
      }
    } else if (--this.timer <= 0) {
      this.dead = true;
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      for (const [vx, vy] of [
        [-2, -2],
        [2, -2],
        [-2.5, 0],
        [2.5, 0],
      ])
        g.enemyShots.push(new EnemyShot(cx, cy, vx, vy, 24, 'solid'));
      g.burst(cx, cy, ['#58d854', '#f8b800'], 6);
      g.play('hit');
    }
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const s = enemySprite('skree', this.pal || g.enemyPal);
    const shake = this.state === 'dig' ? ((this.timer >> 1) % 2) : 0;
    c.drawImage(s, Math.round(this.x - ox + shake), Math.round(this.y - oy));
  }
}

export class Ripper extends Enemy {
  constructor(col: number, row: number) {
    super();
    this.w = 16;
    this.h = 7;
    this.x = col * TILE;
    this.y = row * TILE + 4;
    this.vx = 0.75;
    this.hp = 1;
    this.beamImmune = true;
  }
  onImmune(g: Game, kind: DamageKind) {
    if (kind === 'beam') g.sayOnce('ripper', 'This one ignores beams. Everything has a key.');
  }
  update(g: Game) {
    if (this.flash > 0) this.flash--;
    const vx = this.vx;
    if (moveAxis(g.room, this, 'x')) this.vx = -vx;
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const s = enemySprite('ripper', this.pal || g.enemyPal, this.vx < 0);
    c.drawImage(s, Math.round(this.x - ox), Math.round(this.y - oy));
  }
}

export class Rio extends Enemy {
  perchY: number;
  state: 'perch' | 'swoop' = 'perch';
  cooldown = 30;
  constructor(col: number, row: number) {
    super();
    this.w = 16;
    this.h = 10;
    this.x = col * TILE;
    this.y = row * TILE;
    this.perchY = this.y;
    this.hp = 3;
  }
  update(g: Game) {
    if (this.flash > 0) this.flash--;
    const p = g.player;
    if (this.state === 'perch') {
      if (this.cooldown > 0) this.cooldown--;
      else if (Math.abs(p.cx - (this.x + this.w / 2)) < 72 && p.y > this.y + 8) {
        this.state = 'swoop';
        this.vx = Math.sign(p.cx - (this.x + this.w / 2)) * 1.4 || 1.4;
        this.vy = 2.8;
      }
      return;
    }
    this.vy -= 0.075;
    const vx = this.vx;
    if (moveAxis(g.room, this, 'x')) this.vx = -vx;
    moveAxis(g.room, this, 'y');
    if (this.vy < 0 && this.y <= this.perchY) {
      this.y = this.perchY;
      this.vy = 0;
      this.state = 'perch';
      this.cooldown = 50;
    }
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const kind = this.state === 'swoop' && Math.floor(g.t / 6) % 2 ? 'rioFlap' : 'rio';
    c.drawImage(enemySprite(kind, this.pal || g.enemyPal), Math.round(this.x - ox), Math.round(this.y - oy));
  }
}

export class Ring extends Enemy {
  life = 480;
  constructor(x: number, y: number, tx: number, ty: number) {
    super();
    this.w = 10;
    this.h = 10;
    this.x = x - 5;
    this.y = y - 5;
    const d = Math.hypot(tx - x, ty - y) || 1;
    this.vx = ((tx - x) / d) * 0.9;
    this.vy = ((ty - y) / d) * 0.9;
    this.hp = 1;
    this.ghost = true;
    this.drops = false;
  }
  update(g: Game) {
    if (--this.life <= 0) this.dead = true;
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < -20 || this.y < -20 || this.x > g.room.widthPx + 20 || this.y > g.room.heightPx + 20) this.dead = true;
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    c.drawImage(enemySprite('ring', 'tourian'), Math.round(this.x - ox), Math.round(this.y - oy));
    void g;
  }
}

export class RingSpawner extends Enemy {
  timer = 90;
  constructor(col: number, row: number) {
    super();
    this.x = col * TILE + 8;
    this.y = row * TILE + 8;
    this.w = 0;
    this.h = 0;
    this.harmless = true;
    this.ghost = true;
    this.hp = Infinity;
  }
  update(g: Game) {
    if (g.boss && g.boss.dying) return;
    if (--this.timer > 0) return;
    this.timer = 170;
    const rings = g.enemies.filter((e) => e instanceof Ring).length;
    if (rings < 3 && Math.hypot(g.player.cx - this.x, g.player.cy - this.y) < 320) {
      g.enemies.push(new Ring(this.x, this.y, g.player.cx, g.player.cy));
    }
  }
  hit() {
    return false;
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    // a faint vent
    c.fillStyle = Math.floor(g.t / 10) % 2 ? '#3c1c3c' : '#5c2c5c';
    c.fillRect(Math.round(this.x - 5 - ox), Math.round(this.y - 2 - oy), 10, 4);
  }
}

export class TestEnemy extends Enemy {
  constructor(col: number, row: number) {
    super();
    this.w = 14;
    this.h = 16;
    this.x = col * TILE + 1;
    this.y = row * TILE;
    this.hp = 3;
    this.harmless = true;
    this.drops = false;
  }
  update(g: Game) {
    if (this.flash > 0) this.flash--;
    void g;
  }
  die(g: Game) {
    super.die(g);
    g.floatText('goodbye', this.x + 7, this.y - 6, '#ff88ff', 120);
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    c.drawImage(enemySprite('test', this.pal || 'dev'), Math.round(this.x - ox), Math.round(this.y - oy));
    if (Math.abs(g.player.cx - (this.x + 7)) < 48 && Math.abs(g.player.cy - this.y) < 40) {
      const bx = Math.round(this.x + 7 - ox);
      const by = Math.round(this.y - 14 - oy);
      c.fillStyle = '#fcfcfc';
      c.fillRect(bx - 17, by - 2, 34, 11);
      c.fillRect(bx - 1, by + 9, 3, 3);
      drawTextCentered(c, 'hello', bx, by, '#000000');
    }
  }
}

// ---------------------------------------------------------------- projectiles

export class Shot implements Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  dead = false;
  traveled = 0;
  constructor(
    x: number,
    y: number,
    public vx: number,
    public vy: number,
    public kind: 'beam' | 'missile',
    public long: boolean,
  ) {
    this.w = kind === 'missile' ? 8 : 6;
    this.h = kind === 'missile' ? 5 : 4;
    if (vy !== 0) [this.w, this.h] = [this.h, this.w];
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
  }
  static beam(x: number, y: number, dx: number, dy: number, long: boolean): Shot {
    return new Shot(x, y, dx * BEAM_SPEED, dy * BEAM_SPEED, 'beam', long);
  }
  static missile(x: number, y: number, dx: number, dy: number): Shot {
    return new Shot(x, y, dx * MISSILE_SPEED, dy * MISSILE_SPEED, 'missile', true);
  }
  get range(): number {
    return this.long ? 400 : SHORT_BEAM_RANGE;
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const x = Math.round(this.x - ox);
    const y = Math.round(this.y - oy);
    if (this.kind === 'beam') {
      c.fillStyle = g.t % 4 < 2 ? '#fcfcfc' : '#fcd8a8';
      c.fillRect(x, y, this.w, this.h);
      c.fillStyle = '#f8b800';
      c.fillRect(x + 1, y + 1, Math.max(1, this.w - 2), Math.max(1, this.h - 2));
    } else {
      c.fillStyle = '#fcfcfc';
      c.fillRect(x, y, this.w, this.h);
      c.fillStyle = '#f83800';
      if (this.vx > 0) c.fillRect(x + this.w - 3, y, 3, this.h);
      else if (this.vx < 0) c.fillRect(x, y, 3, this.h);
      else c.fillRect(x, y, this.w, 3);
      c.fillStyle = '#fc7400';
      if (this.vx > 0) c.fillRect(x - 2, y + 1, 2, this.h - 2);
      else if (this.vx < 0) c.fillRect(x + this.w, y + 1, 2, this.h - 2);
    }
  }
}

export class Bomb {
  t = 0;
  dead = false;
  constructor(
    public x: number,
    public y: number,
  ) {}
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const x = Math.round(this.x - ox);
    const y = Math.round(this.y - oy);
    c.fillStyle = '#000';
    c.fillRect(x - 3, y - 3, 6, 6);
    c.fillStyle = this.t % 8 < 4 ? '#fcfc58' : '#f83800';
    c.fillRect(x - 2, y - 2, 4, 4);
    c.fillStyle = '#fcfcfc';
    c.fillRect(x - 1, y - 2, 1, 1);
    void g;
  }
}

export class EnemyShot implements Rect {
  w = 6;
  h = 6;
  x: number;
  y: number;
  dead = false;
  constructor(
    x: number,
    y: number,
    public vx: number,
    public vy: number,
    public life: number,
    /** 'solid' stops at walls; 'glass' passes glass only; 'none' passes everything. */
    public walls: 'solid' | 'glass' | 'none',
    public color = '#fc7400',
  ) {
    this.x = x - 3;
    this.y = y - 3;
  }
  update(g: Game) {
    this.x += this.vx;
    this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
    if (this.walls !== 'none' && overlapsSolid(g.room, this.x, this.y, this.w, this.h, this.walls === 'glass' ? 'shot' : 'body'))
      this.dead = true;
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    const x = Math.round(this.x - ox);
    const y = Math.round(this.y - oy);
    c.fillStyle = g.t % 6 < 3 ? '#fcfcfc' : this.color;
    c.fillRect(x + 1, y, 4, 6);
    c.fillRect(x, y + 1, 6, 4);
    c.fillStyle = this.color;
    c.fillRect(x + 2, y + 2, 2, 2);
  }
}

export class Pickup implements Rect {
  w = 8;
  h = 8;
  life = 360;
  dead = false;
  x: number;
  y: number;
  constructor(
    x: number,
    y: number,
    public kind: 'energy' | 'missile',
  ) {
    this.x = x - 4;
    this.y = y - 4;
  }
  draw(c: Ctx, g: Game, ox: number, oy: number) {
    if (this.life < 90 && this.life % 6 < 3) return;
    const x = Math.round(this.x - ox);
    const y = Math.round(this.y - oy);
    if (this.kind === 'energy') {
      c.fillStyle = g.t % 8 < 4 ? '#fcfcfc' : '#f83800';
      c.fillRect(x + 1, y, 6, 8);
      c.fillRect(x, y + 1, 8, 6);
      c.fillStyle = '#d800cc';
      c.fillRect(x + 2, y + 2, 4, 4);
    } else {
      c.fillStyle = '#fcfcfc';
      c.fillRect(x + 3, y, 2, 7);
      c.fillStyle = '#f83800';
      c.fillRect(x + 2, y + 5, 4, 3);
      c.fillRect(x + 3, y, 2, 2);
    }
  }
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  grav: number;
  size: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export function drawFloatText(c: Ctx, f: FloatText, ox: number, oy: number) {
  const rise = Math.min(12, (120 - f.life) * 0.2);
  drawTextCentered(c, f.text, f.x - ox, f.y - oy - rise, f.color, 1, '#000000');
}

export function spawnEnemy(ch: string, col: number, row: number): Enemy | null {
  switch (ch) {
    case 'z':
      return new Zoomer(col, row);
    case 'k':
      return new Skree(col, row);
    case 'r':
      return new Ripper(col, row);
    case 'o':
      return new Rio(col, row);
    case 'n':
      return new RingSpawner(col, row);
    case 't':
      return new TestEnemy(col, row);
  }
  return null;
}

export { drawText };
