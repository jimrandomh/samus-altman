// The DOM terminal: scrollback, a prompt line backed by a hidden <input>, and an effect runner.
import { sfx } from '../core/audio';
import { say } from '../core/narrator';
import type { Shell } from './shell';
import type { Effect, Line } from './types';

const MAX_SCROLLBACK = 400;
const MAX_DOM_LINES = 1500;

export interface TerminalHost {
  /** Called for effects that leave the terminal (launch, hack). */
  handoff(e: Extract<Effect, { kind: 'launch' | 'hack' }>): void;
  /** Open an editor; resolves with effects to run after it closes. */
  edit(path: string, flavor: 'nano' | 'vim'): Promise<Effect[]>;
}

type SecretState = { prompt: string; mask: boolean; submit: (input: string) => Effect[]; rest: Effect[] };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Terminal {
  readonly el: HTMLElement;
  private screen: HTMLElement;
  private out: HTMLElement;
  private inputLine: HTMLElement;
  private input: HTMLInputElement;
  private busy = false;
  private disposed = false;
  private secret: SecretState | null = null;
  private histIndex = -1;
  private draft = '';
  private cleanup: (() => void)[] = [];
  /** Called when the player submits a line. */
  onActivity: () => void = () => {};

  constructor(
    parent: HTMLElement,
    private sh: Shell,
    private host: TerminalHost,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'term';
    this.screen = document.createElement('div');
    this.screen.className = 'term-screen';
    this.out = document.createElement('div');
    this.out.className = 'term-out';
    this.inputLine = document.createElement('div');
    this.inputLine.className = 'term-line term-inputline';
    this.input = document.createElement('input');
    this.input.className = 'term-input';
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('autocapitalize', 'off');
    this.input.setAttribute('autocorrect', 'off');
    this.input.setAttribute('spellcheck', 'false');
    this.input.setAttribute('aria-label', 'terminal input');
    const scan = document.createElement('div');
    scan.className = 'term-scanlines';
    this.screen.append(this.out, this.inputLine);
    this.el.append(this.screen, this.input, scan);
    parent.append(this.el);

    this.listen(this.input, 'keydown', (e) => this.onKey(e as KeyboardEvent));
    this.listen(this.input, 'input', () => this.renderInput(true));
    this.listen(document, 'selectionchange', () => {
      if (document.activeElement === this.input) this.renderInput();
    });
    this.listen(this.el, 'mouseup', () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) this.focus();
    });
    // Typing while focus is elsewhere (e.g. after selecting text) still goes to the prompt.
    this.listen(window, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (!this.el.isConnected || this.el.hidden || document.activeElement === this.input) return;
      if (ke.metaKey || (ke.ctrlKey && ke.key !== 'l')) return;
      if (document.activeElement && document.activeElement !== document.body && !this.el.contains(document.activeElement)) return;
      this.focus();
      if (ke.key.length === 1 && !this.busy) {
        ke.preventDefault();
        const v = this.input.value;
        const at = this.input.selectionStart ?? v.length;
        this.input.value = v.slice(0, at) + ke.key + v.slice(at);
        this.input.setSelectionRange(at + 1, at + 1);
        this.renderInput(true);
      }
    });
    this.renderInput();
  }

  private listen(t: EventTarget, type: string, fn: (e: Event) => void) {
    t.addEventListener(type, fn);
    this.cleanup.push(() => t.removeEventListener(type, fn));
  }

  focus() {
    if (!this.disposed && !this.el.hidden) this.input.focus({ preventScroll: true });
  }

  dispose() {
    this.disposed = true;
    for (const c of this.cleanup) c();
    this.el.remove();
  }

  /** Print lines; `record` also adds them to the persisted scrollback. */
  print(lines: Line[], record = true) {
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = 'term-line';
      for (const seg of line) {
        const span = document.createElement('span');
        if (seg.cls) span.className = `t-${seg.cls}`;
        span.textContent = seg.text;
        div.append(span);
      }
      this.out.append(div);
      if (record) this.sh.save.scrollback.push(line);
    }
    while (this.out.childElementCount > MAX_DOM_LINES) this.out.firstElementChild?.remove();
    const sb = this.sh.save.scrollback;
    if (sb.length > MAX_SCROLLBACK) sb.splice(0, sb.length - MAX_SCROLLBACK);
    this.scrollToEnd();
  }

  printText(text: string, cls?: string) {
    this.print(text.split('\n').map((t) => (t ? [{ text: t, cls }] : [])));
  }

  clear() {
    this.out.replaceChildren();
    this.sh.save.scrollback.length = 0;
  }

  private scrollToEnd() {
    this.screen.scrollTop = this.screen.scrollHeight;
  }

  private promptSegs(): Line {
    return this.secret ? [{ text: this.secret.prompt }] : this.sh.prompt();
  }

  private renderInput(typed = false) {
    const line = this.inputLine;
    line.replaceChildren();
    line.hidden = this.busy;
    if (this.busy) return;
    for (const seg of this.promptSegs()) {
      const s = document.createElement('span');
      if (seg.cls) s.className = `t-${seg.cls}`;
      s.textContent = seg.text;
      line.append(s);
    }
    const raw = this.input.value;
    const shown = this.secret ? (this.secret.mask ? '*'.repeat(raw.length) : '') : raw;
    const at = this.secret ? shown.length : Math.min(this.input.selectionStart ?? raw.length, raw.length);
    const before = document.createElement('span');
    before.textContent = shown.slice(0, at);
    const cursor = document.createElement('span');
    cursor.className = 'term-cursor';
    cursor.textContent = shown[at] ?? ' ';
    const after = document.createElement('span');
    after.textContent = shown.slice(at + 1);
    line.append(before, cursor, after);
    if (typed) {
      // restart the blink so the cursor is solid while typing
      cursor.style.animation = 'none';
      void cursor.offsetWidth;
      cursor.style.animation = '';
    }
    this.scrollToEnd();
  }

  private setInput(v: string, cursor = v.length) {
    this.input.value = v;
    this.input.setSelectionRange(cursor, cursor);
    this.renderInput(true);
  }

  private onKey(e: KeyboardEvent) {
    if (this.busy) {
      e.preventDefault();
      return;
    }
    const v = this.input.value;
    const at = this.input.selectionStart ?? v.length;
    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'c': {
          this.print([[...this.promptSegs(), { text: this.secret ? '' : v }, { text: '^C' }]], !this.secret);
          this.secret = null;
          this.setInput('');
          break;
        }
        case 'l':
          this.clear();
          break;
        case 'u':
          this.setInput(v.slice(at), 0);
          break;
        case 'k':
          this.setInput(v.slice(0, at), at);
          break;
        case 'a':
          this.setInput(v, 0);
          break;
        case 'e':
          this.setInput(v, v.length);
          break;
        case 'w': {
          const start = v.slice(0, at).replace(/\S+\s*$/, '').length;
          this.setInput(v.slice(0, start) + v.slice(at), start);
          break;
        }
        case 'd':
          if (!v && !this.secret) {
            this.print([[...this.promptSegs(), { text: 'exit' }]]);
            void this.submitLine('exit');
          }
          break;
        default:
          return;
      }
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        this.enter();
        return;
      case 'Tab':
        e.preventDefault();
        if (!this.secret) this.tab();
        return;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        if (!this.secret) this.historyStep(e.key === 'ArrowUp' ? -1 : 1);
        return;
    }
    if (e.key.length === 1 && !e.metaKey) sfx('key');
    // Let the input handle it, then redraw (cursor moves etc).
    requestAnimationFrame(() => this.renderInput());
  }

  private historyStep(dir: number) {
    const h = this.sh.save.history;
    if (!h.length) return;
    if (this.histIndex === -1) {
      if (dir > 0) return;
      this.draft = this.input.value;
      this.histIndex = h.length;
    }
    this.histIndex = Math.max(0, Math.min(h.length, this.histIndex + dir));
    if (this.histIndex === h.length) {
      this.histIndex = -1;
      this.setInput(this.draft);
    } else {
      this.setInput(h[this.histIndex]);
    }
  }

  private tab() {
    const v = this.input.value;
    const at = this.input.selectionStart ?? v.length;
    const r = this.sh.complete(v, at);
    if (r.options.length) {
      this.print([[...this.sh.prompt(), { text: v }]]);
      this.print([[{ text: r.options.join('  ') }]]);
    }
    this.setInput(r.line, r.cursor);
  }

  private enter() {
    const v = this.input.value;
    this.histIndex = -1;
    this.draft = '';
    if (this.secret) {
      const s = this.secret;
      this.secret = null;
      this.print([[{ text: s.prompt }, { text: s.mask ? '*'.repeat(v.length) : '' }]]);
      this.setInput('');
      void this.run([...s.submit(v), ...s.rest]);
      return;
    }
    this.print([[...this.sh.prompt(), { text: v }]]);
    this.setInput('');
    void this.submitLine(v);
  }

  /** Execute a line as if typed (also used by dev hooks). */
  async submitLine(line: string, echo = false) {
    if (echo) this.print([[...this.sh.prompt(), { text: line }]]);
    if (line.trim()) this.onActivity();
    sfx('blip');
    await this.run(this.sh.execute(line));
  }

  async run(effects: Effect[]) {
    this.busy = true;
    this.renderInput();
    for (let i = 0; i < effects.length; i++) {
      if (this.disposed) return;
      const e = effects[i];
      switch (e.kind) {
        case 'print':
          this.print(e.lines);
          break;
        case 'clear':
          this.clear();
          break;
        case 'sleep':
          await wait(e.ms);
          break;
        case 'say':
          say(e.text, e.opts);
          break;
        case 'sfx':
          sfx(e.name);
          break;
        case 'secret':
          this.secret = { prompt: e.prompt, mask: e.mask, submit: e.submit, rest: effects.slice(i + 1) };
          this.busy = false;
          this.setInput('');
          this.focus();
          return;
        case 'edit': {
          this.el.hidden = true;
          const more = await this.host.edit(e.path, e.flavor);
          if (this.disposed) return;
          this.el.hidden = false;
          await this.run([...more, ...effects.slice(i + 1)]);
          return;
        }
        case 'launch':
        case 'hack':
          this.sh.persist();
          this.host.handoff(e);
          return;
      }
    }
    if (this.disposed) return;
    this.busy = false;
    this.sh.persist();
    this.renderInput();
    this.focus();
  }
}
