# MC-3 Improvement Round — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorm session)
**Scope:** Three independent sub-projects, built in order: (1) scrub/slip detection, (2) globe overhaul, (3) iOS push via Cloudflare Worker. Each gets its own implementation plan; this document is the umbrella spec.

## Background

The 4-pass MC-2 roadmap is complete (Mission Briefing, LIVE mode, PWA, Scriptable widget). Brainstorming identified three gaps: launch-day feed changes are invisible (holds/slips/scrubs), the Globe tab looks cheap / runs janky / lacks purpose, and closed-app notifications on iOS still don't work (no push server).

Hard constraints carried over from MC-2 (unchanged):

- `index.html` stays a single self-contained file, no build step, no npm.
- Every external dependency degrades cleanly; the app must stay fully functional offline from `file://`.
- Images stay on `live.staticflickr.com`; CDN libraries load lazily from unpkg.

---

## 1. Scrub/slip detection

**Goal:** when a live feed refresh changes a launch's NET or status, tell the user — "slipped +42 min", "HOLD", "GO for launch", "scrubbed".

### Mechanism

- New `diffFeed(prev, next)` step in the data layer, invoked when a live fetch replaces existing **live** data.
- **Live→live only.** Seed NETs are synthetic (`Date.now()`-anchored), so seed→live diffs are garbage. The first live paint of a session records baselines and emits nothing. Guard: prior state must have `S.feedProvider !== 'seed'`.
- Baseline state: an in-memory `Map` of launch id → `{net, status}`. No new storage keys; resets each session (the 30-min LL2 sessionStorage cache makes cross-session diffs unreliable).

### Detections (per launch id present in both sets)

| Change | Threshold | Message |
|---|---|---|
| NET slip | delta ≥ 5 min | `⏱ <name> slipped +42 min` / `moved up 15 min` |
| NET major slip | delta ≥ 24 h | `✕ <name> scrubbed — recycled to <date>` |
| Status → Hold | — | `⚠ <name> — HOLD` |
| Status → Go | — | `✓ <name> — GO for launch` |
| Status → Failure / Partial Failure | recents | `✕ <name> — <status>` |

### Noise control

- Toasts (`toast()`) + best-effort `notify()` fire only for **watched launches and the current hero** (next launch).
- All other changed launches get a silent `l.netChanged = {oldNet, delta}` marker; the dossier renders a one-line "NET updated (+42 min)" note.
- Respects the existing `S.alerts.enabled` flag.

### Testing

Unit-testable by extracting `diffFeed` as a pure function over two launch arrays returning a list of change events; drive via Playwright by mocking two successive LL2 responses with shifted NETs.

---

## 2. Globe overhaul (A + C)

**Goal:** fix "looks cheap, janky, not useful" — visual facelift within globe.gl plus purpose features. No rebuild; globe.gl stays.

### A — Visual

- **Real earth**: blue-marble day texture, bump map, `showAtmosphere` glow. Night-lights texture when the app is in dark theme. Textures load from the same unpkg CDN that already serves globe.gl (`three-globe` example images) — no new CDN dependency class.
- **Fallback chain preserved**: texture fetch fails → current wireframe look (texture is an enhancement layered on the existing config, never a prerequisite); globe.gl/CDN/WebGL failure → static site list, exactly as today. Offline behavior unchanged.
- **Declutter**: layer toggle chips above the globe — `Arcs · Trails · Terminator · Craft`. Arcs limited to the next ~8 launches. Trails default off on small screens.
- **Performance**: cap `devicePixelRatio` at 2; pause the render loop (`pauseAnimation`/`resumeAnimation`) when the tab is hidden or another app tab is active; reduce point/arc counts on small screens.

### C — Purpose

- **Next-launch framing**: camera boots aimed at the next launch's pad (`pointOfView`), with a floating chip `NEXT · <mission> · T-xx:xx:xx` (live countdown via the existing `cdRegister` engine) that opens the dossier on click/tap.
- **Launch-day mode**: within the LIVE window (`inLiveWindow`), animate an ascent arc from the pad toward orbit insertion, driven by the same synthetic ascent profile the Mission Clock uses (`ascentAlt`), so Clock and Globe agree.
- **Pass prediction promoted**: the existing `findMyPass` ISS computation surfaces as a HUD chip — `ISS over you in 12 min` — instead of hiding inside the sat panel. Geolocation remains opt-in.
- **Clickable pads**: clicking a pad point opens the dossier of that pad's next upcoming launch (falls back to most recent past launch).

---

## 3. iOS push (Cloudflare Worker)

**Goal:** real lock-screen launch alerts with the app closed, on iOS Home-Screen PWA installs (and Android/desktop), at $0.

### Architecture

**Server never learns the watchlist.** It broadcasts every milestone for every upcoming launch; the client's service worker filters. The only server-side user data is the opaque push subscription.

**New `push-worker/` directory** — a wrangler project, deployed separately from GitHub Pages:

- `POST /subscribe` — store the push-subscription JSON in KV, keyed by a hash of the endpoint URL.
- `POST /unsubscribe` — delete by the same key.
- **Cron trigger, every 10 min**: fetch LL2 upcoming (worker-side, cached in KV to respect LL2 rate limits), compute the same milestones the in-app `checkReminders` uses (T-24h / T-1h / T-10m / liftoff), de-dupe fired milestones via KV markers, and send Web Push (VAPID; private key in a Worker secret) with payload `{launchId, name, milestone, net}` to every subscription. Prune subscriptions that return 404/410.

### App side

- **"Enable launch alerts"** button in the existing alert-settings sheet. iOS requires the permission request to come from a user gesture and only grants push to Home-Screen installs — no auto-prompt. Public VAPID key baked into the page config.
- `toggleWatch` mirrors the watchlist into **IndexedDB** (service workers cannot read localStorage).
- `sw.js` gains a `push` handler: parse payload → look up the launch id in the IDB watchlist → `showNotification` only if watched. `notificationclick` opens/deep-links `#launch=<id>` (plumbing exists).
- Failure modes: worker unreachable → the enable button reports failure, nothing else changes; push permission denied → in-app toasts remain the fallback, as today.

### One-time operator setup

Create a free Cloudflare account → `wrangler deploy` → generate VAPID keypair (scripted) → private key as a Worker secret, public key pasted into the app config. Documented in `push-worker/README.md`.

---

## Build order

1. **Scrub detection** — smallest, zero infra, immediately useful.
2. **Globe overhaul** — biggest visible payoff, self-contained in the page.
3. **Push** — gated on Cloudflare account setup; reuses the milestone logic conventions from (1).
