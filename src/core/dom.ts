// Minimal DOM builder.

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      e.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'class') {
      e.className = String(v);
    } else if (k === 'text') {
      e.textContent = String(v);
    } else {
      e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c);
  }
  return e;
}
