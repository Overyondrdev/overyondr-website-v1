// JSON API at /api/*. Identity = Cloudflare Access email (auth.js). Data in D1 (env.DB).
import { ensureSchema } from './schema.js';
import { currentUser, roleOf } from './auth.js';
import { verifyMany, verifyAddress, cleanAddress, norm, FIELDS } from './address.js';

const now = () => new Date().toISOString();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (status, message, extra = {}) => json({ error: message, ...extra }, status);
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const STATUSES = ['verified', 'reviewed', 'needs_review', 'unverified'];
const BATCH_CHECK = 25;
const BATCH_SAVE = 100;

async function log(db, actor, action, clientId, detail = {}) {
  await db.prepare('INSERT INTO activity (created_at, actor, action, client_id, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(now(), actor, action, clientId, JSON.stringify(detail)).run();
}

function row(r) {
  if (!r) return r;
  return { ...r, verification: JSON.parse(r.verification || '{}') };
}

// Person fields (not address) from a request body.
function person(b) {
  return {
    name: clip(b.name, 200), company: clip(b.company, 200), title: clip(b.title, 200),
    email: clip(b.email, 254).toLowerCase(), notes: String(b.notes ?? '').trim().slice(0, 1000),
    department: clip(b.department, 100),
  };
}
function address(b) {
  const a = {};
  for (const f of FIELDS) a[f] = clip(b[f], f === 'country' ? 60 : 200);
  return a;
}
const words = (s) => norm(s).replace(/[^a-z0-9 ]+/g, '').trim();
// Same person at the same street address and postal code (ignoring case, punctuation and "Street"/"St").
export function dedupeKey(name, a) {
  return [words(name), words(a.line1), String(a.postal_code || '').replace(/\s/g, '').slice(0, 5).toLowerCase()].join('|');
}

export const DEFAULT_DEPARTMENTS = ['Education', 'Commercial', 'Entertainment', 'Operations'];
async function settings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  let departments = DEFAULT_DEPARTMENTS;
  try { if (s.departments) departments = JSON.parse(s.departments); } catch { /* keep defaults */ }
  return { deadline: s.deadline || '', closed: s.closed === '1', message: s.message || '', departments };
}

async function findDuplicates(db, keys, exceptId = 0) {
  const map = new Map();
  const uniq = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 90) {
    const part = uniq.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT id, name, company, added_by, created_at, dedupe_key FROM clients
      WHERE dedupe_key IN (${part.map(() => '?').join(',')}) AND id != ?`).bind(...part, exceptId).all();
    for (const r of results) if (!map.has(r.dedupe_key)) map.set(r.dedupe_key, r);
  }
  return map;
}

// The status stored for a client, given the check result and what the person chose.
function storedStatus(v, mode) {
  if (v.status === 'verified') return 'verified';
  if (v.status === 'unverified') return 'unverified';
  if (mode === 'accept' && v.status === 'suggested') return 'verified';
  return 'needs_review';
}
function storedVerification(v) {
  return JSON.stringify({ provider: v.provider, issues: v.issues || [], suggestion: v.suggestion || null, changed: v.changed || [], checkedAt: v.checkedAt, note: v.note || null });
}

// ------------------------------------------------------------------ save one (create or update)
async function saveClient(req, env, user, isAdmin, id) {
  const b = await req.json().catch(() => null);
  if (!b || !b.client) return err(400, 'Missing client.');
  const p = person(b.client);
  if (!p.name) return err(422, 'Add the name that should go on the envelope.', { field: 'name' });
  if (!p.department) return err(422, 'Choose your department.', { field: 'department' });
  const mode = ['check', 'accept', 'keep'].includes(b.mode) ? b.mode : 'check';
  let existing = null;
  if (id) {
    existing = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
    if (!existing || (!isAdmin && existing.added_by !== user.email)) return err(404, 'Not found');
  }
  let a = address(b.client);
  const sameAddress = existing && FIELDS.every((f) => (existing[f === 'postal_code' ? 'postal_code' : f] || '') === cleanAddress(a)[f]);

  let v;
  if (sameAddress) {
    v = { status: existing.status, ...JSON.parse(existing.verification || '{}'), cleaned: cleanAddress(a), unchanged: true };
  } else {
    v = await verifyAddress(a, env);
    if (v.status === 'invalid') return json({ saved: false, verification: v }, 422);
    if (mode === 'check' && (v.status === 'suggested' || v.status === 'needs_review')) return json({ saved: false, verification: v });
  }
  if (mode === 'accept' && v.status === 'suggested' && v.suggestion) a = { ...v.suggestion };
  const stored = sameAddress ? existing : null;
  const clean = cleanAddress(a);
  const key = dedupeKey(p.name, clean);
  if (!b.allowDuplicate) {
    const dup = (await findDuplicates(env.DB, [key], id || 0)).get(key);
    if (dup) return json({ saved: false, duplicate: dup, verification: v });
  }
  const status = stored ? stored.status : storedStatus(v, mode);
  const verification = stored ? stored.verification : storedVerification(v);
  const kept = stored ? stored.kept_as_entered : (mode === 'keep' && status === 'needs_review' ? 1 : 0);
  const ts = now();
  let saved;
  if (id) {
    saved = await env.DB.prepare(`UPDATE clients SET updated_at = ?, updated_by = ?, name = ?, company = ?, title = ?, email = ?, notes = ?, department = ?,
        line1 = ?, line2 = ?, city = ?, region = ?, postal_code = ?, country = ?, status = ?, kept_as_entered = ?, verification = ?,
        reviewed_by = ?, dedupe_key = ? WHERE id = ? RETURNING *`)
      .bind(ts, user.email, p.name, p.company, p.title, p.email, p.notes, p.department, clean.line1, clean.line2, clean.city, clean.region,
        clean.postal_code, clean.country, status, kept, verification, stored ? existing.reviewed_by : null, key, id).first();
    await log(env.DB, user.email, 'edited', id, { name: p.name, status });
  } else {
    saved = await env.DB.prepare(`INSERT INTO clients (created_at, updated_at, added_by, name, company, title, email, notes, department,
        line1, line2, city, region, postal_code, country, status, kept_as_entered, verification, source, dedupe_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'single', ?) RETURNING *`)
      .bind(ts, ts, user.email, p.name, p.company, p.title, p.email, p.notes, p.department, clean.line1, clean.line2, clean.city, clean.region,
        clean.postal_code, clean.country, status, kept, verification, key).first();
    await log(env.DB, user.email, 'added', saved.id, { name: p.name, status });
  }
  if (saved.added_by === user.email) await env.DB.prepare('UPDATE users SET department = ? WHERE email = ?').bind(p.department, user.email).run();
  return json({ saved: true, client: row(saved), verification: v }, id ? 200 : 201);
}

// ------------------------------------------------------------------ bulk
async function checkBatch(req, env) {
  const b = await req.json().catch(() => null);
  const rows = Array.isArray(b?.rows) ? b.rows.slice(0, BATCH_CHECK) : [];
  const results = await verifyMany(rows.map(address), env);
  const keys = rows.map((r, i) => dedupeKey(clip(r.name, 200), results[i].cleaned));
  const dups = await findDuplicates(env.DB, keys);
  return json({ results: results.map((v, i) => ({ verification: v, duplicate: dups.get(keys[i]) || null })) });
}

async function saveBatch(req, env, user) {
  const b = await req.json().catch(() => null);
  const rows = Array.isArray(b?.rows) ? b.rows.slice(0, BATCH_SAVE) : [];
  if (!rows.length) return err(400, 'Nothing to add.');
  let uploadId = parseInt(b.uploadId, 10) || 0;
  if (uploadId) {
    const up = await env.DB.prepare('SELECT * FROM uploads WHERE id = ? AND added_by = ?').bind(uploadId, user.email).first();
    if (!up) uploadId = 0;
  }
  if (!uploadId) {
    uploadId = (await env.DB.prepare('INSERT INTO uploads (created_at, added_by, filename, row_count) VALUES (?, ?, ?, 0) RETURNING id')
      .bind(now(), user.email, clip(b.filename, 200) || 'Pasted list').first()).id;
  }
  const valid = rows.map((r) => ({ p: person(r.client || {}), a: address(r.client || {}), mode: r.choice === 'suggested' ? 'accept' : 'keep' }))
    .filter((r) => r.p.name);
  const checks = await verifyMany(valid.map((r) => r.a), env);
  const ts = now();
  const stmts = [];
  const skipped = [];
  valid.forEach((r, i) => {
    const v = checks[i];
    if (v.status === 'invalid') { skipped.push(r.p.name); return; }
    const a = cleanAddress(r.mode === 'accept' && v.suggestion ? v.suggestion : v.cleaned);
    const status = storedStatus(v, r.mode);
    stmts.push(env.DB.prepare(`INSERT INTO clients (created_at, updated_at, added_by, name, company, title, email, notes, department,
        line1, line2, city, region, postal_code, country, status, kept_as_entered, verification, source, upload_id, dedupe_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bulk', ?, ?)`)
      .bind(ts, ts, user.email, r.p.name, r.p.company, r.p.title, r.p.email, r.p.notes, r.p.department || null, a.line1, a.line2, a.city, a.region,
        a.postal_code, a.country, status, status === 'needs_review' ? 1 : 0, storedVerification(v), uploadId, dedupeKey(r.p.name, a)));
  });
  if (stmts.length) await env.DB.batch(stmts);
  await env.DB.prepare('UPDATE uploads SET row_count = row_count + ? WHERE id = ?').bind(stmts.length, uploadId).run();
  await log(env.DB, user.email, 'imported', null, { uploadId, count: stmts.length, filename: clip(b.filename, 200) });
  return json({ uploadId, added: stmts.length, skipped });
}

// ------------------------------------------------------------------ lists
function listQuery(q, user, isAdmin) {
  const where = [];
  const args = [];
  if (!(isAdmin && q.get('scope') === 'all')) { where.push('added_by = ?'); args.push(user.email); }
  else if (q.get('added_by')) { where.push('added_by = ?'); args.push(q.get('added_by').toLowerCase()); }
  const st = (q.get('status') || '').split(',').filter((s) => STATUSES.includes(s));
  if (st.length) { where.push(`status IN (${st.map(() => '?').join(',')})`); args.push(...st); }
  if (q.get('country')) { where.push('country = ?'); args.push(q.get('country').toUpperCase()); }
  if (q.get('department') === 'Not set') where.push("(department IS NULL OR department = '')");
  else if (q.get('department')) { where.push('department = ?'); args.push(q.get('department')); }
  if (q.get('upload')) { where.push('upload_id = ?'); args.push(parseInt(q.get('upload'), 10) || 0); }
  if (q.get('q')) {
    const like = `%${q.get('q')}%`;
    where.push('(name LIKE ? OR company LIKE ? OR line1 LIKE ? OR city LIKE ? OR postal_code LIKE ? OR added_by LIKE ? OR department LIKE ?)');
    args.push(like, like, like, like, like, like, like);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

async function listClients(url, env, user, isAdmin) {
  const { sql, args } = listQuery(url.searchParams, user, isAdmin);
  const { results } = await env.DB.prepare(`SELECT * FROM clients ${sql} ORDER BY created_at DESC, id DESC LIMIT 5000`).bind(...args).all();
  return json({ items: results.map(row) });
}

const CSV_COLS = [
  ['Name', 'name'], ['Company', 'company'], ['Title', 'title'], ['Address line 1', 'line1'], ['Address line 2', 'line2'],
  ['City', 'city'], ['State / region', 'region'], ['Postal code', 'postal_code'], ['Country', 'country_name'], ['Country code', 'country'], ['Email', 'email'],
  ['Notes', 'notes'], ['Department', 'department'], ['Address status', 'status'], ['Added by', 'added_by'], ['Added on', 'created_at'],
];
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet formulas from running
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
async function exportCsv(url, env, user) {
  const q = new URLSearchParams(url.searchParams); q.set('scope', 'all');
  const { sql, args } = listQuery(q, user, true);
  const { results } = await env.DB.prepare(`SELECT * FROM clients ${sql} ORDER BY country, region, city, name`).bind(...args).all();
  const lines = [CSV_COLS.map((c) => c[0]).join(',')];
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const r of results) {
    const rec = { ...r, created_at: r.created_at.slice(0, 10), country_name: (() => { try { return names.of(r.country); } catch { return r.country; } })() };
    lines.push(CSV_COLS.map(([, k]) => csvCell(rec[k])).join(','));
  }
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="yondr-christmas-cards-${now().slice(0, 10)}.csv"` },
  });
}

async function overview(env) {
  const [tot, people, recent, uploads, depts] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total, SUM(status = 'verified') AS verified, SUM(status = 'reviewed') AS reviewed,
      SUM(status = 'needs_review') AS needs_review, SUM(status = 'unverified') AS unverified, COUNT(DISTINCT added_by) AS contributors,
      COUNT(DISTINCT country) AS countries FROM clients`),
    env.DB.prepare(`SELECT added_by, COUNT(*) AS total, SUM(status = 'needs_review') AS needs_review, SUM(source = 'bulk') AS bulk,
      MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM clients GROUP BY added_by ORDER BY total DESC`),
    env.DB.prepare('SELECT * FROM activity ORDER BY created_at DESC, id DESC LIMIT 40'),
    env.DB.prepare('SELECT * FROM uploads ORDER BY created_at DESC LIMIT 50'),
    env.DB.prepare(`SELECT COALESCE(NULLIF(department, ''), 'Not set') AS department, COUNT(*) AS total FROM clients GROUP BY 1 ORDER BY total DESC`),
  ]);
  return json({
    totals: tot.results[0], contributors: people.results, uploads: uploads.results, departments: depts.results,
    activity: recent.results.map((a) => ({ ...a, detail: JSON.parse(a.detail || '{}') })),
  });
}

// ------------------------------------------------------------------ router
export async function handleApi(request, env, path) {
  if (!env.DB) return err(503, 'Database not configured');
  const user = await currentUser(request, env);
  if (!user) return err(401, 'Please sign in with your Yondr email.');
  await ensureSchema(env.DB);
  const role = await roleOf(env.DB, user.email);
  const isAdmin = !!role;
  const m = request.method;
  const url = new URL(request.url);
  const parts = path.split('/').filter(Boolean);

  if (m !== 'GET' && m !== 'HEAD') {
    // Same-origin JSON only (Access cookies would otherwise ride along on cross-site form posts).
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return err(403, 'Cross-origin request blocked');
    const s = await settings(env.DB);
    if (s.closed && !isAdmin && parts[0] !== 'check' && parts[0] !== 'tutorial') return err(403, 'The card list is closed for this year. Contact the card team to make changes.');
  }

  try {
    if (parts[0] === 'me' && m === 'GET') {
      const ts = now();
      await env.DB.prepare('INSERT INTO users (email, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET last_seen = excluded.last_seen')
        .bind(user.email, ts, ts).run();
      const [mine, u] = await env.DB.batch([
        env.DB.prepare('SELECT COUNT(*) AS n FROM clients WHERE added_by = ?').bind(user.email),
        env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email),
      ]);
      const me = u.results[0] || {};
      return json({ email: user.email, via: user.via, role, isAdmin, settings: await settings(env.DB),
        verifier: env.GOOGLE_MAPS_API_KEY ? 'google' : 'basic', count: mine.results[0].n,
        tutorialDone: !!me.tutorial_done_at, department: me.department || '' });
    }
    if (parts[0] === 'tutorial' && m === 'POST') {
      await env.DB.prepare('UPDATE users SET tutorial_done_at = ? WHERE email = ?').bind(now(), user.email).run();
      return json({ ok: true });
    }
    if (parts[0] === 'check' && m === 'POST') {
      if (parts[1] === 'batch') return checkBatch(request, env);
      const b = await request.json().catch(() => ({}));
      return json({ verification: await verifyAddress(address(b), env) });
    }
    if (parts[0] === 'clients') {
      if (!parts[1] && m === 'GET') return listClients(url, env, user, isAdmin);
      if (!parts[1] && m === 'POST') return saveClient(request, env, user, isAdmin, 0);
      if (parts[1] === 'bulk' && m === 'POST') return saveBatch(request, env, user);
      const id = parseInt(parts[1], 10);
      if (!id) return err(404, 'Not found');
      if (!parts[2] && m === 'PUT') return saveClient(request, env, user, isAdmin, id);
      if (!parts[2] && m === 'DELETE') {
        const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
        if (!c || (!isAdmin && c.added_by !== user.email)) return err(404, 'Not found');
        await env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id).run();
        await log(env.DB, user.email, 'deleted', id, { name: c.name, added_by: c.added_by });
        return json({ ok: true });
      }
      if (parts[2] === 'review' && m === 'POST' && isAdmin) {
        const c = await env.DB.prepare(`UPDATE clients SET status = 'reviewed', reviewed_by = ?, updated_at = ?, updated_by = ? WHERE id = ? RETURNING *`)
          .bind(user.email, now(), user.email, id).first();
        if (!c) return err(404, 'Not found');
        await log(env.DB, user.email, 'reviewed', id, { name: c.name });
        return json({ client: row(c) });
      }
    }
    if (parts[0] === 'admin') {
      if (!isAdmin) return err(403, 'Admins only');
      if (parts[1] === 'overview' && m === 'GET') return overview(env);
      if (parts[1] === 'export.csv' && m === 'GET') return exportCsv(url, env, user);
      if (parts[1] === 'settings' && m === 'PUT') {
        const b = await request.json().catch(() => ({}));
        const stmts = [];
        if ('deadline' in b) stmts.push(['deadline', /^\d{4}-\d{2}-\d{2}$/.test(b.deadline) ? b.deadline : '']);
        if ('closed' in b) stmts.push(['closed', b.closed ? '1' : '0']);
        if ('message' in b) stmts.push(['message', String(b.message || '').slice(0, 500)]);
        if ('departments' in b) {
          const list = [...new Set((Array.isArray(b.departments) ? b.departments : []).map((d) => clip(d, 100)).filter(Boolean))].slice(0, 60);
          stmts.push(['departments', JSON.stringify(list.length ? list : DEFAULT_DEPARTMENTS)]);
        }
        await env.DB.batch(stmts.map(([k, v]) => env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v)));
        return json({ settings: await settings(env.DB) });
      }
      if (parts[1] === 'admins') {
        if (m === 'GET') return json({ admins: (await env.DB.prepare('SELECT * FROM admins ORDER BY added_at').all()).results });
        const b = await request.json().catch(() => ({}));
        const email = clip(b.email, 254).toLowerCase();
        if (!/^[^@\s]+@overyondr\.com$/.test(email)) return err(422, 'Use an @overyondr.com email address.');
        if (m === 'POST') {
          await env.DB.prepare('INSERT OR IGNORE INTO admins (email, role, added_by, added_at) VALUES (?, ?, ?, ?)').bind(email, 'admin', user.email, now()).run();
          return json({ ok: true });
        }
        if (m === 'DELETE') {
          const target = await roleOf(env.DB, email);
          if (target === 'owner') return err(403, 'Owners can’t be removed here.');
          if (email === user.email) return err(403, 'You can’t remove yourself.');
          await env.DB.prepare('DELETE FROM admins WHERE email = ?').bind(email).run();
          return json({ ok: true });
        }
      }
    }
  } catch (e) {
    console.error(e);
    return err(500, 'Something went wrong. Please try again.');
  }
  return err(404, 'Not found');
}
