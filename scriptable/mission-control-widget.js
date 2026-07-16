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

if (typeof module !== 'undefined' && module.exports !== undefined) {
  module.exports = {
    CONFIG, provColor, normalize, padCountry, padShort,
    isTBD, fmtDate, fmtTminus, fmtTminusFine, deepLink, pickLaunch,
  };
}
