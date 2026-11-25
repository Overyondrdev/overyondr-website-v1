// The app's files, bundled into the Worker script (wrangler.toml [[rules]] import them as text / binary).
// Served by the Worker rather than Workers static assets so a deploy is one script upload.
import indexHtml from '../public/index.html';
import appCss from '../public/app.css';
import appJs from '../public/app.js';
import logoGreen from '../public/brand/yondr-dark-green.svg';
import logoWhite from '../public/brand/yondr-off-white.svg';
import fraunces400 from '../public/brand/fonts/fraunces-latin-400-normal.woff2';
import fraunces500 from '../public/brand/fonts/fraunces-latin-500-normal.woff2';
import inter400 from '../public/brand/fonts/inter-tight-latin-400-normal.woff2';
import inter600 from '../public/brand/fonts/inter-tight-latin-600-normal.woff2';
import inter700 from '../public/brand/fonts/inter-tight-latin-700-normal.woff2';
import oflFraunces from '../public/brand/fonts/OFL-Fraunces.txt';
import oflInter from '../public/brand/fonts/OFL-InterTight.txt';

type File = { body: string | ArrayBuffer; type: string; cache: string };
const page = 'no-cache';           // HTML, CSS and JS change with each deploy
const year = 'private, max-age=31536000, immutable';
const day = 'private, max-age=86400';

export const STATIC: Record<string, File> = {
  '/': { body: indexHtml, type: 'text/html; charset=utf-8', cache: page },
  '/app.css': { body: appCss, type: 'text/css; charset=utf-8', cache: page },
  '/app.js': { body: appJs, type: 'text/javascript; charset=utf-8', cache: page },
  '/brand/yondr-dark-green.svg': { body: logoGreen, type: 'image/svg+xml', cache: day },
  '/brand/yondr-off-white.svg': { body: logoWhite, type: 'image/svg+xml', cache: day },
  '/brand/fonts/fraunces-latin-400-normal.woff2': { body: fraunces400, type: 'font/woff2', cache: year },
  '/brand/fonts/fraunces-latin-500-normal.woff2': { body: fraunces500, type: 'font/woff2', cache: year },
  '/brand/fonts/inter-tight-latin-400-normal.woff2': { body: inter400, type: 'font/woff2', cache: year },
  '/brand/fonts/inter-tight-latin-600-normal.woff2': { body: inter600, type: 'font/woff2', cache: year },
  '/brand/fonts/inter-tight-latin-700-normal.woff2': { body: inter700, type: 'font/woff2', cache: year },
  '/brand/fonts/OFL-Fraunces.txt': { body: oflFraunces, type: 'text/plain; charset=utf-8', cache: day },
  '/brand/fonts/OFL-InterTight.txt': { body: oflInter, type: 'text/plain; charset=utf-8', cache: day },
};

export function serveStatic(path: string): Response {
  const f = STATIC[path === '/index.html' ? '/' : path];
  const headers = { 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };
  if (!f) return new Response('Not found', { status: 404, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(f.body, { headers: { ...headers, 'content-type': f.type, 'cache-control': f.cache } });
}
