// Routes requests by hostname; all content is static assets in dist/.
//   overyondrdev.com, www.  -> portal page (V1 / V2 buttons)
//   v2.overyondrdev.com     -> NOT here: V2 is its own Worker (repo Overyondrdev/overyondr-website-v2)
//   anything else (v1.overyondrdev.com, and overyondr.com after cutover) -> the V1 site
import site from '../v1/site.json';
import { loginUrl, yondrUser } from './yondr-session.js';

// The feedback tool is its own Worker (repo Overyondrdev/yondr-feedback, feedback.overyondrdev.com). This site only
// embeds its script and sends the old dashboard address there.
const FEEDBACK = 'https://feedback.overyondrdev.com';

// Who is signed in: the Yondr Google sign-in session. DEV_EMAIL (.dev.vars, local only) is honoured on localhost only.
async function currentUser(request, env) {
  if (env.DEV_EMAIL && /^(localhost|127\.0\.0\.1)$/.test(new URL(request.url).hostname)) return { email: env.DEV_EMAIL };
  return yondrUser(request, env);
}

const PORTAL_HOSTS = new Set(['overyondrdev.com', 'www.overyondrdev.com']);
const SHARED_ASSET = /^\/(css|fonts|js|images|brand|_astro)\//;

// Portal pages: show who is signed in. (The dashboard link is revealed in the page for admins; see Portal.astro.)
async function portalPage(env, request, path) {
  const res = await serve(env, request, path);
  const user = await currentUser(request, env).catch(() => null);
  const email = user && user.email;
  if (!email) return res;
  return new HTMLRewriter()
    .on('[data-user-email]', { element(el) { el.setInnerContent(email); } })
    .on('[data-who]', { element(el) { el.removeAttribute('data-anon'); } })
    .transform(res);
}

function serve(env, request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  return env.ASSETS.fetch(new Request(url, request));
}


// Squarespace served some pages only via query strings (blog authors, older-posts pages, RSS).
function queryRoute(url) {
  if (!url.search) return site.queryRoutes[url.pathname] || null; // e.g. /blog/tag/Yondr
  const exact = site.queryRoutes[url.pathname + url.search];
  if (exact) return exact;
  const wanted = [...url.searchParams].sort().join('&');
  for (const [from, to] of Object.entries(site.queryRoutes)) {
    const u = new URL(from, url);
    if (u.pathname === url.pathname && [...u.searchParams].sort().join('&') === wanted) return to;
  }
  return null;
}

// Feedback widget (with the website preview toolbar and tour): injected into every HTML page on the dev domains only
// (never on overyondr.com).
const DEV_HOST = /(^|\.)overyondrdev\.com$|^(127\.0\.0\.1|localhost)$/;
function withWidget(res, host) {
  const type = res.headers.get('content-type') || '';
  if (!DEV_HOST.test(host) || !type.includes('text/html')) return res;
  const project = PORTAL_HOSTS.has(host) ? 'portal' : 'v1';
  const tag = `<script src="${FEEDBACK}/widget.js" data-project="${project}" data-toolbar="website" defer></script>`;
  return new HTMLRewriter()
    .on('body', { element(el) { el.append(tag, { html: true }); } })
    .transform(res);
}

async function route(request, env) {
  const url = new URL(request.url);
  const host = url.hostname;

  if (PORTAL_HOSTS.has(host)) {
    if (url.pathname === '/') return portalPage(env, request, '/portal');
    if (url.pathname === '/admin' || url.pathname === '/admin/') return Response.redirect(FEEDBACK + '/admin', 301);
    if (SHARED_ASSET.test(url.pathname)) return env.ASSETS.fetch(request);
    return Response.redirect(new URL('/', url), 302);
  }

  // V1 site
  if (/^\/(portal|admin|__q\/)/.test(url.pathname)) return serve(env, request, '/__not_found__');
  const routed = queryRoute(url);
  if (routed) {
    const res = await serve(env, request, routed);
    if (routed.endsWith('.xml')) {
      const out = new Response(res.body, res);
      out.headers.set('Content-Type', 'application/rss+xml; charset=utf-8');
      return out;
    }
    return res;
  }
  return env.ASSETS.fetch(request);
}

// Security headers on every response this Worker returns: pages, static files, query-string pages, portal, redirects
// and the sign-in 302/401. Set only when absent, so a stricter header from the asset wins.
// - HSTS without includeSubDomains/preload: this Worker serves overyondr.com at cutover, and we must not commit
//   subdomains we don't run (Squarespace, HubSpot, shop) to HTTPS-only.
// - Permissions-Policy leaves display-capture at its default ('self'): the feedback widget runs in the page and
//   takes screenshots with getDisplayMedia.
// - CSP is report-only (violations show in the browser console; no report endpoint) on V1 and the portal: V1 is the
//   Squarespace page HTML with inline scripts/styles and HubSpot, Vimeo, YouTube, Elfsight and Shopify embeds, and an
//   enforced policy could silently break one. Enforce after the cutover review (docs/OPERATIONS.md, risk register).
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://feedback.overyondrdev.com https://js.hsforms.net https://*.hsforms.net " +
    'https://*.hsforms.com https://*.hubspot.com https://*.hs-scripts.com https://*.hscollectedforms.net ' +
    'https://static.elfsight.com https://*.elfsight.com https://*.elfsightcdn.com https://player.vimeo.com ' +
    'https://www.youtube.com',
  "style-src 'self' 'unsafe-inline' https://feedback.overyondrdev.com https://*.elfsight.com https://*.elfsightcdn.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://feedback.overyondrdev.com https://*.elfsightcdn.com",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://feedback.overyondrdev.com https://*.hsforms.com https://*.hsforms.net https://*.hubspot.com " +
    'https://*.hubapi.com https://*.hscollectedforms.net https://*.elfsight.com https://*.elfsightcdn.com',
  'frame-src https://player.vimeo.com https://www.youtube.com https://www.youtube-nocookie.com https://*.hsforms.net ' +
    'https://*.hsforms.com https://*.hubspot.com https://*.elfsight.com https://*.myshopify.com',
  "form-action 'self' https://*.hsforms.com https://*.hubspot.com https://*.myshopify.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

function withSecurityHeaders(res, host) {
  const out = new Response(res.body, res); // Response.redirect() and asset responses have immutable headers
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  const type = out.headers.get('content-type') || '';
  if (type.includes('text/html') && !out.headers.has('Content-Security-Policy-Report-Only'))
    out.headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
  return out;
}

// Every overyondrdev.com page needs a Yondr sign-in (Google, @overyondr.com only). overyondr.com itself (after
// cutover) stays public, so only these hosts are gated.
const SIGNIN_HOST = /(^|\.)overyondrdev\.com$/;

export default {
  async fetch(request, env) {
    return withSecurityHeaders(await handle(request, env), new URL(request.url).hostname);
  },
};

async function handle(request, env) {
  const host = new URL(request.url).hostname;
  if (SIGNIN_HOST.test(host) && !(await currentUser(request, env).catch(() => null))) {
    if (request.method === 'GET' || request.method === 'HEAD')
      return new Response(null, { status: 302, headers: { location: loginUrl(request), 'cache-control': 'no-store' } });
    return new Response(JSON.stringify({ error: 'Please sign in with your Yondr Google account.' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const res = await route(request, env);
  return withWidget(res, new URL(request.url).hostname);
}
