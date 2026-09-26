// Procedural pixel art: string-array sprites + palettes, rendered once into small canvases.

export type Palette = Record<string, string>;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function spriteFrom(rows: string[], pal: Palette, flip = false): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = pal[ch];
      if (!col) return;
      g.fillStyle = col;
      g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    });
  });
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();
export function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------- Samus

export type SuitName = 'power' | 'varia' | 'pink' | 'narpas';

export const SUITS: Record<SuitName, Palette> = {
  power: { k: '#301000', r: '#d82800', y: '#f8b800', g: '#58d854', w: '#fcfcfc', d: '#881400' },
  varia: { k: '#301000', r: '#b83000', y: '#fc7400', g: '#58d854', w: '#fcd8a8', d: '#881400' },
  pink: { k: '#300018', r: '#f878f8', y: '#fcc4fc', g: '#3cbcfc', w: '#fcfcfc', d: '#a8007c' },
  narpas: { k: '#000000', r: '#fcfcfc', y: '#a8e4fc', g: '#f83800', w: '#ffffff', d: '#7c7c7c' },
};

const UPPER = [
  '......kkkk......',
  '.....kyyyykk....',
  '....kyyyyyyyk...',
  '....kyyyyggggk..',
  '....kyyyggwwgk..',
  '....kyyyyggggk..',
  '.....kyyyyyyk...',
  '...kkkkyyyykk...',
  '..kyyyykkkkyykk.',
  '.kyyyyyykrkyyyyk',
  '.kywyyyykrkyyyyk',
  '.kyyyyyykrkkkkkk',
  '.kyyyyykrrrkyyyk',
  '..kyyykrrrrrkkk.',
  '...kkkrrrrrrk...',
  '....krrrrrrrk...',
  '....kyyyyyyyk...',
];

const UPPER_AIM_UP = [
  '...........kk...',
  '......kkkkkyyk..',
  '.....kyyyykyyk..',
  '....kyyyyyykyk..',
  '....kyyyygkyyk..',
  '....kyyyggkyyk..',
  '....kyyyygkyyk..',
  '.....kyyyykyyk..',
  '...kkkkyyykyyk..',
  '..kyyyykkkkyyk..',
  '.kyyyyyykrkyyk..',
  '.kywyyyykrkyyk..',
  '.kyyyyyykrkkk...',
  '.kyyyyykrrrk....',
  '..kyyykrrrrrk...',
  '...kkkrrrrrrk...',
  '....krrrrrrrk...',
];

const LEGS_STAND = [
  '...krrrrkkrrrk..',
  '...kyyyk.kyyyk..',
  '...kyyyk.kyyyk..',
  '...krrrk.krrrk..',
  '...kyyyk.kyyyk..',
  '...kyyyk.kyyyk..',
  '...kyyyk.kyyyk..',
  '...krrrk.krrrk..',
  '...kyyyk.kyyyk..',
  '...kyyyk.kyyyk..',
  '..kyyyyk.kyyyyk.',
  '..kyyyyk.kyyyyk.',
  '.kyyyyyk.kyyyyyk',
  '.kkkkkkk.kkkkkkk',
];

const LEGS_RUN = [
  [
    '...krrrrkkrrrk..',
    '..kyyyk...kyyyk.',
    '..kyyyk....kyyyk',
    '.krrrk.....krrrk',
    '.kyyyk......kyyk',
    'kyyyk.......kyyk',
    'kyyyk.......krrk',
    'krrrk.......kyyk',
    'kyyk.......kyyyk',
    'kyyk.......kyyyk',
    'kkkk.......kkkkk',
  ],
  [
    '....krrrkrrrk...',
    '....kyyykyyyk...',
    '....kyyyykyyk...',
    '....krrrkrrk....',
    '....kyyykyyk....',
    '....kyyykyyk....',
    '....kyyyyyk.....',
    '....krrrrrk.....',
    '...kyyyyyk......',
    '...kyyyyyk......',
    '..kyyyyyyk......',
    '..kkkkkkkk......',
  ],
  [
    '...krrrrkkrrrk..',
    '...kyyyk..kyyyk.',
    '..kyyyk....kyyk.',
    '..krrk.....kyyk.',
    '.kyyk......krrk.',
    '.kyyk.....kyyk..',
    'kyyk......kyyk..',
    'krrk.....kyyyk..',
    'kyyk.....kyyyk..',
    'kyyyk...kyyyyk..',
    'kkkkk...kkkkkk..',
  ],
];

const LEGS_JUMP = [
  '...krrrrkkrrrk..',
  '...kyyyk.kyyyyk.',
  '...kyyyk..kyyyyk',
  '...krrrk...krrrk',
  '...kyyyk..kyyyk.',
  '..kyyyk..kyyyk..',
  '..kyyyk..kkkk...',
  '..krrrk.........',
  '..kyyyk.........',
  '.kyyyyk.........',
  '.kkkkkk.........',
];

const SPIN = [
  '....kkkkkk....',
  '..kkyyyyyykk..',
  '.kyyrrrrrryyk.',
  '.kyrrggrrrryk.',
  'kyrrgwwgrrrryk',
  'kyrrggggrrrryk',
  'kyrrrrrrrrrryk',
  'kyyrrrrrrrryyk',
  'kyyyrrrrrryyyk',
  '.kyyyrrrryyyk.',
  '.kkyyyyyyyykk.',
  '...kkkkkkkk...',
];

const BALL = [
  '....kkkk....',
  '..kkyyyykk..',
  '.kyyrrrryyk.',
  '.kyrwwrrrryk',
  'kyrwwrrrrryk',
  'kyrrrrrrrryk',
  'kkkkkkkkkkkk',
  'kyrrrrrrrryk',
  'kyrrrrrrrryk',
  '.kyrrrrrryk.',
  '..kkyyyykk..',
  '....kkkk....',
];

/** Stack upper body on legs and bottom-align so the feet always sit on row 30 of a 16×32 cell. */
function compose(upper: string[], legs: string[]): string[] {
  const rows = [...upper, ...legs];
  while (rows.length < 31) rows.unshift('................');
  rows.push('................');
  return rows;
}

export type SamusPose = 'stand' | 'run0' | 'run1' | 'run2' | 'jump' | 'standUp' | 'jumpUp';

export function samusSprite(pose: SamusPose, suit: SuitName, facing: 1 | -1): HTMLCanvasElement {
  return cached(`samus:${pose}:${suit}:${facing}`, () => {
    const upper = pose === 'standUp' || pose === 'jumpUp' ? UPPER_AIM_UP : UPPER;
    const legs =
      pose === 'jump' || pose === 'jumpUp'
        ? LEGS_JUMP
        : pose.startsWith('run')
          ? LEGS_RUN[Number(pose[3])]
          : LEGS_STAND;
    return spriteFrom(compose(upper, legs), SUITS[suit], facing === -1);
  });
}

export function spinSprite(suit: SuitName): HTMLCanvasElement {
  return cached(`spin:${suit}`, () => spriteFrom(SPIN, SUITS[suit]));
}

export function ballSprite(suit: SuitName): HTMLCanvasElement {
  return cached(`ball:${suit}`, () => spriteFrom(BALL, SUITS[suit]));
}

// ---------------------------------------------------------------- enemies

const ZOOMER = [
  '..r...r...r...r.',
  '.rrr.rrr.rrr.rrr',
  '..kkkkkkkkkkkk..',
  '.kyyyyyyyyyyyyk.',
  'kyywwyyyyyyyyyyk',
  'kyyyyyyyyyyyyyyk',
  'kyyyyyyyyyyyyyyk',
  'kyyykkyyyykkyyyk',
  '.kk.rr.kk.rr.kk.',
  '..r....r....r...',
];

const SKREE = [
  'kkkkkkkkkkkk',
  'kggggggggggk',
  'kgwggggggggk',
  '.kggggggggk.',
  '.kgkggggkgk.',
  '.kggggggggk.',
  '..kggggggk..',
  '..kgyyyygk..',
  '...kyyyyk...',
  '...kyyyyk...',
  '....kyyk....',
  '....kyyk....',
  '.....kk.....',
];

const RIPPER = [
  '....kkkkkkkk....',
  '..kkyyyyyyyykk..',
  '.kyywyyyyyyyyyk.',
  'kyyyyyyyyyyyyyyk',
  'krrrrrrrrrrrrrrk',
  '.krrkrrrrrrkrrk.',
  '..kk.kkkkkk.kk..',
];

const RIO = [
  'k..............k',
  'kk....kkkk....kk',
  'kyk..kyyyyk..kyk',
  'kyyk.kywwyk.kyyk',
  '.kyykyyyyyykyyk.',
  '..kyyyyrryyyyk..',
  '...kyyrrrryyk...',
  '....kkyyyykk....',
  '......kyyk......',
  '.......kk.......',
];

const RIO_FLAP = [
  '................',
  '......kkkk......',
  '.....kyyyyk.....',
  'kkk..kywwyk..kkk',
  'kyykkyyyyyykkyyk',
  '.kyyyyyrryyyyyk.',
  '..kkkyrrrrykkk..',
  '....kkyyyykk....',
  '......kyyk......',
  '.......kk.......',
];

const RING = [
  '...kkkk...',
  '.kkrrrrkk.',
  '.krr..rrk.',
  'krr....rrk',
  'kr......rk',
  'kr......rk',
  'krr....rrk',
  '.krr..rrk.',
  '.kkrrrrkk.',
  '...kkkk...',
];

const TEST_ENEMY = [
  'kkkkkkkkkkkkkk',
  'kppppppppppppk',
  'kpwwwwwwwwwwpk',
  'kpw..w..w..wpk',
  'kpw..w..w..wpk',
  'kpwwwwwwwwwwpk',
  'kpwwkwwwwkwwpk',
  'kpwwkwwwwkwwpk',
  'kpwwwwwwwwwwpk',
  'kpwkwwwwwwkwpk',
  'kpwwkkkkkkwwpk',
  'kpwwwwwwwwwwpk',
  'kppppppppppppk',
  'kkkkkkkkkkkkkk',
  '.kk........kk.',
  '.kk........kk.',
];

export const ENEMY_PAL: Record<string, Palette> = {
  brinstar: { k: '#000000', y: '#f8b800', r: '#d82800', w: '#fcfcfc', g: '#58d854' },
  norfair: { k: '#000000', y: '#fc7460', r: '#fcfc58', w: '#fcfcfc', g: '#f83800' },
  tourian: { k: '#000000', y: '#a8e4fc', r: '#f878f8', w: '#fcfcfc', g: '#3cbcfc' },
  dev: { k: '#000000', p: '#ff00ff', w: '#dddddd', y: '#cccccc', r: '#888888' },
  flash: { k: '#fcfcfc', y: '#fcfcfc', r: '#fcfcfc', w: '#fcfcfc', g: '#fcfcfc', p: '#fcfcfc' },
};

const ENEMY_ART: Record<string, string[]> = {
  zoomer: ZOOMER,
  skree: SKREE,
  ripper: RIPPER,
  rio: RIO,
  rioFlap: RIO_FLAP,
  ring: RING,
  test: TEST_ENEMY,
};

export function enemySprite(kind: string, pal: string, flip = false, flipV = false): HTMLCanvasElement {
  return cached(`enemy:${kind}:${pal}:${flip}:${flipV}`, () => {
    const rows = flipV ? [...ENEMY_ART[kind]].reverse() : ENEMY_ART[kind];
    return spriteFrom(rows, ENEMY_PAL[pal] ?? ENEMY_PAL.brinstar, flip);
  });
}

// ---------------------------------------------------------------- items

const ORB = [
  '....kkkk....',
  '..kkccccdk..',
  '.kcwwccccdk.',
  '.kcwwccccdk.',
  'kccccccccddk',
  'kcccccccccdk',
  'kccccccccddk',
  'kccccccccddk',
  '.kcccccccdk.',
  '.kdccccdddk.',
  '..kkddddkk..',
  '....kkkk....',
];

function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

export function orbSprite(color: string): HTMLCanvasElement {
  return cached(`orb:${color}`, () =>
    spriteFrom(ORB, { k: '#000000', c: color, d: darken(color, 0.55), w: '#fcfcfc' }),
  );
}

export { darken };
