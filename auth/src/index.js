// yondr-auth: one Google sign-in for every *.overyondrdev.com site, at https://auth.overyondrdev.com.
// Replaces Cloudflare Access logins (which cost a Zero Trust seat per person) with Google OAuth/OpenID Connect.
//
//   /login?return=<url>   the sign-in page: says where you're going and what happens (src/pages.js)
//   /login/google?return=<url>  start Google sign-in (Authorization Code flow with PKCE, state and nonce)
//   /callback             Google returns here: the ID token is verified and the person must be a verified
//                         @overyondr.com Google Workspace account (hd claim + email domain)
//   /logout?return=<url>  end the session on every overyondrdev.com site
//   /.well-known/jwks.json  the public key sites use to check sessions (also set as YONDR_AUTH_PUBLIC_JWK)
//
// The session is an ES256-signed token in a cookie for .overyondrdev.com (HttpOnly, Secure, SameSite=Lax), checked
// by each site with src/session.js. Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_PRIVATE_JWK.

import { decode, randomString, sha256b64u, signES256, verifySignature } from './jwt.js';
import { AUTH_ORIGIN, SESSION_AUDIENCE, SESSION_COOKIE, SESSION_ISSUER, verifySession } from './session.js';
import { messagePage, signInPage } from './pages.js';

const FLOW_COOKIE = 'yondr_auth_flow';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

let googleKeys = null;
let googleKeysAt = 0;

const domains = (env) =>
  String(env.ALLOWED_EMAIL_DOMAINS || 'overyondr.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
// The Google Workspace organization(s) whose accounts may sign in (Google's `hd` claim). Defaults to the email domains.
const workspaces = (env) =>
  String(env.ALLOWED_WORKSPACE_DOMAINS || env.ALLOWED_EMAIL_DOMAINS || 'overyondr.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
const siteDomain = (env) => String(env.SITE_DOMAIN || 'overyondrdev.com').toLowerCase();

/** Only send people back to https pages on overyondrdev.com (no open redirects). */
export function safeReturn(value, env) {
  const fallback = `https://${siteDomain(env)}/`;
  try {
    const u = new URL(value || fallback);
    const d = siteDomain(env);
    if (u.protocol !== 'https:' || u.username || u.password) return fallback;
    if (u.hostname !== d && !u.hostname.endsWith('.' + d)) return fallback;
    if (u.hostname === new URL(AUTH_ORIGIN).hostname && /^\/(login|callback)/.test(u.pathname)) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

function cookie(name, value, { maxAge, path = '/', domain } = {}) {
  return [`${name}=${value}`, `Path=${path}`, domain ? `Domain=${domain}` : '', 'HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${maxAge}`]
    .filter(Boolean)
    .join('; ');
}
function readCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
const privateKey = (env) => JSON.parse(env.SESSION_PRIVATE_JWK);
function publicJwk(env) {
  const { kty, crv, x, y, kid } = privateKey(env);
  return { kty, crv, x, y, kid, alg: 'ES256', use: 'sig' };
}

async function googleCerts(force = false) {
  if (!force && googleKeys && Date.now() - googleKeysAt < 3600_000) return googleKeys;
  const res = await fetch(GOOGLE_CERTS);
  if (!res.ok) throw new Error('google certs ' + res.status);
  googleKeys = (await res.json()).keys || [];
  googleKeysAt = Date.now();
  return googleKeys;
}

/** Check Google's ID token: signature, issuer, audience, expiry, nonce, verified Yondr Workspace email. */
export async function checkIdToken(idToken, { clientId, nonce, allowed, workspaces: hds = allowed, keys }) {
  let claims = await verifySignature(idToken, keys || (await googleCerts()), 'RS256');
  if (!claims && !keys) claims = await verifySignature(idToken, await googleCerts(true), 'RS256'); // keys rotated
  if (!claims) return { error: 'signature' };
  const now = Date.now() / 1000;
  if (!GOOGLE_ISSUERS.includes(claims.iss)) return { error: 'issuer' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) return { error: 'audience' };
  if (!claims.exp || claims.exp < now - 60) return { error: 'expired' };
  if (!nonce || claims.nonce !== nonce) return { error: 'nonce' };
  const email = String(claims.email || '').toLowerCase();
  const domain = email.slice(email.lastIndexOf('@') + 1);
  // Both checks: hd is set only for Google Workspace accounts of that organization, and the email must match.
  if (claims.email_verified !== true || !hds.includes(String(claims.hd || '').toLowerCase()) || !allowed.includes(domain)) {
    return { error: 'domain', email, hd: claims.hd || null };
  }
  return { email, name: claims.name || null, sub: claims.sub };
}

// ---------------------------------------------------------------- pages (markup in src/pages.js)
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
};
function html(body, status = 200, extra = {}) {
  const h = new Headers(HEADERS);
  for (const [k, v] of Object.entries(extra)) h.append(k, v);
  return new Response(body, { status, headers: h });
}
const hoursOf = (env) => Math.min(Math.max(Number(env.SESSION_HOURS) || 12, 1), 24 * 7);
function signIn(env, ret, opts = {}, status = 200, extra = {}) {
  return html(signInPage({ ret, domain: domains(env)[0], hours: hoursOf(env), ...opts }), status, extra);
}
async function currentSession(request, env) {
  if (!env.SESSION_PRIVATE_JWK) return null;
  return verifySession(readCookie(request, SESSION_COOKIE), { ...env, YONDR_AUTH_PUBLIC_JWK: JSON.stringify(publicJwk(env)) });
}

function redirect(location, cookies = []) {
  const h = new Headers({ location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}

// ---------------------------------------------------------------- flow
/** The page before Google. Already signed in? Straight back to where you were going. */
async function showLogin(request, env, url) {
  const ret = safeReturn(url.searchParams.get('return'), env);
  if (await currentSession(request, env)) return redirect(ret);
  return signIn(env, ret);
}

async function startGoogle(request, env, url) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_PRIVATE_JWK) {
    return html(messagePage({ title: 'Sign-in not set up', heading: 'Sign-in isn’t set up yet', html: 'Ask the web team to finish the Google sign-in setup.' }), 503);
  }
  const ret = safeReturn(url.searchParams.get('return'), env);
  const state = randomString(24);
  const nonce = randomString(24);
  const verifier = randomString(48);
  const now = Math.floor(Date.now() / 1000);
  const flow = await signES256({ typ: 'flow', state, nonce, v: verifier, r: ret, iat: now, exp: now + 600 }, privateKey(env));
  const g = new URL(GOOGLE_AUTH);
  g.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${AUTH_ORIGIN}/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: await sha256b64u(verifier),
    code_challenge_method: 'S256',
    hd: workspaces(env)[0],
    ...(url.searchParams.get('switch') ? { prompt: 'select_account' } : {}),
  }).toString();
  return redirect(g.toString(), [cookie(FLOW_COOKIE, flow, { maxAge: 600, path: '/callback' })]);
}

async function callback(request, env, url) {
  const clearFlow = cookie(FLOW_COOKIE, '', { maxAge: 0, path: '/callback' });
  const flowToken = readCookie(request, FLOW_COOKIE);
  const flow = flowToken ? await verifySignature(flowToken, [publicJwk(env)], 'ES256') : null;
  const home = `https://${siteDomain(env)}/`;
  if (!flow || flow.typ !== 'flow' || flow.exp < Date.now() / 1000) {
    return signIn(env, home, { heading: 'Let’s try that again', notice: { tone: 'bad', html: 'The sign-in took too long or was started in another tab. Please continue again.' } }, 400, { 'set-cookie': clearFlow });
  }
  if (url.searchParams.get('error')) {
    return signIn(env, flow.r, { heading: 'Sign-in cancelled', notice: { tone: 'bad', html: 'Google sign-in was cancelled. Continue with your Yondr Google account when you’re ready.' } }, 400, { 'set-cookie': clearFlow });
  }
  if (url.searchParams.get('state') !== flow.state || !url.searchParams.get('code')) {
    return signIn(env, flow.r, { heading: 'Let’s try that again', notice: { tone: 'bad', html: 'Something didn’t match. Please continue again.' } }, 400, { 'set-cookie': clearFlow });
  }
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code'),
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${AUTH_ORIGIN}/callback`,
      grant_type: 'authorization_code',
      code_verifier: flow.v,
    }),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.id_token) {
    console.error('google token', tokenRes.status, tokens.error);
    return signIn(env, flow.r, { heading: 'Let’s try that again', notice: { tone: 'bad', html: 'Google didn’t finish signing you in. Please continue again.' } }, 502, { 'set-cookie': clearFlow });
  }
  const who = await checkIdToken(tokens.id_token, { clientId: env.GOOGLE_CLIENT_ID, nonce: flow.nonce, allowed: domains(env), workspaces: workspaces(env) });
  if (who.error) {
    // Logged without the person's name; `hd` shows which Workspace an account belongs to, if a setting needs fixing.
    console.warn('sign-in refused', who.error, who.email ? who.email.replace(/^[^@]*/, '***') : '', 'hd=' + (who.hd || 'none'));
    const wrongAccount = who.error === 'domain';
    return signIn(
      env,
      flow.r,
      {
        heading: wrongAccount ? 'Use your Yondr account' : 'Let’s try that again',
        switchAccount: wrongAccount,
        notice: {
          tone: 'bad',
          html: wrongAccount
            ? `${who.email ? `You signed in to Google as <b>${esc(who.email)}</b>. ` : ''}Only @${esc(domains(env)[0])} Google accounts can use Yondr’s preview sites. Choose your Yondr account instead.`
            : 'We couldn’t confirm your sign-in with Google. Please continue again.',
        },
      },
      403,
      { 'set-cookie': clearFlow },
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const hours = hoursOf(env);
  const session = await signES256(
    { typ: 'session', iss: SESSION_ISSUER, aud: SESSION_AUDIENCE, sub: who.sub, email: who.email, name: who.name, iat: now, nbf: now - 30, exp: now + hours * 3600 },
    privateKey(env),
  );
  console.log('signed in', who.email.replace(/^[^@]*/, '***'));
  return redirect(flow.r, [clearFlow, cookie(SESSION_COOKIE, session, { maxAge: hours * 3600, domain: siteDomain(env) })]);
}

function logout(env, url) {
  const ret = safeReturn(url.searchParams.get('return'), env);
  return signIn(env, ret, { heading: 'You’re signed out', notice: { tone: 'ok', html: 'You’ve been signed out of every Yondr preview site on overyondrdev.com.' } }, 200, {
    'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, domain: siteDomain(env) }),
  });
}

async function home(request, env) {
  const site = `https://${siteDomain(env)}/`;
  const user = await currentSession(request, env);
  if (!user) return signIn(env, site);
  return html(
    messagePage({
      title: 'Signed in',
      heading: 'You’re signed in',
      html: `as <b>${esc(user.email)}</b>. <a href="/logout">Sign out</a>`,
      button: { href: site, label: 'Go to overyondrdev.com' },
    }),
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      switch (url.pathname) {
        case '/':
          return await home(request, env);
        case '/login':
          return await showLogin(request, env, url);
        case '/login/google':
          return await startGoogle(request, env, url);
        case '/callback':
          return await callback(request, env, url);
        case '/logout':
          return logout(env, url);
        case '/.well-known/jwks.json':
          return new Response(JSON.stringify({ keys: env.SESSION_PRIVATE_JWK ? [publicJwk(env)] : [] }), {
            headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
          });
        default:
          return html(messagePage({ title: 'Not found', heading: 'Page not found', html: 'This address isn’t part of the Yondr sign-in.', button: { href: `https://${siteDomain(env)}/`, label: 'Go to overyondrdev.com' } }), 404);
      }
    } catch (e) {
      console.error('auth error', url.pathname, e);
      return html(messagePage({ title: 'Something went wrong', heading: 'Something went wrong', html: 'Please try again in a moment.' }), 500);
    }
  },
};

export { decode };
