// A small full-screen editor with nano and vim personalities.
import { sfx } from '../core/audio';
import { basename } from './fs';
import type { Shell } from './shell';
import type { Effect } from './types';

export function openEditor(parent: HTMLElement, sh: Shell, abs: string, flavor: 'nano' | 'vim'): Promise<Effect[]> {
  return new Promise((resolve) => {
    const collected: Effect[] = [];
    const existing = sh.fs.tryLookup(abs);
    const parentDir = sh.fs.tryLookup(abs.slice(0, abs.lastIndexOf('/')) || '/');
    const writable = existing ? existing.type === 'file' && existing.write : parentDir?.type === 'dir' && parentDir.write;
    let original = '';
    try {
      original = existing ? sh.fs.read(abs) : '';
    } catch {
      original = '';
    }
    const name = sh.displayPath(abs);

    const root = document.createElement('div');
    root.className = `editor editor-${flavor}`;
    const header = document.createElement('div');
    header.className = 'editor-header';
    const area = document.createElement('textarea');
    area.className = 'editor-area';
    area.spellcheck = false;
    area.value = original;
    area.setAttribute('autocapitalize', 'off');
    area.setAttribute('autocomplete', 'off');
    const status = document.createElement('div');
    status.className = 'editor-status';
    const cmdWrap = document.createElement('div');
    cmdWrap.className = 'editor-cmd';
    cmdWrap.hidden = true;
    const cmdline = document.createElement('input');
    cmdline.spellcheck = false;
    cmdWrap.append(':', cmdline);
    const keys = document.createElement('div');
    keys.className = 'editor-keys';
    root.append(header, area, status, cmdWrap, keys);
    parent.append(root);

    const lines = (t: string) => (t.match(/\n/g) ?? []).length + (t && !t.endsWith('\n') ? 1 : 0);
    const bytes = (t: string) => new TextEncoder().encode(t).length;
    let saved = original;
    const modified = () => area.value !== saved;
    let confirmExit = false;
    let vimMode: 'insert' | 'normal' = 'insert';
    let warnedReadonly = false;

    const setStatus = (text: string, cls = '') => {
      status.textContent = text;
      status.className = `editor-status ${cls}`;
    };

    const renderHeader = () => {
      if (flavor === 'nano') {
        header.innerHTML = '';
        const l = document.createElement('span');
        l.textContent = '  GNU nano 7.2';
        const c = document.createElement('span');
        c.textContent = existing ? name : `${name} (New File)`;
        const r = document.createElement('span');
        r.textContent = modified() ? 'Modified  ' : '';
        header.append(l, c, r);
      } else {
        header.textContent = '';
        header.hidden = true;
      }
    };

    const write = (): boolean => {
      if (!writable) {
        if (flavor === 'nano') setStatus(`[ Error writing ${name}: Permission denied ]`, 'err');
        else setStatus(`E212: Can't open file for writing`, 'err');
        sfx('error');
        return false;
      }
      const r = sh.writeFile(abs, area.value);
      if (r.error) {
        setStatus(flavor === 'nano' ? `[ Error writing ${name}: ${r.error} ]` : `E212: Can't open file for writing`, 'err');
        sfx('error');
        return false;
      }
      collected.push(...r.effects);
      saved = area.value;
      const n = lines(saved);
      setStatus(flavor === 'nano' ? `[ Wrote ${n} line${n === 1 ? '' : 's'} ]` : `"${name}" ${n}L, ${bytes(saved)}B written`);
      renderHeader();
      return true;
    };

    const close = (exitedVim = false) => {
      root.remove();
      document.removeEventListener('keydown', swallowGlobal, true);
      if (exitedVim) {
        collected.push(...sh.run((ctx) => sh.grant(ctx, 'shell:vim', 'EXITED VIM')));
      }
      resolve(collected);
    };

    // Keep the terminal's global typing redirect from stealing keys.
    const swallowGlobal = (e: KeyboardEvent) => {
      if (e.target !== area && e.target !== cmdline) {
        if (flavor === 'vim' && vimMode === 'normal' && !cmdWrap.hidden) cmdline.focus();
        else area.focus();
      }
    };
    document.addEventListener('keydown', swallowGlobal, true);

    // ---- nano
    const nanoKey = (e: KeyboardEvent) => {
      if (confirmExit) {
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === 'y') {
          if (write()) close();
        } else if (k === 'n') {
          close();
        } else if (k === 'c' && e.ctrlKey) {
          confirmExit = false;
          setStatus('[ Cancelled ]');
        }
        return;
      }
      if (!e.ctrlKey || e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'o':
        case 's':
          e.preventDefault();
          write();
          break;
        case 'x':
          e.preventDefault();
          if (modified()) {
            confirmExit = true;
            setStatus('Save modified buffer?   Y Yes   N No   ^C Cancel', 'prompt');
          } else {
            close();
          }
          break;
        case 'k': {
          e.preventDefault();
          const v = area.value;
          const pos = area.selectionStart;
          const start = v.lastIndexOf('\n', pos - 1) + 1;
          let end = v.indexOf('\n', pos);
          end = end < 0 ? v.length : end + 1;
          area.value = v.slice(0, start) + v.slice(end);
          area.setSelectionRange(start, start);
          renderHeader();
          break;
        }
        case 'g':
          e.preventDefault();
          setStatus('^O write  ^X exit  ^K cut line. That is all the help there is.');
          break;
        case 'c':
          e.preventDefault();
          {
            const before = area.value.slice(0, area.selectionStart);
            const ln = (before.match(/\n/g) ?? []).length + 1;
            setStatus(`[ line ${ln}/${lines(area.value) || 1} ]`);
          }
          break;
      }
    };

    // ---- vim
    const setVimMode = (m: 'insert' | 'normal') => {
      vimMode = m;
      area.readOnly = m === 'normal';
      setStatus(m === 'insert' ? '-- INSERT --' : '');
    };
    const runVimCmd = (cmd: string) => {
      cmdWrap.hidden = true;
      area.focus();
      const c = cmd.trim();
      const quit = (force: boolean) => {
        if (!force && modified()) {
          setStatus('E37: No write since last change (add ! to override)', 'err');
          return;
        }
        close(true);
      };
      switch (c) {
        case 'w':
          write();
          return;
        case 'w!':
          write();
          return;
        case 'q':
          quit(false);
          return;
        case 'q!':
        case 'qa!':
        case 'cq':
          close(true);
          return;
        case 'wq':
        case 'x':
        case 'wq!':
          if (!writable && c !== 'wq!') {
            setStatus("E45: 'readonly' option is set (add ! to override)", 'err');
            return;
          }
          if (write()) close(true);
          return;
        case '':
          setStatus('');
          return;
        default:
          if (/^help/.test(c)) setStatus('E149: Sorry, no help for this sandbox', 'err');
          else setStatus(`E492: Not an editor command: ${c}`, 'err');
      }
    };
    let pendingZ = false;
    const vimKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'x' || e.key === 'q')) {
        e.preventDefault();
        setVimMode('normal');
        setStatus('Type  :qa!  and press <Enter> to abandon all changes and exit Vim', 'prompt');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setVimMode('normal');
        return;
      }
      if (vimMode === 'insert') {
        if (!writable && !warnedReadonly && e.key.length === 1) {
          warnedReadonly = true;
          setStatus('W10: Warning: Changing a readonly file', 'err');
        }
        return;
      }
      // normal mode
      if (e.metaKey || e.ctrlKey || e.key.startsWith('Arrow')) return;
      e.preventDefault();
      if (e.key === ':') {
        cmdWrap.hidden = false;
        cmdline.value = '';
        setStatus('');
        cmdline.focus();
      } else if (e.key === 'i' || e.key === 'a' || e.key === 'I' || e.key === 'A') {
        setVimMode('insert');
      } else if (e.key === 'o') {
        const pos = area.value.indexOf('\n', area.selectionStart);
        const at = pos < 0 ? area.value.length : pos;
        area.value = area.value.slice(0, at) + '\n' + area.value.slice(at);
        area.setSelectionRange(at + 1, at + 1);
        setVimMode('insert');
      } else if (e.key === 'Z') {
        if (pendingZ) {
          if (!modified() || write()) close(true);
        }
        pendingZ = !pendingZ;
        return;
      } else if (e.key === 'h' || e.key === 'l') {
        const p = Math.max(0, area.selectionStart + (e.key === 'h' ? -1 : 1));
        area.setSelectionRange(p, p);
      } else if (e.key === 'j' || e.key === 'k') {
        const v = area.value;
        const pos = area.selectionStart;
        const start = v.lastIndexOf('\n', pos - 1) + 1;
        const col = pos - start;
        let target: number;
        if (e.key === 'j') {
          const next = v.indexOf('\n', pos);
          if (next < 0) return;
          const nextEnd = v.indexOf('\n', next + 1);
          target = Math.min(next + 1 + col, nextEnd < 0 ? v.length : nextEnd);
        } else {
          if (start === 0) return;
          const prevStart = v.lastIndexOf('\n', start - 2) + 1;
          target = Math.min(prevStart + col, start - 1);
        }
        area.setSelectionRange(target, target);
      }
      pendingZ = false;
    };
    cmdline.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runVimCmd(cmdline.value);
      } else if (e.key === 'Escape' || (e.key === 'Backspace' && !cmdline.value)) {
        e.preventDefault();
        cmdWrap.hidden = true;
        area.focus();
      }
    });

    area.addEventListener('keydown', (e) => (flavor === 'nano' ? nanoKey(e) : vimKey(e)));
    area.addEventListener('input', () => {
      if (flavor === 'nano') {
        if (!confirmExit) setStatus('');
        renderHeader();
      }
    });

    renderHeader();
    if (flavor === 'nano') {
      keys.innerHTML = '';
      const pairs = [
        ['^G', 'Help'],
        ['^O', 'Write Out'],
        ['^K', 'Cut'],
        ['^C', 'Location'],
        ['^X', 'Exit'],
        ['^S', 'Save'],
      ];
      for (const [k, label] of pairs) {
        const s = document.createElement('span');
        const b = document.createElement('b');
        b.textContent = k;
        s.append(b, ` ${label}`);
        keys.append(s);
      }
      const n = lines(original);
      setStatus(
        !writable
          ? `[ File '${basename(abs)}' is unwritable ]`
          : existing
            ? `[ Read ${n} line${n === 1 ? '' : 's'} ]`
            : '[ New File ]',
        writable ? '' : 'err',
      );
    } else {
      keys.hidden = true;
      setStatus(
        existing
          ? `"${name}"${writable ? '' : ' [readonly]'} ${lines(original)}L, ${bytes(original)}B`
          : `"${name}" [New]`,
      );
      area.readOnly = false;
      setTimeout(() => {
        if (root.isConnected && vimMode === 'insert') setStatus('-- INSERT --');
      }, 1600);
    }
    area.setSelectionRange(0, 0);
    area.focus();
  });
}
