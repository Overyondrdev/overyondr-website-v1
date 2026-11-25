// Ad library API, mounted at /__ads/api on ads.overyondrdev.com (behind Cloudflare Access, like the feedback tool).
// The ads are static files in public/__ads/<set>/ described by manifest.json; this API stores what people do with them:
//   campaigns (where ads run) and which ads each uses, approve / needs-changes reactions, downloads,
//   and per-ad feedback, kept in the feedback table (site 'ads', path '/ads/<creative id>') so it also
//   appears in the admin dashboard at /admin.
import { ensureSchema } from '../feedback/schema.js';
import { currentUser, roleOf } from '../feedback/auth.js';

const CHANNELS = ['google-display', 'dv360', 'linkedin', 'meta', 'programmatic', 'direct-buy', 'email', 'website', 'other'];
const STATUSES = ['planned', 'live', 'paused', 'ended'];
const FEEDBACK_TYPES = ['design', 'content', 'bug', 'idea', 'question', 'praise', 'other'];
const ID = /^[a-z0-9-]{3,120}$/;

const now = () => new Date().toISOString();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (status, message) => json({ error: message }, status);
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);
const url = (s) => { try { const u = new URL(clip(s, 1000)); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
const slug = (s) => clip(s, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function campaignRows(db, set) {
  const { results } = await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM ad_campaign_items i WHERE i.campaign_id = c.id) AS ad_count
    FROM ad_campaigns c WHERE c.ad_set = ? ORDER BY CASE c.status WHEN 'live' THEN 0 WHEN 'planned' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, c.updated_at DESC`).bind(set).all();
  return results;
}

// Everything the library page needs in one call.
async function state(env, user, isAdmin, set) {
  const like = `/ads/${set}-%`;
  const [campaigns, items, reactions, mine, downloads, feedback] = await Promise.all([
    campaignRows(env.DB, set),
    env.DB.prepare(`SELECT i.campaign_id, i.creative_id FROM ad_campaign_items i JOIN ad_campaigns c ON c.id = i.campaign_id WHERE c.ad_set = ?`).bind(set).all(),
    env.DB.prepare(`SELECT creative_id, SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down
      FROM ad_reactions WHERE creative_id LIKE ? GROUP BY creative_id`).bind(set + '-%').all(),
    env.DB.prepare('SELECT creative_id, value FROM ad_reactions WHERE email = ? AND creative_id LIKE ?').bind(user.email, set + '-%').all(),
    env.DB.prepare('SELECT creative_id, COUNT(*) AS n FROM ad_downloads WHERE creative_id LIKE ? GROUP BY creative_id').bind(set + '-%').all(),
    env.DB.prepare(`SELECT substr(path, 6) AS creative_id, COUNT(*) AS n FROM feedback WHERE site = 'ads' AND path LIKE ? GROUP BY path`).bind(like).all(),
  ]);
  const per = {};
  const at = (id) => (per[id] ||= { campaigns: [], up: 0, down: 0, mine: 0, downloads: 0, feedback: 0 });
  for (const r of items.results) at(r.creative_id).campaigns.push(r.campaign_id);
  for (const r of reactions.results) Object.assign(at(r.creative_id), { up: r.up, down: r.down });
  for (const r of mine.results) at(r.creative_id).mine = r.value;
  for (const r of downloads.results) at(r.creative_id).downloads = r.n;
  for (const r of feedback.results) at(r.creative_id).feedback = r.n;
  return json({ me: { email: user.email, isAdmin }, campaigns, creatives: per, channels: CHANNELS, statuses: STATUSES });
}

function campaignFields(b, partial) {
  const out = {};
  if (!partial || 'name' in b) { const n = clip(b.name, 120); if (!n) return { error: 'Give the campaign a name.' }; out.name = n; }
  if ('channel' in b) out.channel = CHANNELS.includes(b.channel) ? b.channel : 'other';
  if ('status' in b) { if (!STATUSES.includes(b.status)) return { error: 'Unknown status.' }; out.status = b.status; }
  if ('start_date' in b) out.start_date = date(b.start_date);
  if ('end_date' in b) out.end_date = date(b.end_date);
  if ('landing_url' in b) { out.landing_url = b.landing_url ? url(b.landing_url) : null; if (b.landing_url && !out.landing_url) return { error: 'The landing page must be a full https:// address.' }; }
  if ('utm_campaign' in b) out.utm_campaign = slug(b.utm_campaign) || null;
  if ('owner_email' in b) out.owner_email = clip(b.owner_email, 200).toLowerCase() || null;
  if ('notes' in b) out.notes = clip(b.notes, 4000) || null;
  return { out };
}

async function createCampaign(req, env, user, set) {
  const b = await req.json().catch(() => ({}));
  const { out, error } = campaignFields(b, false);
  if (error) return err(400, error);
  const ts = now();
  const row = await env.DB.prepare(`INSERT INTO ad_campaigns (ad_set, name, channel, status, start_date, end_date, landing_url, utm_campaign, owner_email, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(set, out.name, out.channel || 'google-display', out.status || 'planned', out.start_date ?? null, out.end_date ?? null, out.landing_url ?? null,
      out.utm_campaign || slug(out.name), out.owner_email || user.email, out.notes ?? null, user.email, ts, ts).first();
  const ids = (Array.isArray(b.creatives) ? b.creatives : []).filter((id) => ID.test(id)).slice(0, 500);
  if (ids.length) await setItems(env, row.id, ids, [], user);
  return json({ id: row.id }, 201);
}

async function canEdit(env, id, user, isAdmin) {
  const c = await env.DB.prepare('SELECT * FROM ad_campaigns WHERE id = ?').bind(id).first();
  if (!c) return { error: err(404, 'Campaign not found.') };
  return { c };
}

async function updateCampaign(id, req, env, user, isAdmin) {
  const { error: missing } = await canEdit(env, id, user, isAdmin);
  if (missing) return missing;
  const b = await req.json().catch(() => ({}));
  const { out, error } = campaignFields(b, true);
  if (error) return err(400, error);
  const keys = Object.keys(out);
  if (keys.length) {
    await env.DB.prepare(`UPDATE ad_campaigns SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...keys.map((k) => out[k]), now(), id).run();
  }
  return json({ ok: true });
}

async function deleteCampaign(id, env, user, isAdmin) {
  const { c, error } = await canEdit(env, id, user, isAdmin);
  if (error) return error;
  if (!isAdmin && c.created_by !== user.email) return err(403, 'Only the person who added this campaign, or an admin, can delete it.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ad_campaign_items WHERE campaign_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ad_campaigns WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

async function setItems(env, id, add, remove, user) {
  const ts = now();
  const stmts = [
    ...add.map((cid) => env.DB.prepare('INSERT OR IGNORE INTO ad_campaign_items (campaign_id, creative_id, added_by, added_at) VALUES (?, ?, ?, ?)').bind(id, cid, user.email, ts)),
    ...remove.map((cid) => env.DB.prepare('DELETE FROM ad_campaign_items WHERE campaign_id = ? AND creative_id = ?').bind(id, cid)),
    env.DB.prepare('UPDATE ad_campaigns SET updated_at = ? WHERE id = ?').bind(ts, id),
  ];
  await env.DB.batch(stmts);
}

async function items(id, req, env, user, isAdmin) {
  const { error } = await canEdit(env, id, user, isAdmin);
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const pick = (a) => (Array.isArray(a) ? a : []).filter((x) => ID.test(x)).slice(0, 500);
  await setItems(env, id, pick(b.add), pick(b.remove), user);
  return json({ ok: true });
}

async function react(cid, req, env, user) {
  const { value } = await req.json().catch(() => ({}));
  const v = value === 1 || value === -1 ? value : 0;
  if (v) {
    await env.DB.prepare(`INSERT INTO ad_reactions (creative_id, email, value, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(creative_id, email) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`).bind(cid, user.email, v, now()).run();
  } else {
    await env.DB.prepare('DELETE FROM ad_reactions WHERE creative_id = ? AND email = ?').bind(cid, user.email).run();
  }
  const r = await env.DB.prepare(`SELECT SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down FROM ad_reactions WHERE creative_id = ?`).bind(cid).first();
  return json({ up: r.up || 0, down: r.down || 0, mine: v });
}

// Per-ad feedback is visible to the whole team (unlike page feedback, where non-admins see only their own).
async function feedbackList(cid, env) {
  const { results } = await env.DB.prepare(`SELECT id, created_at, author_email, type, status, message, comment_count FROM feedback
    WHERE site = 'ads' AND path = ? ORDER BY created_at DESC LIMIT 200`).bind('/ads/' + cid).all();
  const { results: who } = await env.DB.prepare(`SELECT r.email, r.value FROM ad_reactions r WHERE r.creative_id = ? ORDER BY r.created_at DESC`).bind(cid).all();
  return json({ items: results, reactions: who });
}

async function feedbackCreate(cid, req, env, user) {
  const b = await req.json().catch(() => ({}));
  const message = clip(b.message, 5000);
  if (!message) return err(400, 'Write a comment first.');
  const type = FEEDBACK_TYPES.includes(b.type) ? b.type : 'other';
  const ts = now();
  const pageUrl = `https://ads.overyondrdev.com/#ad=${cid}`;
  const res = await env.DB.prepare(`INSERT INTO feedback (created_at, updated_at, author_email, site, url, path, page_title, type, priority, status, title, message, tags, context)
      VALUES (?, ?, ?, 'ads', ?, ?, ?, ?, 'normal', 'new', ?, ?, '["ad library"]', ?) RETURNING id`)
    .bind(ts, ts, user.email, pageUrl, '/ads/' + cid, clip(b.adTitle, 300) || 'Ad library', type, clip(b.adTitle, 200) || null, message,
      JSON.stringify({ creative: cid, file: clip(b.file, 300) })).first();
  await env.DB.prepare('INSERT INTO activity (feedback_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(res.id, user.email, 'created', JSON.stringify({ type, from: 'ad library' }), ts).run();
  return feedbackList(cid, env);
}

async function downloads(req, env, user) {
  const b = await req.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => ID.test(x)).slice(0, 500);
  if (ids.length) {
    const ts = now();
    await env.DB.batch(ids.map((id) => env.DB.prepare('INSERT INTO ad_downloads (creative_id, email, created_at) VALUES (?, ?, ?)').bind(id, user.email, ts)));
  }
  return json({ ok: true, logged: ids.length });
}

async function exportCsv(env, set) {
  const { results } = await env.DB.prepare(`SELECT c.id, c.name, c.channel, c.status, c.start_date, c.end_date, c.landing_url, c.utm_campaign, c.owner_email, c.notes,
      i.creative_id, i.added_by, i.added_at FROM ad_campaigns c LEFT JOIN ad_campaign_items i ON i.campaign_id = c.id WHERE c.ad_set = ? ORDER BY c.id, i.creative_id`).bind(set).all();
  const cols = ['id', 'name', 'channel', 'status', 'start_date', 'end_date', 'landing_url', 'utm_campaign', 'owner_email', 'notes', 'creative_id', 'added_by', 'added_at'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...results.map((r) => cols.map((k) => esc(r[k])).join(','))].join('\r\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${set}-campaigns-${now().slice(0, 10)}.csv"` } });
}

export async function handleAdsApi(request, env, path) {
  if (!env.DB) return err(503, 'Storage is not configured.');
  await ensureSchema(env.DB);
  const user = await currentUser(request, env);
  if (!user) return err(401, 'Please sign in.');
  const isAdmin = !!(await roleOf(env.DB, user.email));
  const u = new URL(request.url);
  const m = request.method;
  const seg = path.split('/').filter(Boolean);
  const set = u.searchParams.get('set') || 'harvard-study-2026';
  if (!ID.test(set)) return err(400, 'Unknown ad set.');

  if (seg[0] === 'state' && m === 'GET') return state(env, user, isAdmin, set);
  if (seg[0] === 'campaigns.csv' && m === 'GET') return exportCsv(env, set);
  if (seg[0] === 'campaigns' && seg.length === 1 && m === 'POST') return createCampaign(request, env, user, set);
  if (seg[0] === 'campaigns' && seg[1]) {
    const id = parseInt(seg[1], 10);
    if (!id) return err(404, 'Not found');
    if (seg.length === 2 && m === 'PATCH') return updateCampaign(id, request, env, user, isAdmin);
    if (seg.length === 2 && m === 'DELETE') return deleteCampaign(id, env, user, isAdmin);
    if (seg[2] === 'items' && m === 'POST') return items(id, request, env, user, isAdmin);
  }
  if (seg[0] === 'creatives' && seg[1] && ID.test(seg[1])) {
    if (seg[2] === 'reaction' && m === 'POST') return react(seg[1], request, env, user);
    if (seg[2] === 'feedback' && m === 'GET') return feedbackList(seg[1], env);
    if (seg[2] === 'feedback' && m === 'POST') return feedbackCreate(seg[1], request, env, user);
  }
  if (seg[0] === 'downloads' && m === 'POST') return downloads(request, env, user);
  return err(404, 'Not found');
}
