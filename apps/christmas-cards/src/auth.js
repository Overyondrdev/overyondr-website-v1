// Identity comes from Cloudflare Access (every overyondrdev.com host is behind it).
// The Cf-Access-Jwt-Assertion header is verified against the team's signing keys and the app's AUD,
// so the email can't be spoofed. Local development (`wrangler dev`) may set DEV_EMAIL in .dev.vars.

let jwks = null;
let jwksAt = 0;

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function keys(team) {
  if (jwks && Date.now() - jwksAt < 3600_000) return jwks;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('certs ' + res.status);
  jwks = (await res.json()).keys || [];
  jwksAt = Date.now();
  return jwks;
}

async function verify(token, env) {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const jwk = (await keys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}

export async function currentUser(request, env) {
  // DEV_EMAIL is only ever set in a local .dev.vars file (never in wrangler.jsonc / production).
  if (env.DEV_EMAIL) return { email: env.DEV_EMAIL.toLowerCase() };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const payload = await verify(token, env);
    return payload && payload.email ? { email: String(payload.email).toLowerCase() } : null;
  } catch {
    return null;
  }
}

export async function roleOf(db, email) {
  const row = await db.prepare('SELECT role FROM admins WHERE email = ?').bind(email).first();
  return row ? row.role : null;
}
