// Safety net behind Cloudflare Access. Access signs people in at the edge and adds a signed token
// (Cf-Access-Jwt-Assertion) to every request it lets through. The Worker checks the token's signature against the
// Yondr team's signing keys, its issuer and its expiry, so if ads.overyondrdev.com were ever left out of Access, the
// portal would refuse requests instead of serving ads to anyone. It is not a second login: any app in the Yondr
// Access team may have issued the token, so tightening who gets in (e.g. marketing only) is done in Access itself.

interface AccessEnv { ACCESS_TEAM_DOMAIN?: string; DEV_EMAIL?: string }
interface Jwk extends JsonWebKey { kid?: string }

let keys: Jwk[] | null = null;
let keysAt = 0;

function b64url(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function certs(team: string): Promise<Jwk[]> {
  if (keys && Date.now() - keysAt < 3600_000) return keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Access certs ' + res.status);
  keys = ((await res.json()) as { keys?: Jwk[] }).keys || [];
  keysAt = Date.now();
  return keys;
}

// Returns the signed-in email, or null when the request didn't come through Access.
export async function accessEmail(request: Request, env: AccessEnv): Promise<string | null> {
  // Local development only (.dev.vars): sign in as DEV_EMAIL, or as X-Dev-Email to try other roles. Never set in production.
  if (env.DEV_EMAIL) return (request.headers.get('X-Dev-Email') || env.DEV_EMAIL).toLowerCase();
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN) return null;
  try {
    const [h, p, sig] = token.split('.');
    const header = JSON.parse(new TextDecoder().decode(b64url(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
    const jwk = (await certs(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload.email ? String(payload.email).toLowerCase() : null;
  } catch {
    return null;
  }
}
