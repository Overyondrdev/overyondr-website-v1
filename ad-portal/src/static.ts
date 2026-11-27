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
import renderJs from '../public/render.js';
import editorJs from '../public/editor.js';
import tourJs from '../public/tour.js';
import helpHtml from '../public/help.html';
import helpCss from '../public/help.css';
import helpJs from '../public/help.js';
import helpContentJs from '../public/help-content.js';
import adTemplate from '../generator/ad.html';
import tplFraunces from '../generator/fonts/fraunces-soft.woff2';
import tplInstrument from '../generator/fonts/instrument-sans.woff2';

type File = { body: string | ArrayBuffer; type: string; cache: string };
const page = 'no-cache';           // HTML, CSS and JS change with each deploy
const year = 'private, max-age=31536000, immutable';
const day = 'private, max-age=86400';

export const STATIC: Record<string, File> = {
  '/': { body: indexHtml, type: 'text/html; charset=utf-8', cache: page },
  '/app.css': { body: appCss, type: 'text/css; charset=utf-8', cache: page },
  '/app.js': { body: appJs, type: 'text/javascript; charset=utf-8', cache: page },
  '/render.js': { body: renderJs, type: 'text/javascript; charset=utf-8', cache: page },
  '/editor.js': { body: editorJs, type: 'text/javascript; charset=utf-8', cache: page },
  '/tour.js': { body: tourJs, type: 'text/javascript; charset=utf-8', cache: page },
  // Help center: /help (articles in help-content.js).
  '/help': { body: helpHtml, type: 'text/html; charset=utf-8', cache: page },
  '/help.css': { body: helpCss, type: 'text/css; charset=utf-8', cache: page },
  '/help.js': { body: helpJs, type: 'text/javascript; charset=utf-8', cache: page },
  '/help-content.js': { body: helpContentJs, type: 'text/javascript; charset=utf-8', cache: page },
  // The ad template (same file as the offline generator) and its fonts, for re-rendering ads in the browser.
  '/render/ad.html': { body: adTemplate, type: 'text/html; charset=utf-8', cache: page },
  '/render/fonts/fraunces-soft.woff2': { body: tplFraunces, type: 'font/woff2', cache: year },
  '/render/fonts/instrument-sans.woff2': { body: tplInstrument, type: 'font/woff2', cache: year },
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
  const f = STATIC[path === '/index.html' ? '/' : path === '/help/' || path === '/help.html' ? '/help' : path];
  const headers = { 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };
  if (!f) return new Response('Not found', { status: 404, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(f.body, { headers: { ...headers, 'content-type': f.type, 'cache-control': f.cache } });
}
