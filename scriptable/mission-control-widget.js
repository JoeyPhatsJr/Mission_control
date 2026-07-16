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

if (typeof module !== 'undefined' && module.exports !== undefined) {
  module.exports = {
    CONFIG, provColor, normalize, padCountry, padShort,
    isTBD, fmtDate, fmtTminus, fmtTminusFine, deepLink, pickLaunch,
    loadLaunches, readCache, writeCache, cachePath,
    UI, goColor, countdownRow, staleStamp, buildMessage, ringImage, barImage,
    buildLockRect, buildLockCircle, buildLockInline,
  };
}
