// Vitest setup file: adds the subset of Obsidian's HTMLElement/global DOM helpers
// that plugins commonly use (createEl, createDiv, empty, setText, ...).

type ElInfo = { cls?: string | string[]; text?: string; attr?: Record<string, string> };

function applyInfo(el: HTMLElement, info?: ElInfo | string) {
  if (!info) return;
  if (typeof info === "string") info = { cls: info };
  if (info.cls) el.classList.add(...(Array.isArray(info.cls) ? info.cls : info.cls.split(" ")));
  if (info.text !== undefined) el.textContent = info.text;
  for (const [k, v] of Object.entries(info.attr ?? {})) el.setAttribute(k, v);
}

function createElement(tag: string, info?: ElInfo | string, parent?: HTMLElement) {
  const el = document.createElement(tag);
  applyInfo(el, info);
  parent?.appendChild(el);
  return el;
}

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
Object.assign(proto, {
  createEl(this: HTMLElement, tag: string, info?: ElInfo | string) {
    return createElement(tag, info, this);
  },
  createDiv(this: HTMLElement, info?: ElInfo | string) {
    return createElement("div", info, this);
  },
  createSpan(this: HTMLElement, info?: ElInfo | string) {
    return createElement("span", info, this);
  },
  empty(this: HTMLElement) {
    this.replaceChildren();
  },
  setText(this: HTMLElement, text: string) {
    this.textContent = text;
  },
  addClass(this: HTMLElement, ...cls: string[]) {
    this.classList.add(...cls);
  },
  removeClass(this: HTMLElement, ...cls: string[]) {
    this.classList.remove(...cls);
  },
  toggleClass(this: HTMLElement, cls: string, value: boolean) {
    this.classList.toggle(cls, value);
  },
});

Object.assign(globalThis, {
  createEl: (tag: string, info?: ElInfo | string) => createElement(tag, info),
  createDiv: (info?: ElInfo | string) => createElement("div", info),
  createSpan: (info?: ElInfo | string) => createElement("span", info),
});
