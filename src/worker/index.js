// Routes requests by hostname; all content is static assets in dist/.
//   overyondrdev.com, www.  -> portal page (V1 / V2 buttons) and /admin (feedback)
//   ads.overyondrdev.com    -> the ad library (src/pages/ads.astro, public/__ads, src/worker/ads)
//   v2.overyondrdev.com     -> the V2 redesign (built from v2/ into dist/__v2)
//   anything else (v1.overyondrdev.com, and overyondr.com after cutover) -> the V1 site
import site from '../v1/site.json';
import { handleFeedbackApi } from './feedback/api.js';
import { handleAdsApi } from './ads/api.js';
import { currentUser, roleOf } from './feedback/auth.js';
import { ensureSchema } from './feedback/schema.js';

const PORTAL_HOSTS = new Set(['overyondrdev.com', 'www.overyondrdev.com']);
const ADS_HOST = 'ads.overyondrdev.com';
const SHARED_ASSET = /^\/(css|fonts|js|images|brand|_astro)\//;

// Portal pages: show who is signed in (Cloudflare Access adds this header after login).
async function portalPage(env, request, path) {
  const res = await serve(env, request, path);
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!email) return res;
  let isAdmin = false;
  try {
    const user = env.DB && (await currentUser(request, env));
    if (user) { await ensureSchema(env.DB); isAdmin = !!(await roleOf(env.DB, user.email)); }
  } catch { /* the portal still works without the admin link */ }
  return new HTMLRewriter()
    .on('[data-user-email]', { element(el) { el.setInnerContent(email); } })
    .on('[data-who]', { element(el) { el.removeAttribute('data-anon'); } })
    .on('[data-admin-link]', { element(el) { if (isAdmin) el.removeAttribute('hidden'); } })
    .transform(res);
}

function serve(env, request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  return env.ASSETS.fetch(new Request(url, request));
}

// ---------------------------------------------------------------- V2 (served from dist/__v2)
const V2_PREFIX = '/__v2';
let v2Routes = null;
async function routesV2(env, request) {
  if (!v2Routes) {
    const res = await serve(env, request, V2_PREFIX + '/__routes.json');
    v2Routes = res.ok ? await res.json() : { redirects: [], headers: [] };
  }
  return v2Routes;
}
function patternToRegex(p) {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.*)').replace(/:[A-Za-z]\w*/g, '[^/.]+');
  return new RegExp('^' + esc + '$');
}
function redirectV2(routes, url) {
  for (const r of routes.redirects) {
    if (r.from.endsWith('*')) {
      const base = r.from.slice(0, -1);
      if (url.pathname.startsWith(base)) return { to: r.to.replace(':splat', url.pathname.slice(base.length)), status: r.status };
    } else if (r.from === url.pathname) return { to: r.to, status: r.status };
  }
  return null;
}
async function serveV2(request, env) {
  const url = new URL(request.url);
  if (/^\/brand\//.test(url.pathname)) return env.ASSETS.fetch(request);
  const routes = await routesV2(env, request);
  const hop = redirectV2(routes, url);
  if (hop) return Response.redirect(new URL(hop.to + (hop.to.includes('?') ? '' : url.search), url), hop.status);
  const path = url.pathname === '/' ? V2_PREFIX : V2_PREFIX + url.pathname;
  const target = new URL(url); target.pathname = path;
  let res = await env.ASSETS.fetch(new Request(target, request));
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    // Keep the internal /__v2 prefix out of redirects (e.g. trailing-slash normalisation).
    const loc = new URL(res.headers.get('location'), url);
    if (loc.pathname.startsWith(V2_PREFIX)) loc.pathname = loc.pathname.slice(V2_PREFIX.length) || '/';
    return Response.redirect(new URL(loc.pathname + loc.search, url), res.status);
  }
  if (res.status === 404) {
    const nf = await serve(env, request, V2_PREFIX + '/404');
    res = new Response(nf.body, { status: 404, headers: nf.headers });
  } else {
    res = new Response(res.body, res);
  }
  for (const rule of routes.headers) {
    const isUrl = /^https?:/.test(rule.pattern);
    const subject = isUrl ? 'https://' + url.hostname + url.pathname : url.pathname;
    const pattern = isUrl ? rule.pattern.replace(/^http:/, 'https:') : rule.pattern;
    if (patternToRegex(pattern).test(isUrl ? subject.replace(/^http:/, 'https:') : subject)) {
      for (const [k, v] of Object.entries(rule.set)) res.headers.set(k, v);
    }
  }
  return res;
}

// ---------------------------------------------------------------- Ad library (ads.overyondrdev.com)
// Page, API and ad files (public/__ads). Only on this host: never on the portal, V1, V2 or overyondr.com.
// Fail closed: even though Cloudflare Access guards the host, nothing is served without a verified sign-in,
// so the ads stay private if the host is ever left out of the Access application.
async function serveAds(request, env, url) {
  const user = await currentUser(request, env).catch(() => null);
  if (!user) {
    return new Response('Sign-in required. Open https://ads.overyondrdev.com/ and sign in with your @overyondr.com email.', {
      status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  }
  let res;
  if (url.pathname === '/' || url.pathname === '/index.html') res = await portalPage(env, request, '/ads');
  else if (url.pathname.startsWith('/__ads/api/')) res = await handleAdsApi(request, env, url.pathname.slice('/__ads/api/'.length));
  else if (url.pathname.startsWith('/__ads/') || SHARED_ASSET.test(url.pathname)) res = await env.ASSETS.fetch(request);
  else return Response.redirect(new URL('/', url), 302);
  res = new Response(res.body, res);
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
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

// Feedback widget: injected into every HTML page on the dev domains only (never on overyondr.com).
const DEV_HOST = /(^|\.)overyondrdev\.com$|^(127\.0\.0\.1|localhost)$/;
function withWidget(res, host) {
  const type = res.headers.get('content-type') || '';
  if (!DEV_HOST.test(host) || !type.includes('text/html')) return res;
  return new HTMLRewriter()
    .on('body', { element(el) { el.append('<script src="/__feedback/widget.js" defer></script>', { html: true }); } })
    .transform(res);
}

async function route(request, env) {
  const url = new URL(request.url);
  const host = url.hostname;

  if (url.pathname.startsWith('/__feedback/api/')) return handleFeedbackApi(request, env, url.pathname.slice('/__feedback/api/'.length));
  if (url.pathname.startsWith('/__feedback/')) return env.ASSETS.fetch(request);

  if (PORTAL_HOSTS.has(host)) {
    if (url.pathname === '/') return portalPage(env, request, '/portal');
    if (url.pathname === '/admin' || url.pathname === '/admin/') return portalPage(env, request, '/admin');
    if (SHARED_ASSET.test(url.pathname)) return env.ASSETS.fetch(request);
    return Response.redirect(new URL('/', url), 302);
  }
  if (host === ADS_HOST) return serveAds(request, env, url);
  if (host.startsWith('v2.')) return serveV2(request, env);

  // V1 site
  if (/^\/(portal|admin|__q\/|__v2|__ads\/|ads(\.html)?$)/.test(url.pathname)) return serve(env, request, '/__not_found__');
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

export default {
  async fetch(request, env) {
    const res = await route(request, env);
    const url = new URL(request.url);
    // The admin dashboard has its own feedback views, so no widget there.
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/__feedback/')) return res;
    return withWidget(res, url.hostname);
  },
};
