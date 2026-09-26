// Tunables for Samus Altman. Units: pixels and frames at 60 fps.

export const SCREEN_W = 256;
export const SCREEN_H = 240;
export const TILE = 16;
export const SCREEN_COLS = 16;
export const SCREEN_ROWS = 15;

export const GRAVITY = 0.25;
export const MAX_FALL = 5;
export const RUN_SPEED = 1.5;
export const RUN_ACCEL = 0.35;
/** Apex ≈ 4.2 tiles: clears 3-tile ledges, never 5. */
export const JUMP_V = 5.7;
/** Apex ≈ 7 tiles: clears the 5–6 tile high-jump ledges. */
export const HIGH_JUMP_V = 7.5;
/** Releasing jump while rising caps upward speed to this. */
export const JUMP_CUT = 1.25;

export const PLAYER_W = 12;
export const PLAYER_H = 30;
export const BALL_W = 12;
export const BALL_H = 12;

export const BEAM_SPEED = 5;
/** NES short beam: shots fizzle after about 3.5 tiles. */
export const SHORT_BEAM_RANGE = 52;
export const MISSILE_SPEED = 4;
export const FIRE_COOLDOWN = 10;
export const BOMB_FUSE = 36;
export const BOMB_RADIUS = 14;
export const MAX_BOMBS = 3;

export const CONTACT_DAMAGE = 8;
export const INVULN_FRAMES = 60;
/** Without Varia, hot rooms take 1 energy every this many frames. */
export const HEAT_INTERVAL = 20;
export const LAVA_INTERVAL = 5;
export const BASE_MAX_ENERGY = 99;

export const ESCAPE_SECONDS = 90;
export const FIRST_OOB_HINT_SECONDS = 15 * 60;
