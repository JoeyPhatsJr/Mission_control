/* Mission Control push worker (MC-3).
   - POST /subscribe   {subscription, watch?: ["ll2-<id>", ...]} → stored in KV
   - POST /unsubscribe {endpoint}
   - cron (10 min): poll LL2 upcoming, fire T-24h/T-1h/T-10m/liftoff milestones
     (same set as the in-app reminders) as Web Push to matching subscribers.
   Web Push crypto (RFC 8291 aes128gcm + RFC 8292 VAPID) is implemented on
   WebCrypto with zero dependencies; validated by test.mjs (round-trip decrypt
   + JWT verify).
   A subscription's `watch` list server-filters pushes so devices are not
   spammed with launches they don't follow — iOS revokes web-push subs that
   keep receiving pushes without showing a notification, so pure client-side
   filtering is not viable. An empty/missing watch list receives everything
   (the service worker still filters as defense-in-depth). */

const LL2_UP = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20&mode=list';
const MILESTONES = [1440, 60, 10, 0];                 // minutes before T-0
const FIRE_BAND_MIN = 15;                             // fire only within [min, min+band) — no ancient retro-fires
const SUB_PREFIX = 'sub:';
const FIRED_TTL = 48 * 3600;                          // de-dupe markers expire after the launch is long gone

/* ── base64url / byte helpers ── */
export const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    if (s.length % 4) s += '='.repeat(4 - (s.length % 4));
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  },
};
const te = new TextEncoder();
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/* ── RFC 8291: aes128gcm payload encryption ──
   testKeys/testSalt are injection points for the round-trip test only. */
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
export async function encryptPayload(sub, payloadStr, testKeys, testSalt) {
  const uaPublic = b64u.dec(sub.keys.p256dh);         // 65-byte uncompressed EC point
  const authSecret = b64u.dec(sub.keys.auth);         // 16 bytes
  const local = testKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  // IKM = HKDF-Expand(HKDF-Extract(auth_secret, ecdh_secret), "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(authSecret, ecdhSecret, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = testSalt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const plaintext = concat(te.encode(payloadStr), new Uint8Array([2]));   // 0x02 = last-record pad delimiter (RFC 8188)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));
  // header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(= as_public)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/* ── RFC 8292: VAPID (ES256 JWT) ── */
async function importVapidPrivate(env) {
  const pub = b64u.dec(env.VAPID_PUBLIC_KEY);
  const jwk = {
    kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY,
    x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export async function signJWT(claims, env) {
  const seg = (obj) => b64u.enc(te.encode(JSON.stringify(obj)));
  const input = seg({ typ: 'JWT', alg: 'ES256' }) + '.' + seg(claims);
  const key = await importVapidPrivate(env);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(input));
  return input + '.' + b64u.enc(sig);                 // WebCrypto emits raw r||s — already JWS form
}
async function sendPush(sub, payload, env) {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const aud = new URL(sub.endpoint).origin;
  const jwt = await signJWT({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }, env);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body,
  });
}

/* ── milestone logic (pure; unit-tested) ──
   A milestone fires when T-minus has crossed it within the last FIRE_BAND_MIN
   minutes, so each cron tick catches each crossing exactly once and a fresh
   deploy never retro-fires week-old milestones. */
export function dueMilestones(netMs, nowMs) {
  const remMin = (netMs - nowMs) / 60000;
  return MILESTONES.filter((m) => remMin <= m && remMin > m - FIRE_BAND_MIN);
}

async function subKey(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', te.encode(endpoint));
  return SUB_PREFIX + b64u.enc(h).slice(0, 43);
}

/* ── HTTP: subscribe / unsubscribe ── */
function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const ok = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
async function handleFetch(req, env) {
  const headers = { ...cors(req, env), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const url = new URL(req.url);
  try {
    if (req.method === 'POST' && url.pathname === '/subscribe') {
      const body = await req.json();
      const sub = body.subscription || body;          // accept a bare PushSubscription too
      if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')
        || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
        return new Response(JSON.stringify({ error: 'invalid subscription' }), { status: 400, headers });
      }
      const watch = Array.isArray(body.watch) ? body.watch.filter((w) => typeof w === 'string').slice(0, 200) : [];
      await env.SUBS.put(await subKey(sub.endpoint), JSON.stringify({ sub, watch, at: Date.now() }));
      return new Response(JSON.stringify({ ok: true }), { status: 201, headers });
    }
    if (req.method === 'POST' && url.pathname === '/unsubscribe') {
      const { endpoint } = await req.json();
      if (typeof endpoint === 'string') await env.SUBS.delete(await subKey(endpoint));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers });
  }
  return new Response(JSON.stringify({ ok: true, service: 'mc-push' }), { status: 200, headers });
}

/* ── cron: poll LL2, fire due milestones ── */
async function handleScheduled(env) {
  const res = await fetch(LL2_UP, { headers: { Accept: 'application/json' } });
  if (!res.ok) return;
  const data = await res.json();
  const now = Date.now();
  const due = [];                                     // {launch, milestone}
  for (const raw of data.results || []) {
    const net = Date.parse(raw.net);
    if (!Number.isFinite(net)) continue;
    for (const m of dueMilestones(net, now)) {
      const marker = `fired:${raw.id}:${m}`;
      if (await env.SUBS.get(marker)) continue;
      await env.SUBS.put(marker, '1', { expirationTtl: FIRED_TTL });
      due.push({
        launchId: 'll2-' + raw.id,
        name: raw.name || 'Launch',
        provider: raw.launch_service_provider?.name || '',
        net, milestone: m,
      });
    }
  }
  if (!due.length) return;

  const subs = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: SUB_PREFIX, cursor });
    for (const k of page.keys) {
      const rec = await env.SUBS.get(k.name, 'json');
      if (rec && rec.sub) subs.push({ key: k.name, ...rec });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  for (const payload of due) {
    for (const { key, sub, watch } of subs) {
      if (watch && watch.length && !watch.includes(payload.launchId)) continue;
      try {
        const r = await sendPush(sub, payload, env);
        if (r.status === 404 || r.status === 410) await env.SUBS.delete(key);   // dead subscription
      } catch { /* push service flake — next milestone retries the endpoint */ }
    }
  }
}

export default {
  fetch: (req, env) => handleFetch(req, env),
  scheduled: (_evt, env, ctx) => ctx.waitUntil(handleScheduled(env)),
};
