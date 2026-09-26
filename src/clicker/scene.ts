// The world view: a canvas that zooms out from a wireframe Earth to the solar system,
// then in on the Sun as the sphere closes around it.
import { BODIES, bodyConsumed, eraProgress, type BodyId, type ClickerState } from './model';

const ACCENT = [127, 224, 255] as const;
const TAU = Math.PI * 2;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (c: readonly number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Colour of heat: cold accent → amber → red. */
export function heatColor(temp: number): number[] {
  const t = clamp01((temp - 15) / 450);
  if (t < 0.3) return mix(ACCENT, [255, 190, 90], t / 0.3);
  return mix([255, 190, 90], [255, 70, 40], (t - 0.3) / 0.7);
}

// ---- Earth: a dotted land mask from a handful of ellipses (lat, lon, radii in degrees) ----
const LAND: [number, number, number, number][] = [
  [48, -100, 20, 30], [62, -150, 9, 18], [22, -102, 10, 11], [68, -95, 9, 32], [73, -42, 9, 13],
  [-10, -60, 20, 15], [-35, -66, 14, 8],
  [49, 10, 9, 18], [63, 18, 7, 12], [54, -2, 4, 3],
  [6, 20, 22, 20], [-20, 26, 14, 11], [24, 12, 9, 26],
  [52, 90, 17, 48], [30, 80, 11, 18], [18, 78, 7, 5], [64, 120, 10, 35], [34, 110, 11, 14],
  [15, 104, 8, 7], [-2, 114, 5, 12], [27, 45, 9, 10], [37, 138, 5, 3],
  [-25, 134, 11, 17], [-82, 0, 7, 180],
];

function isLand(lat: number, lon: number): boolean {
  for (const [la, lo, rla, rlo] of LAND) {
    let dl = Math.abs(lon - lo);
    if (dl > 180) dl = 360 - dl;
    const dy = (lat - la) / rla;
    const dx = dl / rlo;
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}

interface LandDot {
  lat: number;
  lon: number;
  rank: number; // 0..1, order in which it lights up
  link: number; // index of a neighbour to draw an arc to
}

function buildLand(): LandDot[] {
  const r = rng(42);
  const dots: LandDot[] = [];
  for (let lat = -84; lat <= 84; lat += 4) {
    const step = 4 / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
    for (let lon = -180; lon < 180; lon += step) {
      if (isLand(lat, lon)) dots.push({ lat, lon, rank: r(), link: 0 });
    }
  }
  // Link each dot to a random nearby dot for network arcs.
  for (let i = 0; i < dots.length; i++) {
    let best = i;
    let bestD = Infinity;
    for (let k = 0; k < 12; k++) {
      const j = Math.floor(r() * dots.length);
      const d = Math.hypot(dots[j].lat - dots[i].lat, dots[j].lon - dots[i].lon);
      if (j !== i && d < bestD && d > 8) {
        best = j;
        bestD = d;
      }
    }
    dots[i].link = best;
  }
  return dots;
}

// ---- Solar system layout ----
interface Orbiter {
  id: BodyId;
  au: number;
  size: number;
  color: number[];
  phase: number;
}

const ORBITS: Orbiter[] = [
  { id: 'mercury', au: 0.39, size: 2.2, color: [170, 160, 150], phase: 1.1 },
  { id: 'venus', au: 0.72, size: 3.6, color: [230, 200, 140], phase: 2.6 },
  { id: 'earth', au: 1.0, size: 3.8, color: [110, 170, 230], phase: 0.2 },
  { id: 'mars', au: 1.52, size: 2.8, color: [220, 110, 70], phase: 4.0 },
  { id: 'jupiter', au: 5.2, size: 8, color: [220, 180, 140], phase: 5.2 },
];

interface Tile {
  x: number;
  y: number;
  z: number;
  rank: number;
}

function fibonacciSphere(n: number): Tile[] {
  const r = rng(7);
  const out: Tile[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    out.push({ x: Math.cos(th) * rad, y, z: Math.sin(th) * rad, rank: r() });
  }
  return out;
}

interface Particle {
  seed: number;
  radius: number;
  speed: number;
  phase: number;
  body: number;
}

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private land = buildLand();
  private stars: { x: number; y: number; a: number; s: number }[] = [];
  private galaxy: { x: number; y: number; a: number }[] = [];
  private tiles = fibonacciSphere(900);
  private particles: Particle[] = [];
  private debris: Record<string, { a: number; dr: number }[]> = {};
  /** 0 = Earth, 1 = solar system, 2 = the Sun. Animated toward the era's target. */
  zoom = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const r = rng(99);
    for (let i = 0; i < 260; i++) this.stars.push({ x: r(), y: r(), a: 0.15 + r() * 0.5, s: r() < 0.1 ? 1.4 : 0.8 });
    for (let i = 0; i < 2600; i++) {
      // A band across the sky.
      const t = r();
      const off = (r() + r() + r() - 1.5) * 0.18;
      this.galaxy.push({ x: t, y: 0.5 + (t - 0.5) * 0.35 + off, a: 0.05 + r() * 0.35 });
    }
    for (let i = 0; i < 900; i++) {
      this.particles.push({ seed: r(), radius: 5 + r() * 16, speed: (0.4 + r()) * (r() < 0.5 ? -1 : 1), phase: r() * TAU, body: r() });
    }
    for (const o of [...ORBITS, { id: 'asteroids' as BodyId }, { id: 'moon' as BodyId }]) {
      this.debris[o.id] = Array.from({ length: o.id === 'asteroids' ? 260 : 90 }, () => ({ a: r() * TAU, dr: (r() - 0.5) * 2 }));
    }
    this.resize();
  }

  static targetZoom(era: number): number {
    return era <= 2 ? 0 : era === 3 ? 1 : 2;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  /** Advance the camera toward where the era wants it. */
  step(dt: number, era: number): void {
    const target = Scene.targetZoom(era);
    const d = target - this.zoom;
    this.zoom += Math.sign(d) * Math.min(Math.abs(d), dt * 0.22);
  }

  render(s: ClickerState, time: number, opts: { dark?: number; sunScale?: number; cy?: number } = {}): void {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#05080b';
    ctx.fillRect(0, 0, w, h);
    this.drawStars(time);

    const z = this.zoom;
    const cx = w / 2;
    const cy = h * (opts.cy ?? 0.5);
    const sysScale = (Math.min(w, h) * 0.46) / Math.sqrt(5.2);
    const earthPos = this.orbitPos('earth', time, cx, cy, sysScale);

    if (z < 1) {
      const t = smooth(z);
      // Earth view shrinks into Earth's position in the system view.
      const R = Math.min(w, h) * 0.3;
      const scale = 1 - t * 0.985;
      const ex = cx + (earthPos.x - cx) * t;
      const ey = cy + (earthPos.y - cy) * t;
      ctx.save();
      ctx.globalAlpha = 1 - smooth(clamp01((z - 0.55) / 0.45));
      this.drawEarth(s, time, ex, ey, R * scale);
      ctx.restore();
      if (z > 0) {
        ctx.save();
        ctx.globalAlpha = smooth(clamp01(z / 0.8));
        const k = 1 + (1 - t) * 7;
        ctx.translate(earthPos.x, earthPos.y);
        ctx.scale(k, k);
        ctx.translate(-earthPos.x, -earthPos.y);
        this.drawSystem(s, time, cx, cy, sysScale, true);
        ctx.restore();
      }
    } else {
      const t = smooth(clamp01(z - 1));
      if (t < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - smooth(clamp01((z - 1) / 0.7));
        const k = 1 + t * 10;
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
        this.drawSystem(s, time, cx, cy, sysScale, false);
        ctx.restore();
      }
      if (z > 1) {
        ctx.save();
        ctx.globalAlpha = smooth(clamp01((z - 1.2) / 0.8));
        const R = Math.min(w, h) * 0.26 * (0.2 + 0.8 * t) * (opts.sunScale ?? 1);
        this.drawSun(s, time, cx, cy, R);
        ctx.restore();
      }
    }

    if (opts.dark) {
      ctx.fillStyle = `rgba(0,0,0,${opts.dark})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawStars(time: number): void {
    const { ctx, w, h } = this;
    for (const st of this.stars) {
      const tw = 0.75 + 0.25 * Math.sin(time * 0.7 + st.x * 40);
      ctx.fillStyle = `rgba(200,220,235,${st.a * tw})`;
      ctx.fillRect(st.x * w, st.y * h, st.s, st.s);
    }
  }

  /** The Milky Way, for the ending. */
  drawGalaxy(alpha: number): void {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const g of this.galaxy) {
      ctx.fillStyle = `rgba(210,225,240,${Math.min(1, g.a * alpha * 1.6)})`;
      ctx.fillRect(g.x * w, g.y * h, 0.9, 0.9);
    }
  }

  private project(lat: number, lon: number, rot: number, R: number) {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180 + rot;
    const x = Math.cos(la) * Math.sin(lo);
    const y0 = Math.sin(la);
    const z0 = Math.cos(la) * Math.cos(lo);
    const tilt = 0.38;
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    const zz = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    return { x: x * R, y: -y * R, z: zz };
  }

  private drawEarth(s: ClickerState, time: number, cx: number, cy: number, R: number): void {
    if (R < 0.5) return;
    const { ctx } = this;
    const rot = time * 0.07;
    const temp = s.earthGone ? 1500 : s.temp;
    const heat = heatColor(temp);
    const heatT = clamp01((temp - 15) / 450);
    const era = s.era;
    const netP = era === 1 ? eraProgress(s) : 1;
    const indP = era === 1 ? 0 : era === 2 ? eraProgress(s) : 1;

    // Atmosphere.
    const glow = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.35);
    glow.addColorStop(0, rgba(heat, 0.18 + heatT * 0.35));
    glow.addColorStop(1, rgba(heat, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.35, 0, TAU);
    ctx.fill();

    // Body.
    const body = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    body.addColorStop(0, rgba(mix([14, 26, 36], [60, 22, 10], heatT), 1));
    body.addColorStop(1, rgba(mix([4, 8, 12], [22, 6, 4], heatT), 1));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();

    // Graticule.
    ctx.lineWidth = Math.max(0.5, R / 400);
    const lineCol = mix([60, 90, 110], heat, heatT);
    for (let lon = 0; lon < 360; lon += 20) this.drawCurve((k) => this.project(k, lon, rot, R), -90, 90, cx, cy, lineCol);
    for (let lat = -60; lat <= 60; lat += 30) this.drawCurve((k) => this.project(lat, k, rot, R), -180, 180, cx, cy, lineCol);

    // Land, network nodes, industry.
    const dotR = Math.max(0.6, R / 170);
    const litCol = mix(ACCENT, heat, heatT);
    for (const d of this.land) {
      const p = this.project(d.lat, d.lon, rot, R);
      if (p.z <= 0.02) continue;
      const lit = d.rank < netP;
      const ind = d.rank < indP;
      let col: number[];
      let a: number;
      let size = dotR;
      if (ind) {
        col = mix([255, 170, 80], [255, 80, 40], heatT);
        a = 0.55 + 0.45 * p.z;
        size = dotR * 1.25;
      } else if (lit) {
        col = litCol;
        a = 0.45 + 0.55 * p.z;
        size = dotR * 1.15;
      } else {
        col = [70, 95, 110];
        a = 0.22 + 0.4 * p.z;
      }
      ctx.fillStyle = rgba(col, a);
      ctx.fillRect(cx + p.x - size / 2, cy + p.y - size / 2, size, size);
    }

    // Network arcs with packets (the internet, being unlocked).
    if (era <= 2 && R > 40) {
      ctx.lineWidth = Math.max(0.5, R / 500);
      let drawn = 0;
      for (let i = 0; i < this.land.length && drawn < 160; i += 3) {
        const a = this.land[i];
        if (a.rank >= netP) continue;
        const b = this.land[a.link];
        if (b.rank >= netP) continue;
        const pa = this.project(a.lat, a.lon, rot, R);
        const pb = this.project(b.lat, b.lon, rot, R);
        if (pa.z <= 0.1 || pb.z <= 0.1) continue;
        drawn++;
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const lift = 1.18;
        const qx = cx + mx * lift;
        const qy = cy + my * lift;
        const alpha = 0.18 * Math.min(pa.z, pb.z) * (era === 2 ? 1 - indP : 1);
        ctx.strokeStyle = rgba(litCol, alpha);
        ctx.beginPath();
        ctx.moveTo(cx + pa.x, cy + pa.y);
        ctx.quadraticCurveTo(qx, qy, cx + pb.x, cy + pb.y);
        ctx.stroke();
        const u = (time * 0.5 + a.rank * 7) % 1;
        const px = (1 - u) * (1 - u) * (cx + pa.x) + 2 * (1 - u) * u * qx + u * u * (cx + pb.x);
        const py = (1 - u) * (1 - u) * (cy + pa.y) + 2 * (1 - u) * u * qy + u * u * (cy + pb.y);
        ctx.fillStyle = rgba(litCol, alpha * 4);
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    // Rim.
    ctx.strokeStyle = rgba(mix([80, 130, 150], heat, heatT), 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
  }

  private drawCurve(
    f: (k: number) => { x: number; y: number; z: number },
    from: number,
    to: number,
    cx: number,
    cy: number,
    col: number[],
  ): void {
    const { ctx } = this;
    const steps = 36;
    let prev = f(from);
    for (let i = 1; i <= steps; i++) {
      const p = f(from + ((to - from) * i) / steps);
      const zf = (p.z + prev.z) / 2;
      if (zf > 0) {
        ctx.strokeStyle = rgba(col, 0.08 + 0.22 * zf);
        ctx.beginPath();
        ctx.moveTo(cx + prev.x, cy + prev.y);
        ctx.lineTo(cx + p.x, cy + p.y);
        ctx.stroke();
      }
      prev = p;
    }
  }

  private orbitPos(id: BodyId, time: number, cx: number, cy: number, scale: number) {
    const o = ORBITS.find((q) => q.id === id)!;
    const ang = o.phase + time * (0.18 / o.au ** 1.5);
    const r = Math.sqrt(o.au) * scale;
    return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.92, r };
  }

  private bodyPos(id: BodyId, time: number, cx: number, cy: number, scale: number) {
    if (id === 'moon') {
      const e = this.orbitPos('earth', time, cx, cy, scale);
      const a = time * 1.3;
      return { x: e.x + Math.cos(a) * 9, y: e.y + Math.sin(a) * 9 };
    }
    if (id === 'asteroids') {
      const a = time * 0.05;
      const r = Math.sqrt(2.7) * scale;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.92 };
    }
    return this.orbitPos(id, time, cx, cy, scale);
  }

  private drawSystem(s: ClickerState, time: number, cx: number, cy: number, scale: number, fromEarth: boolean): void {
    const { ctx } = this;
    const dyson = s.era === 4 ? s.collectors / 1_000_000 : 0;
    const sunBright = 1 - dyson ** 0.8;

    // Sun.
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
    sg.addColorStop(0, `rgba(255,245,220,${0.95 * sunBright + 0.05})`);
    sg.addColorStop(0.25, `rgba(255,200,120,${0.6 * sunBright})`);
    sg.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, TAU);
    ctx.fill();
    if (dyson > 0) {
      ctx.strokeStyle = rgba(ACCENT, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * dyson);
      ctx.stroke();
    }

    // Orbits.
    ctx.lineWidth = 0.6;
    for (const o of ORBITS) {
      ctx.strokeStyle = 'rgba(90,120,140,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.sqrt(o.au) * scale, Math.sqrt(o.au) * scale * 0.92, 0, 0, TAU);
      ctx.stroke();
    }

    // Asteroid belt.
    const beltGone = bodyConsumed(s, 'asteroids');
    const beltR = Math.sqrt(2.7) * scale;
    for (let i = 0; i < this.debris.asteroids.length; i++) {
      const d = this.debris.asteroids[i];
      const a = d.a + time * 0.05;
      const rr = beltR + d.dr * scale * 0.12;
      ctx.fillStyle = `rgba(150,150,140,${0.35 * (1 - beltGone)})`;
      ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, 1, 1);
    }

    // Planets.
    for (const o of ORBITS) {
      const p = this.orbitPos(o.id, time, cx, cy, scale);
      const gone = bodyConsumed(s, o.id);
      const reached = s.bodies[o.id] !== undefined;
      let col = o.color;
      if (o.id === 'earth') col = s.earthGone ? [150, 60, 40] : mix([110, 170, 230], heatColor(s.temp), clamp01((s.temp - 15) / 200));
      const size = o.size * Math.cbrt(1 - gone);
      if (size > 0.3) {
        ctx.fillStyle = rgba(col, 0.95);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
      }
      if (reached && gone < 1) {
        ctx.strokeStyle = rgba(ACCENT, 0.35);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size + 4, 0, TAU);
        ctx.stroke();
      }
      if (gone > 0) {
        // What's left of it, smeared along its orbit.
        for (const d of this.debris[o.id]) {
          const a = Math.atan2((p.y - cy) / 0.92, p.x - cx) + (d.a - Math.PI) * gone * 0.9;
          const rr = p.r + d.dr * 3;
          ctx.fillStyle = rgba(col, 0.4 * gone);
          ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, 1, 1);
        }
      }
      if (o.id === 'earth' && fromEarth) {
        // Moon.
        const m = this.bodyPos('moon', time, cx, cy, scale);
        const mg = bodyConsumed(s, 'moon');
        if (mg < 1) {
          ctx.fillStyle = `rgba(190,190,185,${0.9 * (1 - mg)})`;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 1.3, 0, TAU);
          ctx.fill();
        }
      }
    }
    if (!fromEarth) {
      const m = this.bodyPos('moon', time, cx, cy, scale);
      const mg = bodyConsumed(s, 'moon');
      if (mg < 1) {
        ctx.fillStyle = `rgba(190,190,185,${0.9 * (1 - mg)})`;
        ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
      }
    }

    // Probes: a swarm around every reached body, thickest where the harvest is.
    if (s.probes > 0) {
      const reached = BODIES.filter((b) => s.bodies[b.id] !== undefined).map((b) => b.id);
      const n = Math.min(this.particles.length, Math.floor(40 * Math.log10(1 + s.probes)));
      ctx.fillStyle = rgba(ACCENT, 0.75);
      for (let i = 0; i < n; i++) {
        const q = this.particles[i];
        let host: BodyId = 'earth';
        if (reached.length) host = reached[Math.floor(q.body * reached.length)];
        const hp = this.bodyPos(host, time, cx, cy, scale);
        const a = q.phase + time * q.speed;
        const rr = q.radius * (host === 'jupiter' ? 1.6 : 1);
        ctx.fillRect(hp.x + Math.cos(a) * rr, hp.y + Math.sin(a) * rr * 0.8, 1.1, 1.1);
      }
    }
  }

  private drawSun(s: ClickerState, time: number, cx: number, cy: number, R: number): void {
    const { ctx } = this;
    const p = s.era === 4 ? s.collectors / 1_000_000 : 0;
    const bright = 1 - p ** 0.85;
    if (R < 14 && p >= 1) {
      // Seen from far away: a dark point with a faint ember of waste heat.
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3);
      eg.addColorStop(0, `rgba(120,30,16,${0.35 + 0.1 * Math.sin(time)})`);
      eg.addColorStop(1, 'rgba(120,30,16,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#050304';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.5, R), 0, TAU);
      ctx.fill();
      return;
    }

    // Corona.
    const cg = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * (1.4 + 0.6 * bright));
    cg.addColorStop(0, `rgba(255,190,110,${0.4 * bright})`);
    cg.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 2, 0, TAU);
    ctx.fill();

    // Photosphere, dimming as it's enclosed; at the end, a faint infrared ember.
    const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
    g.addColorStop(0, rgba(mix([40, 8, 6], [255, 250, 225], bright), 1));
    g.addColorStop(0.7, rgba(mix([28, 6, 5], [255, 200, 110], bright), 1));
    g.addColorStop(1, rgba(mix([60, 10, 6], [255, 140, 60], bright), 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();

    // Granulation shimmer.
    if (bright > 0.05) {
      for (let i = 0; i < 60; i++) {
        const a = i * 2.39996 + time * 0.03;
        const rr = R * Math.sqrt((i + 0.5) / 60) * 0.95;
        ctx.fillStyle = `rgba(255,255,230,${0.05 * bright * (0.5 + 0.5 * Math.sin(time * 2 + i))})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * 0.05, 0, TAU);
        ctx.fill();
      }
    }

    // Collectors.
    const rot = time * 0.05;
    const tile = R * 0.105;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const t of this.tiles) {
      if (t.rank >= p) continue;
      const x = t.x * cos + t.z * sin;
      const z = -t.x * sin + t.z * cos;
      if (z <= 0) continue;
      const sx = cx + x * R * 1.03;
      const sy = cy - t.y * R * 1.03;
      const size = tile * (0.3 + 0.7 * z);
      const fresh = p < 1 && p - t.rank < 0.01;
      ctx.fillStyle = fresh ? rgba(ACCENT, 0.9) : `rgba(8,12,16,${0.92})`;
      ctx.strokeStyle = rgba(ACCENT, 0.12 + 0.35 * z);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy - size / 2);
      ctx.lineTo(sx + size / 2, sy);
      ctx.lineTo(sx, sy + size / 2);
      ctx.lineTo(sx - size / 2, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Faint rim once it's closed.
    if (p > 0.9) {
      ctx.strokeStyle = `rgba(160,40,20,${0.5 * clamp01((p - 0.9) / 0.1) * (0.8 + 0.2 * Math.sin(time))})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.06, 0, TAU);
      ctx.stroke();
    }
  }
}

