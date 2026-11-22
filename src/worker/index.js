// Routes requests by hostname; all content is static assets in dist/.
//   overyondrdev.com, www.  -> portal page (V1 / V2 buttons)
//   v2.overyondrdev.com     -> V2 placeholder
//   anything else (v1.overyondrdev.com, and overyondr.com after cutover) -> the V1 site
import site from '../v1/site.json';

const PORTAL_HOSTS = new Set(['overyondrdev.com', 'www.overyondrdev.com']);
const SHARED_ASSET = /^\/(css|fonts|js|images)\//;

function serve(env, request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  return env.ASSETS.fetch(new Request(url, request));
}

// Squarespace served some pages only via query strings (blog authors, older-posts pages, RSS).
function queryRoute(url) {
  if (!url.search) return null;
  const exact = site.queryRoutes[url.pathname + url.search];
  if (exact) return exact;
  const wanted = [...url.searchParams].sort().join('&');
  for (const [from, to] of Object.entries(site.queryRoutes)) {
    const u = new URL(from, url);
    if (u.pathname === url.pathname && [...u.searchParams].sort().join('&') === wanted) return to;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname;

    if (PORTAL_HOSTS.has(host)) {
      if (url.pathname === '/') return serve(env, request, '/portal');
      if (SHARED_ASSET.test(url.pathname)) return env.ASSETS.fetch(request);
      return Response.redirect(new URL('/', url), 302);
    }
    if (host.startsWith('v2.')) {
      if (url.pathname === '/') return serve(env, request, '/portal-v2');
      if (SHARED_ASSET.test(url.pathname)) return env.ASSETS.fetch(request);
      return Response.redirect(new URL('/', url), 302);
    }

    // V1 site
    if (/^\/(portal|__q\/)/.test(url.pathname)) return serve(env, request, '/__not_found__');
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
  },
};
