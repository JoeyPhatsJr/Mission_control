# Scriptable Mission Control Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone Scriptable script (`scriptable/mission-control-widget.js`) that renders the next US launch with a live-ticking countdown in all six iOS widget families, deep-linking into the hosted Mission Control PWA.

**Architecture:** One Scriptable script (CONFIG → data layer → picker → six layout builders → main dispatch + in-app preview menu), tested on macOS via a Node `vm` harness that stubs Scriptable's globals and asserts on the widget element tree. Spec: `docs/superpowers/specs/2026-07-15-scriptable-widget-design.md`.

**Tech Stack:** Scriptable (iOS JavaScriptCore, ES6), Node ≥ 18 (`node:vm`, `node:assert`) for the dev-only harness. Zero npm dependencies.

## Global Constraints

- Widget file must parse as plain CommonJS ES6: **no top-level `await`**, no `import`/`export`, no TypeScript syntax (`node --check` must pass).
- Scriptable globals (`Request`, `ListWidget`, `FileManager`, `DrawContext`, `Color`, `Font`, `Script`, `Alert`, `config`, `Size`, `Point`, `Rect`, `Path`) are used as bare globals — never `require`d.
- End of widget file MUST keep the exports guard exactly: `if (typeof module !== 'undefined' && module.exports !== undefined) { module.exports = {...} }` (Scriptable defines `module`; the guard keeps `node --check` and vm both happy).
- All API field access is defensive (`?.`, fallbacks). A launch with no parseable `net` is dropped, never rendered.
- Deep-link format is exactly `https://joeyphatsjr.github.io/Mission_control/#launch=ll2-<uuid>` (the app prefixes LL2 ids with `ll2-`, see `index.html:2346`).
- LL2 endpoint is exactly `https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=15&hide_recent_previous=true` — no `mode=detailed`.
- Functions that depend on the current time take `now` (epoch ms) as a parameter — never call `Date.now()` inside a testable function (only `main()` may).
- Test command is always `node scriptable/test-harness.mjs`; it must exit 0 with `ALL <n> PASSED` before any commit.
- Commit after every task. Do not modify `index.html`.

---

### Task 1: Harness skeleton + widget skeleton (CONFIG, provColor, exports)

**Files:**
- Create: `scriptable/fixtures/ll2-upcoming.json`
- Create: `scriptable/test-harness.mjs`
- Create: `scriptable/mission-control-widget.js`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - Harness: `loadWidget(overrides = {})` → runs the widget file in a `vm` context, returns `{ exports, ctx }`; `test(name, asyncFn)` registers a test; `run()` at file bottom executes all tests; host-scope hooks `setNextResponse(value)` (object = JSON reply, `Error` instance = network failure, function = called with url) and `vfs` (a `Map` backing the `FileManager` stub, `vfs.clear()` between tests); `flatten(node)` → flat array of all element nodes in a widget tree; `NOW = Date.parse('2026-07-15T12:00:00Z')`.
  - Widget: `CONFIG` object (`APP_URL`, `COUNTRY`, `CACHE_TTL_MIN`, `CACHE_FILE`, `API`, `GRACE_MIN`, `QUEUE_LEN`); `provColor(name) → '#rrggbb' string`.

- [ ] **Step 1: Create the LL2 fixture**

Write `scriptable/fixtures/ll2-upcoming.json`. Six results: three US launches each exercising a different pad-country field shape (2.3.0 `pad.country.alpha_3_code`, 2.2.0 `pad.location.country_code`, location-name suffix fallback), two non-US, one malformed (null `net`). All NETs are fixed dates just after the harness's frozen `NOW` (2026-07-15T12:00Z).

```json
{
  "count": 6,
  "results": [
    {
      "id": "f3c47a1e-1111-4a5b-9c3d-aaaaaaaaaaaa",
      "name": "Falcon 9 Block 5 | Starlink Group 12-31",
      "net": "2026-07-16T02:30:00Z",
      "window_start": "2026-07-16T02:30:00Z",
      "window_end": "2026-07-16T06:30:00Z",
      "probability": 95,
      "status": { "abbrev": "Go" },
      "mission": { "name": "Starlink Group 12-31" },
      "launch_service_provider": { "name": "SpaceX" },
      "rocket": { "configuration": { "name": "Falcon 9", "full_name": "Falcon 9 Block 5" } },
      "pad": {
        "name": "Space Launch Complex 40",
        "country": { "alpha_3_code": "USA" },
        "location": { "name": "Cape Canaveral SFS, FL, USA" }
      }
    },
    {
      "id": "b2d58c2f-2222-4b6c-8d4e-bbbbbbbbbbbb",
      "name": "Vulcan VC4S | USSF-87",
      "net": "2026-07-18T14:00:00Z",
      "window_start": "2026-07-18T14:00:00Z",
      "window_end": "2026-07-18T18:00:00Z",
      "probability": -1,
      "status": { "abbrev": "TBD" },
      "mission": { "name": "USSF-87" },
      "launch_service_provider": { "name": "United Launch Alliance" },
      "rocket": { "configuration": { "name": "Vulcan", "full_name": "Vulcan VC4S" } },
      "pad": {
        "name": "Space Launch Complex 41",
        "location": { "name": "Cape Canaveral SFS, FL, USA", "country_code": "USA" }
      }
    },
    {
      "id": "c9e61d3a-3333-4c7d-9e5f-cccccccccccc",
      "name": "Electron | Salt Of The Earth",
      "net": "2026-07-20T09:10:00Z",
      "window_start": "2026-07-20T09:10:00Z",
      "window_end": "2026-07-20T11:10:00Z",
      "probability": 45,
      "status": { "abbrev": "Go" },
      "mission": { "name": "Salt Of The Earth" },
      "launch_service_provider": { "name": "Rocket Lab" },
      "rocket": { "configuration": { "name": "Electron", "full_name": "Electron" } },
      "pad": {
        "name": "Rocket Lab Launch Complex 2",
        "location": { "name": "Wallops Island, Virginia, USA" }
      }
    },
    {
      "id": "d1f72e4b-4444-4d8e-af60-dddddddddddd",
      "name": "Long March 5B | Tianwen-4",
      "net": "2026-07-17T04:00:00Z",
      "probability": -1,
      "status": { "abbrev": "Go" },
      "mission": { "name": "Tianwen-4" },
      "launch_service_provider": { "name": "China Aerospace Science and Technology Corporation" },
      "rocket": { "configuration": { "name": "Long March 5B", "full_name": "Long March 5B" } },
      "pad": {
        "name": "Wenchang Space Launch Site LC-101",
        "country": { "alpha_3_code": "CHN" },
        "location": { "name": "Wenchang, Hainan, China" }
      }
    },
    {
      "id": "e4a83f5c-5555-4e9f-b071-eeeeeeeeeeee",
      "name": "Soyuz 2.1a | Soyuz MS-29",
      "net": "2026-07-19T11:45:00Z",
      "probability": 90,
      "status": { "abbrev": "Go" },
      "mission": { "name": "Soyuz MS-29" },
      "launch_service_provider": { "name": "Roscosmos" },
      "rocket": { "configuration": { "name": "Soyuz 2.1a", "full_name": "Soyuz 2.1a" } },
      "pad": {
        "name": "Site 31/6",
        "country": { "alpha_3_code": "KAZ" },
        "location": { "name": "Baikonur Cosmodrome, Kazakhstan" }
      }
    },
    {
      "id": "f5b94a6d-6666-4faf-c182-ffffffffffff",
      "name": "Broken | No NET",
      "net": null,
      "status": { "abbrev": "TBD" },
      "launch_service_provider": { "name": "SpaceX" },
      "pad": { "name": "LC-39A", "country": { "alpha_3_code": "USA" }, "location": { "name": "Kennedy Space Center, FL, USA" } }
    }
  ]
}
```

- [ ] **Step 2: Write the harness with stubs, loader, runner, and the first (failing) tests**

Write `scriptable/test-harness.mjs` exactly:

```js
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
```

- [ ] **Step 3: Run harness to verify it fails**

Run: `node scriptable/test-harness.mjs`
Expected: crash or `3 FAILED of 3` (widget file doesn't exist yet — `ENOENT` is the expected failure mode; that counts as red).

- [ ] **Step 4: Write the widget skeleton**

Write `scriptable/mission-control-widget.js`:

```js
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: rocket;

/* MISSION CONTROL — iPhone widget (console build MC-2 · Pass 4)
   Companion to https://joeyphatsjr.github.io/Mission_control/
   Fetches the next US launch from Launch Library 2 and renders a
   glanceable live-ticking countdown in all six widget families.
   Install: paste into a new Scriptable script named "Mission Control". */

const CONFIG = {
  APP_URL: 'https://joeyphatsjr.github.io/Mission_control/',
  COUNTRY: 'USA',        // ISO alpha-3 pad-country filter; null = worldwide
  CACHE_TTL_MIN: 10,     // fresher than this → skip the network entirely
  CACHE_FILE: 'mc2-widget-cache.json',
  API: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=15&hide_recent_previous=true',
  GRACE_MIN: 30,         // keep the current mission on screen through T+30m
  QUEUE_LEN: 3,          // up-next rows on the large widget
};

/* Provider accents — subset of the app's PROVIDERS palette (index.html §1) */
const PROVIDER_COLORS = {
  'SpaceX': '#38bdf8', 'Rocket Lab': '#f472b6',
  'ULA': '#a78bfa', 'United Launch Alliance': '#a78bfa',
  'Blue Origin': '#2dd4bf', 'Firefly': '#a3e635',
  'NASA': '#60a5fa', 'Arianespace': '#fbbf24',
};
const PROV_FALLBACK = ['#38bdf8', '#f472b6', '#a78bfa', '#2dd4bf', '#fbbf24', '#fb923c', '#a3e635', '#e879f9'];
function provColor(name) {
  if (!name) return '#94a3b8';
  for (const key in PROVIDER_COLORS) {
    if (name === key || name.includes(key)) return PROVIDER_COLORS[key];
  }
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROV_FALLBACK[h % PROV_FALLBACK.length];
}

if (typeof module !== 'undefined' && module.exports !== undefined) {
  module.exports = { CONFIG, provColor };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --check scriptable/mission-control-widget.js && node scriptable/test-harness.mjs`
Expected: `ALL 3 PASSED`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add scriptable/
git commit -m "feat(widget): scriptable skeleton — CONFIG, provider palette, Node vm test harness"
```

---

### Task 2: Pure helpers — normalize, padCountry, padShort, formatters

**Files:**
- Modify: `scriptable/mission-control-widget.js` (insert below `provColor`, above the exports guard)
- Modify: `scriptable/test-harness.mjs` (insert tests above `await run()`; keep `export { FIXTURE }` adjacent)

**Interfaces:**
- Consumes: `CONFIG` from Task 1.
- Produces:
  - `normalize(raw) → { id, name, provider, vehicle, padName, country, net, windowEnd, statusAbbrev, probability } | null` (null when `net` unparseable; `net`/`windowEnd` epoch ms, `windowEnd` may be `NaN`; `probability` 0–100 or `null`)
  - `padCountry(raw) → string` (best-effort ISO alpha-3, `''` unknown)
  - `padShort(name) → string` (≤ 18 chars)
  - `isTBD(l) → boolean`
  - `fmtDate(ms) → 'Jul 16'`-style string
  - `fmtTminus(msTo) → 'T−4h'` coarse; `fmtTminusFine(msTo) → 'T−4h 12m'`
  - `deepLink(l) → string`

- [ ] **Step 1: Add failing tests to the harness** (above `await run()`)

```js
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
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node scriptable/test-harness.mjs`
Expected: `4 FAILED of 7` (each new test throws `W.normalize is not a function` or similar).

- [ ] **Step 3: Implement the helpers** (insert into the widget file below `provColor`)

```js
/* ── LL2 normalization (mirrors the app's normalizeLL2 subset) ───── */
function padCountry(raw) {
  const p = raw && raw.pad;
  const code = p?.country?.alpha_3_code || p?.location?.country?.alpha_3_code || p?.location?.country_code;
  if (code) return String(code);
  const tail = String(p?.location?.name || '').split(',').pop().trim();
  if (/united states|usa/i.test(tail)) return 'USA';
  return tail.length === 3 ? tail.toUpperCase() : '';
}
function normalize(raw) {
  const net = raw?.net ? Date.parse(raw.net) : NaN;
  if (!Number.isFinite(net)) return null;
  const cfg = raw.rocket?.configuration || {};
  const rawName = String(raw.name || 'Unnamed Mission');
  const name = String(raw.mission?.name || '') ||
    (rawName.includes('|') ? rawName.split('|').pop().trim() : rawName);
  const prob = Number.isFinite(raw.probability) && raw.probability >= 0 ? raw.probability : null;
  return {
    id: 'll2-' + String(raw.id),
    name,
    provider: String(raw.launch_service_provider?.name || 'Unknown'),
    vehicle: String(cfg.full_name || cfg.name || 'TBD'),
    padName: String(raw.pad?.name || 'TBD'),
    country: padCountry(raw),
    net,
    windowEnd: raw.window_end ? Date.parse(raw.window_end) : NaN,
    statusAbbrev: String(raw.status?.abbrev || ''),
    probability: prob,
  };
}

/* ── Small formatters ────────────────────────────────────────────── */
function padShort(name) {
  let s = String(name || '').split(',')[0]
    .replace(/Space Launch Complex[\s-]*/i, 'SLC-')
    .replace(/Launch Complex[\s-]*/i, 'LC-')
    .replace(/Launch Area[\s-]*/i, 'LA-')
    .replace(/Landing Zone[\s-]*/i, 'LZ-')
    .trim();
  return s.length > 18 ? s.slice(0, 17).trim() + '…' : s;
}
function isTBD(l) { return /TBD|TBC/i.test(l?.statusAbbrev || ''); }
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtTminus(msTo) {
  const sign = msTo >= 0 ? '−' : '+';
  const a = Math.abs(msTo);
  const d = Math.floor(a / 86400000), h = Math.floor(a / 3600000), m = Math.floor(a / 60000);
  return 'T' + sign + (d >= 1 ? d + 'd' : h >= 1 ? h + 'h' : m + 'm');
}
function fmtTminusFine(msTo) {
  const sign = msTo >= 0 ? '−' : '+';
  const a = Math.abs(msTo);
  const d = Math.floor(a / 86400000);
  const h = Math.floor((a % 86400000) / 3600000);
  const m = Math.floor((a % 3600000) / 60000);
  return 'T' + sign + (d >= 1 ? d + 'd ' + h + 'h' : h >= 1 ? h + 'h ' + m + 'm' : m + 'm');
}
function deepLink(l) { return l ? CONFIG.APP_URL + '#launch=' + l.id : CONFIG.APP_URL; }
```

Extend the exports guard to:

```js
if (typeof module !== 'undefined' && module.exports !== undefined) {
  module.exports = {
    CONFIG, provColor, normalize, padCountry, padShort,
    isTBD, fmtDate, fmtTminus, fmtTminusFine, deepLink,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --check scriptable/mission-control-widget.js && node scriptable/test-harness.mjs`
Expected: `ALL 7 PASSED`.

- [ ] **Step 5: Commit**

```bash
git add scriptable/
git commit -m "feat(widget): LL2 normalization, pad-country detection, pad/T-minus formatters"
```

---

### Task 3: Launch picker

**Files:**
- Modify: `scriptable/mission-control-widget.js` (below `deepLink`)
- Modify: `scriptable/test-harness.mjs` (above `await run()`)

**Interfaces:**
- Consumes: `CONFIG` (COUNTRY, GRACE_MIN, QUEUE_LEN), normalized launch objects from Task 2.
- Produces: `pickLaunch(launches, now) → { current: launch|null, queue: launch[] }` — pool filtered to `CONFIG.COUNTRY` (when set) and `net > now − GRACE_MIN`, ascending by `net`; `current` = first, `queue` = next `QUEUE_LEN`.

- [ ] **Step 1: Add failing tests**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scriptable/test-harness.mjs`
Expected: `1 FAILED of 8` (`W.pickLaunch is not a function`).

- [ ] **Step 3: Implement**

```js
/* ── Picker: next launch + up-next queue ─────────────────────────── */
function pickLaunch(launches, now) {
  const grace = CONFIG.GRACE_MIN * 60000;
  const pool = (launches || [])
    .filter(Boolean)
    .filter(l => (CONFIG.COUNTRY ? l.country === CONFIG.COUNTRY : true))
    .filter(l => l.net > now - grace)
    .sort((a, b) => a.net - b.net);
  return { current: pool[0] || null, queue: pool.slice(1, 1 + CONFIG.QUEUE_LEN) };
}
```

Add `pickLaunch` to the exports object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scriptable/test-harness.mjs`
Expected: `ALL 8 PASSED`.

- [ ] **Step 5: Commit**

```bash
git add scriptable/
git commit -m "feat(widget): launch picker with US filter, grace window, up-next queue"
```

---

### Task 4: Cache + fetch layer

**Files:**
- Modify: `scriptable/mission-control-widget.js` (below `pickLaunch`)
- Modify: `scriptable/test-harness.mjs` (above `await run()`)

**Interfaces:**
- Consumes: `CONFIG`, `normalize` (Task 2); Scriptable globals `FileManager`, `Request`.
- Produces: `loadLaunches(now) → Promise<{ launches: launch[]|null, cachedAt: number|null }>` — `launches: null` means signal lost (no net, no cache); `cachedAt` non-null only when serving a **stale** cache after a failed fetch. Also `readCache() → { at, launches }|null`, `writeCache(launches, now)`, `cachePath() → string`.

- [ ] **Step 1: Add failing tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node scriptable/test-harness.mjs`
Expected: `4 FAILED of 12`.

- [ ] **Step 3: Implement**

```js
/* ── Cache + fetch (LL2 unauth ≈ 15 req/h — cache-first protects it) ── */
function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CONFIG.CACHE_FILE);
}
function readCache() {
  try {
    const fm = FileManager.local();
    const p = cachePath();
    if (!fm.fileExists(p)) return null;
    const o = JSON.parse(fm.readString(p));
    if (!o || !Number.isFinite(o.at) || !Array.isArray(o.launches)) return null;
    return o;
  } catch (e) { return null; }
}
function writeCache(launches, now) {
  try { FileManager.local().writeString(cachePath(), JSON.stringify({ at: now, launches })); }
  catch (e) { /* cache write is best-effort */ }
}
async function loadLaunches(now) {
  const cached = readCache();
  if (cached && now - cached.at < CONFIG.CACHE_TTL_MIN * 60000) {
    return { launches: cached.launches, cachedAt: null };   // fresh: silent
  }
  try {
    const req = new Request(CONFIG.API);
    req.timeoutInterval = 12;
    const data = await req.loadJSON();
    const launches = ((data && data.results) || []).map(normalize).filter(Boolean);
    if (!launches.length) throw new Error('empty LL2 payload');
    writeCache(launches, now);
    return { launches, cachedAt: null };
  } catch (e) {
    if (cached) return { launches: cached.launches, cachedAt: cached.at };  // stale, stamped
    return { launches: null, cachedAt: null };               // signal lost
  }
}
```

Add `loadLaunches`, `readCache`, `writeCache`, `cachePath` to the exports object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scriptable/test-harness.mjs`
Expected: `ALL 12 PASSED`.

- [ ] **Step 5: Commit**

```bash
git add scriptable/
git commit -m "feat(widget): cache-first LL2 fetch with stale fallback and signal-lost state"
```

---

### Task 5: Shared UI helpers + Lock Screen builders

**Files:**
- Modify: `scriptable/mission-control-widget.js` (below `loadLaunches`)
- Modify: `scriptable/test-harness.mjs` (above `await run()`)

**Interfaces:**
- Consumes: everything above; Scriptable globals `Color`, `Font`, `DrawContext`, `Size`, `Point`, `Rect`, `Path`.
- Produces:
  - `UI` object: `{ bg, text, dim, accent }` (Color instances, `Color.dynamic` for bg/text/dim)
  - `goColor(probability|null) → Color`
  - `countdownRow(parent, l, size, now)` — `T−`/`T+` prefix + native ticking `addDate` timer; TBD launches get `~ NET <date>` text instead (no date element)
  - `ringImage(frac, msTo, px) → Image` — progress ring + centered coarse readout drawn in one DrawContext
  - `barImage(hex, wpx, hpx) → Image`
  - `staleStamp(parent, cachedAt)` — adds `cached HH:MM` text when `cachedAt` non-null
  - `buildMessage(w, title, sub)` — shared empty/error layout
  - `buildLockRect(w, l, meta)`, `buildLockCircle(w, l, meta)`, `buildLockInline(w, l, meta)` where `meta = { now, cachedAt, queue }`

- [ ] **Step 1: Add failing tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node scriptable/test-harness.mjs`
Expected: `6 FAILED of 18`.

- [ ] **Step 3: Implement** (insert below `loadLaunches`)

```js
/* ── Shared UI ───────────────────────────────────────────────────── */
const UI = {
  bg: Color.dynamic(new Color('#f4f6fb'), new Color('#0a0e14')),
  text: Color.dynamic(new Color('#111827'), new Color('#e5efff')),
  dim: Color.dynamic(new Color('#6b7280'), new Color('#8b98ad')),
  accent: new Color('#38bdf8'),
};
function goColor(p) {
  if (p == null) return new Color('#94a3b8');
  return new Color(p >= 80 ? '#4ade80' : p >= 50 ? '#fbbf24' : '#f87171');
}

/* The ONE live element iOS re-renders every second is a date element in
   timer style — everything else (text, drawings) is frozen between widget
   refreshes (~15–30 min). Countdown = native timer, always. */
function countdownRow(parent, l, size, now) {
  const row = parent.addStack();
  row.bottomAlignContent();
  if (isTBD(l)) {
    const t = row.addText('~ NET ' + fmtDate(l.net));
    t.font = Font.boldMonospacedSystemFont(Math.round(size * 0.8));
    t.textColor = UI.text; t.lineLimit = 1; t.minimumScaleFactor = 0.5;
    return row;
  }
  const pre = row.addText(now >= l.net ? 'T+' : 'T−');
  pre.font = Font.boldMonospacedSystemFont(Math.round(size * 0.62));
  pre.textColor = UI.text;
  row.addSpacer(3);
  const timer = row.addDate(new Date(l.net));
  timer.applyTimerStyle();
  timer.font = Font.boldMonospacedSystemFont(size);
  timer.textColor = UI.text; timer.lineLimit = 1; timer.minimumScaleFactor = 0.5;
  return row;
}
function staleStamp(parent, cachedAt) {
  if (!cachedAt) return;
  const d = new Date(cachedAt);
  const t = parent.addText('cached ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
  t.font = Font.systemFont(9); t.textColor = UI.dim;
}
function buildMessage(w, title, sub) {
  const t = w.addText(title);
  t.font = Font.semiboldSystemFont(13); t.textColor = UI.text; t.lineLimit = 1; t.minimumScaleFactor = 0.6;
  const s = w.addText(sub);
  s.font = Font.systemFont(11); s.textColor = UI.dim; s.lineLimit = 2;
}

/* ── Drawn accents (stale-tolerant decorations only) ─────────────── */
function ringImage(frac, msTo, px) {
  const ctx = new DrawContext();
  ctx.size = new Size(px, px); ctx.opaque = false; ctx.respectScreenScale = true;
  const lw = Math.max(4, px * 0.08), r = (px - lw) / 2, cx = px / 2, cy = px / 2;
  ctx.setLineWidth(lw);
  ctx.setStrokeColor(new Color('#ffffff', 0.3));
  ctx.strokeEllipse(new Rect(lw / 2, lw / 2, px - lw, px - lw));
  const f = Math.min(1, Math.max(0, frac));
  if (f > 0.01) {
    ctx.setStrokeColor(new Color('#ffffff'));
    const path = new Path();
    const steps = Math.max(2, Math.round(90 * f));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * f * (i / steps);
      const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (i === 0) path.move(pt); else path.addLine(pt);
    }
    ctx.addPath(path);
    ctx.strokePath();
  }
  ctx.setTextAlignedCenter();
  ctx.setTextColor(new Color('#ffffff'));
  ctx.setFont(Font.boldSystemFont(Math.round(px * 0.22)));
  ctx.drawTextInRect(fmtTminus(msTo), new Rect(0, cy - px * 0.13, px, px * 0.3));
  return ctx.getImage();
}
function barImage(hex, wpx, hpx) {
  const ctx = new DrawContext();
  ctx.size = new Size(wpx, hpx); ctx.opaque = false; ctx.respectScreenScale = true;
  ctx.setFillColor(new Color(hex));
  const p = new Path();
  p.addRoundedRect(new Rect(0, 0, wpx, hpx), wpx / 2, wpx / 2);
  ctx.addPath(p);
  ctx.fillPath();
  return ctx.getImage();
}

/* ── Lock Screen builders (system-tinted; no color decisions) ────── */
function buildLockRect(w, l, meta) {
  const t1 = w.addText('\u{1F680} ' + l.name.toUpperCase());
  t1.font = Font.semiboldSystemFont(12); t1.lineLimit = 1; t1.minimumScaleFactor = 0.7;
  countdownRow(w, l, 20, meta.now);
  const t3 = w.addText(l.vehicle + ' · ' + padShort(l.padName) + (meta.cachedAt ? ' · cached' : ''));
  t3.font = Font.systemFont(10); t3.lineLimit = 1; t3.minimumScaleFactor = 0.7;
}
function buildLockCircle(w, l, meta) {
  w.addAccessoryWidgetBackground = true;
  const msTo = l.net - meta.now;
  const frac = 1 - msTo / 86400000;          // ring fills over the final 24 h
  const img = w.addImage(ringImage(frac, msTo, 76));
  img.centerAlignImage();
}
function buildLockInline(w, l, meta) {
  const t = w.addText('\u{1F680} ' + l.name + ' · ' +
    (isTBD(l) ? '~ ' + fmtDate(l.net) : fmtTminusFine(l.net - meta.now)));
  t.lineLimit = 1;
}
```

Add to the exports object: `UI, goColor, countdownRow, staleStamp, buildMessage, ringImage, barImage, buildLockRect, buildLockCircle, buildLockInline`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --check scriptable/mission-control-widget.js && node scriptable/test-harness.mjs`
Expected: `ALL 18 PASSED`.

- [ ] **Step 5: Commit**

```bash
git add scriptable/
git commit -m "feat(widget): shared UI helpers, drawn accents, Lock Screen builders"
```

---

### Task 6: Home Screen builders + makeWidget dispatch

**Files:**
- Modify: `scriptable/mission-control-widget.js` (below the lock builders)
- Modify: `scriptable/test-harness.mjs` (above `await run()`)

**Interfaces:**
- Consumes: all prior tasks (`loadLaunches`, `pickLaunch`, builders, `deepLink`, `UI`).
- Produces:
  - `headerRow(parent, withGo, l)` — `NEXT LAUNCH` caps header, `US` tag when `CONFIG.COUNTRY`, optional go-probability dot + `<p>% GO`
  - `mediumContent(col, l, meta)` — header/name/countdown/meta-row/stale column shared by medium & large
  - `buildHomeSmall(w, l, meta)`, `buildHomeMedium(w, l, meta)`, `buildHomeLarge(w, l, meta)`
  - `makeWidget(family, now) → Promise<ListWidget>` — family ∈ `accessoryRectangular | accessoryCircular | accessoryInline | small | medium | large` (unknown → medium); loads data, sets `w.url`, dispatches, sets `w.refreshAfterDate` (+5 min inside T−1h, else +15 min); renders `SIGNAL LOST` / `NO <COUNTRY> LAUNCHES` states

- [ ] **Step 1: Add failing tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node scriptable/test-harness.mjs`
Expected: `6 FAILED of 24`.

- [ ] **Step 3: Implement**

```js
/* ── Home Screen builders ────────────────────────────────────────── */
function headerRow(parent, withGo, l) {
  const h = parent.addStack();
  h.centerAlignContent();
  const t = h.addText('NEXT LAUNCH');
  t.font = Font.semiboldSystemFont(10); t.textColor = UI.dim;
  if (CONFIG.COUNTRY) {
    h.addSpacer(6);
    const tag = h.addText(CONFIG.COUNTRY === 'USA' ? 'US' : CONFIG.COUNTRY);
    tag.font = Font.semiboldSystemFont(9); tag.textColor = UI.accent;
  }
  h.addSpacer();
  if (withGo && l) {
    const dot = h.addText('●');
    dot.font = Font.systemFont(10); dot.textColor = goColor(l.probability);
    if (l.probability != null) {
      h.addSpacer(3);
      const p = h.addText(l.probability + '% GO');
      p.font = Font.semiboldSystemFont(10); p.textColor = UI.dim;
    }
  }
  return h;
}
function buildHomeSmall(w, l, meta) {
  w.setPadding(12, 12, 12, 12);
  headerRow(w, false, l);
  w.addSpacer(4);
  const name = w.addText(l.name);
  name.font = Font.boldSystemFont(15); name.textColor = UI.text; name.lineLimit = 2; name.minimumScaleFactor = 0.7;
  w.addSpacer();
  countdownRow(w, l, 22, meta.now);
  const v = w.addText(l.vehicle);
  v.font = Font.systemFont(11); v.textColor = UI.dim; v.lineLimit = 1;
  staleStamp(w, meta.cachedAt);
}
function mediumContent(col, l, meta) {
  headerRow(col, true, l);
  col.addSpacer(4);
  const name = col.addText(l.name);
  name.font = Font.boldSystemFont(17); name.textColor = UI.text; name.lineLimit = 1; name.minimumScaleFactor = 0.6;
  col.addSpacer(2);
  countdownRow(col, l, 26, meta.now);
  col.addSpacer(2);
  const m = col.addText(l.vehicle + ' · ' + padShort(l.padName) + ' · ' + fmtDate(l.net));
  m.font = Font.systemFont(11); m.textColor = UI.dim; m.lineLimit = 1; m.minimumScaleFactor = 0.7;
  staleStamp(col, meta.cachedAt);
}
function buildHomeMedium(w, l, meta) {
  w.setPadding(14, 14, 14, 14);
  const row = w.addStack();
  row.addImage(barImage(provColor(l.provider), 6, 110));
  row.addSpacer(12);
  const col = row.addStack();
  col.layoutVertically();
  mediumContent(col, l, meta);
}
function buildHomeLarge(w, l, meta) {
  w.setPadding(16, 16, 16, 16);
  const row = w.addStack();
  row.addImage(barImage(provColor(l.provider), 6, 130));
  row.addSpacer(12);
  const col = row.addStack();
  col.layoutVertically();
  mediumContent(col, l, meta);
  w.addSpacer(12);
  const uh = w.addText('UP NEXT');
  uh.font = Font.semiboldSystemFont(10); uh.textColor = UI.dim;
  w.addSpacer(4);
  for (const q of meta.queue) {
    const r = w.addStack();
    r.centerAlignContent();
    const dot = r.addText('●');
    dot.font = Font.systemFont(9); dot.textColor = new Color(provColor(q.provider));
    r.addSpacer(6);
    const n = r.addText(q.name);
    n.font = Font.mediumSystemFont(12); n.textColor = UI.text; n.lineLimit = 1;
    r.addSpacer();
    const d = r.addText((isTBD(q) ? '~ ' : '') + fmtDate(q.net));
    d.font = Font.systemFont(11); d.textColor = UI.dim;
    w.addSpacer(3);
  }
  if (!meta.queue.length) {
    const none = w.addText('No further ' + (CONFIG.COUNTRY || '') + ' launches tracked');
    none.font = Font.systemFont(11); none.textColor = UI.dim;
  }
  w.addSpacer();
}

/* ── Assembly ────────────────────────────────────────────────────── */
async function makeWidget(family, now) {
  const w = new ListWidget();
  const isLock = String(family || '').startsWith('accessory');
  if (!isLock) w.backgroundColor = UI.bg;
  w.url = CONFIG.APP_URL;
  const { launches, cachedAt } = await loadLaunches(now);
  if (!launches) {
    buildMessage(w, 'SIGNAL LOST', 'open app to sync');
    w.refreshAfterDate = new Date(now + 15 * 60000);
    return w;
  }
  const { current, queue } = pickLaunch(launches, now);
  if (!current) {
    buildMessage(w, 'NO ' + (CONFIG.COUNTRY || '') + ' LAUNCHES', 'on the board');
    w.refreshAfterDate = new Date(now + 15 * 60000);
    return w;
  }
  w.url = deepLink(current);
  const meta = { now, cachedAt, queue };
  switch (family) {
    case 'accessoryRectangular': buildLockRect(w, current, meta); break;
    case 'accessoryCircular': buildLockCircle(w, current, meta); break;
    case 'accessoryInline': buildLockInline(w, current, meta); break;
    case 'small': buildHomeSmall(w, current, meta); break;
    case 'large': buildHomeLarge(w, current, meta); break;
    default: buildHomeMedium(w, current, meta);
  }
  const msTo = current.net - now;
  const mins = msTo > 0 && msTo < 3600000 ? 5 : 15;   // tighten inside T−1h
  w.refreshAfterDate = new Date(now + mins * 60000);
  return w;
}
```

Add to the exports object: `headerRow, mediumContent, buildHomeSmall, buildHomeMedium, buildHomeLarge, makeWidget`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --check scriptable/mission-control-widget.js && node scriptable/test-harness.mjs`
Expected: `ALL 24 PASSED`.

- [ ] **Step 5: Commit**

```bash
git add scriptable/
git commit -m "feat(widget): home-screen builders, family dispatch, refresh hints, offline states"
```

---

### Task 7: main() entrypoint + in-app preview menu

**Files:**
- Modify: `scriptable/mission-control-widget.js` (below `makeWidget`, above the exports guard)
- Modify: `scriptable/test-harness.mjs` (above `await run()`)

**Interfaces:**
- Consumes: `makeWidget` (Task 6); Scriptable globals `config`, `Script`, `Alert`.
- Produces: `main(nowOverride?) → Promise<void>` — `const now = nowOverride ?? Date.now()` (injectable so harness tests stay deterministic forever); widget mode: `Script.setWidget(await makeWidget(config.widgetFamily, now))` + `Script.complete()`; app mode: an `Alert` sheet listing all six families, previewing the chosen one (guarded `presentAccessory*` calls — older Scriptable lacks them, falls back to `presentSmall`). Auto-runs at load ONLY when `config.runsInWidget || config.runsInApp` (harness sets both false).

- [ ] **Step 1: Add failing tests**

```js
test('main in widget mode builds for the reported family and sets the widget', async () => {
  const { exports: W, ctx } = loadWidget({
    config: { runsInWidget: true, runsInApp: false, widgetFamily: 'accessoryRectangular' },
  });
  // loadWidget auto-ran main() at parse time because runsInWidget=true —
  // stage the response BEFORE loading instead:
  assert.ok(W.main, 'main must be exported');
});

test('main (widget mode, invoked directly) sets exactly one widget', async () => {
  setNextResponse(FIXTURE);
  const { exports: W, ctx } = loadWidget();   // auto-run disabled (both flags false)
  ctx.config.runsInWidget = true;
  ctx.config.widgetFamily = 'medium';
  await W.main(NOW);   // inject the frozen clock — fixture NETs stay "future" forever
  assert.equal(ctx.__setWidgetCalls.length, 1);
  assert.ok(texts(ctx.__setWidgetCalls[0]).includes('Starlink Group 12-31'));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node scriptable/test-harness.mjs`
Expected: `2 FAILED of 26` (`main` missing).

- [ ] **Step 3: Implement**

```js
/* ── Entrypoint ──────────────────────────────────────────────────── */
async function main(nowOverride) {
  const now = nowOverride ?? Date.now();
  if (config.runsInWidget) {
    const w = await makeWidget(config.widgetFamily, now);
    Script.setWidget(w);
    Script.complete();
    return;
  }
  // Run manually in the Scriptable app → preview menu for every family
  const fams = ['accessoryRectangular', 'accessoryCircular', 'accessoryInline', 'small', 'medium', 'large'];
  while (true) {
    const alert = new Alert();
    alert.title = 'Mission Control widget';
    alert.message = 'Preview a family';
    for (const f of fams) alert.addAction(f);
    alert.addCancelAction('Done');
    const i = await alert.presentSheet();
    if (i < 0 || i >= fams.length) break;
    const fam = fams[i];
    const w = await makeWidget(fam, Date.now());
    if (fam === 'small') await w.presentSmall();
    else if (fam === 'large') await w.presentLarge();
    else if (fam === 'accessoryRectangular' && w.presentAccessoryRectangular) await w.presentAccessoryRectangular();
    else if (fam === 'accessoryCircular' && w.presentAccessoryCircular) await w.presentAccessoryCircular();
    else if (fam === 'accessoryInline' && w.presentAccessoryInline) await w.presentAccessoryInline();
    else if (fam.startsWith('accessory')) await w.presentSmall();   // older Scriptable
    else await w.presentMedium();
  }
  Script.complete();
}

if (typeof config !== 'undefined' && (config.runsInWidget || config.runsInApp)) {
  main();
}
```

Add `main` to the exports object. Final exports guard reads:

```js
if (typeof module !== 'undefined' && module.exports !== undefined) {
  module.exports = {
    CONFIG, provColor, normalize, padCountry, padShort,
    isTBD, fmtDate, fmtTminus, fmtTminusFine, deepLink,
    pickLaunch, loadLaunches, readCache, writeCache, cachePath,
    UI, goColor, countdownRow, staleStamp, buildMessage, ringImage, barImage,
    buildLockRect, buildLockCircle, buildLockInline,
    headerRow, mediumContent, buildHomeSmall, buildHomeMedium, buildHomeLarge,
    makeWidget, main,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --check scriptable/mission-control-widget.js && node scriptable/test-harness.mjs`
Expected: `ALL 26 PASSED`.

- [ ] **Step 5: Commit**

```bash
git add scriptable/
git commit -m "feat(widget): main entrypoint, widget-mode dispatch, in-app preview menu"
```

---

### Task 8: Docs — scriptable/README.md + CLAUDE.md update

**Files:**
- Create: `scriptable/README.md`
- Modify: `CLAUDE.md` (the `**Not built (planned)**` paragraph, currently line 13)

**Interfaces:**
- Consumes: the finished widget (Tasks 1–7).
- Produces: user-facing install docs; CLAUDE.md reflects reality.

- [ ] **Step 1: Write scriptable/README.md**

```markdown
# Mission Control — iPhone Widget

A Lock Screen / Home Screen widget for [Mission Control](https://joeyphatsjr.github.io/Mission_control/),
built for the free [Scriptable](https://scriptable.app) app. It shows the next launch
from a US pad with a **live-ticking countdown** and deep-links into the app's mission
dossier when tapped. No server, no account, no push infrastructure.

## Install

1. Install **Scriptable** from the App Store (free).
2. Open Scriptable → **+** → paste the entire contents of `mission-control-widget.js` → rename the script **Mission Control**.
3. Run it once inside Scriptable — a preview menu lets you eyeball every widget size.

### Add to the Lock Screen
Long-press the Lock Screen → **Customize** → Lock Screen → tap the widget strip →
add a **Scriptable** widget (rectangular, circular, or inline) → tap it → Script: **Mission Control**.

### Add to the Home Screen
Long-press the Home Screen → **+** → search **Scriptable** → pick small/medium/large →
add → long-press the new widget → **Edit Widget** → Script: **Mission Control** →
When Interacting: **Open URL** is NOT needed (the script sets its own tap URL).

## Configure

Open the script and edit `CONFIG` at the top:

- `COUNTRY: 'USA'` — pad-country filter. Set to `null` for worldwide launches.
- `APP_URL` — where taps land (your Mission Control deployment).

## Behavior notes

- The countdown digits tick every second (native iOS timer element) even though
  iOS only refreshes the rest of the widget every ~15–30 minutes.
- Launch data is cached for 10 minutes (LL2 allows ~15 requests/hour unauthenticated).
  If the network is down, the widget serves the last good data with a `cached HH:MM` stamp.
- `~ NET <date>` instead of a countdown means the launch date is still TBD.
- After liftoff the timer counts up (`T+`) and holds the mission for 30 minutes
  before advancing to the next one.

## Development

`node scriptable/test-harness.mjs` runs the offline test suite (Node ≥ 18, no deps) —
it stubs Scriptable's globals and asserts on the rendered widget tree.
`fixtures/ll2-upcoming.json` is the canned LL2 response it tests against.
```

- [ ] **Step 2: Update CLAUDE.md**

Replace the `**Not built (planned)**` paragraph with:

```markdown
**iPhone widget (`scriptable/`):** the Pass-4 **Scriptable Lock Screen widget** — `scriptable/mission-control-widget.js`, a standalone script for the free Scriptable app covering all six widget families (Lock Screen rectangular/circular/inline + Home Screen small/medium/large). Fetches LL2 `launches/upcoming` (cache-first via `FileManager.local()`, 10-min TTL, stale-fallback with a `cached HH:MM` stamp), filters to US pads (`CONFIG.COUNTRY`, `null` = worldwide), renders a **native ticking timer** (`addDate` + `applyTimerStyle` — the only element iOS updates between widget refreshes; drawn accents like the circular progress ring and provider bar are stale-tolerant decorations). Taps deep-link to `#launch=ll2-<uuid>`. It's the workaround for the iOS closed-app notification limit (no push server needed). Tested offline via `node scriptable/test-harness.mjs` (Node vm + Scriptable global stubs asserting on the widget element tree); install guide in `scriptable/README.md`.
```

- [ ] **Step 3: Full verification run**

Run: `node --check scriptable/mission-control-widget.js && node scriptable/test-harness.mjs`
Expected: `ALL 26 PASSED`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scriptable/README.md CLAUDE.md
git commit -m "docs: widget install guide; CLAUDE.md Pass-4 paragraph flips to built"
```

---

## Post-plan verification (session lead, not a subagent)

After all tasks: run the full harness once more, review the final file top-to-bottom for Scriptable-API misuse, then push to `main` (GitHub Pages redeploys; the widget file ships in the repo for easy copy-paste). On-device verification (ticking timer, tap-through, all six families) is the user's step — provide them the run-through checklist from the README.
