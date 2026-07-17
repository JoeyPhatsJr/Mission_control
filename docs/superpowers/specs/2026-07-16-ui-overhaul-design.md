# UI Overhaul — iOS Webapp + Desktop — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorm) — direction locked, building in verified stages.

## Decisions (from brainstorm)

- **Visual identity:** free rein; keep the futuristic/spacey console feel. Solo user — branding is not a constraint. Refine and evolve where it helps; don't preserve details for their own sake.
- **Navigation:** a fixed **bottom tab bar everywhere** (phone + desktop), replacing the overflowing top tab strip.
- **Desktop:** **embrace the width** — fill horizontal space (hero imagery, multi-column grids, denser dashboards).
- **iOS webapp plumbing (always):** safe-area insets (top + bottom), standalone status-bar theming, momentum scroll, ≥44px touch targets.

## Problems in the current UI (observed)

- On iPhone the six top tabs overflow and scroll off-screen (Companies/Fleet hidden); the header stack (brand + icon row + scrolling tabs) eats vertical space; no bottom safe-area handling for standalone.
- On desktop the hero's right half is empty (image area) and everything stays in a narrow centered column — the width is wasted.

## Architecture

Single-file `index.html`, no build. All changes are CSS + small markup/JS moves. Preserve every behavior: ARIA tablist semantics, `switchTab`, deep-linking, offline seed, theme toggle, all overlays.

### 1. Bottom tab bar (`nav.tabbar`)

- New fixed bottom nav holding the 6 sections; the `role="tablist"` + `role="tab"` semantics **move here** from the top strip (panels keep `role="tabpanel"`, `aria-labelledby` still points at these tab ids). `switchTab`, keyboard arrow handling, and deep-linking are unchanged — same `#tab-<name>` ids and `data-tab`.
- Each tab = inline SVG icon (self-contained, offline-safe) + short label. Active tab: accent icon/label + a glow indicator. ≥44px hit targets.
- Fixed to bottom, full width, `padding-bottom: env(safe-area-inset-bottom)`, backdrop blur, top hairline. Hidden from print.
- `main` gets `padding-bottom` clearing the bar height + safe area so content never hides behind it.
- Overlays that sit above everything (modal, clock, palette, sheets, PIP, toasts) stack **above** the tab bar; the mobile toast/PIP offsets lift to clear it.

### 2. Slim top header

- Header keeps brand (left) + utility actions (search, tz, alerts, help, install, theme, data badge) right. Tabs removed. Height drops. On narrow widths the utilities collapse to icons (already do).
- Stays sticky with top safe-area inset.

### 3. Hero (Missions) — two-column on desktop

- Desktop (≥900px): a two-column hero — mission info/countdown left, launch imagery filling a tall panel right (fixes the empty half). Mobile: stacked (image band on top, info below), as today but tightened.
- Countdown, window bar, LIVE state, actions unchanged.

### 4. Embrace desktop width

- `main` max-width raised (1440 → ~1600) with comfortable side gutters.
- Card grids: `auto-fill, minmax()` so upcoming/recent/companies/fleet flow to 3–4 columns on wide screens instead of 2.
- Analytics dashboard tiles/charts use the extra width (denser multi-column).

### 5. Visual refinement pass

- Tighten spacing rhythm and elevation on cards; keep the cyan-on-dark console language and starfield. Refine the hero and stat row. No palette overhaul required, but small token tweaks allowed where they sharpen the look.

### 6. iOS webapp specifics

- `viewport-fit=cover` already set. Add safe-area insets to header (top) and tab bar (bottom).
- `-webkit-overflow-scrolling: touch` momentum; keep `overscroll-behavior` to kill rubber-banding where it causes bar detachment.
- Touch targets ≥44px on tab bar + icon buttons on coarse pointers (`@media (pointer: coarse)`).
- Keep `apple-mobile-web-app-*` metas; verify status-bar style works with the slim header.

## Build order (each verified with screenshots at 390px + 1440px, zero console errors, offline seed)

1. Bottom tab bar + slim header + safe-area/content-padding + overlay/PIP/toast offsets.
2. Hero two-column desktop / stacked mobile.
3. Width + responsive grid columns (missions, companies, fleet, timeline, analytics).
4. Visual polish + iOS touch-target/scroll pass.
5. Full regression sweep (all 6 tabs at both widths, dossier, clock, palette, sheets), commit, deploy.

## Non-goals

- No framework, no build step, no new runtime deps. No data/feature changes. No new external assets (icons are inline SVG).
