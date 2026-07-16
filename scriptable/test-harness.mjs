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

test('normalize maps LL2 fields and drops null-net entries', () => {
  const { exports: W } = loadWidget();
  const l = W.normalize(FIXTURE.results[0]);
  assert.equal(l.id, 'll2-f3c47a1e-1111-4a5b-9c3d-aaaaaaaaaaaa');
  assert.equal(l.name, 'Starlink Group 12-31');           // mission.name preferred
  assert.equal(l.provider, 'SpaceX');
  assert.equal(l.vehicle, 'Falcon 9 Block 5');            // full_name preferred
  assert.equal(l.padName, 'Space Launch Complex 40');
  assert.equal(l.net, Date.parse('2026-07-16T02:30:00Z'));
  assert.equal(l.probability, 95);
  assert.equal(W.normalize(FIXTURE.results[5]), null);    // net: null → dropped
  assert.equal(W.normalize(FIXTURE.results[1]).probability, null); // -1 → null
  // pipe-split fallback when mission.name absent
  const noMission = { ...FIXTURE.results[0], mission: null };
  assert.equal(W.normalize(noMission).name, 'Starlink Group 12-31');
});

test('padCountry handles all three LL2 field shapes', () => {
  const { exports: W } = loadWidget();
  assert.equal(W.padCountry(FIXTURE.results[0]), 'USA');  // 2.3.0 pad.country.alpha_3_code
  assert.equal(W.padCountry(FIXTURE.results[1]), 'USA');  // 2.2.0 pad.location.country_code
  assert.equal(W.padCountry(FIXTURE.results[2]), 'USA');  // location-name suffix fallback
  assert.equal(W.padCountry(FIXTURE.results[3]), 'CHN');
  assert.equal(W.padCountry({}), '');
});

test('padShort abbreviates pad boilerplate', () => {
  const { exports: W } = loadWidget();
  assert.equal(W.padShort('Space Launch Complex 40'), 'SLC-40');
  assert.equal(W.padShort('Launch Complex 39A'), 'LC-39A');
  assert.equal(W.padShort('Rocket Lab Launch Complex 2'), 'Rocket Lab LC-2');
  assert.ok(W.padShort('An Extremely Long Pad Name That Never Ends').length <= 18);
  assert.equal(W.padShort(null), '');
});

test('formatters: fmtTminus / fmtTminusFine / fmtDate / isTBD / deepLink', () => {
  const { exports: W } = loadWidget();
  const H = 3600000, D = 86400000, M = 60000;
  assert.equal(W.fmtTminus(4 * H + 12 * M), 'T−4h');
  assert.equal(W.fmtTminus(3 * D), 'T−3d');
  assert.equal(W.fmtTminus(42 * M), 'T−42m');
  assert.equal(W.fmtTminus(-5 * M), 'T+5m');
  assert.equal(W.fmtTminusFine(4 * H + 12 * M), 'T−4h 12m');
  assert.equal(W.fmtTminusFine(2 * D + 5 * H), 'T−2d 5h');
  assert.match(W.fmtDate(NOW), /\d/);
  assert.equal(W.isTBD({ statusAbbrev: 'TBD' }), true);
  assert.equal(W.isTBD({ statusAbbrev: 'Go' }), false);
  assert.equal(W.deepLink({ id: 'll2-abc' }), 'https://joeyphatsjr.github.io/Mission_control/#launch=ll2-abc');
  assert.equal(W.deepLink(null), 'https://joeyphatsjr.github.io/Mission_control/');
});

test('pickLaunch filters to US pads, sorts, honors the T+30m grace window', () => {
  const { exports: W } = loadWidget();
  const mk = (id, net, country = 'USA') => ({ id, name: id, provider: 'SpaceX', vehicle: 'F9', padName: 'SLC-40', country, net, windowEnd: NaN, statusAbbrev: 'Go', probability: 90 });
  const H = 3600000, M = 60000;
  const launches = [
    mk('later', NOW + 5 * H),
    mk('foreign', NOW + 1 * H, 'CHN'),          // filtered out
    mk('in-grace', NOW - 10 * M),               // T+10m → still current
    mk('too-old', NOW - 45 * M),                // past grace → dropped
    null,                                        // defensive
    mk('q2', NOW + 8 * H), mk('q3', NOW + 9 * H), mk('q4', NOW + 10 * H),
  ];
  const { current, queue } = W.pickLaunch(launches, NOW);
  assert.equal(current.id, 'in-grace');
  assert.deepEqual(queue.map(l => l.id), ['later', 'q2', 'q3']);  // capped at QUEUE_LEN
  assert.equal(W.pickLaunch([mk('cn', NOW + H, 'CHN')], NOW).current, null);
  assert.equal(W.pickLaunch([], NOW).current, null);
});

test('loadLaunches: fresh cache short-circuits the network', async () => {
  const { exports: W } = loadWidget();
  const cached = { at: NOW - 5 * 60000, launches: [{ id: 'll2-x', name: 'Cached', provider: 'SpaceX', vehicle: 'F9', padName: 'SLC-40', country: 'USA', net: NOW + 3600000, windowEnd: NaN, statusAbbrev: 'Go', probability: 90 }] };
  vfs.set('/docs/' + W.CONFIG.CACHE_FILE, JSON.stringify(cached));
  setNextResponse(new Error('network must not be touched'));
  const r = await W.loadLaunches(NOW);
  assert.equal(r.launches[0].name, 'Cached');
  assert.equal(r.cachedAt, null);                    // fresh cache is silent
});

test('loadLaunches: stale cache → fetch, normalize, rewrite cache', async () => {
  const { exports: W } = loadWidget();
  vfs.set('/docs/' + W.CONFIG.CACHE_FILE, JSON.stringify({ at: NOW - 60 * 60000, launches: [] }));
  setNextResponse(FIXTURE);
  const r = await W.loadLaunches(NOW);
  assert.equal(r.launches.length, 5);                // 6 results − 1 null-net
  assert.equal(r.cachedAt, null);
  const rewritten = JSON.parse(vfs.get('/docs/' + W.CONFIG.CACHE_FILE));
  assert.equal(rewritten.at, NOW);
  assert.equal(rewritten.launches.length, 5);
});

test('loadLaunches: fetch failure falls back to stale cache, stamped', async () => {
  const { exports: W } = loadWidget();
  const stale = { at: NOW - 90 * 60000, launches: [{ id: 'll2-y', name: 'Stale', provider: 'ULA', vehicle: 'Vulcan', padName: 'SLC-41', country: 'USA', net: NOW + 7200000, windowEnd: NaN, statusAbbrev: 'Go', probability: null }] };
  vfs.set('/docs/' + W.CONFIG.CACHE_FILE, JSON.stringify(stale));
  setNextResponse(new Error('offline'));
  const r = await W.loadLaunches(NOW);
  assert.equal(r.launches[0].name, 'Stale');
  assert.equal(r.cachedAt, stale.at);                // stamped as stale
});

test('loadLaunches: failure with no cache → signal lost; empty payload treated as failure', async () => {
  const { exports: W } = loadWidget();
  setNextResponse(new Error('offline'));
  assert.equal((await W.loadLaunches(NOW)).launches, null);
  setNextResponse({ results: [] });                  // empty payload = failure too
  assert.equal((await W.loadLaunches(NOW)).launches, null);
  vfs.set('/docs/' + W.CONFIG.CACHE_FILE, '{corrupt json');  // corrupt cache ignored
  setNextResponse(new Error('offline'));
  assert.equal((await W.loadLaunches(NOW)).launches, null);
});

function mkLaunch(over = {}) {
  return { id: 'll2-t1', name: 'Starlink Group 12-31', provider: 'SpaceX', vehicle: 'Falcon 9 Block 5', padName: 'Space Launch Complex 40', country: 'USA', net: NOW + 4 * 3600000, windowEnd: NaN, statusAbbrev: 'Go', probability: 95, ...over };
}

test('countdownRow: ticking native timer with T− prefix; T+ after net; ~ for TBD', () => {
  const { exports: W, ctx } = loadWidget();
  const w1 = new ctx.ListWidget();
  W.countdownRow(w1, mkLaunch(), 20, NOW);
  const dates1 = flatten(w1).filter(e => e.type === 'date');
  assert.equal(dates1.length, 1);
  assert.equal(dates1[0].style, 'timer');
  assert.equal(dates1[0].date.getTime(), NOW + 4 * 3600000);
  assert.ok(texts(w1).includes('T−'));
  const w2 = new ctx.ListWidget();
  W.countdownRow(w2, mkLaunch({ net: NOW - 5 * 60000 }), 20, NOW);
  assert.ok(texts(w2).includes('T+'));
  const w3 = new ctx.ListWidget();
  W.countdownRow(w3, mkLaunch({ statusAbbrev: 'TBD' }), 20, NOW);
  assert.equal(flatten(w3).filter(e => e.type === 'date').length, 0);
  assert.ok(texts(w3).some(t => t.startsWith('~ NET ')));
});

test('goColor thresholds', () => {
  const { exports: W } = loadWidget();
  assert.equal(W.goColor(95).hex, '#4ade80');
  assert.equal(W.goColor(80).hex, '#4ade80');
  assert.equal(W.goColor(60).hex, '#fbbf24');
  assert.equal(W.goColor(20).hex, '#f87171');
  assert.equal(W.goColor(null).hex, '#94a3b8');
});

test('buildLockRect: name line, timer, vehicle·pad line, cached marker', () => {
  const { exports: W, ctx } = loadWidget();
  const w = new ctx.ListWidget();
  W.buildLockRect(w, mkLaunch(), { now: NOW, cachedAt: null, queue: [] });
  const ts = texts(w);
  assert.ok(ts.some(t => t.includes('STARLINK GROUP 12-31')));
  assert.ok(ts.some(t => t.includes('Falcon 9 Block 5') && t.includes('SLC-40')));
  assert.equal(flatten(w).filter(e => e.type === 'date' && e.style === 'timer').length, 1);
  const w2 = new ctx.ListWidget();
  W.buildLockRect(w2, mkLaunch(), { now: NOW, cachedAt: NOW - 3600000, queue: [] });
  assert.ok(texts(w2).some(t => t.includes('cached')));
});

test('buildLockCircle: single drawn image containing the coarse readout', () => {
  const { exports: W, ctx } = loadWidget();
  const w = new ctx.ListWidget();
  W.buildLockCircle(w, mkLaunch(), { now: NOW, cachedAt: null, queue: [] });
  const imgs = flatten(w).filter(e => e.type === 'image');
  assert.equal(imgs.length, 1);
  assert.deepEqual(imgs[0].img.textCalls, ['T−4h']);   // drawn centered readout
  assert.equal(w.addAccessoryWidgetBackground, true);
});

test('buildLockInline: one line with name and fine T-minus', () => {
  const { exports: W, ctx } = loadWidget();
  const w = new ctx.ListWidget();
  W.buildLockInline(w, mkLaunch(), { now: NOW, cachedAt: null, queue: [] });
  const ts = texts(w);
  assert.equal(ts.length, 1);
  assert.ok(ts[0].includes('Starlink Group 12-31'));
  assert.ok(ts[0].includes('T−4h 0m'));
});

test('buildMessage renders title + subtitle', () => {
  const { exports: W, ctx } = loadWidget();
  const w = new ctx.ListWidget();
  W.buildMessage(w, 'SIGNAL LOST', 'open app to sync');
  assert.deepEqual(texts(w), ['SIGNAL LOST', 'open app to sync']);
});

test('buildHomeSmall: header + US tag + name + timer + vehicle', () => {
  const { exports: W, ctx } = loadWidget();
  const w = new ctx.ListWidget();
  W.buildHomeSmall(w, mkLaunch(), { now: NOW, cachedAt: null, queue: [] });
  const ts = texts(w);
  assert.ok(ts.includes('NEXT LAUNCH'));
  assert.ok(ts.includes('US'));
  assert.ok(ts.includes('Starlink Group 12-31'));
  assert.ok(ts.includes('Falcon 9 Block 5'));
  assert.equal(flatten(w).filter(e => e.type === 'date' && e.style === 'timer').length, 1);
});

test('buildHomeMedium: accent bar image + go percentage + meta row', () => {
  const { exports: W, ctx } = loadWidget();
  const w = new ctx.ListWidget();
  W.buildHomeMedium(w, mkLaunch(), { now: NOW, cachedAt: null, queue: [] });
  assert.equal(flatten(w).filter(e => e.type === 'image').length, 1);   // provider bar
  const ts = texts(w);
  assert.ok(ts.includes('95% GO'));
  assert.ok(ts.some(t => t.includes('SLC-40') && t.includes('Falcon 9 Block 5')));
});

test('buildHomeLarge: medium content + UP NEXT queue rows', () => {
  const { exports: W, ctx } = loadWidget();
  const w = new ctx.ListWidget();
  const queue = [
    mkLaunch({ id: 'll2-q1', name: 'USSF-87', provider: 'United Launch Alliance', net: NOW + 2 * 86400000, statusAbbrev: 'TBD' }),
    mkLaunch({ id: 'll2-q2', name: 'Salt Of The Earth', provider: 'Rocket Lab', net: NOW + 4 * 86400000 }),
  ];
  W.buildHomeLarge(w, mkLaunch(), { now: NOW, cachedAt: null, queue });
  const ts = texts(w);
  assert.ok(ts.includes('UP NEXT'));
  assert.ok(ts.includes('USSF-87'));
  assert.ok(ts.includes('Salt Of The Earth'));
  assert.ok(ts.some(t => t.startsWith('~')));           // TBD queue row gets ~ date
  const wEmpty = new ctx.ListWidget();
  W.buildHomeLarge(wEmpty, mkLaunch(), { now: NOW, cachedAt: null, queue: [] });
  assert.ok(texts(wEmpty).some(t => t.toLowerCase().includes('no further')));
});

test('makeWidget: dispatch, deep-link url, refresh hints', async () => {
  const { exports: W } = loadWidget();
  setNextResponse(FIXTURE);
  const w = await W.makeWidget('medium', NOW);
  assert.equal(w.url, 'https://joeyphatsjr.github.io/Mission_control/#launch=ll2-f3c47a1e-1111-4a5b-9c3d-aaaaaaaaaaaa');
  assert.ok(texts(w).includes('Starlink Group 12-31'));
  assert.equal(w.refreshAfterDate.getTime(), NOW + 15 * 60000);   // T−14.5h → +15 min
  vfs.clear();
  const soon = JSON.parse(JSON.stringify(FIXTURE));
  soon.results[0].net = new Date(NOW + 30 * 60000).toISOString(); // inside T−1h
  setNextResponse(soon);
  const w2 = await W.makeWidget('accessoryRectangular', NOW);
  assert.equal(w2.refreshAfterDate.getTime(), NOW + 5 * 60000);   // tightened
  assert.equal(flatten(w2).filter(e => e.type === 'date' && e.style === 'timer').length, 1);
});

test('makeWidget: SIGNAL LOST and empty-filter states still link to the app', async () => {
  const { exports: W } = loadWidget();
  setNextResponse(new Error('offline'));
  const w = await W.makeWidget('small', NOW);
  assert.ok(texts(w).includes('SIGNAL LOST'));
  assert.equal(w.url, W.CONFIG.APP_URL);
  vfs.clear();
  const foreignOnly = { results: [FIXTURE.results[3], FIXTURE.results[4]] };
  setNextResponse(foreignOnly);
  const w2 = await W.makeWidget('medium', NOW);
  assert.ok(texts(w2).includes('NO USA LAUNCHES'));
});

test('makeWidget: every family renders the current mission', async () => {
  const { exports: W } = loadWidget();
  for (const fam of ['accessoryRectangular', 'accessoryCircular', 'accessoryInline', 'small', 'medium', 'large']) {
    vfs.clear(); setNextResponse(FIXTURE);
    const w = await W.makeWidget(fam, NOW);
    const all = texts(w).join(' ').toUpperCase();   // buildLockRect uppercases the name
    const drawn = flatten(w).filter(e => e.type === 'image');
    assert.ok(all.includes('STARLINK') || drawn.length > 0, fam + ' rendered nothing');
  }
});

export { FIXTURE };
await run();
