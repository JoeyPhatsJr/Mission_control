// Dev-only Node harness for scriptable/mission-control-widget.js.
// Stubs Scriptable's globals, runs the widget in a vm context, and asserts
// on the recorded widget element tree. Run: node scriptable/test-harness.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const NOW = Date.parse('2026-07-15T12:00:00Z');
const FIXTURE = JSON.parse(readFileSync(path.join(DIR, 'fixtures', 'll2-upcoming.json'), 'utf8'));

/* ── Scriptable global stubs ─────────────────────────────────────── */
class Color {
  constructor(hex, alpha) { this.hex = hex; this.alpha = alpha ?? 1; }
  static dynamic(light, dark) { return dark; }
  static white() { return new Color('#ffffff'); }
}
const Font = new Proxy({}, { get: (_t, name) => (...args) => ({ fontName: name, args }) });
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Rect { constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; } }
class Path { move() {} addLine() {} addRoundedRect() {} }
class DrawContext {
  constructor() { this.textCalls = []; }
  setStrokeColor() {} setLineWidth() {} strokeEllipse() {} addPath() {} strokePath() {}
  setFillColor() {} fillPath() {} setTextAlignedCenter() {} setFont() {} setTextColor() {}
  drawTextInRect(s) { this.textCalls.push(String(s)); }
  getImage() { return { stub: 'image', textCalls: this.textCalls }; }
}
class WStack {
  constructor(type = 'stack') { this.type = type; this.children = []; }
  addText(t) { const e = { type: 'text', text: String(t) }; this.children.push(e); return e; }
  addDate(d) {
    const e = { type: 'date', date: d };
    e.applyTimerStyle = () => { e.style = 'timer'; };
    e.applyRelativeStyle = () => { e.style = 'relative'; };
    this.children.push(e); return e;
  }
  addImage(img) { const e = { type: 'image', img, centerAlignImage() {} }; this.children.push(e); return e; }
  addStack() { const s = new WStack(); this.children.push(s); return s; }
  addSpacer(n) { this.children.push({ type: 'spacer', n }); }
  setPadding() {} centerAlignContent() {} bottomAlignContent() {} topAlignContent() {}
  layoutVertically() { this.vertical = true; } layoutHorizontally() { this.vertical = false; }
}
class ListWidget extends WStack {
  constructor() { super('widget'); }
  async presentSmall() {} async presentMedium() {} async presentLarge() {}
}
export const vfs = new Map();
const FileManager = {
  local: () => ({
    documentsDirectory: () => '/docs',
    joinPath: (a, b) => a + '/' + b,
    fileExists: p => vfs.has(p),
    readString: p => vfs.get(p),
    writeString: (p, s) => vfs.set(p, s),
  }),
};
let nextResponse = null;
export function setNextResponse(v) { nextResponse = v; }
class Request {
  constructor(url) { this.url = url; this.timeoutInterval = 0; }
  async loadJSON() {
    if (typeof nextResponse === 'function') return nextResponse(this.url);
    if (nextResponse instanceof Error) throw nextResponse;
    if (nextResponse == null) throw new Error('harness: no response staged');
    return nextResponse;
  }
}
class Alert {
  constructor() { this.actions = []; }
  addAction(t) { this.actions.push(t); }
  addCancelAction() {}
  async presentSheet() { return -1; }
}

/* ── Loader ──────────────────────────────────────────────────────── */
export function loadWidget(overrides = {}) {
  const code = readFileSync(path.join(DIR, 'mission-control-widget.js'), 'utf8');
  const module = { exports: {} };
  const setWidgetCalls = [];
  const ctx = vm.createContext({
    module, console, Date, JSON, Math, String, Number, Array, Object, RegExp,
    Color, Font, Size, Point, Rect, Path, DrawContext, ListWidget, FileManager, Request, Alert,
    config: { runsInWidget: false, runsInApp: false, widgetFamily: null },
    Script: { setWidget: w => setWidgetCalls.push(w), complete() {} },
    ...overrides,
  });
  ctx.__setWidgetCalls = setWidgetCalls;
  new vm.Script(code, { filename: 'mission-control-widget.js' }).runInContext(ctx);
  return { exports: module.exports, ctx };
}
export function flatten(node, out = []) {
  out.push(node);
  for (const c of node.children || []) flatten(c, out);
  return out;
}
export function texts(node) {
  return flatten(node).filter(e => e.type === 'text').map(e => e.text);
}

/* ── Runner ──────────────────────────────────────────────────────── */
const tests = [];
export function test(name, fn) { tests.push([name, fn]); }
async function run() {
  let failures = 0;
  for (const [name, fn] of tests) {
    vfs.clear(); setNextResponse(null);
    try { await fn(); console.log('  ✓ ' + name); }
    catch (e) { failures++; console.error('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); }
  }
  console.log(failures ? `\n${failures} FAILED of ${tests.length}` : `\nALL ${tests.length} PASSED`);
  process.exit(failures ? 1 : 0);
}

/* ═════════ TESTS ═════════ */

test('widget file loads and exports the API surface', () => {
  const { exports: W } = loadWidget();
  for (const k of ['CONFIG', 'provColor']) assert.equal(typeof W[k] === 'undefined', false, `missing export: ${k}`);
});

test('CONFIG carries the locked spec values', () => {
  const { exports: W } = loadWidget();
  assert.equal(W.CONFIG.APP_URL, 'https://joeyphatsjr.github.io/Mission_control/');
  assert.equal(W.CONFIG.COUNTRY, 'USA');
  assert.equal(W.CONFIG.API, 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=15&hide_recent_previous=true');
  assert.equal(W.CONFIG.CACHE_TTL_MIN, 10);
  assert.equal(W.CONFIG.GRACE_MIN, 30);
  assert.equal(W.CONFIG.QUEUE_LEN, 3);
});

test('provColor matches the app palette and hash-falls-back', () => {
  const { exports: W } = loadWidget();
  assert.equal(W.provColor('SpaceX'), '#38bdf8');
  assert.equal(W.provColor('United Launch Alliance'), '#a78bfa');
  assert.equal(W.provColor('Rocket Lab'), '#f472b6');
  const fb = W.provColor('Totally New Rocket Co');
  assert.match(fb, /^#[0-9a-f]{6}$/);
  assert.equal(W.provColor('Totally New Rocket Co'), fb); // stable hash
});

export { FIXTURE };
await run();
