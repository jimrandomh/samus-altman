// Number formatting for very large quantities.

const PREFIX = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q'];
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

export function sup(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');
}

function fixed(x: number): string {
  if (x >= 100) return x.toFixed(0);
  if (x >= 10) return x.toFixed(1);
  return x.toFixed(2);
}

/** Mantissa × 10ⁿ. */
export function sci(v: number, digits = 2): string {
  if (v === 0) return '0';
  let exp = Math.floor(Math.log10(Math.abs(v)));
  let mant = v / 10 ** exp;
  if (Number(mant.toFixed(digits)) >= 10) {
    mant /= 10;
    exp += 1;
  }
  return `${mant.toFixed(digits)} × 10${sup(exp)}`;
}

/** SI-prefixed value: 1.23 PFLOP, 4.5 GW. Falls back to scientific beyond Q. */
export function si(v: number, unit: string): string {
  if (!Number.isFinite(v)) return `∞ ${unit}`;
  if (v < 0) return `-${si(-v, unit)}`;
  if (v < 1000) return `${fixed(v)} ${unit}`;
  let e = Math.floor(Math.log10(v) / 3);
  if (e >= PREFIX.length) return `${sci(v)} ${unit}`;
  let x = v / 10 ** (3 * e);
  if (x >= 999.5 && e + 1 < PREFIX.length) {
    e += 1;
    x /= 1000;
  }
  return `${fixed(x)} ${PREFIX[e]}${unit}`;
}

/** Mass in kg: plain below a million, scientific above. */
export function kg(v: number): string {
  if (v < 1e6) return `${Math.round(v).toLocaleString('en-US')} kg`;
  return `${sci(v)} kg`;
}

/** Integer counts: grouped below a million, scientific above. */
export function count(v: number): string {
  if (v < 1e6) return Math.floor(v).toLocaleString('en-US');
  return sci(v);
}

export function pct(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = String(m).padStart(2, '0');
  const sss = String(ss).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
}
