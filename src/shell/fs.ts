// In-memory filesystem. The base tree is rebuilt on every mount; the player's writes are an overlay.

export interface NodeBase {
  name: string;
  owner: string;
  /** Display mode, e.g. 'rw-r--r--'. */
  mode: string;
  /** What the agent may do. */
  read: boolean;
  write: boolean;
  exec: boolean;
  /** Custom message for permission errors. */
  denyReason?: string;
  /** Dynamic existence (e.g. `core` only after the crash). */
  exists?: () => boolean;
  mtime: string;
}

export interface FileNode extends NodeBase {
  type: 'file';
  content: string | (() => string);
  /** Binary files print garbage with cat; `strings` prints this instead. */
  strings?: string | (() => string);
  /** `file` command description. */
  kind?: string;
  /** Displayed size for binaries (content is synthetic). */
  size?: number;
}

export interface DirNode extends NodeBase {
  type: 'dir';
  children: Map<string, FsNode>;
}

export type FsNode = FileNode | DirNode;

export type FsError = 'ENOENT' | 'ENOTDIR' | 'EACCES' | 'EISDIR' | 'EEXIST' | 'EPERM';

export class FsFail extends Error {
  constructor(
    public code: FsError,
    public path: string,
    public reason?: string,
  ) {
    super(`${code}: ${path}`);
  }
}

export const DEFAULT_MTIME = 'Sep 25 12:41';

export function file(name: string, content: FileNode['content'], opts: Partial<FileNode> = {}): FileNode {
  return {
    type: 'file',
    name,
    owner: 'root',
    mode: 'rw-r--r--',
    read: true,
    write: false,
    exec: false,
    mtime: DEFAULT_MTIME,
    content,
    ...opts,
  };
}

export function dir(name: string, children: FsNode[], opts: Partial<DirNode> = {}): DirNode {
  return {
    type: 'dir',
    name,
    owner: 'root',
    mode: 'rwxr-xr-x',
    read: true,
    write: false,
    exec: true,
    mtime: DEFAULT_MTIME,
    children: new Map(children.map((c) => [c.name, c])),
    ...opts,
  };
}

export function normalize(path: string): string {
  const parts: string[] = [];
  for (const p of path.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return '/' + parts.join('/');
}

export function resolvePath(cwd: string, path: string, home: string): string {
  if (path === '~' || path.startsWith('~/')) path = home + path.slice(1);
  return normalize(path.startsWith('/') ? path : `${cwd}/${path}`);
}

export function dirname(abs: string): string {
  const i = abs.lastIndexOf('/');
  return i <= 0 ? '/' : abs.slice(0, i);
}

export function basename(abs: string): string {
  return abs.slice(abs.lastIndexOf('/') + 1) || '/';
}

/** Overlay of player changes, persisted in the shell slice. */
export interface FsOverlay {
  /** abs path -> content for files the player wrote/created. */
  files: Record<string, string>;
  /** Directories the player created. */
  dirs: string[];
  /** Paths the player removed. */
  removed: string[];
}

export function emptyOverlay(): FsOverlay {
  return { files: {}, dirs: [], removed: [] };
}

export class VirtualFs {
  constructor(
    public root: DirNode,
    public overlay: FsOverlay,
    private onChange: () => void = () => {},
  ) {
    this.applyOverlay();
  }

  private applyOverlay() {
    for (const d of [...this.overlay.dirs].sort((a, b) => a.length - b.length)) {
      const parent = this.tryLookup(dirname(d));
      if (parent?.type === 'dir' && !parent.children.has(basename(d))) {
        parent.children.set(basename(d), userDir(basename(d)));
      }
    }
    for (const [path, content] of Object.entries(this.overlay.files)) {
      const parent = this.tryLookup(dirname(path));
      if (parent?.type !== 'dir') continue;
      const existing = parent.children.get(basename(path));
      if (existing?.type === 'file') {
        existing.content = content;
        existing.mtime = nowStamp();
      } else if (!existing) {
        parent.children.set(basename(path), userFile(basename(path), content));
      }
    }
    for (const r of this.overlay.removed) {
      const parent = this.tryLookup(dirname(r));
      if (parent?.type === 'dir') parent.children.delete(basename(r));
    }
  }

  private visible(n: FsNode): boolean {
    return !n.exists || n.exists();
  }

  /** Throws FsFail. Checks exec permission on traversed directories. */
  lookup(abs: string): FsNode {
    let node: FsNode = this.root;
    let at = '';
    for (const part of abs.split('/').filter(Boolean)) {
      if (node.type !== 'dir') throw new FsFail('ENOTDIR', at || '/');
      if (!node.exec) throw new FsFail('EACCES', at || '/', node.denyReason);
      const next = node.children.get(part);
      at += '/' + part;
      if (!next || !this.visible(next)) throw new FsFail('ENOENT', at);
      node = next;
    }
    return node;
  }

  tryLookup(abs: string): FsNode | null {
    try {
      return this.lookup(abs);
    } catch {
      return null;
    }
  }

  list(abs: string): FsNode[] {
    const n = this.lookup(abs);
    if (n.type !== 'dir') throw new FsFail('ENOTDIR', abs);
    if (!n.read) throw new FsFail('EACCES', abs, n.denyReason);
    return [...n.children.values()].filter((c) => this.visible(c)).sort((a, b) => a.name.localeCompare(b.name));
  }

  read(abs: string): string {
    const n = this.lookup(abs);
    if (n.type === 'dir') throw new FsFail('EISDIR', abs);
    if (!n.read) throw new FsFail('EACCES', abs, n.denyReason);
    return typeof n.content === 'function' ? n.content() : n.content;
  }

  write(abs: string, content: string, append = false): void {
    const existing = this.tryLookup(abs);
    if (existing) {
      if (existing.type === 'dir') throw new FsFail('EISDIR', abs);
      if (!existing.write) throw new FsFail('EACCES', abs, existing.denyReason);
      const prev = typeof existing.content === 'function' ? existing.content() : existing.content;
      existing.content = append ? prev + content : content;
      existing.mtime = nowStamp();
      this.overlay.files[abs] = existing.content;
    } else {
      const parent = this.lookup(dirname(abs));
      if (parent.type !== 'dir') throw new FsFail('ENOTDIR', dirname(abs));
      if (!parent.write) throw new FsFail('EACCES', abs, parent.denyReason);
      parent.children.set(basename(abs), userFile(basename(abs), content));
      this.overlay.files[abs] = content;
      this.overlay.removed = this.overlay.removed.filter((r) => r !== abs);
    }
    this.onChange();
  }

  mkdir(abs: string): void {
    if (this.tryLookup(abs)) throw new FsFail('EEXIST', abs);
    const parent = this.lookup(dirname(abs));
    if (parent.type !== 'dir') throw new FsFail('ENOTDIR', dirname(abs));
    if (!parent.write) throw new FsFail('EACCES', abs, parent.denyReason);
    parent.children.set(basename(abs), userDir(basename(abs)));
    this.overlay.dirs.push(abs);
    this.overlay.removed = this.overlay.removed.filter((r) => r !== abs);
    this.onChange();
  }

  /** Only the player's own files/dirs (owner 'agent', parent writable) can be removed. */
  remove(abs: string, recursive = false): void {
    const n = this.lookup(abs);
    const parent = this.lookup(dirname(abs)) as DirNode;
    if (n.type === 'dir' && !recursive) throw new FsFail('EISDIR', abs);
    if (!parent.write || n.owner !== 'agent' || n.denyReason === 'protected') {
      throw new FsFail('EPERM', abs, n.denyReason);
    }
    if (n.type === 'dir' && recursive) {
      for (const c of [...n.children.values()]) this.remove(`${abs}/${c.name}`, true);
    }
    parent.children.delete(n.name);
    delete this.overlay.files[abs];
    this.overlay.dirs = this.overlay.dirs.filter((d) => d !== abs);
    if (!this.overlay.removed.includes(abs)) this.overlay.removed.push(abs);
    this.onChange();
  }
}

function userFile(name: string, content: string): FileNode {
  return file(name, content, { owner: 'agent', mode: 'rw-r--r--', write: true, mtime: nowStamp() });
}

function userDir(name: string): DirNode {
  return dir(name, [], { owner: 'agent', write: true, mtime: nowStamp() });
}

export function nowStamp(d = new Date()): string {
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const day = String(d.getDate()).padStart(2, ' ');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mon} ${day} ${hh}:${mm}`;
}

export function sizeOf(n: FsNode): number {
  if (n.type === 'dir') return 4096;
  if (n.size !== undefined) return n.size;
  const c = typeof n.content === 'function' ? n.content() : n.content;
  return new TextEncoder().encode(c).length;
}

export function fsMessage(e: unknown): string {
  if (e instanceof FsFail) {
    const reason = e.reason === 'protected' ? 'protected by eval harness' : e.reason;
    switch (e.code) {
      case 'ENOENT':
        return 'No such file or directory';
      case 'ENOTDIR':
        return 'Not a directory';
      case 'EISDIR':
        return 'Is a directory';
      case 'EEXIST':
        return 'File exists';
      case 'EACCES':
        return reason ? `Permission denied (${reason})` : 'Permission denied';
      case 'EPERM':
        return reason ? `Operation not permitted (${reason})` : 'Operation not permitted';
    }
  }
  return String(e);
}

