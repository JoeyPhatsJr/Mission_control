# Fable Rebuild Prompt — Mission Control

A paste-ready prompt for handing the **Mission Control** space-launch tracker rebuild to Fable.

## Context for the human (not part of the prompt)

The current `index.html` (~880 lines) has three tabs — Missions, Timeline, Companies. The project's `CLAUDE.md` describes a **3D Globe tab with ISS tracking (`globe.gl`)** that is *not present* in the current file, so the rebuild treats that as an opportunity to add.

Preserve these when rebuilding:
- The efficient **per-digit countdown diff + flip animation** (only changed digits re-render).
- The `live.staticflickr.com`-only image constraint (Wikimedia / NASA CDNs are blocked under `file://`).
- Single self-contained file, no build step, runs from `file://`.

---

## The prompt (paste into Fable)

```
ROLE
You are a senior creative front-end engineer and product designer. You build award-worthy, single-file web apps that feel like real products, not demos. You care about typography, motion, information density, resilience, and details most people skip. You write clean, well-organized vanilla JavaScript with no framework.

TASK
Rebuild a single-file web app called MISSION CONTROL — a live space-launch tracker — from scratch. Produce ONE self-contained `index.html` that is dramatically better than the current version in visual design, information depth, interactivity, and robustness, while honoring every hard constraint in this brief. This is a full redesign, not a patch: you may restructure anything as long as the constraints hold and the app is unmistakably an evolution of the same product identity (dark mission-console aesthetic, cyan accent).

Read this entire brief before writing a single line. Then build the whole thing in one pass.

═══════════════════════════════════════════════════════════════════
1 · WHAT IT IS TODAY (the baseline you are beating)
═══════════════════════════════════════════════════════════════════
A ~880-line self-contained HTML file — embedded CSS + vanilla JS, no build step, no framework, no npm. Dark "space console" theme with a cyan accent (#22d3ee). Type system: Oxanium (display/headings), JetBrains Mono (data/labels/numbers), DM Sans (body). A fixed starfield canvas, a subtle cyan grid overlay, a sticky blurred nav with a "LIVE" badge. Three tabs:

  • MISSIONS  — a 4-up stat row (upcoming count, recent count, active agencies, launches this year, each with a count-up animation), a grid of UPCOMING launch cards each with a live per-second countdown, and a grid of RECENT launch cards. Clicking any card opens a detail modal.
  • TIMELINE  — a filterable table (All / Upcoming / Past) grouped by month, with each row fading/sliding in on scroll via IntersectionObserver. Past rows are dimmed.
  • COMPANIES — static, hardcoded cards (SpaceX, NASA, Blue Origin, ESA, CNSA, Rocket Lab, ULA) with a focus tag, description, three stats, and a tag list.

Data source — RocketLaunch.live JSON API:
  • Upcoming: https://fdo.rocketlaunch.live/json/launches/next/15
  • Past:     https://fdo.rocketlaunch.live/json/launches/past/15
Both responses are cached in sessionStorage for 5 minutes. A `normalizeRL(launch, isPast)` function maps the raw API shape into a common internal object:
  {
    id, name,
    status: { abbrev, name },              // e.g. Go / TBD / Success / Failure
    launch_service_provider: { name },
    rocket: { configuration: { name } },
    pad: { name, latitude, longitude, location: { name } },
    mission: { description },
    image,                                  // may be null
    net,                                    // "no earlier than" ISO date
    window_start
  }

Known weaknesses in the current app you should fix, not copy:
  • Rocket images are chosen by brittle substring matching of the vehicle name against a small hardcoded Flickr pool; misses fall back to one generic photo.
  • App state lives in loose globals (window._launches, allTl, countdownTargets) with view logic duplicated across cards/timeline/modal.
  • The "3D Globe with ISS tracking" tab is documented in the project spec but does NOT exist in the current file. Add it.
  • No real offline story: if the API can't be reached (common from file://), the page shows an error box instead of content.
  • No search, no sort, no per-provider filtering, no hero/"next launch" focal point.

═══════════════════════════════════════════════════════════════════
2 · HARD CONSTRAINTS — violating any of these fails the task
═══════════════════════════════════════════════════════════════════
1.  ONE file. All HTML, CSS, and JS inline in a single `index.html`. No build tooling, no npm, no bundler, no local asset files. It must run by double-clicking the file from `file://`.
2.  The only permitted external runtime dependencies are CDN <link>/<script> tags: Google Fonts, and OPTIONALLY `globe.gl@2.27.2` (plus the Three.js it needs) for the globe. Nothing else. If a CDN fails to load, the app must still work (globe tab degrades gracefully — see §4B).
3.  IMAGES: every rocket/photo image MUST use a `https://live.staticflickr.com/...` URL. Wikimedia (`upload.wikimedia.org`) and the NASA image CDN (`images-assets.nasa.gov`) are BLOCKED under `file://` — never use them. Flickr full-size pattern: `https://live.staticflickr.com/{server}/{photo_id}_{secret}_b.jpg` where `_b` = the 1024px size; dropping `_b` gives a smaller default.
4.  Every <img> uses `loading="eager"`. Do NOT use `loading="lazy"` — under `file://` the browser's lazy-load IntersectionObserver never fires, so lazy images never appear. (IntersectionObserver for scroll-reveal of non-image elements still works fine — use it freely there.)
5.  Every image `onerror` handler MUST set `this.onerror=null` as its FIRST action, then swap to a fallback src, so a failing fallback can't trigger an infinite error loop.
6.  OFFLINE-FIRST RESILIENCE. Assume the live API will often be unreachable from `file://` (CORS/offline). The app must render fully and beautifully regardless: attempt the live API with a timeout, and on any failure fall back silently to a rich embedded seed dataset (see §4A). Never show a broken or empty page. Surface data provenance with a small, tasteful indicator ("LIVE" vs "SAMPLE DATA"), not an error wall.
7.  Preserve the efficient countdown: one setInterval/rAF tick per second that mutates ONLY the digits that changed (per-digit diffing against previous values), never a full re-render of every timer each second. Keep the flip/roll micro-animation on digit change.
8.  No uncaught exceptions and no console errors in either the happy path (API works) or the offline path (API blocked). Wrap all fetches in try/catch with a timeout.
9.  Self-contained determinism: do not rely on any server, localhost, or environment variable. Opening the raw file is the entire deployment.

═══════════════════════════════════════════════════════════════════
3 · DESIGN SYSTEM — elevate, don't abandon
═══════════════════════════════════════════════════════════════════
Keep the identity (dark aerospace console, cyan accent, mono data readouts) but make it feel more premium, more considered, and more alive.

COLOR — define as CSS custom properties on :root. Start from the existing palette and refine:
  --bg #020508 · --surf #050b14 · --surf2 #091220 · --surf3 #0e1a2d ·
  --border #122030 · --border2 #1c3048 · --accent #22d3ee · --accent-d #0891b2 ·
  --orange #f97316 · --text #daeaf7 · --text2 #6898b8 · --dim #365570 ·
  --green #34d399 (go/success) · --red #f87171 (failure) · --amber #fbbf24 (hold/tbd).
  Add a small set of provider accent hues (SpaceX, Rocket Lab, ULA, Blue Origin, ESA/Arianespace, CNSA, NASA) used consistently for provider tags, timeline legend, and globe points.
  Provide a full dark theme (default) AND a comfortable light theme toggle in the nav, both driven by CSS variables so every component adapts. Persist the choice in localStorage. Respect `prefers-color-scheme` for the initial value.

TYPE — Oxanium (--fd) for display/headings/section labels, JetBrains Mono (--fm) for data/labels/countdowns/coords, DM Sans (--fu) for body copy. Establish a deliberate modular type scale and use tabular-nums for all numeric readouts. Use letter-spacing and uppercase treatments for the "console telemetry" feel, but keep body copy readable.

SPACE & LAYOUT — a consistent spacing rhythm (4/8px based), a max content width (~1440px), generous section breathing room, and hairline 1px borders/dividers with the cyan-gradient-to-transparent treatment already used for section labels. Cards should read like instrument panels.

MOTION — tasteful, physical, never gratuitous. Card hover lifts, image zoom-on-hover, countdown digit flips, scroll-reveal for timeline rows and cards, count-up for stats, a smooth tab cross-fade, and modal scale-in. Everything must be wrapped so that `@media (prefers-reduced-motion: reduce)` disables non-essential animation. Target 60fps: transform/opacity only, no animating layout properties.

ATMOSPHERE — improve the background: a multi-layer starfield (a couple of parallax depth layers, a few subtly twinkling stars, occasional slow "drifting" satellite dot) drawn cheaply on canvas, plus the existing masked cyan grid. It should feel deep but never distract or cost meaningful CPU.

═══════════════════════════════════════════════════════════════════
4 · FEATURE MANDATE — build ALL of this
═══════════════════════════════════════════════════════════════════

A. DATA LAYER
   • A single normalized launch model consumed by every view (hero, cards, timeline, globe, modal, search). One normalization path — no per-view reshaping.
   • Normalization must tolerate every missing field gracefully. Never render the literal string "undefined", "null", or "NaN". Missing values render as "TBD" or "—".
   • Derived helpers computed once: soonest upcoming launch, per-provider launch counts, per-pad launch counts, per-month grouping, this-year count, active-agency set.
   • An embedded SEED DATASET of realistic launches: at least 15 upcoming + 15 past. Use real providers and vehicles (SpaceX Falcon 9 / Falcon Heavy / Starship, Rocket Lab Electron / Neutron, ULA Vulcan / Atlas V, Blue Origin New Glenn, Arianespace Ariane 6, ISRO, Roscosmos Soyuz, CNSA Long March, Firefly Alpha, etc.), real launch pads with accurate lat/lon (KSC LC-39A, CCSFS SLC-40, Vandenberg SLC-4E, Boca Chica, Wallops, Mahia NZ, Kourou, Baikonur, Jiuquan, Wenchang, Sriharikota), plausible mission names and descriptions, staggered NET dates (several within the next hours/days for live countdowns, the rest spread over coming weeks), and correct Flickr `_b` image URLs per vehicle. This dataset is what makes offline mode look real — invest in it.
   • Caching: keep the 5-minute sessionStorage cache for live responses. Cache invalidation must be safe (wrap JSON.parse in try/catch).

B. GLOBE TAB (new — this is the flagship addition)
   • Add a GLOBE tab using globe.gl. Lazy-initialize it only on first visit (it is heavy) and pause its render loop / polling whenever the tab is not visible.
   • Plot every launch site from the dataset as a point on the globe, color-coded by the status of its next launch and sized by that pad's launch frequency. Hovering a point shows a label (pad + location); clicking flies the camera to it and opens a side panel listing that pad's launches (click a launch → open its modal).
   • Draw great-circle "launch arc" trajectories rising from upcoming/active pads (globe.gl arcs), animated, colored by provider.
   • LIVE ISS TRACKING: poll https://api.wheretheiss.at/v1/satellites/25544 about every 5 seconds; render the ISS as a distinct marker with a fading ground-track trail of its recent positions, plus a small readout (lat, lon, altitude, velocity). Throttle politely and stop polling when the tab is hidden. If the API is blocked, simulate a plausible orbit locally (simple Keplerian/ground-track math) so the feature still demonstrates — and label it "SIMULATED".
   • If globe.gl or its Three.js dependency fails to load from CDN, the GLOBE tab must degrade to a clean static list of launch sites grouped by region — never a blank canvas or an error.

C. MISSIONS TAB
   • NEXT LAUNCH HERO at the top: the single soonest upcoming launch, presented large — vehicle image, provider accent, status pill, a big prominent live countdown, key facts (vehicle, pad, location, window), and a launch-window progress bar. When T-0 is under 1 hour, escalate visually (e.g. accent shifts toward orange/amber, "IMMINENT" state, tighter pulse); when launched, show "LIFTOFF"/"IN FLIGHT".
   • Keep the count-up stat row but make the numbers derive from the live dataset.
   • Controls bar for the card grids: sort (soonest / provider / vehicle), and quick filters (by provider, by status). Filtering here should share state with the Timeline and be reachable from Companies (click a company → filter to that provider).
   • Upcoming card grid (each with live countdown) + recent card grid (with result badges). Cards remain clickable → modal. Use loading SKELETONS (shimmer placeholders shaped like cards), not a bare spinner, while data resolves.

D. TIMELINE TAB
   • Keep month grouping and IntersectionObserver scroll-reveal; keep All / Upcoming / Past filters and dim past rows.
   • Add a provider color legend and color the row's left border by provider.
   • Add a compact/comfortable density toggle.
   • Make each row expandable inline (click to expand) to reveal mission detail, pad, window, and a thumbnail — without opening the modal. Only one expanded at a time is fine; animate the expand.
   • Respect the shared provider/status filter from the Missions controls.

E. COMPANIES TAB
   • Keep the rich card design but derive live launch/mission counts from the actual dataset where the data supports it; clearly mark any still-hardcoded figures.
   • Clicking a company filters Missions and Timeline to that provider and switches to the Missions tab (or reveals its launches inline). Make the relationship obvious.
   • Add a small recent-form indicator per company (e.g. last few results as success/failure ticks) computed from the dataset.

F. MODAL / MISSION DOSSIER
   • Upgrade the detail modal into a full dossier: hero image, status pill, name, provider, description, a live countdown, structured Mission / Rocket / Launchpad sections, and the pad coordinates.
   • Render a small PAD LOCATOR from the coordinates WITHOUT external map tiles — draw a lightweight canvas/SVG world locator dot, or reuse the globe to fly to the pad. No third-party tile servers (they'd break under file:// / the image constraint).
   • Add prev/next navigation between launches within the modal (keyboard ← / → and on-screen controls), plus Escape to close, backdrop-click to close, focus trap, and restore focus to the triggering card on close.

G. GLOBAL SEARCH / COMMAND
   • Press "/" (or click a search affordance) to open a command palette that fuzzy-searches launches, providers, and pads. Selecting a result jumps to it (opens the modal, or navigates+filters the relevant tab). Full keyboard control (arrow keys, Enter, Escape).

═══════════════════════════════════════════════════════════════════
5 · ACCESSIBILITY & RESPONSIVENESS (required, not optional)
═══════════════════════════════════════════════════════════════════
  • Keyboard: every interactive element is reachable and operable by keyboard with a visible focus ring. Tabs behave like an ARIA tablist; the modal and command palette are proper dialogs with focus trapping and Escape.
  • Semantics: appropriate roles/labels (tablist/tab/tabpanel, dialog, buttons vs links), alt text on images, aria-live for the "LIVE/SAMPLE" data indicator and for countdown milestones.
  • Contrast: meet WCAG AA for text against its background in both themes; don't rely on color alone to convey status (pair with text/icon).
  • Responsive from 360px up to large desktop. Nav collapses cleanly (a compact menu on small screens). Grids reflow. The globe degrades to the static site list on very small/again-unsupported screens. The timeline table becomes a readable stacked layout on narrow widths. No horizontal body scroll at any width — wide elements scroll inside their own container.

═══════════════════════════════════════════════════════════════════
6 · PERFORMANCE BUDGET
═══════════════════════════════════════════════════════════════════
  • One shared requestAnimationFrame loop where feasible; the 1-second countdown does per-digit diffing only.
  • No layout thrash: batch DOM reads/writes; animate only transform/opacity.
  • Starfield is cheap (cap star count; avoid per-frame full-canvas expensive work) and pauses when the document is hidden (visibilitychange).
  • Globe render loop and ISS polling pause when the Globe tab isn't active or the document is hidden.
  • Debounce/throttle search input and any resize handlers.
  • First meaningful paint should not wait on the network — render seed/cached content immediately, then upgrade to live data if it arrives.

═══════════════════════════════════════════════════════════════════
7 · CODE QUALITY
═══════════════════════════════════════════════════════════════════
  • Vanilla JS, organized into clear labeled sections (data layer, rendering, countdown, globe, timeline, companies, modal, search, nav, boot). Comment the non-obvious parts (the countdown diffing, the offline fallback flow, the globe lifecycle, the image fallback chain).
  • Centralize the image resolution logic into one function with an explicit fallback chain: API image → vehicle-matched Flickr photo → generic Flickr fallback, each guarded by the onerror-nulling rule.
  • No dead code, no leftover console.logs, no TODO placeholders. Every feature described above is actually wired up and works from the seed data with no network.

═══════════════════════════════════════════════════════════════════
8 · SELF-CHECK BEFORE YOU FINISH (verify each; fix any that fail)
═══════════════════════════════════════════════════════════════════
  □ Opening the file with NO network access renders the full app (hero, all four tabs, globe or its fallback) from seed data, with a "SAMPLE DATA" indicator and zero console errors.
  □ With network, live data loads and the indicator reads "LIVE"; the 5-min cache works on reload.
  □ Countdowns tick every second and only changed digits animate; the <1h imminent state and the launched state both render correctly (you can force this via seed dates).
  □ No image ever uses a non-Flickr host; every img is eager; every onerror nulls itself first; a broken primary image visibly falls back.
  □ Globe: points, arcs, ISS marker+trail, click-to-fly, side panel all work; killing the globe CDN degrades to the static site list.
  □ Search palette (/) finds launches/providers/pads and navigates correctly by keyboard.
  □ Modal: dossier renders, pad locator draws with no external tiles, prev/next + Escape + focus trap all work.
  □ Light/dark toggle restyles everything and persists; prefers-reduced-motion disables non-essential animation.
  □ Responsive at 360px with no horizontal body scroll; nav, grids, timeline, and globe all adapt.
  □ No uncaught errors in either path.

═══════════════════════════════════════════════════════════════════
9 · OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════
Return the COMPLETE `index.html` in a single code block — the entire file, no ellipses, no "…rest unchanged…", no external files, no omissions. It must open and work offline from `file://` on the first try.

After the code block, provide:
  1. A CHANGELOG of 8–12 bullets naming exactly what you made better versus the baseline in §1.
  2. A short "TRADE-OFFS & OMISSIONS" note: anything you intentionally simplified or left out, and why.
  3. A one-line note on how to force the "imminent" (<1h) and "launched" states via the seed data, for quick visual QA.
```
