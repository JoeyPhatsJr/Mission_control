# Mission Control — Scriptable iPhone Widget (Pass 4)

**Date:** 2026-07-15
**Status:** Approved design, pre-implementation
**Deliverable:** `scriptable/mission-control-widget.js` + `scriptable/README.md` (install guide). Zero changes to `index.html` behavior; CLAUDE.md "Not built (planned)" paragraph updates to built.

## Purpose

iOS won't deliver web notifications from a closed PWA without a push server, so Mission Control's launch alerts only work while the app is open. This widget is the no-server workaround: a standalone JavaScript file for the free [Scriptable](https://scriptable.app) app that puts the next launch — with a **live-ticking countdown** — on the Lock Screen and Home Screen. Tapping it deep-links into the hosted PWA.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Placements | **All six families**: Lock Screen rectangular, circular, inline + Home Screen small, medium, large |
| Launch selection | **US-launch focus**: filter to launches from US pads (LL2 pad country), via a `CONFIG.COUNTRY = 'USA'` constant; `null` = worldwide |
| Tap action | Open `https://joeyphatsjr.github.io/Mission_control/#launch=ll2-<uuid>` — the app's deep-link handler (`readHash`/`hashPendingLaunch`) already resolves ids that arrive before live data |
| Rendering | **Hybrid**: native ListWidget elements for all data (critically the timer), DrawContext only for decorations (circular progress ring, Home Screen provider accent bar) |

### Why hybrid rendering

iOS re-renders widgets on its own budget (~15–30 min). Anything *drawn* is frozen between refreshes. The only live-ticking element is a native date element with timer style (`addDate` + `applyTimerStyle()`), which iOS updates every second forever. So: countdown = native timer, always; drawings = coarse decorations where staleness is acceptable.

## Architecture

One file, no dependencies, structured top-to-bottom:

1. **`CONFIG`** — app URL, `COUNTRY` filter, cache TTL (10 min), cache filename, provider color map (subset of the app's `PROVIDERS` palette: SpaceX `#38bdf8`, Rocket Lab `#f472b6`, ULA `#a78bfa`, Blue Origin `#2dd4bf`, Firefly `#a3e635`, NASA `#60a5fa`, + fallback hash-pick mirroring `provColor`)
2. **Data layer** — `loadLaunches()`: cache-first fetch (below)
3. **Picker** — `pickLaunch(launches)`: first launch from a US pad with `net > now − 30 min` (grace window keeps the current mission on screen through liftoff); also returns the following 3 for the large widget's queue
4. **Layout builders** — one function per family, dispatched on `config.widgetFamily`
5. **Preview harness** — when run manually in-app (`!config.runsInWidget`), an alert menu previews each family

## Data flow

- **Endpoint:** `https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=15&hide_recent_previous=true` (normal mode — name, net, window, provider, pad + country, status, probability all present; `mode=detailed` is unnecessary weight)
- **Cache:** parsed JSON + timestamp via `FileManager.local()` in Scriptable's documents dir
- **Strategy:**
  - Cache fresher than 10 min → use it, skip network (protects the ~15 req/hr unauthenticated LL2 budget against iOS refresh bursts)
  - Else fetch; on success rewrite cache
  - On fetch failure → use cache **regardless of age**, stamped "cached HH:MM"
- **Refresh hint:** `widget.refreshAfterDate` set to ~15 min out (tighter inside T−1 h); iOS treats it as advisory

## Layouts

All families show the picked launch; the native timer ticks wherever the family supports it.

- **Lock rectangular** — line 1: `🚀` + mission name (caps, truncated); line 2: ticking timer (largest element); line 3: `vehicle · pad shortname` (LL2 pad name with boilerplate stripped — e.g. "Space Launch Complex 40" → "SLC-40" via a small abbreviation regex, else truncated)
- **Lock circular** — DrawContext ring filling over the final 24 h to T−0, compact `T−4h` readout centered (ring is stale-tolerant; text refreshes with iOS)
- **Lock inline** — `🚀 <name> · T−4h 12m` static text (inline slots can't tick)
- **Home small** — `NEXT LAUNCH` header (with a small `US` tag when the country filter is active), mission name, ticking timer, vehicle
- **Home medium** — small's content + drawn provider-color accent bar (left edge), go-probability dot (green ≥ 80 %, amber ≥ 50 %, red < 50 %, gray null) with %, meta row `vehicle · pad · date`
- **Home large** — medium's layout + **up-next queue**: the following 3 launches as `provider-dot name … date` rows
- **Post-T−0:** native timer counts up automatically; label flips `T−` → `T+` at next iOS refresh; picker holds the mission for 30 min past NET

## Theming

- Lock Screen families: system-tinted monochrome — no color decisions
- Home Screen: `Color.dynamic(light, dark)` mirroring the app — dark console default (near-black bg `#0a0e14`-family, light text), light variant for light mode
- Fonts: system (`Font.boldSystemFont` etc.) — custom webfonts aren't available in Scriptable; monospaced digits for the timer (`Font.boldMonospacedSystemFont`)

## Error handling

- No network + no cache → "SIGNAL LOST — open app to sync" state, still tappable into the PWA
- US filter empties the list → "No US launches on the board"
- Defensive field access (`?.`) throughout; a launch missing critical fields (no `net`) is skipped for the next one
- TBD-status launches: `~` prefix on the date instead of a confident countdown

## Testing

Scriptable is iOS-only, so verification is two-stage:

1. **On this machine:** `node --check` for syntax + a Node harness (`scriptable/test-harness.mjs`, dev-only) stubbing Scriptable globals (`Request`, `ListWidget`, `FileManager`, `DrawContext`, `config`, `args`, `Script`, `Color`, `Font`, `Device`) that runs all six builders against (a) a live LL2 fetch, (b) a canned fixture, (c) an empty/filtered-out response, (d) a network-failure simulation — asserting no throws and sane text content
2. **On device:** run the script manually in Scriptable → preview menu for each family; add one widget per placement and spot-check ticking + tap-through

## Out of scope

- Push notifications (still requires a server — explicitly rejected)
- Watchlist sync with the PWA (localStorage isn't shared across apps)
- Multiple simultaneous filters / widget parameters (superseded by the hardcoded US focus; the `COUNTRY` constant is the escape hatch)
