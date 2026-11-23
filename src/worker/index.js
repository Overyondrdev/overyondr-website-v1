// Routes requests by hostname; all content is static assets in dist/.
//   overyondrdev.com, www.  -> portal page (V1 / V2 buttons)
//   v2.overyondrdev.com     -> V2 placeholder
//   anything else (v1.overyondrdev.com, and overyondr.com after cutover) -> the V1 site
import site from '../v1/site.json';
import { handleFeedbackApi } from './feedback/api.js';
import { currentUser, roleOf } from './feedback/auth.js';
import { ensureSchema } from './feedback/schema.js';

const PORTAL_HOSTS = new Set(['overyondrdev.com', 'www.overyondrdev.com']);
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
  if (host.startsWith('v2.')) {
    if (url.pathname === '/') return portalPage(env, request, '/portal-v2');
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

export default {
  async fetch(request, env) {
    const res = await route(request, env);
    const url = new URL(request.url);
    // The admin dashboard has its own feedback views, so no widget there.
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/__feedback/')) return res;
    return withWidget(res, url.hostname);
  },
};
