// Copies the ad copy edited in the portal (D1 ad_sets.copy) into generator/campaign.json, so an offline
// re-render (generator/render.mjs) uses the same headlines, descriptions, CTA and tagline as the portal.
//   node scripts/pull-copy.mjs --remote   (or --local)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const where = process.argv.includes('--local') ? '--local' : '--remote';
const file = join(root, 'generator/campaign.json');
const c = JSON.parse(readFileSync(file, 'utf8'));
const out = execFileSync('npx', ['wrangler', '-c', 'wrangler.toml', 'd1', 'execute', 'yondr-ad-portal-db', where, '--json',
  '--command', `SELECT copy FROM ad_sets WHERE id = '${c.id.replace(/'/g, '')}'`], { cwd: root }).toString();
const row = JSON.parse(out)[0].results[0];
if (!row) { console.error('Set not found in D1: ' + c.id); process.exit(1); }
const p = JSON.parse(row.copy);
for (const k of ['eyebrow', 'cta', 'ctaShort', 'source', 'sourceShort', 'longHeadline', 'stat']) if (p[k] != null) c[k] = p[k];
c.headlines = c.headlines.map((h) => { const e = (p.headlines || []).find((x) => x.id === h.id); return e ? { ...h, text: e.text, desc: e.desc } : h; });
writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
console.log('Updated generator/campaign.json from the portal’s copy.');
