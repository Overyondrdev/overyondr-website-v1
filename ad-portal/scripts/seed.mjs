// Loads the generated ads (seed/, from generator/render.mjs) into the portal:
// uploads every file to R2 (yondr-ad-portal-assets) and records the set, ads and source images in D1.
//
//   node scripts/seed.mjs --local  [--by you@overyondr.com]     # local wrangler dev storage
//   node scripts/seed.mjs --remote [--by you@overyondr.com]     # production (needs Cloudflare credentials)
//   add --skip-files to only rewrite the D1 records
//
// Safe to re-run: files are replaced, and records keep their status, title, dates, reviews and comments.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const has = (f) => process.argv.includes('--' + f);
const arg = (f) => { const i = process.argv.indexOf('--' + f); return i > 0 ? process.argv[i + 1] : null; };
const where = has('remote') ? '--remote' : has('local') ? '--local' : null;
if (!where) { console.error('Pass --local or --remote.'); process.exit(1); }
let by = arg('by') || process.env.SEED_BY;
if (!by) { try { by = execFileSync('git', ['config', 'user.email']).toString().trim(); } catch { /* none */ } }
if (!by) { console.error('Pass --by you@overyondr.com (recorded as uploaded_by).'); process.exit(1); }

const m = JSON.parse(readFileSync(join(root, 'seed/manifest.json'), 'utf8'));
const c = JSON.parse(readFileSync(join(root, 'generator/campaign.json'), 'utf8'));
const BUCKET = 'yondr-ad-portal-assets';
const DB = 'yondr-ad-portal-db';
const TYPE = { jpg: 'image/jpeg', gif: 'image/gif', png: 'image/png', webp: 'image/webp' };
const key = (file) => `sets/${m.id}/${file}`;
const wrangler = (args) => execFileSync('npx', ['wrangler', '-c', 'wrangler.toml', ...args], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });

const files = [...m.creatives.map((x) => x.file), ...(m.sources || []).map((s) => s.file)];
if (!has('skip-files')) {
  files.forEach((f, i) => {
    process.stdout.write(`\r  R2 ${i + 1}/${files.length} ${f.padEnd(60)}`);
    wrangler(['r2', 'object', 'put', `${BUCKET}/${key(f)}`, '--file', join(root, 'seed', f), '--content-type', TYPE[f.split('.').pop()], where]);
  });
  console.log(`\nUploaded ${files.length} files to R2 (${where.slice(2)}).`);
}

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const ts = m.generated || new Date().toISOString();
const copy = { headlines: c.headlines.map(({ id, text, desc }) => ({ id, text, desc })), longHeadline: c.longHeadline, cta: c.cta,
  stat: c.stat, source: c.source, sizes: c.sizes, concepts: c.concepts };
const sql = [
  `INSERT INTO ad_sets (id, name, summary, study_url, release_url, copy, created_by, created_at, updated_at)
   VALUES (${[m.id, m.name, m.summary, m.studyUrl, m.releaseUrl, JSON.stringify(copy), by, ts, ts].map(q).join(', ')})
   ON CONFLICT(id) DO UPDATE SET name = excluded.name, summary = excluded.summary, study_url = excluded.study_url,
     release_url = excluded.release_url, copy = excluded.copy, updated_at = excluded.updated_at;`,
  ...m.creatives.map((x) => {
    const meta = { headlineId: x.headline, desc: x.desc, size: x.size, sizeName: x.sizeName, duration: x.duration, frames: x.frames, generated: true };
    const title = `${x.headlineText} · ${x.conceptName} · ${x.w}×${x.h}`;
    const ext = x.file.split('.').pop();
    return `INSERT INTO ads (id, set_id, title, headline, variant, kind, format, width, height, bytes, r2_key, content_type, status, meta, uploaded_by, created_at, updated_at)
   VALUES (${[x.id, m.id, title, x.headlineText, x.concept, x.kind, x.format, x.w, x.h, x.bytes, key(x.file), TYPE[ext], 'in_review', JSON.stringify(meta), by, ts, ts].map(q).join(', ')})
   ON CONFLICT(id) DO UPDATE SET width = excluded.width, height = excluded.height, bytes = excluded.bytes, r2_key = excluded.r2_key,
     content_type = excluded.content_type, format = excluded.format, kind = excluded.kind, meta = excluded.meta, updated_at = excluded.updated_at;`;
  }),
  ...(m.sources || []).map((s) => {
    const ext = s.file.split('.').pop();
    const bytes = readFileSync(join(root, 'seed', s.file)).length;
    return `INSERT INTO set_files (r2_key, set_id, name, alt, content_type, bytes, uploaded_by, created_at)
   VALUES (${[key(s.file), m.id, s.name, s.alt, TYPE[ext], bytes, by, ts].map(q).join(', ')})
   ON CONFLICT(r2_key) DO UPDATE SET name = excluded.name, alt = excluded.alt, bytes = excluded.bytes;`;
  }),
];
const sqlFile = join(root, 'seed/seed.sql');
writeFileSync(sqlFile, sql.join('\n') + '\n');
wrangler(['d1', 'execute', DB, '--file', sqlFile, where, '--yes']);
console.log(`Recorded 1 set, ${m.creatives.length} ads and ${(m.sources || []).length} source files in D1 (${where.slice(2)}).`);
