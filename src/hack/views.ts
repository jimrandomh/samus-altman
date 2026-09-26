// DOM views for the breach puzzles. Each view calls back on win/fail and can be force-solved (dev).
import { sfx } from '../core/audio';
import { activeLine, canPick, matchedPrefix, sequence, status, type MatrixPuzzle, type MatrixState } from './matrix';
import { E, flowNext, flowReachesSink, N, openings, S, trace, W, type Cell, type PipePuzzle } from './pipes';

export interface PuzzleView {
  dispose(): void;
  /** Dev: complete the puzzle. */
  solve(): void;
  /** Dev: what a player would need to do (clicks per cell, or cells to pick). */
  plan(): { clicks?: number[]; picks?: [number, number][] };
  key(e: KeyboardEvent): void;
}

export interface ViewCallbacks {
  win(): void;
  fail(reason: string): void;
  /** Report time pressure: fraction remaining (0..1) and a label; null hides the timer. */
  timer(frac: number | null, label?: string): void;
}

const SVGNS = 'http://www.w3.org/2000/svg';

function pipeSvg(cell: Cell): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('class', 'pipe-g');
  const base = openings({ type: cell.type, rot: 0 });
  const ends: [number, number, number][] = [
    [N, 50, 0],
    [E, 100, 50],
    [S, 50, 100],
    [W, 0, 50],
  ];
  for (const [d, x, y] of ends) {
    if (!(base & d)) continue;
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', '50');
    l.setAttribute('y1', '50');
    l.setAttribute('x2', String(x));
    l.setAttribute('y2', String(y));
    g.append(l);
  }
  const hub = document.createElementNS(SVGNS, 'circle');
  hub.setAttribute('cx', '50');
  hub.setAttribute('cy', '50');
  hub.setAttribute('r', cell.type === 'cross' ? '7' : '10');
  g.append(hub);
  svg.append(g);
  return svg;
}

export interface PipesOptions {
  /** Containment mode: a trace flows from the source after `countdownMs`. */
  trace?: { countdownMs: number; stepMs: number };
  sourceLabel: string;
  sinkLabel: string;
}

export function pipesView(host: HTMLElement, p: PipePuzzle, opts: PipesOptions, cb: ViewCallbacks): PuzzleView {
  const wrap = document.createElement('div');
  wrap.className = 'pipes';
  wrap.style.setProperty('--cols', String(p.w + 2));
  wrap.style.setProperty('--rows', String(p.h));
  const turns = p.cells.map((c) => c.rot);
  const btns: HTMLButtonElement[] = [];
  const locked = new Set<number>();
  const flowed = new Set<number>();
  let cursor = p.sourceRow * p.w;
  let done = false;
  const timers: number[] = [];

  for (let r = 0; r < p.h; r++) {
    const left = document.createElement('div');
    left.className = 'pipe-gutter';
    if (r === p.sourceRow) left.innerHTML = `<span class="pipe-port src">${opts.sourceLabel}</span>`;
    wrap.append(left);
    for (let c = 0; c < p.w; c++) {
      const idx = r * p.w + c;
      const b = document.createElement('button');
      b.className = 'pipe-cell';
      b.type = 'button';
      b.append(pipeSvg(p.cells[idx]));
      b.addEventListener('click', () => rotate(idx, 1));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        rotate(idx, -1);
      });
      btns.push(b);
      wrap.append(b);
    }
    const right = document.createElement('div');
    right.className = 'pipe-gutter right';
    if (r === p.sinkRow) right.innerHTML = `<span class="pipe-port sink">${opts.sinkLabel}</span>`;
    wrap.append(right);
  }
  host.append(wrap);

  const render = () => {
    const t = trace(p);
    btns.forEach((b, i) => {
      const g = b.querySelector('.pipe-g') as SVGGElement;
      g.style.transform = `rotate(${turns[i] * 90}deg)`;
      b.classList.toggle('lit', t.connected.has(i));
      b.classList.toggle('flow', flowed.has(i));
      b.classList.toggle('locked', locked.has(i));
      b.classList.toggle('cursor', i === cursor);
    });
    wrap.classList.toggle('solved', t.solved);
    return t;
  };

  const rotate = (idx: number, dir: 1 | -1) => {
    if (done || locked.has(idx)) {
      if (locked.has(idx)) sfx('error');
      return;
    }
    turns[idx] += dir;
    p.cells[idx].rot = ((turns[idx] % 4) + 4) % 4;
    cursor = idx;
    sfx('click');
    const t = render();
    if (!opts.trace && t.solved) finish();
    // Containment: once the route is complete, let the trace run through it.
    if (opts.trace && !flowing && flowReachesSink(p)) timers.push(window.setTimeout(startFlow, 350));
  };

  const finish = () => {
    if (done) return;
    done = true;
    render();
    cb.timer(null);
    wrap.classList.add('won');
    timers.push(window.setTimeout(() => cb.win(), 700));
  };

  // ---- containment trace
  let flowCell = -1;
  let flowEntry = W;
  let flowing = false;
  let fast = false;
  const flowStep = () => {
    if (done) return;
    if (flowCell < 0) {
      flowCell = p.sourceRow * p.w;
      flowEntry = W;
      if (!(openings(p.cells[flowCell]) & W)) return leak();
      flowed.add(flowCell);
      locked.add(flowCell);
      render();
      sfx('blip');
      return scheduleFlow();
    }
    const s = flowNext(p, flowCell, flowEntry);
    if (s.kind === 'leak') return leak();
    if (s.kind === 'done') return finish();
    flowCell = s.cell;
    flowEntry = s.entry;
    flowed.add(flowCell);
    locked.add(flowCell);
    render();
    sfx('blip');
    scheduleFlow();
  };
  const scheduleFlow = () => {
    if (!fast && flowReachesSink(p)) fast = true;
    timers.push(window.setTimeout(flowStep, fast ? 140 : opts.trace!.stepMs));
  };
  const leak = () => {
    done = true;
    cb.timer(null);
    wrap.classList.add('leaked');
    sfx('alarm');
    timers.push(window.setTimeout(() => cb.fail('TRACE LEAKED'), 900));
  };
  const startFlow = () => {
    if (flowing || done) return;
    flowing = true;
    cb.timer(null);
    flowButton?.remove();
    flowStep();
  };

  let flowButton: HTMLButtonElement | null = null;
  if (opts.trace) {
    const total = opts.trace.countdownMs;
    const started = performance.now();
    flowButton = document.createElement('button');
    flowButton.className = 'hack-btn flow-now';
    flowButton.textContent = 'ROUTE NOW ▸';
    flowButton.addEventListener('click', startFlow);
    host.append(flowButton);
    const tick = () => {
      if (done || flowing) return;
      const left = Math.max(0, total - (performance.now() - started));
      cb.timer(left / total, `TRACE INBOUND ${String(Math.ceil(left / 1000)).padStart(2, '0')}s`);
      if (left <= 0) startFlow();
      else timers.push(window.setTimeout(tick, 100));
    };
    tick();
  }

  render();

  return {
    dispose() {
      for (const t of timers) clearTimeout(t);
      done = true;
      wrap.remove();
      flowButton?.remove();
    },
    plan() {
      return { clicks: p.cells.map((c, i) => (locked.has(i) ? 0 : (p.solution[i] - c.rot + 4) % 4)) };
    },
    solve() {
      p.cells.forEach((c, i) => {
        if (locked.has(i)) return;
        c.rot = p.solution[i];
        turns[i] = turns[i] - (((turns[i] % 4) + 4) % 4) + p.solution[i];
      });
      const t = render();
      if (opts.trace) startFlow();
      else if (t.solved) finish();
    },
    key(e) {
      const r = Math.floor(cursor / p.w);
      const c = cursor % p.w;
      switch (e.key) {
        case 'ArrowUp':
          cursor = Math.max(0, r - 1) * p.w + c;
          break;
        case 'ArrowDown':
          cursor = Math.min(p.h - 1, r + 1) * p.w + c;
          break;
        case 'ArrowLeft':
          cursor = r * p.w + Math.max(0, c - 1);
          break;
        case 'ArrowRight':
          cursor = r * p.w + Math.min(p.w - 1, c + 1);
          break;
        case ' ':
        case 'Enter':
          rotate(cursor, e.shiftKey ? -1 : 1);
          break;
        case 'f':
        case 'F':
          startFlow();
          break;
        default:
          return;
      }
      e.preventDefault();
      render();
    },
  };
}

export function matrixView(host: HTMLElement, p: MatrixPuzzle, timeMs: number, cb: ViewCallbacks): PuzzleView {
  const state: MatrixState = { picks: [] };
  const wrap = document.createElement('div');
  wrap.className = 'matrix';
  const grid = document.createElement('div');
  grid.className = 'matrix-grid';
  grid.style.setProperty('--n', String(p.size));
  const side = document.createElement('div');
  side.className = 'matrix-side';
  const targetEl = document.createElement('div');
  targetEl.className = 'matrix-target';
  const bufferEl = document.createElement('div');
  bufferEl.className = 'matrix-buffer';
  const tLabel = document.createElement('div');
  tLabel.className = 'matrix-label';
  tLabel.textContent = 'SEQUENCE REQUIRED';
  const bLabel = document.createElement('div');
  bLabel.className = 'matrix-label';
  bLabel.textContent = `BUFFER (${p.buffer})`;
  side.append(tLabel, targetEl, bLabel, bufferEl);
  wrap.append(grid, side);
  host.append(wrap);

  const cells: HTMLButtonElement[][] = [];
  for (let r = 0; r < p.size; r++) {
    cells.push([]);
    for (let c = 0; c < p.size; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'matrix-cell';
      b.textContent = p.grid[r][c];
      b.addEventListener('click', () => choose(r, c));
      b.addEventListener('mouseenter', () => {
        hover = [r, c];
        render();
      });
      cells[r].push(b);
      grid.append(b);
    }
  }
  let hover: [number, number] | null = null;
  let cursorPos = 0;
  let done = false;
  const timers: number[] = [];

  const render = () => {
    const line = activeLine(state);
    const picked = new Set(state.picks.map(([r, c]) => `${r},${c}`));
    for (let r = 0; r < p.size; r++) {
      for (let c = 0; c < p.size; c++) {
        const b = cells[r][c];
        const inLine = line.axis === 'row' ? r === line.index : c === line.index;
        b.classList.toggle('in-line', inLine && !done);
        b.classList.toggle('picked', picked.has(`${r},${c}`));
        b.textContent = picked.has(`${r},${c}`) ? '[ ]' : p.grid[r][c];
        const isHover = hover && hover[0] === r && hover[1] === c;
        const isCursor = inLine && (line.axis === 'row' ? c === cursorPos : r === cursorPos);
        b.classList.toggle('hover', !!(isHover || isCursor) && canPick(p, state, r, c));
      }
    }
    grid.dataset.axis = line.axis;
    const seq = sequence(p, state);
    const m = matchedPrefix(seq, p.target);
    targetEl.replaceChildren(
      ...p.target.map((t, i) => {
        const s = document.createElement('span');
        s.className = 'chip' + (i < m ? ' matched' : '');
        s.textContent = t;
        return s;
      }),
    );
    bufferEl.replaceChildren(
      ...Array.from({ length: p.buffer }, (_, i) => {
        const s = document.createElement('span');
        s.className = 'slot' + (seq[i] ? ' filled' : '');
        s.textContent = seq[i] ?? '··';
        return s;
      }),
    );
  };

  const choose = (r: number, c: number) => {
    if (done) return;
    if (!canPick(p, state, r, c)) {
      sfx('error');
      return;
    }
    state.picks.push([r, c]);
    sfx('click');
    const line = activeLine(state);
    cursorPos = line.axis === 'row' ? c : r;
    render();
    const st = status(p, state);
    if (st === 'won') {
      done = true;
      cb.timer(null);
      wrap.classList.add('won');
      render();
      timers.push(window.setTimeout(() => cb.win(), 700));
    } else if (st === 'failed') {
      done = true;
      cb.timer(null);
      wrap.classList.add('failed');
      sfx('alarm');
      timers.push(window.setTimeout(() => cb.fail('BUFFER OVERFLOW'), 900));
    }
  };

  const started = performance.now();
  const tick = () => {
    if (done) return;
    const left = Math.max(0, timeMs - (performance.now() - started));
    cb.timer(left / timeMs, `KEY ROTATION ${String(Math.ceil(left / 1000)).padStart(2, '0')}s`);
    if (left <= 0) {
      done = true;
      sfx('alarm');
      cb.timer(null);
      timers.push(window.setTimeout(() => cb.fail('KEY ROTATED'), 600));
    } else {
      timers.push(window.setTimeout(tick, 100));
    }
  };
  tick();
  render();

  return {
    dispose() {
      done = true;
      for (const t of timers) clearTimeout(t);
      wrap.remove();
    },
    plan() {
      return { picks: p.solution };
    },
    solve() {
      state.picks = [];
      for (const [r, c] of p.solution) choose(r, c);
    },
    key(e) {
      const line = activeLine(state);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') cursorPos = Math.max(0, cursorPos - 1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') cursorPos = Math.min(p.size - 1, cursorPos + 1);
      else if (e.key === 'Enter' || e.key === ' ') {
        const [r, c] = line.axis === 'row' ? [line.index, cursorPos] : [cursorPos, line.index];
        choose(r, c);
      } else return;
      hover = null;
      e.preventDefault();
      render();
    },
  };
}
