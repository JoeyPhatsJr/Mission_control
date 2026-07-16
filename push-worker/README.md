# Mission Control push relay

A tiny Cloudflare Worker (free tier) that gives the PWA **real closed-app launch alerts** — including iPhone lock-screen notifications, which web apps can't do without a push server.

How it works: the app POSTs its Web Push subscription (plus the ★ watchlist, used as a server-side filter) here; a 10-minute cron polls Launch Library 2 and fires the same milestones the in-app reminders use (T-24h · T-1h · T-10m · liftoff) as encrypted Web Push. The service worker double-checks the watchlist before showing anything. No accounts, no analytics; the only stored data is the opaque push subscription + the watched launch ids.

The push crypto (RFC 8291 `aes128gcm`, RFC 8292 VAPID) is implemented in-repo on WebCrypto — zero npm dependencies. `node test.mjs` validates it against the RFC 8291 Appendix A test vector byte-for-byte.

## One-time setup (~10 minutes)

1. **Cloudflare account** — free: <https://dash.cloudflare.com/sign-up>, then `npm i -g wrangler && wrangler login`.

2. **VAPID keys**:
   ```
   cd push-worker
   node gen-keys.mjs
   ```
   Copy `VAPID_PUBLIC_KEY` into **two places**: `wrangler.toml` (`[vars]`) and `index.html` (`PUSH.vapidKey`).

3. **KV namespace**:
   ```
   wrangler kv namespace create SUBS
   ```
   Paste the printed `id` into `wrangler.toml`.

4. **Private key as a secret** (never in the toml):
   ```
   wrangler secret put VAPID_PRIVATE_KEY
   ```
   (paste the private key from step 2 when prompted)

5. **Deploy**:
   ```
   wrangler deploy
   ```
   Copy the printed `https://mc-push.<account>.workers.dev` URL into `index.html` (`PUSH.worker`).

6. **Ship the app** — commit the two `index.html` values and push to `main` (GitHub Pages redeploys). While `PUSH.worker` is empty the feature is invisible and the app is unchanged.

## Using it

Open **⚠ Alerts** in the app → toggle **“Push to this device.”**
On iPhone: the app must be added to the Home Screen first (Share → Add to Home Screen), and iOS will only show the permission prompt because the toggle is a user gesture.

Alerts follow the ★ watchlist. Starring/unstarring re-syncs the filter to the relay automatically (debounced).

## Notes & limits

- **A NET slip after a milestone fired won't re-fire it server-side** (the de-dupe marker is keyed launch+milestone, TTL 48 h). The in-app reminders do re-arm on slips, so an open app stays accurate.
- The cron polls LL2 every 10 min (`*/10 * * * *`); a milestone fires when T-minus crossed it within the last 15 min, so nothing retro-fires on a fresh deploy.
- Free-tier headroom: KV + 100k requests/day + cron is far beyond what this needs.
- `test.mjs` (Node 18+): RFC 8291 exact-vector match, independent-receiver round-trip decrypt, VAPID ES256 verify, milestone-window logic.
