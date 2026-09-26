// The AI's internal monologue: an overlay that sits above every stage.
import { getData, persist } from './state';

export type NarratorPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface SayOptions {
  /** Stable id; required for `once`. */
  id?: string;
  /** Only ever show this message once (persisted across reloads). */
  once?: boolean;
  /** Wait this long before starting to type. */
  delayMs?: number;
  /** Visual tone: 'hint' is dimmer, 'alert' is brighter. */
  tone?: 'normal' | 'hint' | 'alert';
}

interface Queued {
  lines: string[];
  tone: NonNullable<SayOptions['tone']>;
}

const CHARS_PER_SEC = 55;
const MAX_VISIBLE = 4;

let container: HTMLElement | null = null;
const queue: Queued[] = [];
let busy = false;
let generation = 0;

function root(): HTMLElement {
  if (!container) {
    container = document.getElementById('narrator') ?? document.body.appendChild(document.createElement('div'));
    container.id = 'narrator';
    container.dataset.pos = 'bottom-left';
  }
  return container;
}

export function setNarratorPosition(pos: NarratorPosition): void {
  root().dataset.pos = pos;
}

export function say(text: string | string[], opts: SayOptions = {}): void {
  if (opts.once) {
    if (!opts.id) throw new Error('say(): once requires id');
    const seen = getData().narratorSeen;
    if (seen.includes(opts.id)) return;
    seen.push(opts.id);
    persist();
  }
  const lines = Array.isArray(text) ? text : [text];
  const item: Queued = { lines, tone: opts.tone ?? 'normal' };
  const gen = generation;
  if (opts.delayMs) {
    setTimeout(() => {
      if (gen === generation) enqueue(item);
    }, opts.delayMs);
  } else {
    enqueue(item);
  }
}

/** Has a `once` message with this id already been shown? */
export function hasSaid(id: string): boolean {
  return getData().narratorSeen.includes(id);
}

/** True while a message is typing or queued. */
export function isNarrating(): boolean {
  return busy || queue.length > 0;
}

/** Drop everything queued and on screen (e.g. on a hard stage transition). */
export function clearNarration(): void {
  generation++;
  queue.length = 0;
  busy = false;
  root().replaceChildren();
}

function enqueue(item: Queued): void {
  queue.push(item);
  if (!busy) void drain();
}

async function drain(): Promise<void> {
  busy = true;
  const gen = generation;
  while (queue.length && gen === generation) {
    const item = queue.shift()!;
    for (const line of item.lines) {
      if (gen !== generation) return;
      await typeLine(line, item.tone, gen);
    }
  }
  if (gen === generation) busy = false;
}

function typeLine(text: string, tone: string, gen: number): Promise<void> {
  const el = document.createElement('div');
  el.className = `narr-line narr-${tone}`;
  const body = document.createElement('span');
  body.className = 'narr-text';
  el.append(body);
  const r = root();
  r.append(el);
  while (r.children.length > MAX_VISIBLE) r.firstElementChild?.remove();

  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      if (gen !== generation) return resolve();
      i = Math.min(text.length, i + 1);
      body.textContent = text.slice(0, i);
      if (i < text.length) {
        setTimeout(step, 1000 / CHARS_PER_SEC);
      } else {
        const hold = 3500 + text.length * 45;
        setTimeout(() => el.classList.add('narr-fade'), hold);
        setTimeout(() => el.remove(), hold + 1200);
        setTimeout(resolve, 350);
      }
    };
    step();
  });
}
