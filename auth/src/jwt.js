// Minimal JWT helpers on WebCrypto: ES256 for our session tokens, RS256 to verify Google's ID tokens.
// No dependencies, so the same code runs in Workers and in Node's test runner.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64u(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const json64 = (o) => b64u(enc.encode(JSON.stringify(o)));

/** Split and decode a compact JWT without verifying it. */
export function decode(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    return { header: JSON.parse(dec.decode(unb64u(parts[0]))), payload: JSON.parse(dec.decode(unb64u(parts[1]))), parts };
  } catch {
    return null;
  }
}

/** Sign a payload with an ES256 private JWK (object). */
export async function signES256(payload, privateJwk) {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = json64({ alg: 'ES256', typ: 'JWT', kid: privateJwk.kid });
  const body = json64(payload);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

/** Verify a JWT signature against a list of public JWKs (by kid). Returns the payload or null. */
export async function verifySignature(token, jwks, alg) {
  const d = decode(token);
  if (!d || d.header.alg !== alg) return null;
  const jwk = jwks.find((k) => !d.header.kid || k.kid === d.header.kid);
  if (!jwk) return null;
  const algo = alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: undefined, use: undefined, key_ops: undefined }, algo, false, ['verify']);
  const ok = await crypto.subtle.verify(
    alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5',
    key,
    unb64u(d.parts[2]),
    enc.encode(`${d.parts[0]}.${d.parts[1]}`),
  );
  return ok ? d.payload : null;
}

export async function sha256b64u(s) {
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
export function randomString(bytes = 32) {
  return b64u(crypto.getRandomValues(new Uint8Array(bytes)));
}
