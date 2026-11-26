import test from 'node:test';
import assert from 'node:assert/strict';
import { signES256, b64u } from '../src/jwt.js';
import { verifySession, loginUrl } from '../src/session.js';
import { safeReturn, checkIdToken } from '../src/index.js';

const env = { SITE_DOMAIN: 'overyondrdev.com', ALLOWED_EMAIL_DOMAINS: 'overyondr.com' };
const now = () => Math.floor(Date.now() / 1000);

async function esKeys(kid = 'k1') {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = { ...(await crypto.subtle.exportKey('jwk', kp.privateKey)), kid };
  const { kty, crv, x, y } = priv;
  return { priv, pub: JSON.stringify({ kty, crv, x, y, kid }) };
}
const session = (over = {}) => ({ typ: 'session', iss: 'https://auth.overyondrdev.com', aud: 'overyondrdev.com', email: 'sam@overyondr.com', iat: now(), exp: now() + 3600, ...over });

test('only returns to https pages on overyondrdev.com', () => {
  assert.equal(safeReturn('https://requests.overyondrdev.com/requests/MR-1001', env), 'https://requests.overyondrdev.com/requests/MR-1001');
  assert.equal(safeReturn('https://overyondrdev.com/', env), 'https://overyondrdev.com/');
  for (const bad of ['https://evil.com/', 'https://overyondrdev.com.evil.com/', 'http://v1.overyondrdev.com/', 'https://x@evil.com', 'javascript:alert(1)', '//evil.com', 'https://auth.overyondrdev.com/login?return=x'])
    assert.equal(safeReturn(bad, env), 'https://overyondrdev.com/', bad);
});

test('accepts a valid session and rejects tampered, expired, foreign or wrongly addressed ones', async () => {
  const k = await esKeys();
  const e = { ...env, YONDR_AUTH_PUBLIC_JWK: k.pub };
  assert.deepEqual(await verifySession(await signES256(session(), k.priv), e), { email: 'sam@overyondr.com', name: null });
  const good = await signES256(session(), k.priv);
  const [h, , s] = good.split('.');
  const forged = `${h}.${b64u(new TextEncoder().encode(JSON.stringify(session({ email: 'boss@overyondr.com' }))))}.${s}`;
  assert.equal(await verifySession(forged, e), null, 'tampered payload');
  assert.equal(await verifySession(await signES256(session({ exp: now() - 5 }), k.priv), e), null, 'expired');
  assert.equal(await verifySession(await signES256(session({ email: 'eve@gmail.com' }), k.priv), e), null, 'other domain');
  assert.equal(await verifySession(await signES256(session({ aud: 'other' }), k.priv), e), null, 'audience');
  assert.equal(await verifySession(await signES256(session({ typ: 'flow' }), k.priv), e), null, 'not a session');
  const other = await esKeys('k1');
  assert.equal(await verifySession(await signES256(session(), other.priv), e), null, 'signed by another key');
  assert.equal(await verifySession(good, { ...env }), null, 'no public key configured');
});

test('login URL brings people back to where they were', () => {
  const u = loginUrl(new Request('https://ads.overyondrdev.com/?set=1'));
  assert.equal(u, 'https://auth.overyondrdev.com/login?return=' + encodeURIComponent('https://ads.overyondrdev.com/?set=1'));
});

async function googleToken(claims) {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pub = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'g1' };
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: 'RS256', kid: 'g1', typ: 'JWT' });
  const body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return { token: `${head}.${body}.${b64u(sig)}`, keys: [pub] };
}
const google = (over = {}) => ({ iss: 'https://accounts.google.com', aud: 'client-1', sub: '123', email: 'Sam@Overyondr.com', email_verified: true, hd: 'overyondr.com', nonce: 'n1', exp: now() + 300, ...over });

test('Google ID tokens: only verified Yondr Workspace accounts, for our client, with our nonce', async () => {
  const opts = (keys) => ({ clientId: 'client-1', nonce: 'n1', allowed: ['overyondr.com'], keys });
  let g = await googleToken(google());
  assert.equal((await checkIdToken(g.token, opts(g.keys))).email, 'sam@overyondr.com');
  for (const [over, err] of [
    [{ hd: undefined, email: 'sam@gmail.com' }, 'domain'],
    [{ hd: 'other.com' }, 'domain'],
    [{ email_verified: false }, 'domain'],
    [{ email: 'sam@overyondr.com.evil.com' }, 'domain'],
    [{ aud: 'someone-else' }, 'audience'],
    [{ nonce: 'other' }, 'nonce'],
    [{ iss: 'https://evil.com' }, 'issuer'],
    [{ exp: now() - 3600 }, 'expired'],
  ]) {
    g = await googleToken(google(over));
    assert.equal((await checkIdToken(g.token, opts(g.keys))).error, err, JSON.stringify(over));
  }
  // A Workspace whose primary domain differs from the email domain, when configured.
  g = await googleToken(google({ hd: 'yondr-group.com' }));
  assert.equal((await checkIdToken(g.token, { ...opts(g.keys), workspaces: ['yondr-group.com'] })).email, 'sam@overyondr.com');
  assert.equal((await checkIdToken(g.token, opts(g.keys))).error, 'domain');
  const a = await googleToken(google());
  const b = await googleToken(google());
  assert.equal((await checkIdToken(a.token, opts(b.keys))).error, 'signature', 'signed by a different key');
});
