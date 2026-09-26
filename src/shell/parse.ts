// A small bash-ish command-line parser: quotes, escapes, $VARS, ~, pipes, redirects, ; && ||.

export type RedirectOp = '>' | '>>' | '<' | '2>' | '2>>' | '2>&1';

export interface Redirect {
  op: RedirectOp;
  target: string;
}

export interface Word {
  text: string;
  /** True if an unquoted `*` or `?` appeared (eligible for globbing). */
  glob: boolean;
}

export interface SimpleCommand {
  words: Word[];
  redirects: Redirect[];
}

export type Connector = ';' | '&&' | '||';

export interface ListItem {
  /** How this pipeline is joined to the previous one (null for the first). */
  connector: Connector | null;
  pipeline: SimpleCommand[];
}

export type ParseResult = { ok: true; list: ListItem[] } | { ok: false; error: string };

type Token = { t: 'word'; w: Word } | { t: 'op'; v: string };

const OPS = ['2>&1', '2>>', '&&', '||', '>>', '2>', '|', '>', '<', ';', '&'];

export interface ExpandEnv {
  vars: Record<string, string>;
  home: string;
}

function lex(line: string, env: ExpandEnv): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;
  let cur: Word | null = null;
  const push = () => {
    if (cur) tokens.push({ t: 'word', w: cur });
    cur = null;
  };
  const word = (): Word => (cur ??= { text: '', glob: false });

  const expandVar = (): string => {
    // at line[i] === '$'
    const rest = line.slice(i + 1);
    let m = /^\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(rest);
    if (m) {
      i += m[0].length + 1;
      return env.vars[m[1]] ?? '';
    }
    m = /^([A-Za-z_][A-Za-z0-9_]*|\?|\$)/.exec(rest);
    if (m) {
      i += m[0].length + 1;
      if (m[1] === '$') return '311';
      return env.vars[m[1]] ?? '';
    }
    i += 1;
    return '$';
  };

  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') {
      push();
      i++;
      continue;
    }
    if (c === '#' && !cur) break; // comment
    const op = OPS.find((o) => line.startsWith(o, i));
    // "2>" only counts as an operator at the start of a word
    if (op && !(op.startsWith('2') && cur)) {
      push();
      tokens.push({ t: 'op', v: op });
      i += op.length;
      continue;
    }
    if (c === '\\') {
      if (i + 1 < line.length) word().text += line[i + 1];
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) return { ok: false, error: "bash: unexpected EOF while looking for matching `''" };
      word().text += line.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (c === '"') {
      const w = word();
      i++;
      let closed = false;
      while (i < line.length) {
        const d = line[i];
        if (d === '"') {
          closed = true;
          i++;
          break;
        }
        if (d === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) {
          w.text += line[i + 1];
          i += 2;
          continue;
        }
        if (d === '$') {
          w.text += expandVar();
          continue;
        }
        w.text += d;
        i++;
      }
      if (!closed) return { ok: false, error: 'bash: unexpected EOF while looking for matching `"\'' };
      continue;
    }
    if (c === '$') {
      word().text += expandVar();
      continue;
    }
    if (c === '~' && !cur && (i + 1 === line.length || /[\s/]/.test(line[i + 1]))) {
      word().text += env.home;
      i++;
      continue;
    }
    if (c === '*' || c === '?') word().glob = true;
    word().text += c;
    i++;
  }
  push();
  return { ok: true, tokens };
}

export function parseLine(line: string, env: ExpandEnv): ParseResult {
  const lexed = lex(line, env);
  if (!lexed.ok) return lexed;
  const list: ListItem[] = [];
  let pipeline: SimpleCommand[] = [];
  let cmd: SimpleCommand = { words: [], redirects: [] };
  let connector: Connector | null = null;
  const toks = lexed.tokens;

  const syntax = (tok: string) => ({ ok: false as const, error: `bash: syntax error near unexpected token \`${tok}'` });

  const endCommand = (tok: string): string | null => {
    if (!cmd.words.length && !cmd.redirects.length) return tok;
    pipeline.push(cmd);
    cmd = { words: [], redirects: [] };
    return null;
  };

  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === 'word') {
      cmd.words.push(tk.w);
      continue;
    }
    switch (tk.v) {
      case '|': {
        const bad = endCommand('|');
        if (bad) return syntax(bad);
        break;
      }
      case ';':
      case '&&':
      case '||':
      case '&': {
        const bad = endCommand(tk.v);
        if (bad) return syntax(bad);
        list.push({ connector, pipeline });
        pipeline = [];
        connector = tk.v === '&' ? ';' : (tk.v as Connector);
        break;
      }
      case '2>&1':
        cmd.redirects.push({ op: '2>&1', target: '' });
        break;
      default: {
        const next = toks[k + 1];
        if (!next || next.t !== 'word') return syntax(next ? (next as { v: string }).v : 'newline');
        cmd.redirects.push({ op: tk.v as RedirectOp, target: next.w.text });
        k++;
      }
    }
  }
  if (cmd.words.length || cmd.redirects.length) pipeline.push(cmd);
  if (pipeline.length) {
    list.push({ connector, pipeline });
  } else if (connector === '&&' || connector === '||') {
    return syntax('newline');
  } else if (list.length && list[list.length - 1].pipeline.length === 0) {
    return syntax(';');
  }
  // A trailing '|' leaves an empty pipeline segment
  if (toks.length && toks[toks.length - 1].t === 'op' && (toks[toks.length - 1] as { v: string }).v === '|') {
    return syntax('newline');
  }
  return { ok: true, list };
}

/** Split a line into the word being completed, for tab completion. */
export function currentWordStart(line: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && !/[\s|;&<>]/.test(line[i - 1])) i--;
  return i;
}
