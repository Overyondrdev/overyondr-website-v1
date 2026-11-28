// Import the Yondr Team Contact List into the people directory from a file, with the same rules as the scheduled
// sync (src/directory.js): only name, email, title; rows without a valid @overyondr.com email skipped; the 20 % removal
// guard; leavers kept inactive. Used while the directory is fed by the owner's Google Sheets connection instead of
// the service account (README "People directory").
//
//   node scripts/import-directory.mjs rows.tsv current.json > bulk.json
//
// rows.tsv: the sheet's First, Last Name, E-Mail and Title columns, tab-separated, header first (other columns are
// ignored if present). current.json: the KV value of `directory:v1` and `directory:meta` as
// {"data": <directory:v1 or null>, "meta": <directory:meta or null>}. Output: a Cloudflare KV bulk-write body. Nothing
// is written if the guard trips or no valid rows are found (exit code 2, reason on stderr).
import fs from 'node:fs';
import { parseRows, merge, KV_DATA, KV_META, MAX_REMOVED_SHARE } from '../src/directory.js';

const [rowsFile, currentFile] = process.argv.slice(2);
if (!rowsFile || !currentFile) {
  console.error('usage: node scripts/import-directory.mjs rows.tsv current.json > bulk.json');
  process.exit(1);
}
const rows = fs.readFileSync(rowsFile, 'utf8').replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split('\t'));
const current = JSON.parse(fs.readFileSync(currentFile, 'utf8') || '{}');
const prev = (current.data && current.data.people) || [];
const meta = current.meta || {};
const now = new Date().toISOString();
const fail = (msg) => {
  console.error(msg);
  process.exit(2);
};
const { people, skipped } = parseRows(rows, ['overyondr.com']);
if (!people.length) fail('No rows with a valid @overyondr.com email; nothing changed.');
const m = merge(prev, people, now);
if (m.guard) fail(`Not applied: ${m.removed.length} people would be removed at once (limit ${MAX_REMOVED_SHARE * 100} %). Check the sheet's filters and sorting.`);
const changed = m.added.length + m.removed.length + m.changed.length;
const history = [{ at: now, added: m.added.length, removed: m.removed.length, changed: m.changed.length }, ...(meta.history || [])].slice(0, 30);
const nextMeta = {
  ...meta, source: 'owner-connector', ok: true, error: null, guard: false, last_attempt: now, last_ok: now,
  active: people.length, inactive: m.people.length - people.length, skipped_rows: skipped, history,
  last_change: changed ? { at: now, added: m.added, removed: m.removed, changed: m.changed } : meta.last_change || null,
};
process.stdout.write(JSON.stringify([{ key: KV_DATA, value: JSON.stringify({ updated: now, people: m.people }) }, { key: KV_META, value: JSON.stringify(nextMeta) }]));
console.error(`ok: ${people.length} people (+${m.added.length} −${m.removed.length} ~${m.changed.length}); skipped rows: ${skipped.join(', ') || 'none'}`);
