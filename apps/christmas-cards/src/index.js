// Yondr Christmas cards (cards.overyondrdev.com). Behind Cloudflare Access like all of overyondrdev.com.
//   /        the staff page: add clients one by one or upload a list, see and edit your own
//   /admin   the card team's view: everyone's clients, who added them, export, settings
//   /api/*   JSON API (src/api.js)
import { handleApi } from './api.js';
import FILES from './static.generated.js';

const PAGES = { '/': '/index.html', '/admin': '/admin.html', '/admin/': '/admin.html' };
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
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let res;
    if (url.pathname.startsWith('/api/')) res = await handleApi(request, env, url.pathname.slice(5));
    else {
      res = serveStatic(request, url.pathname);
      if (!res) return Response.redirect(new URL('/', url), 302);
    }
    return withHeaders(res);
  },
};
