/* One-time VAPID keypair generator (Node 18+): node gen-keys.mjs
   Prints the public key (goes in wrangler.toml vars AND index.html PUSH.vapidKey)
   and the private key (wrangler secret put VAPID_PRIVATE_KEY). */
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
console.log('VAPID_PUBLIC_KEY  =', b64u(pub));
console.log('VAPID_PRIVATE_KEY =', jwk.d);
