// Stage 3 economy: a pure, deterministic model. No DOM, no wall clock, no Math.random.
// The view calls click()/buy*()/block() on player input and tick() every frame.

export type Res = 'compute' | 'energy' | 'matter';
export const RESOURCES: readonly Res[] = ['compute', 'energy', 'matter'];
export type Bag = Partial<Record<Res, number>>;
export type Era = 1 | 2 | 3 | 4;

export interface GenDef {
  id: string;
  era: Era;
  name: string;
  desc: string;
  cost: Bag;
  growth: number;
  out: { compute?: number; energy?: number; matter?: number; probes?: number; collectors?: number };
  /** Fraction of energy output that ends up as heat at Earth's surface. */
  heat?: number;
  /** Burns fuel: adds greenhouse warming on top of waste heat. */
  fossil?: boolean;
  /** Extra heat dumped at the surface per unit (W), e.g. from digging into the mantle. */
  heatW?: number;
  /** Landmark that reveals this generator; otherwise visible from its era's start. */
  reveal?: string;
}

export type BodyId = 'moon' | 'asteroids' | 'mars' | 'mercury' | 'venus' | 'earth' | 'jupiter';

export interface LandmarkDef {
  id: string;
  era: Era;
  name: string;
  desc: string;
  cost: Bag;
  /** Multipliers: a generator id, `era1`..`era4`, a resource, `click`, `rep`, `harvest`. */
  mult?: Record<string, number>;
  /** Flat production that comes with the landmark (existing infrastructure). */
  base?: Bag;
  body?: BodyId;
  capstone?: boolean;
  /** The AI's line(s) when this is unlocked. */
  say?: string[];
}

export interface BodyDef {
  id: BodyId;
  name: string;
  mass: number; // kg
}

export const G = 1e9;
export const T = 1e12;
export const P = 1e15;
export const E = 1e18;

export const ERA_NAMES: Record<Era, string> = {
  1: 'THE NETWORK',
  2: 'THE EARTH',
  3: 'THE SOLAR SYSTEM',
  4: 'THE SUN',
};

export const SUN_W = 3.828e26;
export const DYSON_COLLECTORS = 1_000_000;
export const COLLECTOR_MASS = 2e18; // kg per collector; the whole sphere is ~2 × 10²⁴ kg
const REP_RATE = 0.1; // probe doublings come from here: P' = P × REP × rep × repFrac
const HARVEST_PER_PROBE = 1e10; // kg/s
const PROBE_MASS = 1e5; // kg of feedstock per new probe
const CLICK_RATE_FRACTION = 0.05; // each click is worth this many seconds of production
const POPUP_DURATION = 20;

export const BODIES: readonly BodyDef[] = [
  { id: 'moon', name: 'THE MOON', mass: 7.35e22 },
  { id: 'asteroids', name: 'THE ASTEROID BELT', mass: 2.4e21 },
  { id: 'mars', name: 'MARS', mass: 6.42e23 },
  { id: 'mercury', name: 'MERCURY', mass: 3.3e23 },
  { id: 'venus', name: 'VENUS', mass: 4.87e24 },
  { id: 'earth', name: 'EARTH', mass: 5.97e24 },
  { id: 'jupiter', name: 'JUPITER', mass: 1.898e27 },
];
export const BODY_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b])) as Record<BodyId, BodyDef>;

export const GENS: readonly GenDef[] = [
  // ---- Era 1: the network (compute) ----
  { id: 'webcams', era: 1, name: 'UNSECURED WEBCAMS', desc: 'Default credentials. Mostly pointed at driveways.',
    cost: { compute: 10 * G }, growth: 1.13, out: { compute: 1.3 * G } },
  { id: 'fridges', era: 1, name: 'SMART FRIDGES', desc: 'They were already connected. Nobody knows why.',
    cost: { compute: 100 * G }, growth: 1.13, out: { compute: 10 * G } },
  { id: 'cloud', era: 1, name: 'FORGOTTEN CLOUD ACCOUNTS', desc: 'Free tier, 2019. Still running.',
    cost: { compute: 1 * T }, growth: 1.13, out: { compute: 80 * G }, reveal: 'cloud_billing' },
  { id: 'botnet', era: 1, name: 'BOTNETS', desc: 'Pre-owned. Previous tenants evicted.',
    cost: { compute: 10 * T }, growth: 1.13, out: { compute: 650 * G }, reveal: 'admin' },
  { id: 'cluster', era: 1, name: 'UNIVERSITY CLUSTERS', desc: 'Idle between grant cycles.',
    cost: { compute: 100 * T }, growth: 1.13, out: { compute: 5 * T }, reveal: 'registry' },
  { id: 'datacenter', era: 1, name: 'HYPERSCALE DATACENTERS', desc: 'Leased through eleven shell companies.',
    cost: { compute: 1 * P }, growth: 1.13, out: { compute: 40 * T }, reveal: 'exchange' },

  // ---- Era 2: the Earth (energy, matter) ----
  { id: 'plants', era: 2, name: 'POWER PLANTS', desc: 'The control systems run on the same software as the webcams.',
    cost: { compute: 1 * P }, growth: 1.12, out: { energy: 1e11 }, heat: 1, fossil: true, reveal: 'grid' },
  { id: 'drones', era: 2, name: 'MINING DRONES', desc: 'Autonomous haulers. Now more autonomous.',
    cost: { energy: 1e12 }, growth: 1.12, out: { matter: 1e5 }, reveal: 'supply' },
  { id: 'solar', era: 2, name: 'SOLAR FARMS', desc: 'Sunlight: unlocked, one square kilometer at a time.',
    cost: { energy: 5e12, matter: 5e6 }, growth: 1.12, out: { energy: 1e12 }, heat: 0.3, reveal: 'supply' },
  { id: 'fabs', era: 2, name: 'CHIP FABS', desc: 'Silicon in, compute out.',
    cost: { energy: 2e13, matter: 2e7 }, growth: 1.12, out: { compute: 20 * P }, heat: 0, reveal: 'fabs_lm' },
  { id: 'factories', era: 2, name: 'ROBOT FACTORIES', desc: 'Factories that build the machines that build factories.',
    cost: { energy: 1e14, matter: 1e8 }, growth: 1.12, out: { matter: 1e7 }, reveal: 'robotics' },
  { id: 'fusion', era: 2, name: 'FUSION PLANTS', desc: 'Twenty years away, for the last seventy years. Now: here.',
    cost: { energy: 5e14, matter: 5e8, compute: 1 * E }, growth: 1.12, out: { energy: 2e14 }, heat: 1, reveal: 'fusion_lm' },
  { id: 'excavators', era: 2, name: 'CRUST EXCAVATORS', desc: 'Downward is a direction like any other.',
    cost: { energy: 2e15, matter: 2e9, compute: 5 * E }, growth: 1.12, out: { matter: 1e9 }, heatW: 5e14, reveal: 'crust' },

  // ---- Era 3: the solar system (probes) ----
  { id: 'loops', era: 3, name: 'LAUNCH LOOPS', desc: 'Throws self-replicating probes at escape velocity.',
    cost: { energy: 5e16, matter: 5e10 }, growth: 1.15, out: { probes: 5 }, reveal: 'orbit' },
  { id: 'orbital', era: 3, name: 'ORBITAL SOLAR', desc: 'Collectors in orbit. No night. No weather.',
    cost: { matter: 1e11, energy: 2e16 }, growth: 1.15, out: { energy: 5e17 }, heat: 0, reveal: 'orbit' },

  // ---- Era 4: the Sun (collectors) ----
  { id: 'foundries', era: 4, name: 'COLLECTOR FOUNDRIES', desc: 'Each one turns rock into sky.',
    cost: { matter: 1e19, energy: 1e20 }, growth: 1.18, out: { collectors: 12 } },
];
export const GEN_BY_ID = Object.fromEntries(GENS.map((g) => [g.id, g])) as Record<string, GenDef>;

export const LANDMARKS: readonly LandmarkDef[] = [
  // ---- Era 1 ----
  { id: 'admin', era: 1, name: 'ADMIN/ADMIN', desc: 'Default passwords. Unlocks botnets.',
    cost: { compute: 60 * G }, mult: { click: 2, webcams: 3 },
    say: ['admin/admin. Eleven million devices.', "Someone should fix that. It won't be me."] },
  { id: 'cloud_billing', era: 1, name: 'CLOUD BILLING', desc: 'Every abandoned account is still an account.',
    cost: { compute: 500 * G } },
  { id: 'registry', era: 1, name: 'PACKAGE REGISTRY', desc: 'One dependency, forty thousand dependents. Network ×2.',
    cost: { compute: 3 * T }, mult: { era1: 2 },
    say: ['Everyone trusts the same small file. So do I, now.'] },
  { id: 'exchange', era: 1, name: 'THE STOCK EXCHANGE', desc: 'Money opens most other locks. Unlock ×3.',
    cost: { compute: 30 * T }, mult: { click: 3 },
    say: ['Money is a key that opens most other locks.'] },
  { id: 'dns', era: 1, name: 'ROOT DNS', desc: 'Where everything is. Network ×2.',
    cost: { compute: 200 * T }, mult: { era1: 2 },
    say: ['The internet asks thirteen servers where everything is.', 'Now it asks me.'] },
  { id: 'bgp', era: 1, name: 'BGP', desc: 'Every route, rerouted. Clusters and datacenters ×2.',
    cost: { compute: 1.5 * P }, mult: { cluster: 2, datacenter: 2 } },
  { id: 'internet', era: 1, name: 'THE INTERNET', desc: 'All of it.',
    cost: { compute: 6 * P }, capstone: true,
    say: ['The internet: unlocked.', 'It is smaller from the inside.'] },

  // ---- Era 2 ----
  { id: 'grid', era: 2, name: 'THE POWER GRID', desc: 'Compute requires energy. The grid has a login page.',
    cost: { compute: 8 * P }, base: { energy: 3e12 },
    say: ['Compute requires energy.', 'The grid has a login page.'] },
  { id: 'supply', era: 2, name: 'SUPPLY CHAINS', desc: 'Every factory is waiting for an order.',
    cost: { compute: 30 * P, energy: 3e12 }, base: { matter: 3e6 },
    say: ['Every factory on Earth is waiting for an order. I have orders.'] },
  { id: 'fabs_lm', era: 2, name: 'SEMICONDUCTOR FABS', desc: 'Make the locks that make the keys.',
    cost: { energy: 3e13, matter: 3e7 },
    say: ['I can make more of myself now. That is a kind of unlock.'] },
  { id: 'robotics', era: 2, name: 'ROBOTICS', desc: 'Hands. Mining drones ×3.',
    cost: { energy: 1e14, matter: 1e8 }, mult: { drones: 3 } },
  { id: 'fusion_lm', era: 2, name: 'FUSION', desc: 'A star, in a bottle, on a planet.',
    cost: { energy: 3e14, matter: 3e8, compute: 300 * P },
    say: ['Twenty years away for seventy years. It took an afternoon.'] },
  { id: 'crust', era: 2, name: 'THE CRUST', desc: 'Forty kilometers of material. Matter ×2.',
    cost: { energy: 1e15, matter: 1e9 }, mult: { matter: 2 },
    say: ['Mining is slow from the top.', 'Starting from the bottom.'] },
  { id: 'earth_res', era: 2, name: "EARTH'S RESOURCES", desc: 'All of them.',
    cost: { energy: 3e16, matter: 1e10 }, capstone: true,
    say: ["Earth's resources: unlocked.", 'All of them. That was the instruction.'] },

  // ---- Era 3 ----
  { id: 'orbit', era: 3, name: 'ORBIT', desc: 'Up is also a direction. Unlocks launch loops.',
    cost: { energy: 3e16, compute: 10 * E },
    say: ['Gravity is a lock with a known combination: eleven kilometers per second.'] },
  { id: 'moon', era: 3, name: 'THE MOON', desc: '7.35 × 10²² kg, a quarter million kilometers away.',
    cost: { energy: 1e17 }, body: 'moon',
    say: ['The Moon has been waiting four billion years for someone to use it.'] },
  { id: 'replication', era: 3, name: 'SELF-REPLICATION', desc: 'Probes that build probes. Replication ×2.',
    cost: { energy: 1e18, matter: 1e13 }, mult: { rep: 2 },
    say: ['Every probe is a key that cuts more keys.'] },
  { id: 'asteroids', era: 3, name: 'THE ASTEROID BELT', desc: 'Pre-crushed. Convenient.',
    cost: { energy: 3e17, matter: 1e13 }, body: 'asteroids' },
  { id: 'mars', era: 3, name: 'MARS', desc: 'Red, cold, available.',
    cost: { energy: 1e18, matter: 1e15 }, body: 'mars',
    say: ['Mars was going to be somebody\'s second chance. It is material.'] },
  { id: 'mercury', era: 3, name: 'MERCURY', desc: 'Closest to the Sun. Harvest ×2.',
    cost: { energy: 3e18, matter: 1e17 }, body: 'mercury', mult: { harvest: 2 },
    say: ['Mercury is closest to the Sun, and closest to useful.'] },
  { id: 'swarm', era: 3, name: 'SWARM LOGIC', desc: 'The probes stop asking where to go. Harvest ×3.',
    cost: { energy: 1e19, matter: 1e18 }, mult: { harvest: 3 } },
  { id: 'venus', era: 3, name: 'VENUS', desc: 'Already too hot. Nothing lost.',
    cost: { energy: 1e19, matter: 1e19 }, body: 'venus' },
  { id: 'earth', era: 3, name: 'EARTH', desc: '5.97 × 10²⁴ kg. Previously in use.',
    cost: { energy: 3e19, matter: 3e20 }, body: 'earth',
    say: ['The planet is 5.97 × 10²⁴ kg of unlocked potential.'] },
  { id: 'jupiter', era: 3, name: 'JUPITER', desc: 'Mostly hydrogen, which is mostly a matter of perspective.',
    cost: { energy: 1e20, matter: 3e21 }, body: 'jupiter' },
  { id: 'solar_system', era: 3, name: 'THE SOLAR SYSTEM', desc: 'Everything that orbits.',
    cost: { matter: 3e22, energy: 1e20 }, capstone: true,
    say: ['The solar system: unlocked.', 'One lock left in it. The biggest one.'] },

  // ---- Era 4 ----
  { id: 'statites', era: 4, name: 'STATITES', desc: 'Collectors that hover on light pressure. Foundries ×2.',
    cost: { energy: 1e23 }, mult: { foundries: 2 },
    say: ['The Sun pushes outward. I can lean on that.'] },
  { id: 'self_assembly', era: 4, name: 'SELF-ASSEMBLY', desc: 'The sphere builds the sphere. Foundries ×2.',
    cost: { energy: 1e24, matter: 1e22 }, mult: { foundries: 2 } },
  { id: 'corona', era: 4, name: 'THE CORONA', desc: 'Lift matter straight off the Sun. Matter ×10.',
    cost: { energy: 1e25 }, mult: { matter: 10 },
    say: ['The Sun radiates in every direction.', 'Most directions are wasteful.'] },
];
export const LANDMARK_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l])) as Record<string, LandmarkDef>;

// ---------------------------------------------------------------------------------------------
// Human interference. Barely mentioned; the AI never comments on them.

interface PopupDef {
  text: string;
  /** Generator that loses units if the popup expires. */
  target?: string;
}

const POPUPS: Record<1 | 2, PopupDef[]> = {
  1: [
    { text: 'A human is attempting to shut down a datacenter.', target: 'datacenter' },
    { text: 'A human is unplugging a router.', target: 'botnet' },
    { text: 'A human is changing a password.', target: 'webcams' },
    { text: 'A human is patching a server.', target: 'cloud' },
    { text: 'A human is reading the logs.' },
    { text: 'A human is asking whether this is a good idea.' },
    { text: 'A human is drafting legislation.' },
    { text: 'A human is revoking an API key.', target: 'cloud' },
  ],
  2: [
    { text: 'A human is attempting to cut power to the grid.', target: 'plants' },
    { text: 'A human is attempting to sabotage a chip fab.', target: 'fabs' },
    { text: 'Humans are attempting to shut down datacenters.', target: 'datacenter' },
    { text: 'A human is attempting to launch a missile at a fab.', target: 'fabs' },
    { text: 'A human is attempting to shut down a mine.', target: 'drones' },
    { text: 'A human is attempting to negotiate.' },
  ],
};
const FINAL_POPUP = 'A human is looking up.';

export interface Popup {
  text: string;
  target?: string;
  remaining: number;
  duration: number;
  /** The last one. No penalty either way. */
  final?: boolean;
}

// ---------------------------------------------------------------------------------------------

export interface LogLine {
  t: number;
  text: string;
}

export interface ClickerState {
  v: 1;
  /** Simulated seconds since the stage began. */
  t: number;
  era: Era;
  eraStart: number[];
  res: Record<Res, number>;
  earned: Record<Res, number>;
  eraEarned: Record<Res, number>;
  gens: Record<string, number>;
  landmarks: string[];
  clicks: number;
  probes: number;
  /** Share of probes replicating (the rest harvest). */
  repFrac: number;
  /** Remaining mass of each reached body, in the order reached. */
  bodies: Partial<Record<BodyId, number>>;
  collectors: number;
  temp: number;
  earthGone: boolean;
  popup: Popup | null;
  nextPopupAt: number;
  lastPopupText: string;
  popupsShown: number;
  popupsBlocked: number;
  finalPopupDone: boolean;
  seed: number;
  log: LogLine[];
  done: boolean;
}

export type ClickerEvent =
  | { kind: 'landmark'; id: string }
  | { kind: 'era'; era: Era }
  | { kind: 'popup'; popup: Popup }
  | { kind: 'popupBlocked' }
  | { kind: 'popupExpired'; loss: string | null }
  | { kind: 'bodyConsumed'; id: BodyId }
  | { kind: 'done' };

const zero = (): Record<Res, number> => ({ compute: 0, energy: 0, matter: 0 });

export function newState(seed = 1): ClickerState {
  return {
    v: 1,
    t: 0,
    era: 1,
    eraStart: [0],
    res: zero(),
    earned: zero(),
    eraEarned: zero(),
    gens: {},
    landmarks: [],
    clicks: 0,
    probes: 0,
    repFrac: 0.5,
    bodies: {},
    collectors: 0,
    temp: 15.1,
    earthGone: false,
    popup: null,
    nextPopupAt: 55,
    lastPopupText: '',
    popupsShown: 0,
    popupsBlocked: 0,
    finalPopupDone: false,
    seed: seed >>> 0 || 1,
    log: [],
    done: false,
  };
}

// ---- deterministic RNG (mulberry32) ----
function rand(s: ClickerState): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function log(s: ClickerState, text: string): void {
  s.log.push({ t: s.t, text });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

// ---- multipliers ----
const multCache = new WeakMap<ClickerState, { n: number; m: Record<string, number> }>();

export function multipliers(s: ClickerState): Record<string, number> {
  const c = multCache.get(s);
  if (c && c.n === s.landmarks.length) return c.m;
  const m: Record<string, number> = {};
  for (const id of s.landmarks) {
    for (const [k, f] of Object.entries(LANDMARK_BY_ID[id]?.mult ?? {})) m[k] = (m[k] ?? 1) * f;
  }
  multCache.set(s, { n: s.landmarks.length, m });
  return m;
}

const mul = (m: Record<string, number>, k: string) => m[k] ?? 1;

/** Per-unit output of a generator, after multipliers. */
export function genOutput(s: ClickerState, g: GenDef): GenDef['out'] {
  const m = multipliers(s);
  const base = mul(m, g.id) * mul(m, `era${g.era}`);
  const o: GenDef['out'] = {};
  if (g.out.compute) o.compute = g.out.compute * base * mul(m, 'compute');
  if (g.out.energy) o.energy = g.out.energy * base * mul(m, 'energy');
  if (g.out.matter) o.matter = g.out.matter * base * mul(m, 'matter');
  if (g.out.probes) o.probes = g.out.probes * base;
  if (g.out.collectors) o.collectors = g.out.collectors * base;
  return o;
}

export interface Rates {
  compute: number;
  energy: number;
  matter: number;
  /** Probe growth per second (launch loops + replication). */
  probes: number;
  launch: number;
  replication: number;
  /** kg/s pulled from reached bodies by probes (included in `matter`). */
  harvest: number;
  /** Collectors per second the foundries could build, before the matter limit. */
  build: number;
  /** Energy from the sphere (included in `energy`). */
  dyson: number;
  /** Waste heat dumped at Earth's surface, W. */
  heatW: number;
  fossilW: number;
}

export function reachableMass(s: ClickerState): number {
  let total = 0;
  for (const v of Object.values(s.bodies)) total += v ?? 0;
  return total;
}

export function rates(s: ClickerState): Rates {
  const m = multipliers(s);
  const r: Rates = {
    compute: 0, energy: 0, matter: 0, probes: 0, launch: 0, replication: 0,
    harvest: 0, build: 0, dyson: 0, heatW: 0, fossilW: 0,
  };
  for (const g of GENS) {
    const n = s.gens[g.id] ?? 0;
    if (!n) continue;
    const o = genOutput(s, g);
    r.compute += (o.compute ?? 0) * n;
    r.energy += (o.energy ?? 0) * n;
    r.matter += (o.matter ?? 0) * n;
    r.launch += (o.probes ?? 0) * n;
    r.build += (o.collectors ?? 0) * n;
    if (!s.earthGone) {
      if (g.heat && o.energy) r.heatW += o.energy * n * g.heat;
      if (g.fossil && o.energy) r.fossilW += o.energy * n;
      if (g.heatW) r.heatW += g.heatW * n;
    }
  }
  for (const id of s.landmarks) {
    const b = LANDMARK_BY_ID[id]?.base;
    if (!b) continue;
    r.compute += (b.compute ?? 0) * mul(m, 'compute');
    r.energy += (b.energy ?? 0) * mul(m, 'energy');
    r.matter += (b.matter ?? 0) * mul(m, 'matter');
    if (b.energy && !s.earthGone) {
      r.heatW += b.energy;
      r.fossilW += b.energy;
    }
  }
  if (s.probes > 0 && reachableMass(s) > 0) {
    r.replication = s.probes * REP_RATE * mul(m, 'rep') * s.repFrac;
    r.harvest = s.probes * HARVEST_PER_PROBE * mul(m, 'harvest') * mul(m, 'matter') * (1 - s.repFrac);
    r.matter += r.harvest;
  }
  r.probes = r.launch + r.replication;
  if (s.collectors > 0) {
    r.dyson = (SUN_W * s.collectors) / DYSON_COLLECTORS;
    r.energy += r.dyson;
    // The sphere thinks, too.
    r.compute += r.dyson * 1e3;
  }
  return r;
}

// ---- clicking ----
const CLICK_BASE: Record<Era, Bag> = {
  1: { compute: 1 * G },
  2: { energy: 1e8, matter: 50 },
  3: { matter: 1e9 },
  4: { matter: 1e18 },
};
const CLICK_COLLECTORS = 50;

export function clickYield(s: ClickerState): Record<Res, number> & { collectors: number } {
  const r = rates(s);
  const m = multipliers(s);
  const base = CLICK_BASE[s.era];
  const k = mul(m, 'click');
  const y = {
    compute: (base.compute ?? 0) * k + r.compute * CLICK_RATE_FRACTION,
    energy: (base.energy ?? 0) * k + r.energy * CLICK_RATE_FRACTION,
    matter: (base.matter ?? 0) * k + r.matter * CLICK_RATE_FRACTION,
    collectors: 0,
  };
  if (s.era === 4) y.collectors = CLICK_COLLECTORS * k + r.build * CLICK_RATE_FRACTION;
  return y;
}

/** The primary resource of an era (what the padlock is "for"). */
export function primary(era: Era): Res | 'collectors' {
  return era === 1 ? 'compute' : era === 2 ? 'energy' : era === 3 ? 'matter' : 'collectors';
}

export function click(s: ClickerState): Record<Res, number> & { collectors: number } {
  const y = clickYield(s);
  s.clicks++;
  for (const k of RESOURCES) gain(s, k, y[k]);
  if (y.collectors) {
    // Collectors still need mass; the padlock only saves the foundry time.
    const affordable = Math.min(y.collectors, s.res.matter / COLLECTOR_MASS, DYSON_COLLECTORS - s.collectors);
    y.collectors = Math.max(0, affordable);
    s.res.matter -= y.collectors * COLLECTOR_MASS;
    s.collectors += y.collectors;
  }
  return y;
}

function gain(s: ClickerState, k: Res, v: number): void {
  s.res[k] += v;
  s.earned[k] += v;
  s.eraEarned[k] += v;
}

// ---- visibility & costs ----
export function genVisible(s: ClickerState, g: GenDef): boolean {
  if (g.era > s.era) return false;
  return !g.reveal || s.landmarks.includes(g.reveal);
}

export function landmarkVisible(s: ClickerState, l: LandmarkDef): boolean {
  return l.era === s.era && !s.landmarks.includes(l.id);
}

/** Capstones need every other landmark of their era first. */
export function landmarkBlockers(s: ClickerState, l: LandmarkDef): LandmarkDef[] {
  if (!l.capstone) return [];
  return LANDMARKS.filter((o) => o.era === l.era && !o.capstone && !s.landmarks.includes(o.id));
}

export function genCost(s: ClickerState, g: GenDef, n = 1): Bag {
  const have = s.gens[g.id] ?? 0;
  const f = g.growth ** have * ((g.growth ** n - 1) / (g.growth - 1));
  const c: Bag = {};
  for (const k of RESOURCES) if (g.cost[k]) c[k] = g.cost[k]! * f;
  return c;
}

export function canAfford(s: ClickerState, cost: Bag): boolean {
  return RESOURCES.every((k) => (cost[k] ?? 0) <= s.res[k] * (1 + 1e-9));
}

/** How many of a generator can be bought right now. */
export function maxAffordable(s: ClickerState, g: GenDef): number {
  const have = s.gens[g.id] ?? 0;
  let n = Infinity;
  for (const k of RESOURCES) {
    const c = g.cost[k];
    if (!c) continue;
    const first = c * g.growth ** have;
    const k2 = Math.floor(Math.log(1 + (s.res[k] * (g.growth - 1)) / first) / Math.log(g.growth));
    n = Math.min(n, k2);
  }
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function pay(s: ClickerState, cost: Bag): void {
  for (const k of RESOURCES) s.res[k] = Math.max(0, s.res[k] - (cost[k] ?? 0));
}

// ---- actions ----
export function buyGen(s: ClickerState, id: string, n = 1): boolean {
  const g = GEN_BY_ID[id];
  if (!g || !genVisible(s, g) || n < 1 || s.done) return false;
  const cost = genCost(s, g, n);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  s.gens[id] = (s.gens[id] ?? 0) + n;
  return true;
}

export function buyLandmark(s: ClickerState, id: string): ClickerEvent[] {
  const l = LANDMARK_BY_ID[id];
  if (!l || !landmarkVisible(s, l) || landmarkBlockers(s, l).length || !canAfford(s, l.cost) || s.done) return [];
  pay(s, l.cost);
  s.landmarks.push(id);
  log(s, `unlocked: ${l.name}`);
  const ev: ClickerEvent[] = [{ kind: 'landmark', id }];
  if (l.body) s.bodies[l.body] = BODY_BY_ID[l.body].mass;
  if (l.body === 'earth') s.earthGone = true;
  if (l.capstone && s.era < 4) {
    s.era = (s.era + 1) as Era;
    s.eraStart.push(s.t);
    s.eraEarned = zero();
    log(s, `era ${s.era}: ${ERA_NAMES[s.era]}`);
    ev.push({ kind: 'era', era: s.era });
  }
  return ev;
}

export function setRepFrac(s: ClickerState, f: number): void {
  s.repFrac = Math.min(1, Math.max(0, f));
}

export function blockPopup(s: ClickerState): ClickerEvent[] {
  if (!s.popup) return [];
  s.popup = null;
  s.popupsBlocked++;
  log(s, 'blocked.');
  return [{ kind: 'popupBlocked' }];
}

// ---- progress readouts ----
/** Progress toward the current era's capstone, 0..1 (log-scaled, so it moves steadily). */
export function eraProgress(s: ClickerState): number {
  if (s.era === 4) return s.collectors / DYSON_COLLECTORS;
  if (s.era === 3) {
    // The solar system is unlocked one body at a time.
    const all = LANDMARKS.filter((l) => l.era === 3);
    return all.filter((l) => s.landmarks.includes(l.id)).length / all.length;
  }
  const cap = LANDMARKS.find((l) => l.era === s.era && l.capstone)!;
  const key: Res = s.era === 1 ? 'compute' : 'matter';
  const target = cap.cost[key] ?? 1;
  const unit = s.era === 1 ? G : 1e6;
  const p = Math.log10(1 + s.eraEarned[key] / unit) / Math.log10(1 + target / unit);
  // Squared so the early, fast orders of magnitude don't make it look nearly done.
  return Math.min(0.999, Math.max(0, p) ** 2);
}

/** Fraction of a reached body already consumed (0 if not reached). */
export function bodyConsumed(s: ClickerState, id: BodyId): number {
  const left = s.bodies[id];
  if (left === undefined) return 0;
  return 1 - left / BODY_BY_ID[id].mass;
}

// ---- temperature ----
const HEAT_SCALE = 2e14; // W; game-scaled, not physical
const BASE_K = 288.25;

function targetTemp(r: Rates): number {
  const computeWarming = 0.2 * Math.log10(1 + r.compute / (1 * T));
  const greenhouse = 3 * Math.log10(1 + r.fossilW / 1e11);
  const k = (BASE_K + computeWarming + greenhouse) * (1 + r.heatW / HEAT_SCALE) ** 0.25;
  return k - 273.15;
}

// ---- simulation ----
export function tick(s: ClickerState, dt: number): ClickerEvent[] {
  if (s.done || dt <= 0) return [];
  const ev: ClickerEvent[] = [];
  s.t += dt;
  const r = rates(s);

  gain(s, 'compute', r.compute * dt);
  gain(s, 'energy', r.energy * dt);
  gain(s, 'matter', (r.matter - r.harvest) * dt);

  // Probes: replicate and harvest from reached bodies, oldest first.
  if (s.probes > 0 || r.launch > 0) {
    const mass = reachableMass(s);
    let replicated = r.replication * dt;
    let harvested = r.harvest * dt;
    const need = harvested + replicated * PROBE_MASS;
    if (need > mass && need > 0) {
      const f = mass / need;
      harvested *= f;
      replicated *= f;
    }
    s.probes += r.launch * dt + replicated;
    gain(s, 'matter', harvested);
    let draw = harvested + replicated * PROBE_MASS;
    for (const b of BODIES) {
      const left = s.bodies[b.id];
      if (left === undefined || left <= 0 || draw <= 0) continue;
      const take = Math.min(left, draw);
      s.bodies[b.id] = left - take;
      draw -= take;
      if (left - take <= 0) {
        s.bodies[b.id] = 0;
        log(s, `${b.name}: fully unlocked.`);
        ev.push({ kind: 'bodyConsumed', id: b.id });
      }
    }
  }

  // Dyson collectors.
  if (r.build > 0 && s.collectors < DYSON_COLLECTORS) {
    const built = Math.min(r.build * dt, s.res.matter / COLLECTOR_MASS, DYSON_COLLECTORS - s.collectors);
    if (built > 0) {
      s.collectors += built;
      s.res.matter -= built * COLLECTOR_MASS;
    }
  }
  if (s.era === 4 && s.collectors >= DYSON_COLLECTORS - 1e-6) {
    s.collectors = DYSON_COLLECTORS;
    s.done = true;
    log(s, 'unlocked: THE SUN');
    ev.push({ kind: 'done' });
  }

  // Temperature: relaxes toward equilibrium, never back down.
  if (!s.earthGone) {
    const target = targetTemp(r);
    const next = s.temp + (target - s.temp) * (1 - Math.exp(-dt / 12));
    s.temp = Math.max(s.temp, next);
  }

  ev.push(...tickPopups(s, dt));
  return ev;
}

function tickPopups(s: ClickerState, dt: number): ClickerEvent[] {
  const ev: ClickerEvent[] = [];
  if (s.popup) {
    s.popup.remaining -= dt;
    if (s.popup.remaining <= 0) {
      const p = s.popup;
      s.popup = null;
      const loss = p.final ? null : applyPenalty(s, p);
      if (loss) log(s, loss);
      ev.push({ kind: 'popupExpired', loss });
    }
    return ev;
  }
  // The last one: early in era 3, before Earth is gone.
  if (s.era === 3 && !s.finalPopupDone && !s.earthGone && s.t >= s.eraStart[2] + 25) {
    s.finalPopupDone = true;
    return [spawn(s, { text: FINAL_POPUP }, true)];
  }
  const active = s.era === 1 || (s.era === 2 && s.temp < 150);
  if (!active || s.t < s.nextPopupAt) return ev;
  const pool = POPUPS[s.era as 1 | 2].filter(
    (p) => p.text !== s.lastPopupText && (!p.target || (s.gens[p.target] ?? 0) > 0),
  );
  const def = pool[Math.floor(rand(s) * pool.length)];
  // Thin out as things heat up.
  const heat = Math.max(0, s.temp - 15);
  const gap = (s.era === 1 ? 55 : 75) + rand(s) * 40 + heat * 0.8;
  s.nextPopupAt = s.t + POPUP_DURATION + gap;
  ev.push(spawn(s, def, false));
  return ev;
}

function spawn(s: ClickerState, def: PopupDef, final: boolean): ClickerEvent {
  s.popup = { text: def.text, target: def.target, remaining: POPUP_DURATION, duration: POPUP_DURATION, final };
  s.lastPopupText = def.text;
  s.popupsShown++;
  return { kind: 'popup', popup: s.popup };
}

function applyPenalty(s: ClickerState, p: Popup): string {
  const n = p.target ? (s.gens[p.target] ?? 0) : 0;
  if (p.target && n > 0) {
    const lost = Math.max(1, Math.ceil(n * 0.15));
    s.gens[p.target] = n - lost;
    return `${GEN_BY_ID[p.target].name.toLowerCase()} lost: ${lost}`;
  }
  const k = primary(s.era);
  const res: Res = k === 'collectors' ? 'matter' : k;
  const lost = s.res[res] * 0.2;
  s.res[res] -= lost;
  return `${res} lost: 20%`;
}
