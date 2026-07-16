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
