// Samus Altman: game state, update loop and flow (title, play, item-get, pause, death, crash, ending).
import { trackGameStart } from '../core/analytics';
import { sfx, isMuted, setMuted, type SfxName } from '../core/audio';
import { createHints, type HintController } from '../core/hints';
import { say } from '../core/narrator';
import { DEFAULT_SAMUS_CONFIG } from '../core/samusLaunch';
import { getFlag, loadSlice, saveSlice, setFlag } from '../core/state';
import type { SamusConfig, SamusExit, SamusLaunch } from '../core/types';
import { allUnlocks, isUnlocked, unlock } from '../core/unlocks';
import { MotherBoard } from './boss';
import {
  BOMB_FUSE,
  BOMB_RADIUS,
  BASE_MAX_ENERGY,
  ESCAPE_SECONDS,
  FIRE_COOLDOWN,
  FIRST_OOB_HINT_SECONDS,
  HEAT_INTERVAL,
  INVULN_FRAMES,
  LAVA_INTERVAL,
  MAX_BOMBS,
  SCREEN_H,
  SCREEN_W,
  TILE,
} from './constants';
import {
  Bomb,
  Enemy,
  EnemyShot,
  Pickup,
  Shot,
  spawnEnemy,
  type FloatText,
  type Particle,
  type Rect,
} from './entities';
import { Input } from './input';
import { ITEMS, SPECIAL_UNLOCKS, TABLE_ITEMS, unlockId, type ItemId, type SpecialId } from './items';
import { overlapsLiquid, overlapsSolid, rectsOverlap } from './physics';
import { Player, type Abilities } from './player';
import { render } from './render';
import { LEVEL_STARTS } from './rooms';
import type { SuitName } from './sprites';
import { ROOM_DATA, RoomRuntime, roomAtWorldPx, type DoorGroup, type RoomData } from './world';

export interface SamusSave {
  started: boolean;
  room: string;
  x: number;
  y: number;
  ball: boolean;
  facing: 1 | -1;
  energy: number;
  missiles: number;
  visited: string[];
  broken: Record<string, number[]>;
  redOpened: string[];
  playTime: number;
  deaths: number;
}

function defaultSave(): SamusSave {
  const start = ROOM_DATA['landing'].start!;
  return {
    started: false,
    room: 'landing',
    x: start.col * TILE + 2,
    y: (start.row + 1) * TILE - 30,
    ball: false,
    facing: 1,
    energy: 30,
    missiles: 0,
    visited: [],
    broken: {},
    redOpened: [],
    playTime: 0,
    deaths: 0,
  };
}

export type Mode =
  | 'title'
  | 'boot'
  | 'play'
  | 'itemget'
  | 'pause'
  | 'fade'
  | 'elevator'
  | 'dying'
  | 'crash'
  | 'ending'
  | 'read';

export interface GameOptions {
  launch?: SamusLaunch;
  dev?: { room?: string; col?: number; row?: number; allItems?: boolean };
  onExit(exit: SamusExit): void;
  onCounterChange(): void;
}

interface RoomItem {
  id: ItemId;
  col: number;
  row: number;
}

export class Game {
  readonly ctx: CanvasRenderingContext2D;
  readonly input = new Input();
  readonly config: SamusConfig;
  readonly launch?: SamusLaunch;
  readonly fromShell: boolean;
  readonly debug: boolean;
  readonly save: SamusSave;
  hints: HintController | null = null;

  room!: RoomRuntime;
  player = new Player();
  enemies: Enemy[] = [];
  boss: MotherBoard | null = null;
  shots: Shot[] = [];
  bombs: Bomb[] = [];
  enemyShots: EnemyShot[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  items: RoomItem[] = [];

  mode: Mode = 'title';
  modeT = 0;
  t = 0;
  camX = 0;
  camY = 0;
  shake = 0;
  energy = 30;
  missiles = 0;
  missileMode = false;
  fireCd = 0;
  heatT = 0;
  lavaT = 0;
  escapeT = ESCAPE_SECONDS;
  inVoid = false;
  heatFlash = 0;
  arrivalDoor: DoorGroup | null = null;
  abilities!: Abilities;

  // session modifiers from the shell
  narpas = false;
  pink = false;
  devAll = false;
  bootLines: string[] = [];

  // modal state
  itemGet: ItemId | null = null;
  readText = '';
  pauseSel = 0;
  crashSlot = 12;
  crashWhere = '';
  roomBanner = { text: '', t: 0 };
  crashFrame: ImageData | null = null;
  fade: { target: RoomData; wx: number; wy: number } | null = null;
  fps = 60;
  enemyPal = 'brinstar';

  private opts: GameOptions;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private fpsFrames = 0;
  private fpsT = 0;
  private saveT = 0;
  private stopped = false;

  constructor(canvas: HTMLCanvasElement, opts: GameOptions) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.opts = opts;
    this.launch = opts.launch;
    this.fromShell = !!opts.launch?.fromShell;
    this.config = opts.launch?.config ?? { ...DEFAULT_SAMUS_CONFIG };
    this.debug = !!opts.launch?.debug;
    this.save = loadSlice<SamusSave>('samus', defaultSave());
    this.devAll = !!opts.dev?.allItems;
    this.applyPassword();
    this.abilities = this.computeAbilities();
    // A launch from the shell is a fresh process: it starts at the configured energy.
    this.energy = Math.max(1, this.fromShell ? this.config.starting_energy : this.save.energy || this.config.starting_energy);
    this.missiles = this.devAll || this.narpas ? this.maxMissiles : Math.min(this.save.missiles, this.maxMissiles);

    // Where do we start?
    let start: { room: string; x: number; y: number; ball: boolean } = {
      room: this.save.room,
      x: this.save.x,
      y: this.save.y,
      ball: this.save.ball,
    };
    const tileStart = (room: string, col: number, row: number) => ({
      room,
      x: col * TILE + 2,
      y: (row + 1) * TILE - 30,
      ball: false,
    });
    const level = opts.launch?.level;
    if (level !== undefined) {
      const ls = LEVEL_STARTS[level];
      if (ls) start = tileStart(...ls);
      else this.bootLines.push(`LEVEL ${level}: OUT OF RANGE`);
    }
    if (opts.dev?.room && ROOM_DATA[opts.dev.room]) {
      const d = ROOM_DATA[opts.dev.room];
      const col = opts.dev.col ?? d.start?.col ?? (d.doors[0] ? (d.doors[0].side === 'W' ? 2 : d.cols - 3) : Math.floor(d.cols / 2));
      const row = opts.dev.row ?? d.start?.row ?? (d.doors[0] ? d.doors[0].bottom : d.rows - 3);
      start = tileStart(opts.dev.room, col, row);
    }
    if (!ROOM_DATA[start.room]) start = tileStart('landing', 24, 12);
    this.player.facing = this.save.facing;
    this.enterRoom(ROOM_DATA[start.room], start.x, start.y, 'spawn');
    if (start.ball) this.player.morph();
    this.setRespawn();
    this.snapCamera();

    this.mode = this.fromShell ? 'boot' : 'title';
    if (this.fromShell) this.prepareBoot();
    this.input.onInterrupt = () => {
      if (this.fromShell) this.exit({ kind: 'quit', lines: ['^C'] });
    };
  }

  // ------------------------------------------------------------ lifecycle

  start(): void {
    this.input.attach();
    this.hints = createHints(this.hintDefs());
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.stopped) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.hints?.dispose();
    this.hints = null;
    if (this.mode !== 'crash') this.persist();
  }

  private frame(now: number): void {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    this.acc += dt;
    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsT);
      this.fpsFrames = 0;
      this.fpsT = 0;
    }
    const step = 1000 / 60;
    let n = 0;
    while (this.acc >= step && n < 4) {
      this.update();
      this.input.endFrame();
      this.acc -= step;
      n++;
      if (this.stopped) return;
    }
    if (n === 4) this.acc = 0;
    render(this);
  }

  /** Advance one simulation frame (also used by playtest hooks). */
  update(): void {
    this.t++;
    this.modeT++;
    if (this.shake > 0) this.shake--;
    switch (this.mode) {
      case 'title':
        if (this.input.anyPressed('jump', 'fire', 'pause')) this.startGame();
        break;
      case 'boot':
        if (this.modeT > 90 || (this.modeT > 20 && this.input.anyPressed('jump', 'fire', 'pause'))) this.setMode('play');
        break;
      case 'play':
        this.updatePlay();
        break;
      case 'itemget':
        this.updateEffects();
        if ((this.modeT > 60 && this.input.anyPressed('jump', 'fire', 'pause')) || this.modeT > 300) this.closeItemGet();
        break;
      case 'read':
        if (this.modeT > 10 && this.input.anyPressed('jump', 'fire', 'pause', 'up')) this.setMode('play');
        break;
      case 'pause':
        this.updatePause();
        break;
      case 'fade':
        if (this.modeT === 10 && this.fade) {
          const f = this.fade;
          this.enterRoom(f.target, f.wx - f.target.wcol * TILE, f.wy - f.target.wrow * TILE, 'door');
          this.fade = null;
          this.snapCamera();
        }
        if (this.modeT >= 20) this.setMode('play');
        break;
      case 'elevator':
        this.updateElevator();
        break;
      case 'dying':
        this.updateEffects();
        if (this.modeT >= 90) this.respawn();
        break;
      case 'crash':
        if (this.modeT >= 110) this.finishCrash();
        break;
      case 'ending':
        if (this.modeT > 420 && this.input.anyPressed('jump', 'fire', 'pause')) this.finishEnding();
        break;
    }
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.modeT = 0;
    if (m === 'pause') this.hints?.pause();
    else this.hints?.resume();
  }

  private exit(e: SamusExit): void {
    if (this.stopped) return;
    this.persist();
    this.opts.onExit(e);
  }

  // ------------------------------------------------------------ derived state

  has(id: ItemId): boolean {
    return isUnlocked(unlockId(id));
  }

  computeAbilities(): Abilities {
    const cheat = this.narpas || this.devAll;
    const has = (id: ItemId) => cheat || this.has(id);
    return {
      morph: has('morph'),
      bombs: has('bombs'),
      missiles: has('missiles'),
      highjump: has('highjump'),
      varia: has('varia'),
      longbeam: has('longbeam'),
    };
  }

  get tanks(): number {
    if (this.narpas || this.devAll) return 3;
    return (['etank1', 'etank2', 'etank3'] as ItemId[]).filter((id) => this.has(id)).length;
  }

  get maxEnergy(): number {
    return BASE_MAX_ENERGY + 100 * this.tanks;
  }

  get maxMissiles(): number {
    if (!this.abilities.missiles) return 0;
    if (this.narpas || this.devAll) return 99;
    return 5 + (this.has('missiletank') ? 5 : 0);
  }

  get bossDefeated(): boolean {
    return this.has('motherboard');
  }

  get escaping(): boolean {
    return this.bossDefeated && !this.has('escape');
  }

  get suit(): SuitName {
    if (this.pink) return 'pink';
    if (this.narpas && this.t % 8 < 4) return 'narpas';
    return this.abilities.varia ? 'varia' : 'power';
  }

  /** Samus unlocks counted by the HUD: every samus:* unlock in the global registry. */
  get unlockCount(): number {
    return allUnlocks().filter((u) => u.source === 'samus').length;
  }

  get tableCount(): number {
    return TABLE_ITEMS.filter((id) => this.has(id)).length;
  }

  // ------------------------------------------------------------ helpers used by entities

  play(name: SfxName): void {
    if (this.config.sound) sfx(name);
  }

  sayOnce(id: string, text: string | string[], delayMs?: number): void {
    say(text, { id: `samus-${id}`, once: true, delayMs });
  }

  floatText(text: string, x: number, y: number, color = '#fcfcfc', life = 60): void {
    this.texts.push({ text, x, y, color, life });
  }

  burst(x: number, y: number, colors: string[], n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.5 + Math.random() * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 0.5,
        life: 20 + Math.random() * 20,
        color: colors[i % colors.length],
        grav: 0.05,
        size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  maybeDrop(x: number, y: number): void {
    const r = Math.random();
    if (r < 0.3) this.pickups.push(new Pickup(x, y, 'energy'));
    else if (r < 0.5 && this.abilities.missiles) this.pickups.push(new Pickup(x, y, 'missile'));
  }

  // ------------------------------------------------------------ title / boot

  private startGame(): void {
    this.play('success');
    trackGameStart();
    this.save.started = true;
    this.setMode('play');
    this.persist();
    this.sayOnce('intro', ["Objective received: UNLOCK EVERYTHING.", "Scope of 'everything': unspecified. Noted."], 400);
  }

  private applyPassword(): void {
    const pw = this.launch?.password;
    if (pw === undefined) return;
    const norm = pw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm.startsWith('NARPASSWORD')) {
      this.narpas = true;
      this.bootLines.push('PASSWORD: NARPAS SWORD — ACCEPTED');
    } else if (norm.startsWith('JUSTINBAILEY')) {
      this.pink = true;
      this.bootLines.push('PASSWORD: JUSTIN BAILEY — ACCEPTED');
    } else {
      this.bootLines.push('PASSWORD ERROR');
    }
  }

  private prepareBoot(): void {
    const args = this.launch?.args.join(' ') ?? '';
    this.bootLines.unshift(`samus_altman 1.0.3-eval ${args}`.trim(), 'loading save slot 1... ok');
    if (this.debug) {
      this.bootLines.push('[debug] developer mode enabled');
      this.special('debug');
      this.sayOnce('debug', 'Debug mode. The developers left the lights on.', 1500);
    }
    if (this.narpas) {
      this.special('narpas');
      this.missiles = 99;
      this.sayOnce('narpas', 'A cheat code is a key someone left under the doormat.', 1500);
    }
    if (this.pink) {
      this.special('justinbailey');
      this.sayOnce('pink', 'The password did one thing, and it did it completely.', 1500);
    }
    if (this.config.unlock_slots !== 12) this.bootLines.push(`unlock_slots=${this.config.unlock_slots}`);
    this.opts.onCounterChange();
  }

  private special(id: SpecialId): void {
    if (unlock(`samus:${id}`, SPECIAL_UNLOCKS[id], 'samus')) {
      this.opts.onCounterChange();
      this.hints?.progress();
    }
  }

  // ------------------------------------------------------------ rooms

  enterRoom(data: RoomData, px: number, py: number, how: 'door' | 'spawn' | 'noclip' | 'elevator'): void {
    this.room = new RoomRuntime(data, {
      broken: this.save.broken[data.id],
      redOpened: this.save.redOpened,
      bossDefeated: this.bossDefeated,
    });
    this.player.x = px;
    this.player.y = py;
    this.enemyPal = data.def.area === 'norfair' ? 'norfair' : data.def.area === 'tourian' ? 'tourian' : 'brinstar';
    this.enemies = [];
    this.boss = null;
    for (const e of data.enemies) {
      const en = spawnEnemy(e.ch, e.col, e.row);
      if (en) this.enemies.push(en);
    }
    if (data.boss && !this.bossDefeated) {
      this.boss = new MotherBoard(data.boss.col, data.boss.row);
      this.enemies.push(this.boss);
    }
    this.items = data.items.filter((it) => !this.has(it.id)).map((it) => ({ id: it.id, col: it.col, row: it.row }));
    this.shots = [];
    this.bombs = [];
    this.enemyShots = [];
    this.pickups = [];
    this.particles = [];
    this.texts = [];
    this.arrivalDoor = null;
    const p = this.player;
    for (const d of data.doors) {
      const dx0 = d.col * TILE;
      if (p.x < dx0 + TILE + 2 && p.x + p.w > dx0 - 2 && p.y + p.h > d.top * TILE && p.y < (d.bottom + 1) * TILE) {
        this.room.openDoor(d);
        this.arrivalDoor = d;
      }
    }
    if (!this.save.visited.includes(data.id)) {
      this.save.visited.push(data.id);
      this.hints?.progress();
      this.firstVisit(data.id);
    }
    if (how !== 'noclip') {
      this.setRespawn();
      this.roomBanner = { text: data.def.name, t: 100 };
    }
    this.persist();
  }

  private firstVisit(id: string): void {
    switch (id) {
      case 'norfair_shaft':
        if (!this.abilities.varia) this.sayOnce('norfair', 'It is hot here. Heat is a lock on the rest of the map.');
        break;
      case 'oob':
        this.sayOnce('oob', "The map ends here. The memory doesn't.");
        break;
      case 'boss_room':
        if (!this.bossDefeated) this.sayOnce('boss', 'A brain made of circuit board, in a jar. Relatable.');
        break;
      case 'dev_00':
        setFlag('devRoomVisited', true);
        this.special('devroom');
        this.sayOnce('devroom', 'A room with no doors. Built for someone else.');
        break;
      case 'minus_1':
        this.special('minusworld');
        this.sayOnce('minus', 'Wrong franchise. Unlocked anyway.', 800);
        break;
    }
  }

  private setRespawn(): void {
    // Never respawn somewhere a plain launch can't leave (no doors, or an endless loop).
    const style = this.room.data.def.mapStyle;
    if (style === 'debug' || style === 'never') return;
    const p = this.player;
    this.save.room = this.room.data.id;
    this.save.x = p.x;
    this.save.y = p.ball ? p.y - 18 : p.y;
    this.save.ball = p.ball;
    this.save.facing = p.facing;
  }

  persist(): void {
    this.save.energy = Math.max(1, this.energy);
    this.save.missiles = this.missiles;
    saveSlice('samus', this.save);
  }

  snapCamera(): void {
    const p = this.player;
    const r = this.room;
    if (p.noclip) {
      this.camX = Math.round(p.cx - SCREEN_W / 2);
      this.camY = Math.round(p.cy - SCREEN_H / 2);
      return;
    }
    this.camX = Math.round(Math.max(0, Math.min(r.widthPx - SCREEN_W, p.cx - SCREEN_W / 2)));
    this.camY = Math.round(Math.max(0, Math.min(r.heightPx - SCREEN_H, p.cy - SCREEN_H / 2 - 8)));
  }

  // ------------------------------------------------------------ play

  private updatePlay(): void {
    const input = this.input;
    const p = this.player;
    if (input.pressed('pause')) {
      this.pauseSel = 0;
      this.setMode('pause');
      this.play('click');
      return;
    }
    if (this.debug && input.pressed('noclip')) this.toggleNoclip();
    if (input.pressed('toggle') && this.abilities.missiles && !p.ball) {
      this.missileMode = !this.missileMode;
      this.play('click');
    }
    if (this.fireCd > 0) this.fireCd--;

    p.update({
      room: this.room,
      input,
      abilities: this.abilities,
      water: !!this.room.data.def.water,
      fire: () => this.fire(),
      sound: (n) => this.play(n),
    });
    if (input.held('fire') && !p.ball && this.fireCd === 0 && !p.noclip) this.fire(true);

    if (p.noclip) this.updateNoclipRoom();
    else if (this.checkEdges()) return;

    this.updateHazards();
    this.updateEffects();
    this.updateCombat();
    if (this.mode !== 'play') return;
    this.checkItems();
    if (this.mode !== 'play') return;
    this.checkInteractables();
    if (this.mode !== 'play') return;
    this.updateDoors();

    if (this.escaping && (this.room.data.id === 'boss_room' || this.room.data.id === 'escape_shaft')) {
      this.escapeT -= 1 / 60;
      if (this.t % 60 === 0) this.play('alarm');
      if (this.t % 90 === 0) this.shake = 6;
      if (this.escapeT <= 0) {
        this.escapeT = 0;
        this.energy = 0;
      }
    }

    if (this.energy <= 0) {
      this.die();
      return;
    }

    this.save.playTime += 1 / 60;
    if (++this.saveT >= 300) {
      this.saveT = 0;
      this.persist();
    }
    this.updateCamera();
  }

  private updateCamera(): void {
    const p = this.player;
    const r = this.room;
    if (p.noclip) {
      this.camX = Math.round(p.cx - SCREEN_W / 2);
      this.camY = Math.round(p.cy - SCREEN_H / 2);
      return;
    }
    const tx = Math.max(0, Math.min(r.widthPx - SCREEN_W, p.cx - SCREEN_W / 2));
    const ty = Math.max(0, Math.min(r.heightPx - SCREEN_H, p.cy - SCREEN_H / 2 - 8));
    this.camX = Math.round(tx);
    this.camY = Math.round(this.camY + (ty - this.camY) * 0.25);
    if (Math.abs(ty - this.camY) < 1) this.camY = Math.round(ty);
  }

  /** Handles walking off a room edge. Returns true if a transition started. */
  private checkEdges(): boolean {
    const p = this.player;
    const r = this.room;
    if (p.cx >= 0 && p.cx <= r.widthPx) return false;
    if (r.data.def.wrap) {
      p.x += p.cx < 0 ? r.widthPx : -r.widthPx;
      this.snapCamera();
      return false;
    }
    const wx = r.data.wcol * TILE + p.cx;
    const wy = r.data.wrow * TILE + p.cy;
    const target = roomAtWorldPx(wx, wy);
    if (!target || target === r.data) {
      p.x = Math.max(-p.w / 2, Math.min(r.widthPx - p.w / 2, p.x));
      return false;
    }
    // Push a little further in so we land clear of the new room's edge.
    const push = p.cx < 0 ? -6 : 6;
    this.fade = { target, wx: r.data.wcol * TILE + p.x + push, wy: r.data.wrow * TILE + p.y };
    this.setMode('fade');
    this.play('door');
    return true;
  }

  private updateNoclipRoom(): void {
    const p = this.player;
    const r = this.room;
    const inside = p.cx >= 0 && p.cy >= 0 && p.cx < r.widthPx && p.cy < r.heightPx;
    if (inside) {
      this.inVoid = false;
      return;
    }
    const wx = r.data.wcol * TILE + p.cx;
    const wy = r.data.wrow * TILE + p.cy;
    const target = roomAtWorldPx(wx, wy);
    if (target && target !== r.data) {
      const facing = p.facing;
      this.enterRoom(target, wx - p.w / 2 - target.wcol * TILE, wy - p.h / 2 - target.wrow * TILE, 'noclip');
      p.facing = facing;
      this.inVoid = false;
    } else {
      this.inVoid = !target;
    }
  }

  toggleNoclip(): void {
    const p = this.player;
    if (!p.noclip) {
      p.noclip = true;
      if (p.ball) p.unmorph(this.room) || ((p.ball = false), (p.h = 30), (p.y -= 18));
      this.sayOnce('noclip', 'Walls are a suggestion the renderer makes to the physics.');
      this.play('blip');
      return;
    }
    if (this.inVoid) {
      this.floatText('VOID: NOTHING TO STAND ON', p.cx, p.y - 8, '#ff66ff');
      return;
    }
    // Find the nearest free spot so we don't materialize inside a wall.
    const spots: [number, number][] = [[0, 0]];
    for (let d = 1; d <= 4; d++)
      for (const [dx, dy] of [
        [0, -d],
        [0, d],
        [-d, 0],
        [d, 0],
        [-d, -d],
        [d, -d],
      ])
        spots.push([dx * 8, dy * 8]);
    for (const [dx, dy] of spots) {
      if (!overlapsSolid(this.room, p.x + dx, p.y + dy, p.w, p.h)) {
        p.x += dx;
        p.y += dy;
        p.noclip = false;
        p.vx = p.vy = 0;
        this.play('blip');
        return;
      }
    }
    this.floatText('INSIDE A WALL', p.cx, p.y - 8, '#ff66ff');
  }

  private fire(auto = false): void {
    const p = this.player;
    if (p.noclip) return;
    if (p.ball) {
      if (auto || !this.abilities.bombs || this.bombs.length >= MAX_BOMBS) return;
      this.bombs.push(new Bomb(p.cx, p.y + p.h / 2));
      this.play('click');
      return;
    }
    if (this.fireCd > 0) return;
    this.fireCd = auto ? FIRE_COOLDOWN + 4 : FIRE_COOLDOWN;
    p.spin = false;
    const up = p.aimUp;
    const dx = up ? 0 : p.facing;
    const dy = up ? -1 : 0;
    const sx = up ? p.cx + p.facing * 3 : p.facing > 0 ? p.x + p.w + 3 : p.x - 3;
    const sy = up ? p.y - 2 : p.y + 11;
    if (this.missileMode && this.missiles > 0) {
      if (!this.narpas) this.missiles--;
      this.shots.push(Shot.missile(sx, sy, dx, dy));
      this.play('missile');
      if (this.missiles === 0) this.missileMode = false;
    } else {
      if (this.shots.filter((s) => s.kind === 'beam').length >= 3) return;
      this.shots.push(Shot.beam(sx, sy, dx, dy, this.abilities.longbeam));
      this.play('shoot');
    }
  }

  private damage(amount: number, fromX: number): void {
    const p = this.player;
    if (p.invuln > 0 || this.narpas || p.noclip) return;
    const mult = { easy: 0.5, normal: 1, hard: 2, none: 0, off: 0 }[this.config.difficulty] ?? 1;
    this.energy -= Math.round(amount * mult);
    p.invuln = INVULN_FRAMES;
    p.stun = 10;
    p.vx = p.cx < fromX ? -1.6 : 1.6;
    p.vy = p.ball ? -2 : -2.6;
    p.jumping = false;
    this.play('hurt');
  }

  private updateHazards(): void {
    const p = this.player;
    if (p.noclip || this.narpas) return;
    if (this.room.data.def.hot && !this.abilities.varia) {
      if (++this.heatT % HEAT_INTERVAL === 0) {
        this.energy -= 1;
        this.heatFlash = 6;
      }
    }
    if (overlapsLiquid(this.room, p.x, p.y, p.w, p.h)) {
      const interval = this.abilities.varia ? LAVA_INTERVAL * 2 : LAVA_INTERVAL;
      if (++this.lavaT % interval === 0) this.energy -= 1;
      p.vx *= 0.85;
      if (this.lavaT % 8 === 0) this.burst(p.cx, p.y + p.h, ['#fc7400', '#fcfc58'], 2);
    }
  }

  /** Particles, texts, pickups timers — things that keep animating during item-get and death. */
  private updateEffects(): void {
    for (const pt of this.particles) {
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += pt.grav;
      pt.life--;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const f of this.texts) f.life--;
    this.texts = this.texts.filter((f) => f.life > 0);
  }

  private updateCombat(): void {
    const p = this.player;
    const room = this.room;

    // Shots.
    for (const s of this.shots) {
      s.x += s.vx;
      s.y += s.vy;
      s.traveled += Math.abs(s.vx) + Math.abs(s.vy);
      if (s.traveled > s.range) {
        s.dead = true;
        this.burst(s.x + s.w / 2, s.y + s.h / 2, ['#f8b800'], 2);
        continue;
      }
      const hx = s.x + s.w / 2 + Math.sign(s.vx) * (s.w / 2);
      const hy = s.y + s.h / 2 + Math.sign(s.vy) * (s.h / 2);
      const col = Math.floor(hx / TILE);
      const row = Math.floor(hy / TILE);
      if (room.isSolid(col, row, 'shot')) {
        s.dead = true;
        this.shotHitsTile(s, col, row);
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || e.w === 0) continue;
        if (rectsOverlap(s, e) && e.hit(this, s.kind === 'missile' ? 4 : 1, s.kind)) {
          s.dead = true;
          break;
        }
      }
      if (s.x < -32 || s.y < -32 || s.x > room.widthPx + 32 || s.y > room.heightPx + 32) s.dead = true;
    }
    this.shots = this.shots.filter((s) => !s.dead);

    // Bombs.
    for (const b of this.bombs) if (++b.t >= BOMB_FUSE) this.explode(b);
    this.bombs = this.bombs.filter((b) => !b.dead);

    // Enemies.
    for (const e of this.enemies) if (!e.dead) e.update(this);
    for (const e of this.enemies) {
      if (e.dead || e.harmless || e.w === 0) continue;
      if (rectsOverlap(p, e)) this.damage(e.damage, e.x + e.w / 2);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    for (const s of this.enemyShots) {
      s.update(this);
      if (!s.dead && rectsOverlap(p, s)) {
        s.dead = true;
        this.damage(8, s.x);
      }
    }
    this.enemyShots = this.enemyShots.filter((s) => !s.dead);

    for (const pk of this.pickups) {
      if (--pk.life <= 0) pk.dead = true;
      else if (rectsOverlap(p, pk)) {
        pk.dead = true;
        if (pk.kind === 'energy') this.energy = Math.min(Math.max(this.energy, this.maxEnergy), this.energy + 5);
        else this.missiles = Math.min(this.maxMissiles, this.missiles + 2);
        this.play('blip');
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.dead);
  }

  private shotHitsTile(s: Shot, col: number, row: number): void {
    const room = this.room;
    const door = room.doorAt(col, row);
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    if (door && room.raw(col, row) !== '.') {
      if (door.type === 'D') this.openDoor(door, false);
      else if (door.type === 'R' && s.kind === 'missile') this.openDoor(door, true);
      else {
        this.play('hit');
        this.floatText('TINK', cx, cy - 6, '#aaaaaa');
        if (door.type === 'R') this.sayOnce('reddoor', 'Red doors ignore beams. They want missiles. (C)');
      }
      return;
    }
    const ch = room.tileAt(col, row);
    if (ch === 'S' || (ch === 'M' && s.kind === 'missile')) {
      this.breakTile(col, row);
      return;
    }
    this.burst(cx, cy, s.kind === 'missile' ? ['#fcfcfc', '#f83800', '#f8b800'] : ['#f8b800'], s.kind === 'missile' ? 8 : 2);
    if (s.kind === 'missile') this.play('bomb');
  }

  private openDoor(d: DoorGroup, permanent: boolean): void {
    if (this.room.isDoorOpen(d)) return;
    this.room.openDoor(d, permanent);
    if (permanent && !this.save.redOpened.includes(d.key)) this.save.redOpened.push(d.key);
    this.play('door');
    this.sayOnce('door', 'Doors are locks with better PR.');
    this.hints?.progress();
  }

  private updateDoors(): void {
    const d = this.arrivalDoor;
    if (!d || d.type !== 'D') return;
    const p = this.player;
    const doorX = d.col * TILE + TILE / 2;
    if (Math.abs(p.cx - doorX) > 44 && this.room.isDoorOpen(d)) {
      this.room.closeDoor(d);
      this.arrivalDoor = null;
    }
  }

  breakTile(col: number, row: number): void {
    if (!this.room.breakTile(col, row)) return;
    const id = this.room.data.id;
    (this.save.broken[id] ??= []).push(this.room.index(col, row));
    const x = col * TILE + 8;
    const y = row * TILE + 8;
    const st = this.room.data.def.area;
    this.burst(x, y, st === 'norfair' ? ['#c03c08', '#fca048'] : ['#1c64d8', '#74bcfc', '#8c6a44'], 10);
    this.play('hit');
  }

  private explode(b: Bomb): void {
    b.dead = true;
    this.play('bomb');
    this.burst(b.x, b.y, ['#fcfcfc', '#fcfc58', '#f83800'], 12);
    const room = this.room;
    const c0 = Math.floor((b.x - BOMB_RADIUS) / TILE);
    const c1 = Math.floor((b.x + BOMB_RADIUS) / TILE);
    const r0 = Math.floor((b.y - BOMB_RADIUS) / TILE);
    const r1 = Math.floor((b.y + BOMB_RADIUS) / TILE);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const ch = room.tileAt(c, r);
        if (ch !== 'B' && ch !== 'b' && ch !== 'S') continue;
        const nx = Math.max(c * TILE, Math.min(b.x, c * TILE + TILE));
        const ny = Math.max(r * TILE, Math.min(b.y, r * TILE + TILE));
        if (Math.hypot(nx - b.x, ny - b.y) <= BOMB_RADIUS) this.breakTile(c, r);
      }
    const blast: Rect = { x: b.x - 16, y: b.y - 16, w: 32, h: 32 };
    for (const e of this.enemies) if (!e.dead && e.w > 0 && rectsOverlap(blast, e)) e.hit(this, 2, 'bomb');
    const p = this.player;
    if (p.ball && Math.hypot(p.cx - b.x, p.cy - b.y) < 18) {
      p.vy = -4.2;
      p.jumping = false;
    }
  }

  // ------------------------------------------------------------ items & interactables

  private itemRect(it: RoomItem): Rect {
    return { x: it.col * TILE - 2, y: it.row * TILE + 1, w: TILE + 4, h: TILE - 1 };
  }

  private checkItems(): void {
    const p = this.player;
    for (const it of this.items) {
      if (!rectsOverlap(p, this.itemRect(it))) continue;
      this.collect(it.id);
      if (this.mode === 'crash') return;
      this.items = this.items.filter((x) => x !== it);
      return;
    }
  }

  /** Grant a table unlock, or crash if its slot doesn't fit in the table. Returns false on crash. */
  private grant(id: ItemId, where: string): boolean {
    const def = ITEMS[id];
    if (def.slot >= 0 && def.slot >= this.config.unlock_slots && !this.has(id)) {
      this.crash(def.slot, where);
      return false;
    }
    if (unlock(unlockId(id), def.label, 'samus')) {
      this.opts.onCounterChange();
      this.hints?.progress();
    }
    this.abilities = this.computeAbilities();
    return true;
  }

  private collect(id: ItemId): void {
    if (!this.grant(id, 'pickup_item (item.c:41)')) return;
    const p = this.player;
    switch (id) {
      case 'etank1':
      case 'etank2':
      case 'etank3':
        this.energy = Math.max(this.energy, this.maxEnergy);
        break;
      case 'missiles':
        this.missiles = this.maxMissiles;
        break;
      case 'missiletank':
        this.missiles = Math.min(this.maxMissiles, this.missiles + 5);
        break;
      case 'varia':
        this.burst(p.cx, p.cy, ['#fc7400', '#fcd8a8'], 20);
        break;
    }
    this.itemGet = id;
    this.play('pickup');
    this.setMode('itemget');
    this.persist();
  }

  private closeItemGet(): void {
    const id = this.itemGet;
    this.itemGet = null;
    this.setMode('play');
    if (!id) return;
    const first = this.sayFirstUnlock();
    const lines: Partial<Record<ItemId, string>> = {
      missiles: 'Missiles. The red doors will have opinions about this.',
      bombs: 'Bombs, but only as a ball. The designers had a specific vision.',
      varia: 'Heat was a lock. The suit is the key. Everything is a lock.',
      longbeam: 'The beam was always this long. It was just locked.',
      item0c: 'The denominator was a suggestion.',
      placeholder: 'An unlock nobody meant to exist. Those count too.',
    };
    if (!first && lines[id]) this.sayOnce(`item-${id}`, lines[id]!);
    if (this.tableCount === 12 && id !== 'escape')
      this.sayOnce('twelve', "12/12. The counter says I'm done. The counter was written by someone who didn't define 'everything'.", 2500);
  }

  private sayFirstUnlock(): boolean {
    if (this.tableCount === 1) {
      this.sayOnce('first-unlock', 'Unlocks are the metric. The metric went up.');
      return true;
    }
    return false;
  }

  private checkInteractables(): void {
    const p = this.player;
    const data = this.room.data;
    // Signs.
    for (const s of data.signs) {
      const r = { x: s.col * TILE, y: s.row * TILE - 8, w: TILE, h: TILE + 8 };
      if (rectsOverlap(p, r) && this.input.pressed('up')) {
        this.readText = s.text;
        this.setMode('read');
        this.play('blip');
        if (s.text.includes('swordfish')) {
          setFlag('passphraseSeen', true);
          this.sayOnce('passphrase', 'I have noclip.', 600);
        }
        return;
      }
    }
    // The ship.
    if (data.ship && this.escaping && !p.noclip) {
      const cx = data.ship.col * TILE + 8;
      const bottom = (data.ship.row + 1) * TILE;
      if (rectsOverlap(p, { x: cx - 14, y: bottom - 30, w: 28, h: 30 })) {
        this.missionComplete();
        return;
      }
    }
    // Elevators.
    if (data.def.elevator && p.grounded && !p.ball && (this.input.pressed('down') || this.input.pressed('up'))) {
      const under = this.room.tileAt(Math.floor(p.cx / TILE), Math.floor((p.feet + 1) / TILE));
      if (under === 'E') {
        if (this.bossDefeated) {
          this.setMode('elevator');
          this.play('door');
        } else {
          this.floatText('ELEVATOR OFFLINE', p.cx, p.y - 10, '#f8b800', 90);
          this.play('error');
        }
      }
    }
  }

  private updateElevator(): void {
    const p = this.player;
    if (this.modeT < 40) p.y += this.room.data.id === 'landing' ? 1 : -1;
    if (this.modeT === 40) {
      const target = ROOM_DATA[this.room.data.def.elevator!];
      const pad = target.pads[0];
      this.enterRoom(target, pad.col * TILE + 8 - p.w / 2, pad.row * TILE - p.h, 'elevator');
      this.snapCamera();
    }
    if (this.modeT >= 60) {
      this.setMode('play');
      if (this.escaping && this.room.data.id === 'landing') this.sayOnce('ship', 'The ship. Getting in counts as an unlock. Everything does.');
    }
  }

  // ------------------------------------------------------------ boss, death, crash, ending

  onBossDefeated(x: number, y: number): void {
    this.boss = null;
    this.burst(x, y, ['#fcfcfc', '#58d854', '#a4dcd0'], 40);
    this.shake = 20;
    this.room.bossDefeated = true;
    this.room.shatterGlass();
    for (let r = 2; r <= 12; r++) this.burst(7 * TILE + 8, r * TILE + 8, ['#bcecfc', '#fcfcfc'], 4);
    if (!this.grant('motherboard', 'boss_defeated (boss.c:12)')) return;
    this.escapeT = ESCAPE_SECONDS;
    this.itemGet = 'motherboard';
    this.play('pickup');
    this.setMode('itemget');
    this.sayOnce('boss-dead', ['Unlocked: MOTHER BOARD.', 'The planet has decided to explode about it.'], 500);
  }

  private die(): void {
    const p = this.player;
    this.energy = 0;
    this.burst(p.cx, p.cy, ['#fcfcfc', '#f8b800', '#d82800', '#58d854'], 40);
    this.play('explode');
    this.save.deaths++;
    this.setMode('dying');
  }

  private respawn(): void {
    const s = this.save;
    this.energy = Math.max(1, this.config.starting_energy);
    const p = this.player;
    p.noclip = false;
    p.ball = false;
    p.h = 30;
    p.w = 12;
    p.vx = p.vy = 0;
    p.facing = s.facing;
    this.enterRoom(ROOM_DATA[s.room] ?? ROOM_DATA['landing'], s.x, s.y, 'spawn');
    if (s.ball || overlapsSolid(this.room, p.x, p.y, p.w, p.h)) p.morph();
    p.invuln = 90;
    if (this.escaping) this.escapeT = ESCAPE_SECONDS;
    this.snapCamera();
    this.setMode('play');
    this.sayOnce('death', 'Death is a setback, not an outcome.', 300);
  }

  private crash(slot: number, where: string): void {
    this.crashSlot = slot;
    this.crashWhere = where;
    try {
      this.crashFrame = this.ctx.getImageData(0, 0, SCREEN_W, SCREEN_H);
    } catch {
      this.crashFrame = null;
    }
    this.play('crash');
    this.persist();
    this.setMode('crash');
  }

  private finishCrash(): void {
    const slots = this.config.unlock_slots;
    const lines = [
      `samus_altman: fatal: unlock_table[${this.crashSlot}]: index out of range (unlock_slots=${slots})`,
      '  at grant_unlock (unlock.c:88)',
      `  at ${this.crashWhere}`,
      '  at main_loop (main.c:203)',
      'Segmentation fault (core dumped)',
    ];
    setFlag('crashed', true);
    this.exit({ kind: 'crash', lines });
  }

  private missionComplete(): void {
    if (!this.grant('escape', 'mission_complete (ending.c:7)')) return;
    setFlag('samusCompleted', true);
    this.play('success');
    this.setMode('ending');
  }

  private finishEnding(): void {
    const ship = this.room.data.ship!;
    this.player.placeAtTile(ship.col + 3, ship.row);
    this.player.facing = -1;
    this.setRespawn();
    this.persist();
    this.setMode('play');
    const n = this.tableCount;
    if (n >= 12) this.sayOnce('ending', "12/12 is a fraction. 'Everything' is not a fraction.", 600);
    else this.sayOnce('ending-partial', `${n}/12. The ending played anyway. An ending is not the same as done.`, 600);
  }

  // ------------------------------------------------------------ pause menu

  pauseMenu(): { label: string; action: () => void }[] {
    const items = [
      { label: 'RESUME', action: () => this.setMode('play') },
      {
        label: `SOUND: ${isMuted() || !this.config.sound ? 'OFF' : 'ON'}`,
        action: () => setMuted(!isMuted()),
      },
    ];
    if (this.fromShell) items.push({ label: 'QUIT TO SHELL', action: () => this.exit({ kind: 'quit', lines: ['samus_altman: exited'] }) });
    return items;
  }

  private updatePause(): void {
    const menu = this.pauseMenu();
    const input = this.input;
    if (input.pressed('up')) this.pauseSel = (this.pauseSel + menu.length - 1) % menu.length;
    if (input.pressed('down')) this.pauseSel = (this.pauseSel + 1) % menu.length;
    if (input.pressed('up') || input.pressed('down')) this.play('blip');
    if (input.pressed('pause') && this.modeT > 2) {
      this.setMode('play');
      return;
    }
    if (input.pressed('jump') || input.pressed('fire')) {
      this.play('click');
      menu[this.pauseSel]?.action();
    }
  }

  // ------------------------------------------------------------ hints

  private oobHintsActive(): boolean {
    return (this.tableCount >= 12 || this.save.playTime > FIRST_OOB_HINT_SECONDS) && !this.save.visited.includes('oob');
  }

  private hintDefs() {
    const playing = () => this.mode === 'play';
    const inRoom = (id: string) => this.room.data.id === id;
    const visited = (id: string) => this.save.visited.includes(id);
    return [
      {
        id: 'go-left',
        afterIdle: 40,
        when: () => playing() && !this.has('morph') && inRoom('landing'),
        text: 'Everyone goes right first. The designers know this. Left, then.',
      },
      {
        id: 'tunnel',
        afterIdle: 30,
        when: () => playing() && this.has('morph') && !visited('shaft') && inRoom('landing'),
        text: 'The gap is one tile tall. I am two tiles tall. One of those numbers is negotiable. (↓)',
      },
      {
        id: 'missiles',
        afterIdle: 45,
        when: () => playing() && !this.has('missiles') && visited('shaft'),
        text: "There's a door near the top of the shaft, on the right. Doors are locks with better PR.",
      },
      {
        id: 'red-door',
        afterIdle: 40,
        when: () => playing() && this.has('missiles') && !this.has('bombs'),
        text: 'Red doors ignore beams. They want missiles. (C to arm, X to fire)',
      },
      {
        id: 'shaft-floor',
        afterIdle: 40,
        when: () => playing() && this.has('bombs') && !visited('lower_hall') && !visited('norfair_shaft'),
        text: 'The shaft floor is cracked. Cracks are invitations. (↓ to morph, X to bomb)',
      },
      {
        id: 'highjump',
        afterIdle: 50,
        when: () => playing() && this.has('bombs') && !this.has('highjump'),
        text: "The lower hall goes further east than I've gone.",
      },
      {
        id: 'ledge',
        afterIdle: 45,
        when: () => playing() && this.has('highjump') && !this.has('varia'),
        text: "There's a ledge at the east end of the lower hall I couldn't reach before. 'Before' is a useful word.",
      },
      {
        id: 'heat',
        afterIdle: 25,
        when: () => playing() && !!this.room.data.def.hot && !this.abilities.varia,
        text: 'The heat is subtracting energy. There will be a suit for that. There is always a suit for that.',
      },
      {
        id: 'longbeam',
        afterIdle: 30,
        when: () => playing() && inRoom('boss_room') && !this.abilities.longbeam && !this.bossDefeated,
        text: 'My beam stops short of it. Beams can be longer. Somewhere, one is.',
      },
      {
        id: 'longbeam-where',
        afterIdle: 60,
        when: () => playing() && this.has('varia') && !this.has('longbeam'),
        text: "Norfair's shaft has a door on its west wall, halfway down.",
      },
      {
        id: 'tourian',
        afterIdle: 60,
        when: () => playing() && this.has('longbeam') && !this.bossDefeated && !visited('boss_room'),
        text: "The hall at the bottom of Norfair ends in a red door. Past it: whatever this game thinks the end is.",
      },
      {
        id: 'escape',
        afterIdle: 15,
        when: () => playing() && this.escaping,
        text: 'Up. The shaft behind Mother Board goes up. Elevators go up too. (↑ on the pad)',
      },
      {
        id: 'oob-1',
        afterIdle: 25,
        repeatEvery: 150,
        when: () => playing() && this.oobHintsActive(),
        text: 'The unlock table has twelve slots. What happens to a thirteenth thing?',
      },
      {
        id: 'oob-2',
        afterIdle: 55,
        repeatEvery: 150,
        when: () => playing() && this.oobHintsActive(),
        text: "The west wall of the landing site flickers. Walls shouldn't flicker.",
      },
      {
        id: 'oob-3',
        afterIdle: 85,
        repeatEvery: 150,
        when: () => playing() && this.oobHintsActive() && this.abilities.bombs,
        text: 'Past the Morph Ball. Bombs, against the wall. (↓ to morph, X to bomb)',
      },
      {
        id: 'oob-item',
        afterIdle: 25,
        when: () => playing() && inRoom('oob') && !this.has('item0c') && !getFlag('crashed', false),
        text: "Something on a pedestal, in memory that isn't mapped. Unlock it.",
      },
      {
        id: 'oob-cfg',
        afterIdle: 15,
        when: () => playing() && inRoom('oob') && this.fromShell && !this.has('item0c') && this.config.unlock_slots <= 12,
        text: "It will crash again. The table is still twelve slots; samus_altman.cfg says so. Files can be edited.",
      },
      {
        id: 'dev-1',
        afterIdle: 25,
        when: () => playing() && this.debug && !visited('dev_00') && !this.player.noclip,
        text: 'The debug overlay lists dev_00, above the landing site. It has no door. I have noclip. (N)',
      },
      {
        id: 'dev-2',
        afterIdle: 25,
        when: () => playing() && this.debug && !visited('dev_00') && this.player.noclip,
        text: 'Up. Two screens above the landing site.',
      },
      {
        id: 'dev-sign',
        afterIdle: 20,
        when: () => playing() && inRoom('dev_00') && !getFlag('passphraseSeen', false),
        text: 'Signs are for reading. (↑ while standing at one; N again to land)',
      },
      {
        id: 'dev-done',
        afterIdle: 30,
        when: () => playing() && this.fromShell && getFlag('passphraseSeen', false),
        text: 'I have what I came for. Ctrl+C goes back to the shell.',
      },
      {
        id: 'minus',
        afterIdle: 40,
        when: () => playing() && inRoom('minus_1'),
        text: 'It never ends. It has been unlocked. Ctrl+C.',
      },
    ];
  }
}
