// Feedback API, mounted at /__feedback/api on every overyondrdev.com host (same-origin for the widget).
// Storage: D1 (env.DB) for records, KV (env.SHOTS) for screenshots, Workers AI (env.AI) for summaries.
import { ensureSchema } from './schema.js';
import { currentUser, roleOf } from './auth.js';

const TYPES = ['bug', 'design', 'content', 'idea', 'question', 'praise', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const STATUSES = ['new', 'reviewing', 'agreed', 'planned', 'done', 'wont_do'];
const MAX_SHOTS = 6;
const MAX_SHOT_BYTES = 8 * 1024 * 1024;

const now = () => new Date().toISOString();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (status, message) => json({ error: message }, status);
const clip = (s, n) => String(s ?? '').slice(0, n);

async function log(db, feedbackId, actor, action, detail = {}) {
  await db.prepare('INSERT INTO activity (feedback_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(feedbackId, actor, action, JSON.stringify(detail), now()).run();
}

function row(r) {
  if (!r) return r;
  return { ...r, tags: JSON.parse(r.tags || '[]'), context: JSON.parse(r.context || '{}') };
}

function dataUrlToBytes(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1], bytes };
}

async function canSee(db, user, isAdmin, id) {
  const fb = await db.prepare('SELECT * FROM feedback WHERE id = ?').bind(id).first();
  if (!fb) return null;
  if (!isAdmin && fb.author_email !== user.email) return null;
  return fb;
}

// ---------------------------------------------------------------- handlers
async function createFeedback(req, env, user) {
  const b = await req.json().catch(() => null);
  if (!b || !clip(b.message, 10000).trim()) return err(400, 'Please describe your feedback.');
  const type = TYPES.includes(b.type) ? b.type : 'other';
  const priority = PRIORITIES.includes(b.priority) ? b.priority : 'normal';
  const site = ['v1', 'v2', 'portal'].includes(b.site) ? b.site : 'v1';
  const ts = now();
  const res = await env.DB.prepare(`INSERT INTO feedback (created_at, updated_at, author_email, site, url, path, page_title, type, priority,
      status, title, message, tags, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, '[]', ?) RETURNING id`)
    .bind(ts, ts, user.email, site, clip(b.url, 2000), clip(b.path, 1000), clip(b.pageTitle, 300), type, priority,
      clip(b.title, 200) || null, clip(b.message, 10000), JSON.stringify(b.context || {}).slice(0, 20000)).first();
  const id = res.id;
  const shots = (Array.isArray(b.screenshots) ? b.screenshots : []).slice(0, MAX_SHOTS);
  let n = 0;
  for (const s of shots) {
    const parsed = dataUrlToBytes(s && s.dataUrl);
    if (!parsed || parsed.bytes.length > MAX_SHOT_BYTES) continue;
    const aid = crypto.randomUUID();
    await env.SHOTS.put(`shot/${aid}`, parsed.bytes, { metadata: { type: parsed.type, feedback: id } });
    await env.DB.prepare('INSERT INTO attachments (id, feedback_id, kind, content_type, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(aid, id, 'screenshot', parsed.type, s.width | 0, s.height | 0, parsed.bytes.length, ts).run();
    n++;
  }
  if (n) await env.DB.prepare('UPDATE feedback SET attachment_count = ? WHERE id = ?').bind(n, id).run();
  await log(env.DB, id, user.email, 'created', { type, priority, screenshots: n });
  return json({ id }, 201);
}

async function listFeedback(url, env, user, isAdmin) {
  const q = url.searchParams;
  const scope = q.get('scope') === 'all' && isAdmin ? 'all' : 'mine';
  const where = [];
  const args = [];
  if (scope === 'mine') { where.push('f.author_email = ?'); args.push(user.email); }
  for (const [key, col, allowed] of [['status', 'status', STATUSES], ['type', 'type', TYPES], ['priority', 'priority', PRIORITIES], ['site', 'site', ['v1', 'v2', 'portal']]]) {
    const vals = (q.get(key) || '').split(',').filter((v) => allowed.includes(v));
    if (vals.length) { where.push(`f.${col} IN (${vals.map(() => '?').join(',')})`); args.push(...vals); }
  }
  if (q.get('author')) { where.push('f.author_email = ?'); args.push(q.get('author').toLowerCase()); }
  if (q.get('assignee')) { where.push('f.assignee = ?'); args.push(q.get('assignee').toLowerCase()); }
  if (q.get('path')) { where.push('f.path = ?'); args.push(q.get('path')); }
  if (q.get('q')) { where.push('(f.message LIKE ? OR f.title LIKE ? OR f.path LIKE ? OR f.author_email LIKE ?)'); const like = `%${q.get('q')}%`; args.push(like, like, like, like); }
  const sort = { new: 'f.created_at DESC', old: 'f.created_at ASC', votes: 'f.score DESC, f.created_at DESC',
    discussed: 'f.comment_count DESC, f.created_at DESC', updated: 'f.updated_at DESC',
    priority: "CASE f.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, f.created_at DESC" }[q.get('sort')] || 'f.created_at DESC';
  const limit = Math.min(500, Math.max(1, parseInt(q.get('limit') || '200', 10)));
  const sql = `SELECT f.*, (SELECT value FROM votes v WHERE v.feedback_id = f.id AND v.email = ?) AS my_vote
    FROM feedback f ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} LIMIT ${limit}`;
  const { results } = await env.DB.prepare(sql).bind(user.email, ...args).all();
  return json({ items: results.map(row), scope });
}

async function getFeedback(id, env, user, isAdmin) {
  const fb = await canSee(env.DB, user, isAdmin, id);
  if (!fb) return err(404, 'Not found');
  const [att, com, vot, act] = await env.DB.batch([
    env.DB.prepare('SELECT id, kind, content_type, width, height, bytes, created_at FROM attachments WHERE feedback_id = ? ORDER BY created_at').bind(id),
    env.DB.prepare(`SELECT * FROM comments WHERE feedback_id = ? ${isAdmin ? '' : 'AND internal = 0'} ORDER BY created_at`).bind(id),
    env.DB.prepare('SELECT email, value, created_at FROM votes WHERE feedback_id = ? ORDER BY created_at').bind(id),
    env.DB.prepare('SELECT * FROM activity WHERE feedback_id = ? ORDER BY created_at').bind(id),
  ]);
  return json({
    item: row(fb),
    attachments: att.results,
    comments: com.results,
    votes: isAdmin ? vot.results : vot.results.filter((v) => v.email === user.email),
    activity: isAdmin ? act.results.map((a) => ({ ...a, detail: JSON.parse(a.detail || '{}') })) : [],
  });
}

async function updateFeedback(id, req, env, user, isAdmin) {
  const fb = await canSee(env.DB, user, isAdmin, id);
  if (!fb) return err(404, 'Not found');
  const b = await req.json().catch(() => ({}));
  const sets = [];
  const args = [];
  const changes = {};
  const own = fb.author_email === user.email;
  const editable = isAdmin ? ['status', 'priority', 'type', 'assignee', 'tags', 'title', 'message'] : own && fb.status === 'new' ? ['message', 'title', 'type', 'priority'] : [];
  for (const k of editable) {
    if (!(k in b)) continue;
    let v = b[k];
    if (k === 'status' && !STATUSES.includes(v)) continue;
    if (k === 'priority' && !PRIORITIES.includes(v)) continue;
    if (k === 'type' && !TYPES.includes(v)) continue;
    if (k === 'assignee') v = v ? String(v).toLowerCase().slice(0, 200) : null;
    if (k === 'tags') v = JSON.stringify((Array.isArray(v) ? v : []).map((t) => clip(t, 40).trim()).filter(Boolean).slice(0, 12));
    if (k === 'message' || k === 'title') v = clip(v, k === 'message' ? 10000 : 200);
    sets.push(`${k} = ?`); args.push(v);
    changes[k] = { from: k === 'tags' ? JSON.parse(fb.tags) : fb[k], to: k === 'tags' ? JSON.parse(v) : v };
  }
  if (!sets.length) return err(400, 'Nothing to change');
  await env.DB.prepare(`UPDATE feedback SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...args, now(), id).run();
  await log(env.DB, id, user.email, 'updated', changes);
  return getFeedback(id, env, user, isAdmin);
}

async function deleteFeedback(id, env, user, isAdmin) {
  const fb = await canSee(env.DB, user, isAdmin, id);
  if (!fb) return err(404, 'Not found');
  if (!isAdmin && !(fb.author_email === user.email && fb.status === 'new')) return err(403, 'Only new items can be withdrawn.');
  const { results } = await env.DB.prepare('SELECT id FROM attachments WHERE feedback_id = ?').bind(id).all();
  await Promise.all(results.map((a) => env.SHOTS.delete(`shot/${a.id}`)));
  await env.DB.batch(['attachments', 'comments', 'votes'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE feedback_id = ?`).bind(id))
    .concat([env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id)]));
  await log(env.DB, id, user.email, 'deleted', { title: fb.title, message: clip(fb.message, 200) });
  return json({ ok: true });
}

async function addComment(id, req, env, user, isAdmin) {
  const fb = await canSee(env.DB, user, isAdmin, id);
  if (!fb) return err(404, 'Not found');
  const b = await req.json().catch(() => ({}));
  const body = clip(b.body, 5000).trim();
  if (!body) return err(400, 'Comment is empty');
  const internal = isAdmin && b.internal ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO comments (feedback_id, author_email, body, internal, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, user.email, body, internal, now()),
    env.DB.prepare('UPDATE feedback SET comment_count = comment_count + 1, updated_at = ? WHERE id = ?').bind(now(), id),
  ]);
  await log(env.DB, id, user.email, internal ? 'noted' : 'commented', {});
  return getFeedback(id, env, user, isAdmin);
}

async function vote(id, req, env, user, isAdmin) {
  const fb = await canSee(env.DB, user, isAdmin, id);
  if (!fb) return err(404, 'Not found');
  const { value } = await req.json().catch(() => ({}));
  const v = value === 1 || value === -1 ? value : 0;
  if (v) {
    await env.DB.prepare('INSERT INTO votes (feedback_id, email, value, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(feedback_id, email) DO UPDATE SET value = excluded.value, created_at = excluded.created_at')
      .bind(id, user.email, v, now()).run();
  } else {
    await env.DB.prepare('DELETE FROM votes WHERE feedback_id = ? AND email = ?').bind(id, user.email).run();
  }
  const s = await env.DB.prepare('SELECT COALESCE(SUM(value), 0) AS s FROM votes WHERE feedback_id = ?').bind(id).first();
  await env.DB.prepare('UPDATE feedback SET score = ? WHERE id = ?').bind(s.s, id).run();
  return json({ score: s.s, my_vote: v });
}

async function attachment(aid, env, user, isAdmin) {
  const a = await env.DB.prepare('SELECT * FROM attachments WHERE id = ?').bind(aid).first();
  if (!a || !(await canSee(env.DB, user, isAdmin, a.feedback_id))) return err(404, 'Not found');
  const data = await env.SHOTS.get(`shot/${aid}`, 'arrayBuffer');
  if (!data) return err(404, 'Not found');
  return new Response(data, { headers: { 'content-type': a.content_type, 'cache-control': 'private, max-age=31536000, immutable' } });
}

async function stats(env) {
  const q = (sql) => env.DB.prepare(sql);
  const [total, byStatus, byType, bySite, byPriority, byDay, topPages, topVoted, people, recent] = await env.DB.batch([
    q('SELECT COUNT(*) AS n, SUM(attachment_count) AS shots, SUM(comment_count) AS comments FROM feedback'),
    q('SELECT status AS k, COUNT(*) AS n FROM feedback GROUP BY status'),
    q('SELECT type AS k, COUNT(*) AS n FROM feedback GROUP BY type'),
    q('SELECT site AS k, COUNT(*) AS n FROM feedback GROUP BY site'),
    q('SELECT priority AS k, COUNT(*) AS n FROM feedback GROUP BY priority'),
    q("SELECT substr(created_at, 1, 10) AS k, COUNT(*) AS n FROM feedback WHERE created_at >= date('now', '-29 days') GROUP BY k ORDER BY k"),
    q("SELECT site || ' ' || path AS k, COUNT(*) AS n FROM feedback GROUP BY site, path ORDER BY n DESC LIMIT 8"),
    q("SELECT id, title, message, score, type, status FROM feedback WHERE status NOT IN ('done', 'wont_do') ORDER BY score DESC, comment_count DESC LIMIT 6"),
    q('SELECT author_email AS k, COUNT(*) AS n FROM feedback GROUP BY author_email ORDER BY n DESC'),
    q(`SELECT a.*, f.title, f.message FROM activity a LEFT JOIN feedback f ON f.id = a.feedback_id ORDER BY a.created_at DESC LIMIT 15`),
  ]);
  const kv = (r) => Object.fromEntries(r.results.map((x) => [x.k, x.n]));
  return json({
    total: total.results[0].n || 0, screenshots: total.results[0].shots || 0, comments: total.results[0].comments || 0,
    byStatus: kv(byStatus), byType: kv(byType), bySite: kv(bySite), byPriority: kv(byPriority),
    byDay: byDay.results, topPages: topPages.results, topVoted: topVoted.results, people: people.results,
    recent: recent.results.map((a) => ({ ...a, detail: JSON.parse(a.detail || '{}') })),
  });
}

// ------------------------------------------------------------ AI summary
async function summarize(env, user) {
  if (!env.AI) return err(503, 'Workers AI is not configured.');
  const { results } = await env.DB.prepare(
    "SELECT id, site, path, type, priority, status, score, comment_count, title, message FROM feedback WHERE status NOT IN ('done', 'wont_do') ORDER BY score DESC, created_at DESC LIMIT 150").all();
  if (!results.length) return err(400, 'There is no open feedback to summarise yet.');
  const lines = results.map((f) => `#${f.id} [${f.site} ${f.path}] ${f.type}/${f.priority}/${f.status} votes:${f.score} comments:${f.comment_count} — ${clip((f.title ? f.title + ': ' : '') + f.message, 400).replace(/\s+/g, ' ')}`);
  const prompt = `You are helping the Yondr web team decide what to build next for the new Yondr website.
Below is internal feedback from Yondr staff about two versions of the site (V1 = current site rebuilt, V2 = redesign).
Group it into clear themes, judge impact (high/medium/low) from priority, votes, how many people raised it and how it affects visitors, and recommend concrete next steps.
Respond with ONLY valid JSON, no markdown, matching:
{"headline": string (one sentence overall read),
 "themes": [{"title": string, "summary": string (2-3 sentences), "impact": "high"|"medium"|"low", "recommendation": string, "item_ids": number[]}],
 "quick_wins": [{"text": string, "item_ids": number[]}],
 "open_questions": [{"text": string, "item_ids": number[]}],
 "sentiment": {"v1": string, "v2": string}}
Order themes by impact. Use at most 8 themes. Only cite item ids that appear below.

FEEDBACK:
${lines.join('\n')}`;
  const out = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [{ role: 'user', content: prompt }], max_tokens: 2500, temperature: 0.2,
  });
  // Workers AI returns either { response } or an OpenAI-style { choices: [{ message: { content } }] }.
  const text = typeof out === 'string' ? out
    : out.response != null ? out.response
    : (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) || '';
  let parsed;
  try {
    parsed = typeof text === 'object' ? text : JSON.parse(String(text).replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  } catch {
    return err(502, 'The AI summary could not be read. Please try again.');
  }
  await env.DB.prepare('INSERT INTO summaries (created_at, created_by, item_count, content) VALUES (?, ?, ?, ?)')
    .bind(now(), user.email, results.length, JSON.stringify(parsed)).run();
  return latestSummary(env);
}

async function latestSummary(env) {
  const s = await env.DB.prepare('SELECT * FROM summaries ORDER BY id DESC LIMIT 1').first();
  return json({ summary: s ? { ...s, content: JSON.parse(s.content) } : null });
}

// ------------------------------------------------------------ admins
async function admins(req, env, user, role) {
  if (req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM admins ORDER BY role DESC, email').all();
    return json({ admins: results });
  }
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@overyondr\.com$/.test(email)) return err(400, 'Admins must have an @overyondr.com email address.');
  if (req.method === 'POST') {
    // Re-adding an existing owner as "admin" would demote them; only an owner may change an owner's role.
    if ((await roleOf(env.DB, email)) === 'owner' && role !== 'owner') return err(403, 'Only an owner can change an owner’s role.');
    const newRole = b.role === 'owner' && role === 'owner' ? 'owner' : 'admin';
    await env.DB.prepare('INSERT INTO admins (email, role, added_by, added_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role')
      .bind(email, newRole, user.email, now()).run();
    await log(env.DB, null, user.email, 'admin_added', { email, role: newRole });
  } else if (req.method === 'DELETE') {
    const target = await roleOf(env.DB, email);
    if (target === 'owner' && role !== 'owner') return err(403, 'Only an owner can remove an owner.');
    if (email === user.email) return err(400, 'You can’t remove yourself.');
    await env.DB.prepare('DELETE FROM admins WHERE email = ?').bind(email).run();
    await log(env.DB, null, user.email, 'admin_removed', { email });
  }
  return admins(new Request(req.url), env, user, role);
}

async function exportCsv(env) {
  const { results } = await env.DB.prepare('SELECT * FROM feedback ORDER BY id').all();
  const cols = ['id', 'created_at', 'author_email', 'site', 'path', 'url', 'type', 'priority', 'status', 'assignee', 'score', 'comment_count', 'attachment_count', 'title', 'message', 'tags'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...results.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="yondr-feedback-${now().slice(0, 10)}.csv"` } });
}

// ------------------------------------------------------------ router
export async function handleFeedbackApi(request, env, path) {
  if (!env.DB || !env.SHOTS) return err(503, 'Feedback storage is not configured.');
  await ensureSchema(env.DB);
  const user = await currentUser(request, env);
  if (!user) return err(401, 'Please sign in.');
  const role = await roleOf(env.DB, user.email);
  const isAdmin = !!role;
  const url = new URL(request.url);
  const m = request.method;
  const seg = path.split('/').filter(Boolean); // e.g. ['feedback', '12', 'comments']
  const adminOnly = (fn) => (isAdmin ? fn() : err(403, 'Admins only'));

  if (seg[0] === 'me') return json({ email: user.email, role, isAdmin });
  if (seg[0] === 'feedback' && seg.length === 1) {
    if (m === 'GET') return listFeedback(url, env, user, isAdmin);
    if (m === 'POST') return createFeedback(request, env, user);
  }
  if (seg[0] === 'feedback' && seg[1]) {
    const id = parseInt(seg[1], 10);
    if (!id) return err(404, 'Not found');
    if (seg.length === 2) {
      if (m === 'GET') return getFeedback(id, env, user, isAdmin);
      if (m === 'PATCH') return updateFeedback(id, request, env, user, isAdmin);
      if (m === 'DELETE') return deleteFeedback(id, env, user, isAdmin);
    }
    if (seg[2] === 'comments' && m === 'POST') return addComment(id, request, env, user, isAdmin);
    if (seg[2] === 'vote' && m === 'POST') return vote(id, request, env, user, isAdmin);
  }
  if (seg[0] === 'attachments' && seg[1] && m === 'GET') return attachment(seg[1], env, user, isAdmin);
  if (seg[0] === 'stats' && m === 'GET') return adminOnly(() => stats(env));
  if (seg[0] === 'summary') return adminOnly(() => (m === 'POST' ? summarize(env, user) : latestSummary(env)));
  if (seg[0] === 'admins') return adminOnly(() => admins(request, env, user, role));
  if (seg[0] === 'export.csv' && m === 'GET') return adminOnly(() => exportCsv(env));
  return err(404, 'Not found');
}
