# Mission Control 🚀

A self-contained space launch tracker — live countdowns, a 3D globe with real satellite tracking, launch analytics, and mission dossiers, all in **one HTML file** with zero build step and zero dependencies to install.

**Live:** https://joeyphatsjr.github.io/Mission_control/

![console build MC-2](https://img.shields.io/badge/console-MC--2-4cc9f0) ![no build step](https://img.shields.io/badge/build-none-2ec27e) ![PWA](https://img.shields.io/badge/PWA-installable-9b5de5)

## Quick start

```sh
# just open it
open index.html

# or serve it (unlocks inline YouTube webcasts + PWA install)
python3 -m http.server 8000
# → http://localhost:8000
```

No npm, no bundler, no API keys. The app works fully offline from `file://` — it boots on an embedded seed dataset and silently upgrades to live data when the network allows.

## What's inside

**Six tabs:**

| Tab | What it does |
|---|---|
| **Missions** | NEXT LAUNCH hero with live countdown, launch-window progress, IMMINENT/LIFTOFF states; watchlist ★, filters, upcoming/recent card grids |
| **Timeline** | Month-grouped launch history with provider color legend and inline-expandable rows |
| **Globe** | `globe.gl` wireframe globe: pads sized by launch count, animated launch arcs, day/night terminator, and **ISS / Tiangong / Hubble tracked with real TLEs** (SGP4-lite propagation, ground tracks, pass predictions) |
| **Analytics** | Live NOAA space-weather panel (Kp index), provider/pad/outcome charts, monthly cadence, orbit distribution, records & milestones — pure HTML/CSS, no chart library |
| **Companies** | Operator cards with dataset-derived stats, recent-form ✓/✕ ticks, and Wikipedia blurbs |
| **Fleet** | Flight-proven boosters: serials, flight counts, landing records, fastest turnarounds |

**Plus:**

- **Mission dossier** — a modal briefing per launch: Go Call (official LL2 probability or a labeled estimate), crew/payload manifest, orbit neighborhood, historical context, an hour-by-hour launch-window weather strip, an **interactive offline vector pad map** (pan/zoom, no tiles), and a Launch Feed webcast/replay player with floating PIP
- **Mission Clock** — full-screen focus mode: giant countdown → synthetic ascent telemetry with staging callouts → outcome
- **LIVE mode** — the hero flips to ● LIVE from T-20m to T+2h with a Watch Live button (real LL2 webcast)
- **Watchlist & alerts** — star launches, get T-24h / T-1h / T-10m / liftoff toasts and browser notifications, download `.ics` calendar events
- **Command palette** — `/` or `Cmd/Ctrl-K`, fuzzy search over launches, providers, and pads
- **PWA** — installable, offline shell via service worker
- **Deep links** — tab, filters, launch, and clock state all live in the URL hash
- Dark/light themes, Local/UTC toggle, keyboard shortcuts (`?`), reduced-motion support

## Data sources

All APIs are keyless, and every one degrades cleanly — the app stays fully functional offline.

- [Launch Library 2](https://thespacedevs.com/llapi) — primary launch feed (crew, launch probability, weather concerns)
- [rocketlaunch.live](https://www.rocketlaunch.live/) — fallback feed
- [NOAA SWPC](https://www.swpc.noaa.gov/) — planetary Kp index for the space-weather panel
- [Open-Meteo](https://open-meteo.com/) — real launch-time weather forecasts
- [wheretheiss.at](https://wheretheiss.at/) — live ISS position
- [TLE API](https://tle.ivanstanojevic.me/) — orbital elements for the tracked craft
- Wikipedia — operator summaries

The nav badge reports provenance: `LIVE DATA` / `CACHED` / `LIVE + SAMPLE` / `SAMPLE DATA`.

## Files

```
index.html            the entire app (~4,000 lines of HTML/CSS/JS)
manifest.webmanifest  PWA manifest
sw.js                 service worker (offline shell, notification clicks)
icons/                app icons
tools/                coastline simplifier that generated the offline vector map
index.baseline.html   pre-rebuild version, kept for reference
fable-rebuild-prompt.md  the design brief the rebuild was built against
CLAUDE.md             architecture notes / contributor guide
```

## Notes for contributors

- Architecture, constraints, and gotchas live in [CLAUDE.md](CLAUDE.md) — read it before changing anything.
- Rocket images must come from `live.staticflickr.com` (other CDNs are blocked from `file://`), and every Flickr ID / YouTube clip ID in the curated lists was verified live before inclusion.
- YouTube embeds only work over http(s); from `file://` the Launch Feed launches out to YouTube instead.
- Pushing to `main` redeploys GitHub Pages.
