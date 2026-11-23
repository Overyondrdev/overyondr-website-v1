// Copies the V2 build (v2/dist) into dist/__v2 so one Worker serves both sites.
// The Worker maps every request on v2.overyondrdev.com to /__v2/<path> (see src/worker/index.js).
// Cloudflare only reads _redirects/_headers at the assets root, so V2's are converted to
// dist/__v2/__routes.json, which the Worker applies itself for the V2 host.
import { cp, rm, readFile, writeFile, access } from 'node:fs/promises';

const SRC = 'v2/dist';
const DEST = 'dist/__v2';

await access(SRC).catch(() => { throw new Error('v2/dist not found — run the V2 build first'); });
await rm(DEST, { recursive: true, force: true });
await cp(SRC, DEST, { recursive: true });

async function read(file) {
  try { return await readFile(`${DEST}/${file}`, 'utf8'); } catch { return ''; }
}

// _redirects: "<from> <to> [status]"; a trailing * in <from> becomes :splat in <to>.
const redirects = (await read('_redirects')).split('\n')
  .map((l) => l.replace(/#.*/, '').trim()).filter(Boolean)
  .map((l) => { const [from, to, status] = l.split(/\s+/); return { from, to, status: Number(status) || 301 }; });

// _headers: a URL pattern line, then indented "Name: value" lines.
const headers = [];
for (const line of (await read('_headers')).split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (/^\s/.test(line)) {
    const i = line.indexOf(':');
    if (headers.length && i > 0) headers[headers.length - 1].set[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  } else headers.push({ pattern: line.trim(), set: {} });
}

await rm(`${DEST}/_redirects`, { force: true });
await rm(`${DEST}/_headers`, { force: true });
await writeFile(`${DEST}/__routes.json`, JSON.stringify({ redirects, headers }, null, 1));
console.log(`V2 merged into ${DEST}: ${redirects.length} redirects, ${headers.length} header rules`);
