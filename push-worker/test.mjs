/* Offline tests for the push worker (Node 18+): node test.mjs
   1. RFC 8291 Appendix A test vector — exact-match against the published
      ciphertext (fixed keys + salt injected).
   2. Round-trip — encrypt with worker code, decrypt with an independently
      written receiver (RFC 8291 §3.4 from the UA side).
   3. VAPID JWT — verify the ES256 signature and claims with WebCrypto.
   4. dueMilestones window logic. */
import { encryptPayload, signJWT, dueMilestones, b64u } from './src/worker.js';

let failures = 0;
const assert = (cond, name) => { console.log((cond ? '  ok ' : 'FAIL ') + name); if (!cond) failures++; };
const te = new TextEncoder();

/* ── 1. RFC 8291 Appendix A test vector ── */
{
  const V = {
    uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    plaintext: 'When I grow up, I want to be a watermelon',
    message: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  };
  const asPub = b64u.dec(V.asPublic);
  const asKeys = {
    privateKey: await crypto.subtle.importKey('jwk',
      { kty: 'EC', crv: 'P-256', d: V.asPrivate, x: b64u.enc(asPub.slice(1, 33)), y: b64u.enc(asPub.slice(33, 65)), ext: true },
      { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
  const sub = { endpoint: 'https://example.test', keys: { p256dh: V.uaPublic, auth: V.auth } };
  const out = await encryptPayload(sub, V.plaintext, asKeys, b64u.dec(V.salt));
  assert(b64u.enc(out) === V.message, 'RFC 8291 Appendix A exact ciphertext match');
}

/* ── 2. round-trip with fresh keys (independent receiver implementation) ── */
{
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { endpoint: 'https://example.test', keys: { p256dh: b64u.enc(uaPub), auth: b64u.enc(auth) } };
  const payload = JSON.stringify({ launchId: 'll2-abc', name: 'Starlink', milestone: 10 });
  const msg = await encryptPayload(sub, payload);

  // receiver side, written from RFC 8291/8188 independently of the sender code
  const salt = msg.slice(0, 16);
  const rs = new DataView(msg.buffer, msg.byteOffset + 16, 4).getUint32(0);
  const idlen = msg[20];
  const asPub = msg.slice(21, 21 + idlen);
  const ct = msg.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const hk = async (s, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: s, info },
    await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
  const cat = (...ps) => { const o = new Uint8Array(ps.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of ps) { o.set(p, i); i += p.length; } return o; };
  const ikm = await hk(auth, secret, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  assert(padded[padded.length - 1] === 2, 'round-trip: last-record pad delimiter 0x02');
  assert(new TextDecoder().decode(padded.slice(0, -1)) === payload, 'round-trip: plaintext survives');
  assert(rs === 4096 && idlen === 65, 'round-trip: header rs/keyid well-formed');
}

/* ── 3. VAPID JWT signature + claims ── */
{
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwkPriv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const env = { VAPID_PUBLIC_KEY: b64u.enc(pub), VAPID_PRIVATE_KEY: jwkPriv.d, VAPID_SUBJECT: 'mailto:t@t.t' };
  const claims = { aud: 'https://fcm.googleapis.com', exp: Math.floor(Date.now() / 1000) + 3600, sub: env.VAPID_SUBJECT };
  const jwt = await signJWT(claims, env);
  const [h, b, s] = jwt.split('.');
  const vKey = await crypto.subtle.importKey('raw', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vKey, b64u.dec(s), te.encode(h + '.' + b));
  assert(ok, 'VAPID: ES256 signature verifies');
  const decoded = JSON.parse(new TextDecoder().decode(b64u.dec(b)));
  assert(decoded.aud === claims.aud && decoded.exp === claims.exp, 'VAPID: claims intact');
  assert(JSON.parse(new TextDecoder().decode(b64u.dec(h))).alg === 'ES256', 'VAPID: header alg ES256');
}

/* ── 4. milestone windows ── */
{
  const now = Date.now();
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  assert(eq(dueMilestones(now + 55 * 60e3, now), [60]), 'due: T-55m fires the T-1h milestone');
  assert(eq(dueMilestones(now + 8 * 60e3, now), [10]), 'due: T-8m fires T-10m');
  assert(eq(dueMilestones(now - 5 * 60e3, now), [0]), 'due: T+5m fires liftoff');
  assert(eq(dueMilestones(now - 20 * 60e3, now), []), 'due: T+20m fires nothing (band passed)');
  assert(eq(dueMilestones(now + 3 * 86400e3, now), []), 'due: T-3d fires nothing');
  assert(eq(dueMilestones(now + 1439 * 60e3, now), [1440]), 'due: T-23h59m fires T-24h');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall tests passed');
process.exit(failures ? 1 : 0);
