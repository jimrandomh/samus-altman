// Samus: movement, morphing, jumping. Pure logic; the game handles damage, shots and rendering.
import {
  BALL_H,
  GRAVITY,
  HIGH_JUMP_V,
  JUMP_CUT,
  JUMP_V,
  MAX_FALL,
  PLAYER_H,
  PLAYER_W,
  RUN_ACCEL,
  RUN_SPEED,
} from './constants';
import { moveAxis, onGround, overlapsSolid, type Body } from './physics';
import type { RoomRuntime } from './world';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'fire' | 'toggle' | 'pause' | 'noclip';

export interface InputState {
  held(a: Action): boolean;
  pressed(a: Action): boolean;
}

export interface Abilities {
  morph: boolean;
  bombs: boolean;
  missiles: boolean;
  highjump: boolean;
  varia: boolean;
  longbeam: boolean;
}

export const NO_ABILITIES: Abilities = {
  morph: false,
  bombs: false,
  missiles: false,
  highjump: false,
  varia: false,
  longbeam: false,
};

export interface PlayerEnv {
  room: RoomRuntime;
  input: InputState;
  abilities: Abilities;
  water: boolean;
  /** Called when the player wants to shoot (or bomb, when morphed). */
  fire?(): void;
  sound?(name: 'jump' | 'blip'): void;
}

export class Player implements Body {
  x = 0;
  y = 0;
  w = PLAYER_W;
  h = PLAYER_H;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  ball = false;
  grounded = false;
  aimUp = false;
  jumping = false;
  spin = false;
  /** Frames of lost control after taking a hit. */
  stun = 0;
  invuln = 0;
  noclip = false;
  runT = 0;
  /** Frames since last on the ground (coyote time). */
  airT = 0;
  /** Frames since jump was pressed (jump buffering). */
  jumpBuf = 99;
  ballRot = 0;

  /** Place with feet on the bottom edge of tile (col, row). */
  placeAtTile(col: number, row: number): void {
    this.ball = false;
    this.w = PLAYER_W;
    this.h = PLAYER_H;
    this.x = col * 16 + (16 - this.w) / 2;
    this.y = (row + 1) * 16 - this.h;
    this.vx = this.vy = 0;
  }

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }
  get feet(): number {
    return this.y + this.h;
  }

  /** Try to curl up; always possible. */
  morph(): void {
    if (this.ball) return;
    this.ball = true;
    this.y += PLAYER_H - BALL_H;
    this.h = BALL_H;
    this.spin = false;
  }

  /** Try to stand up; fails under a low ceiling. */
  unmorph(room: RoomRuntime): boolean {
    if (!this.ball) return true;
    const ny = this.y - (PLAYER_H - BALL_H);
    if (overlapsSolid(room, this.x, ny, PLAYER_W, PLAYER_H)) return false;
    this.ball = false;
    this.y = ny;
    this.h = PLAYER_H;
    return true;
  }

  update(env: PlayerEnv): void {
    const { input, room, abilities } = env;
    if (this.invuln > 0) this.invuln--;

    if (this.noclip) {
      const sp = 3;
      this.vx = (input.held('right') ? sp : 0) - (input.held('left') ? sp : 0);
      this.vy = (input.held('down') ? sp : 0) - (input.held('up') ? sp : 0);
      this.x += this.vx;
      this.y += this.vy;
      if (this.vx) this.facing = this.vx > 0 ? 1 : -1;
      this.grounded = false;
      this.spin = false;
      if (input.pressed('fire')) env.fire?.();
      return;
    }

    const dir = this.stun > 0 ? 0 : (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    if (this.stun > 0) this.stun--;
    const speed = RUN_SPEED * (env.water ? 0.65 : 1);
    if (dir !== 0) this.facing = dir as 1 | -1;
    if (this.stun === 0) {
      const target = dir * speed;
      const accel = this.grounded ? RUN_ACCEL : RUN_ACCEL * 0.8;
      if (this.vx < target) this.vx = Math.min(target, this.vx + accel);
      else if (this.vx > target) this.vx = Math.max(target, this.vx - accel);
    }

    // Morph / unmorph.
    if (!this.ball && input.pressed('down') && abilities.morph && this.stun === 0) {
      this.morph();
    } else if (this.ball && (input.pressed('up') || input.pressed('jump'))) {
      this.unmorph(room);
    }
    this.aimUp = !this.ball && input.held('up');

    // Jump (with a few frames of coyote time and input buffering).
    this.jumpBuf = input.pressed('jump') ? 0 : this.jumpBuf + 1;
    const canJump = this.grounded || (this.airT < 5 && !this.jumping && this.vy >= 0);
    if (!this.ball && canJump && this.jumpBuf < 6 && (input.held('jump') || input.pressed('jump')) && this.stun === 0) {
      this.vy = -(abilities.highjump ? HIGH_JUMP_V : JUMP_V) * (env.water ? 0.85 : 1);
      this.jumping = true;
      this.grounded = false;
      this.jumpBuf = 99;
      this.spin = Math.abs(this.vx) > 0.5;
      env.sound?.('jump');
    }
    if (this.jumping && this.vy < -JUMP_CUT && !input.held('jump')) this.vy = -JUMP_CUT;

    if (input.pressed('fire') && this.stun === 0) env.fire?.();

    // Gravity and movement.
    const g = GRAVITY * (env.water ? 0.5 : 1);
    const maxFall = env.water ? 2.5 : MAX_FALL;
    this.vy = Math.min(maxFall, this.vy + g);
    moveAxis(room, this, 'x');
    const wasRising = this.vy < 0;
    const hitY = moveAxis(room, this, 'y');
    if (hitY && wasRising) this.jumping = false;
    this.grounded = onGround(room, this);
    this.airT = this.grounded ? 0 : this.airT + 1;
    if (this.grounded) {
      this.jumping = false;
      this.spin = false;
      if (this.vy > 0) this.vy = 0;
    }

    if (this.grounded && Math.abs(this.vx) > 0.1) this.runT += Math.abs(this.vx);
    else if (this.grounded) this.runT = 0;
    if (this.ball) this.ballRot += this.vx * 0.25;
  }
}
