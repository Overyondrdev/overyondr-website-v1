// Yondr Christmas cards (cards.overyondrdev.com). Behind Cloudflare Access like all of overyondrdev.com.
//   /        the staff page: add clients one by one or upload a list, see and edit your own
//   /admin   the card team's view: everyone's clients, who added them, export, settings
//   /signin  email + one-time code sign-in (src/signin.js), used when Cloudflare Access isn't in front
//   /api/*   JSON API (src/api.js)
import { handleApi } from './api.js';
import { handleSignin } from './signin.js';
import { currentUser } from './auth.js';
import FILES from './static.generated.js';

const PAGES = { '/': '/index.html', '/admin': '/admin.html', '/admin/': '/admin.html', '/signin': '/signin.html' };
const PROTECTED = new Set(['/', '/admin', '/admin/', '/index.html', '/admin.html']);
const bytes = new Map();
function serveStatic(request, path) {
  const f = FILES[PAGES[path] || path];
  if (!f) return null;
  const headers = { 'content-type': f.type, etag: `"${f.etag}"`,
    'cache-control': f.type.startsWith('text/html') ? 'no-cache' : f.type.startsWith('font/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300' };
  if (request.headers.get('if-none-match') === headers.etag) return new Response(null, { status: 304, headers });
  if (!bytes.has(f.etag)) bytes.set(f.etag, Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)));
  return new Response(request.method === 'HEAD' ? null : bytes.get(f.etag), { headers });
}

const SECURITY = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function withHeaders(res) {
  const out = new Response(res.body, res); // copy: redirect responses have immutable headers
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let res;
    if (url.pathname.startsWith('/api/signin/')) res = await handleSignin(request, env, url.pathname.slice(12));
    else if (url.pathname.startsWith('/api/')) res = await handleApi(request, env, url.pathname.slice(5));
    else if (PROTECTED.has(url.pathname) && !(await currentUser(request, env))) {
      // Not signed in: show the sign-in page, then come back here.
      const next = url.pathname === '/' ? '' : '?next=' + encodeURIComponent(url.pathname);
      return withHeaders(Response.redirect(new URL('/signin' + next, url), 302));
    } else if (url.pathname === '/signin' && (await currentUser(request, env))) {
      const next = url.searchParams.get('next');
      return Response.redirect(new URL(next && /^\/[a-z]*$/.test(next) ? next : '/', url), 302);
    } else {
      res = serveStatic(request, url.pathname);
      if (!res) return Response.redirect(new URL('/', url), 302);
    }
    return withHeaders(res);
  },
};
