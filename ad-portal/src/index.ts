// yondr-ad-portal: the Yondr ad library at https://ads.overyondrdev.com
//
// Cloudflare Access (app "overyondrdev.com (Yondr website dev)", *.overyondrdev.com) signs people in at the edge,
// before requests reach this Worker. The Worker verifies Access's signed token (src/access.ts) for who it is, and
// refuses requests without one, so the portal stays private even if the host were ever left out of Access.
//   /            the app (public/: index.html, app.js, app.css, brand files), bundled into the script (src/static.ts)
//   /files/<key> ad files from R2 (AD_ASSETS); the bucket itself is private
//   /api/*       JSON API over D1 (DB): ad sets, ads, uploads, copy edits, reviews, comments, campaigns, downloads, people
//   /render/*    the ad template (generator/ad.html + fonts) the portal uses to re-render ads after copy edits
// Who can do what: src/roles.ts (viewer / editor / admin).

import { serveStatic } from './static';
import { accessEmail } from './access';
import { loginUrl } from './yondr-session.js';
import { can, helpContacts, helpFeedback, log, seen, setTourRole, tourRole, usersApi, whoIs, type Who } from './roles';
import { editors, inbox, notify } from './notify';

interface Env {
  AD_ASSETS: R2Bucket;
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string; // Yondr's Cloudflare Access team, which signs the sign-in tokens
  OWNER_EMAILS?: string; // always admins (comma-separated)
  DEFAULT_ROLE?: string; // role for everyone else who signs in (viewer)
  DEV_EMAIL?: string; // local development only (.dev.vars); never set in production
  SLACK_WEBHOOK_URL?: string; // optional secret: Slack incoming webhook for notifications (src/notify.ts)
}

const STATUSES = ['in_review', 'approved', 'needs_changes', 'archived'];
const VARIANTS = ['pouch', 'in-use', 'motion', 'other'];
const CHANNELS = ['google-display', 'dv360', 'linkedin', 'meta', 'programmatic', 'direct-buy', 'email', 'website', 'other'];
const CAMPAIGN_STATUSES = ['planned', 'live', 'paused', 'ended'];
const COMMENT_TYPES = ['design', 'content', 'bug', 'idea', 'question', 'praise', 'other'];
const TYPES: Record<string, string> = { 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/png': 'PNG', 'image/webp': 'WEBP' };
const MAX_UPLOAD = 20 * 1024 * 1024;
const ID = /^[a-z0-9-]{2,160}$/;

const now = () => new Date().toISOString();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (status: number, message: string) => json({ error: message }, status);
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const date = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const slug = (s: unknown) => clip(s, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const url = (s: unknown) => { try { const u = new URL(clip(s, 1000)); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
const parse = (s: string | null) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };


// ------------------------------------------------------------------ image size from the file header
function dimensions(b: Uint8Array, type: string): { width: number; height: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (type === 'image/png' && b.length > 24) return { width: dv.getUint32(16), height: dv.getUint32(20) };
  if (type === 'image/gif' && b.length > 10) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  if (type === 'image/webp' && b.length > 30) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (chunk === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') { const v = dv.getUint32(21, true); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
  }
  if (type === 'image/jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5) };
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return null;
}
function animated(b: Uint8Array, type: string): boolean {
  if (type !== 'image/gif') return false;
  let frames = 0; // count image descriptors after graphic control extensions
  for (let i = 0; i < b.length - 3; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04 && ++frames > 1) return true;
  return false;
}

// ------------------------------------------------------------------ files
async function file(request: Request, env: Env, key: string): Promise<Response> {
  const obj = await env.AD_ASSETS.get(key, { onlyIf: request.headers });
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  // Ad URLs carry ?v=<updated_at>, which changes whenever the file is replaced, so versioned requests can be
  // cached for good. Unversioned ones (old links) get an hour.
  const url = new URL(request.url);
  headers.set('cache-control', url.searchParams.has('v') ? 'private, max-age=31536000, immutable' : 'private, max-age=3600');
  headers.set('x-robots-tag', 'noindex');
  if (url.searchParams.has('download')) headers.set('content-disposition', `attachment; filename="${key.split('/').pop()}"`);
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}

// ------------------------------------------------------------------ sets
async function listSets(env: Env) {
  const { results } = await env.DB.prepare(`SELECT s.id, s.name, s.summary, s.created_at,
      (SELECT COUNT(*) FROM ads a WHERE a.set_id = s.id AND a.status != 'archived') AS ad_count
    FROM ad_sets s ORDER BY s.created_at DESC`).all();
  return json({ sets: results });
}

async function getSet(env: Env, id: string, who: Who) {
  const email = who.email;
  await seen(env, email);
  const set = await env.DB.prepare('SELECT * FROM ad_sets WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!set) return err(404, 'Ad set not found.');
  const [ads, files, campaigns, links, reviews, mine, comments, downloads] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM ads WHERE set_id = ? ORDER BY id').bind(id),
    env.DB.prepare('SELECT * FROM set_files WHERE set_id = ? ORDER BY created_at').bind(id),
    env.DB.prepare(`SELECT c.*, (SELECT COUNT(*) FROM campaign_ads x WHERE x.campaign_id = c.id) AS ad_count FROM campaigns c WHERE c.set_id = ?
      ORDER BY CASE c.status WHEN 'live' THEN 0 WHEN 'planned' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, c.updated_at DESC`).bind(id),
    env.DB.prepare('SELECT x.campaign_id, x.ad_id FROM campaign_ads x JOIN campaigns c ON c.id = x.campaign_id WHERE c.set_id = ?').bind(id),
    env.DB.prepare(`SELECT r.ad_id, SUM(r.value = 1) AS up, SUM(r.value = -1) AS down FROM reviews r JOIN ads a ON a.id = r.ad_id WHERE a.set_id = ? GROUP BY r.ad_id`).bind(id),
    env.DB.prepare('SELECT r.ad_id, r.value FROM reviews r JOIN ads a ON a.id = r.ad_id WHERE a.set_id = ? AND r.email = ?').bind(id, email || ''),
    env.DB.prepare('SELECT c.ad_id, COUNT(*) AS n FROM comments c JOIN ads a ON a.id = c.ad_id WHERE a.set_id = ? GROUP BY c.ad_id').bind(id),
    env.DB.prepare('SELECT d.ad_id, COUNT(*) AS n FROM downloads d JOIN ads a ON a.id = d.ad_id WHERE a.set_id = ? GROUP BY d.ad_id').bind(id),
  ]);
  const per: Record<string, any> = {};
  const at = (k: string) => (per[k] ||= { campaigns: [], up: 0, down: 0, mine: 0, comments: 0, downloads: 0 });
  for (const r of links.results as any[]) at(r.ad_id).campaigns.push(r.campaign_id);
  for (const r of reviews.results as any[]) Object.assign(at(r.ad_id), { up: r.up || 0, down: r.down || 0 });
  for (const r of mine.results as any[]) at(r.ad_id).mine = r.value;
  for (const r of comments.results as any[]) at(r.ad_id).comments = r.n;
  for (const r of downloads.results as any[]) at(r.ad_id).downloads = r.n;
  return json({
    me: { email, role: who.role, owner: who.owner, tourRole: await tourRole(env, email) },
    sets: (await env.DB.prepare(`SELECT s.id, s.name, (SELECT COUNT(*) FROM ads a WHERE a.set_id = s.id AND a.status != 'archived') AS ad_count FROM ad_sets s ORDER BY s.created_at DESC`).all()).results,
    set: { ...set, copy: parse(set.copy) },
    ads: (ads.results as any[]).map((a) => ({ ...a, meta: parse(a.meta), stats: at(a.id) })),
    files: files.results,
    campaigns: campaigns.results,
    channels: CHANNELS,
  });
}

async function createSet(request: Request, env: Env, email: string) {
  const b: any = await request.json().catch(() => ({}));
  const name = clip(b.name, 120);
  if (!name) return err(400, 'Give the ad set a name.');
  let id = slug(b.id || name) || 'ads';
  if (await env.DB.prepare('SELECT 1 FROM ad_sets WHERE id = ?').bind(id).first()) id += '-' + Date.now().toString(36);
  const ts = now();
  await env.DB.prepare('INSERT INTO ad_sets (id, name, summary, study_url, release_url, copy, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, name, clip(b.summary, 1000) || null, url(b.study_url), url(b.release_url), '{}', email, ts, ts).run();
  return json({ id }, 201);
}

// ------------------------------------------------------------------ ads
// Motion ads get a still poster (their end card) for the grid. The browser makes it and sends it as "poster".
async function savePoster(env: Env, form: FormData, key: string): Promise<string | null> {
  const p = form.get('poster');
  if (!p || typeof p === 'string' || !['image/jpeg', 'image/webp'].includes(p.type) || p.size > 600_000) return null;
  const pkey = key + '.poster.' + (p.type === 'image/webp' ? 'webp' : 'jpg');
  await env.AD_ASSETS.put(pkey, await p.arrayBuffer(), { httpMetadata: { contentType: p.type } });
  return pkey;
}
async function upload(request: Request, env: Env, setId: string, email: string) {
  if (!(await env.DB.prepare('SELECT 1 FROM ad_sets WHERE id = ?').bind(setId).first())) return err(404, 'Ad set not found.');
  const form = await request.formData().catch(() => null);
  const f = form?.get('file');
  if (!form || !f || typeof f === 'string') return err(400, 'Choose a file to upload.');
  const type = f.type;
  if (!TYPES[type]) return err(400, 'Upload a JPEG, GIF, PNG or WebP image.');
  if (f.size > MAX_UPLOAD) return err(400, 'That file is over 20 MB.');
  const bytes = new Uint8Array(await f.arrayBuffer());
  const dims = dimensions(bytes, type);
  if (!dims || !dims.width || !dims.height) return err(400, 'That image could not be read.');
  const isMotion = animated(bytes, type);
  const base = slug(f.name.replace(/\.[a-z0-9]+$/i, '')) || 'ad';
  const id = `${setId}-up-${Date.now().toString(36)}-${base}`.slice(0, 150);
  const ext = { 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/png': 'png', 'image/webp': 'webp' }[type];
  const key = `sets/${setId}/uploads/${id}.${ext}`;
  const variant = VARIANTS.includes(String(form.get('variant'))) ? String(form.get('variant')) : isMotion ? 'motion' : 'other';
  const status = STATUSES.includes(String(form.get('status'))) ? String(form.get('status')) : 'in_review';
  const ts = now();
  await env.AD_ASSETS.put(key, bytes, { httpMetadata: { contentType: type }, customMetadata: { uploadedBy: email, originalName: f.name.slice(0, 200) } });
  const posterKey = isMotion ? await savePoster(env, form, key) : null;
  await env.DB.prepare(`INSERT INTO ads (id, set_id, title, headline, variant, kind, format, width, height, bytes, r2_key, content_type, status,
      campaign_start, campaign_end, meta, uploaded_by, created_at, updated_at, poster_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, setId, clip(form.get('title'), 200) || f.name.slice(0, 200), clip(form.get('headline'), 200) || null, variant, isMotion ? 'motion' : 'still',
      TYPES[type], dims.width, dims.height, bytes.length, key, type, status, date(form.get('campaign_start')), date(form.get('campaign_end')),
      JSON.stringify({ desc: clip(form.get('desc'), 300) || undefined, originalName: f.name.slice(0, 200) }), email, ts, ts, posterKey).run();
  return json({ id }, 201);
}

async function updateAd(request: Request, env: Env, id: string, who: Who, ctx: ExecutionContext) {
  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ?').bind(id).first();
  if (!ad) return err(404, 'Ad not found.');
  const b: any = await request.json().catch(() => ({}));
  const sets: string[] = [];
  const args: unknown[] = [];
  if ('title' in b) { const t = clip(b.title, 200); if (!t) return err(400, 'The title can’t be empty.'); sets.push('title = ?'); args.push(t); }
  if ('headline' in b) { sets.push('headline = ?'); args.push(clip(b.headline, 200) || null); }
  if ('status' in b) { if (!STATUSES.includes(b.status)) return err(400, 'Unknown status.'); sets.push('status = ?'); args.push(b.status); }
  if ('campaign_start' in b) { sets.push('campaign_start = ?'); args.push(date(b.campaign_start)); }
  if ('campaign_end' in b) { sets.push('campaign_end = ?'); args.push(date(b.campaign_end)); }
  if (!sets.length) return err(400, 'Nothing to change.');
  await env.DB.prepare(`UPDATE ads SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...args, now(), id).run();
  if (b.status === 'needs_changes') await notifyChanges(env, [id], who, ctx);
  return json({ ok: true });
}

// Several ads at once (Set status, Approve selected, the review queue).
async function bulkStatus(request: Request, env: Env, who: Who, ctx: ExecutionContext) {
  const b: any = await request.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: unknown) => typeof x === 'string' && ID.test(x)).slice(0, 500);
  if (!ids.length) return err(400, 'Choose some ads.');
  if (!STATUSES.includes(b.status)) return err(400, 'Unknown status.');
  const ts = now();
  await env.DB.batch(ids.map((id: string) => env.DB.prepare('UPDATE ads SET status = ?, updated_at = ? WHERE id = ?').bind(b.status, ts, id)));
  if (b.status === 'needs_changes') await notifyChanges(env, ids, who, ctx);
  return json({ ok: true, count: ids.length });
}
async function notifyChanges(env: Env, ids: string[], who: Who, ctx: ExecutionContext) {
  const first = await env.DB.prepare('SELECT set_id, title, uploaded_by FROM ads WHERE id = ?').bind(ids[0]).first<any>();
  if (!first) return;
  await notify(env, [...(await editors(env)), first.uploaded_by], { kind: 'changes_requested', actor: who.email, setId: first.set_id, adId: ids.length === 1 ? ids[0] : null,
    text: `${who.email.split('@')[0]} asked for changes on ${ids.length === 1 ? first.title : ids.length + ' ads'}.` }, ctx);
}

async function deleteAd(env: Env, id: string, who: Who) {
  const email = who.email;
  const ad = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!ad) return err(404, 'Ad not found.');
  if (ad.uploaded_by !== email && !can(who, 'admin')) return err(403, 'Only the person who uploaded this ad, or an admin, can delete it. You can archive it instead.');
  await env.DB.batch(['campaign_ads', 'reviews', 'comments', 'downloads'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE ad_id = ?`).bind(id))
    .concat([env.DB.prepare('DELETE FROM ads WHERE id = ?').bind(id)]));
  await env.AD_ASSETS.delete(ad.r2_key);
  return json({ ok: true });
}

async function review(request: Request, env: Env, id: string, email: string, who: Who, ctx: ExecutionContext) {
  if (!(await env.DB.prepare('SELECT 1 FROM ads WHERE id = ?').bind(id).first())) return err(404, 'Ad not found.');
  const { value } = (await request.json().catch(() => ({}))) as any;
  const v = value === 1 || value === -1 ? value : 0;
  if (v) await env.DB.prepare(`INSERT INTO reviews (ad_id, email, value, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(ad_id, email) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`).bind(id, email, v, now()).run();
  else await env.DB.prepare('DELETE FROM reviews WHERE ad_id = ? AND email = ?').bind(id, email).run();
  if (v === -1) await notifyChanges(env, [id], who, ctx);
  const r = await env.DB.prepare('SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM reviews WHERE ad_id = ?').bind(id).first<any>();
  return json({ up: r?.up || 0, down: r?.down || 0, mine: v });
}

async function comments(env: Env, id: string) {
  const [c, r] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM comments WHERE ad_id = ? ORDER BY created_at DESC LIMIT 200').bind(id),
    env.DB.prepare('SELECT email, value FROM reviews WHERE ad_id = ? ORDER BY created_at DESC').bind(id),
  ]);
  return json({ items: c.results, reviews: r.results });
}

async function addComment(request: Request, env: Env, id: string, email: string, ctx: ExecutionContext) {
  const ad = await env.DB.prepare('SELECT set_id, title, uploaded_by FROM ads WHERE id = ?').bind(id).first<any>();
  if (!ad) return err(404, 'Ad not found.');
  const b: any = await request.json().catch(() => ({}));
  const body = clip(b.body, 5000);
  if (!body) return err(400, 'Write a comment first.');
  await env.DB.prepare('INSERT INTO comments (ad_id, author_email, type, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, COMMENT_TYPES.includes(b.type) ? b.type : 'other', body, now()).run();
  // Editors hear about suggestions and comments; the uploader hears about comments on their ad.
  const name = email.split('@')[0];
  const suggestion = b.type === 'content';
  await notify(env, [...(await editors(env)), ad.uploaded_by], { kind: suggestion ? 'suggestion' : 'comment', actor: email, setId: ad.set_id, adId: id,
    text: `${name} ${suggestion ? 'suggested a change on' : 'commented on'} ${ad.title}: “${body.slice(0, 140)}${body.length > 140 ? '…' : ''}”` }, ctx);
  return comments(env, id);
}

async function downloads(request: Request, env: Env, email: string) {
  const b: any = await request.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: unknown) => typeof x === 'string' && ID.test(x)).slice(0, 500);
  if (ids.length) {
    const ts = now();
    await env.DB.batch(ids.map((id: string) => env.DB.prepare('INSERT INTO downloads (ad_id, email, created_at) VALUES (?, ?, ?)').bind(id, email, ts)));
  }
  return json({ ok: true });
}

// ------------------------------------------------------------------ campaigns
function campaignFields(b: any, partial: boolean): { out?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {};
  if (!partial || 'name' in b) { const n = clip(b.name, 120); if (!n) return { error: 'Give the campaign a name.' }; out.name = n; }
  if ('channel' in b) out.channel = CHANNELS.includes(b.channel) ? b.channel : 'other';
  if ('status' in b) { if (!CAMPAIGN_STATUSES.includes(b.status)) return { error: 'Unknown status.' }; out.status = b.status; }
  if ('start_date' in b) out.start_date = date(b.start_date);
  if ('end_date' in b) out.end_date = date(b.end_date);
  if ('owner_email' in b) out.owner_email = clip(b.owner_email, 200).toLowerCase() || null;
  if ('notes' in b) out.notes = clip(b.notes, 4000) || null;
  return { out };
}

async function setCampaignAds(env: Env, id: number, add: string[], remove: string[], email: string) {
  const ts = now();
  await env.DB.batch([
    ...add.map((a) => env.DB.prepare('INSERT OR IGNORE INTO campaign_ads (campaign_id, ad_id, added_by, added_at) SELECT ?, id, ?, ? FROM ads WHERE id = ?').bind(id, email, ts, a)),
    ...remove.map((a) => env.DB.prepare('DELETE FROM campaign_ads WHERE campaign_id = ? AND ad_id = ?').bind(id, a)),
    env.DB.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').bind(ts, id),
  ]);
}
const ids = (a: unknown) => (Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && ID.test(x)).slice(0, 500) as string[];

async function createCampaign(request: Request, env: Env, setId: string, email: string) {
  if (!(await env.DB.prepare('SELECT 1 FROM ad_sets WHERE id = ?').bind(setId).first())) return err(404, 'Ad set not found.');
  const b: any = await request.json().catch(() => ({}));
  const { out, error } = campaignFields(b, false);
  if (error || !out) return err(400, error || 'Invalid campaign.');
  const ts = now();
  const row = await env.DB.prepare(`INSERT INTO campaigns (set_id, name, channel, status, start_date, end_date, owner_email, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(setId, out.name, out.channel || 'google-display', out.status || 'planned', out.start_date ?? null, out.end_date ?? null,
      out.owner_email || email, out.notes ?? null, email, ts, ts).first<{ id: number }>();
  const add = ids(b.ads);
  if (row && add.length) await setCampaignAds(env, row.id, add, [], email);
  return json({ id: row?.id }, 201);
}

async function campaignRoute(request: Request, env: Env, id: number, sub: string | undefined, who: Who) {
  const email = who.email;
  const c = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!c) return err(404, 'Campaign not found.');
  const m = request.method;
  if (sub === 'ads' && m === 'POST') {
    const b: any = await request.json().catch(() => ({}));
    await setCampaignAds(env, id, ids(b.add), ids(b.remove), email);
    return json({ ok: true });
  }
  if (!sub && m === 'PATCH') {
    const { out, error } = campaignFields(await request.json().catch(() => ({})), true);
    if (error || !out) return err(400, error || 'Invalid campaign.');
    const keys = Object.keys(out);
    if (keys.length) await env.DB.prepare(`UPDATE campaigns SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => out[k]), now(), id).run();
    return json({ ok: true });
  }
  if (!sub && m === 'DELETE') {
    if (c.created_by !== email && !can(who, 'admin')) return err(403, 'Only the person who added this campaign, or an admin, can delete it.');
    await env.DB.batch([env.DB.prepare('DELETE FROM campaign_ads WHERE campaign_id = ?').bind(id), env.DB.prepare('DELETE FROM campaigns WHERE id = ?').bind(id)]);
    return json({ ok: true });
  }
  return err(405, 'Method not allowed');
}

async function campaignsCsv(env: Env, setId: string) {
  const { results } = await env.DB.prepare(`SELECT c.id, c.name, c.channel, c.status, c.start_date, c.end_date, c.owner_email, c.notes,
      a.id AS ad_id, a.title AS ad_title, a.width || 'x' || a.height AS ad_size, a.format AS ad_format, x.added_by, x.added_at
    FROM campaigns c LEFT JOIN campaign_ads x ON x.campaign_id = c.id LEFT JOIN ads a ON a.id = x.ad_id WHERE c.set_id = ? ORDER BY c.id, a.id`).bind(setId).all();
  const cols = ['id', 'name', 'channel', 'status', 'start_date', 'end_date', 'owner_email', 'notes', 'ad_id', 'ad_title', 'ad_size', 'ad_format', 'added_by', 'added_at'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...(results as any[]).map((r) => cols.map((k) => esc(r[k])).join(','))].join('\r\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${setId}-campaigns-${now().slice(0, 10)}.csv"` } });
}

// ------------------------------------------------------------------ copy edits (editors)
// The set's copy drives the ad template. The portal saves the new copy, re-renders the affected ads in the
// editor's browser (public/render.js) and uploads each new file with replaceFile().
const LIMITS: Record<string, number> = { eyebrow: 40, cta: 24, ctaShort: 14, source: 140, sourceShort: 60, longHeadline: 120 };
async function updateCopy(request: Request, env: Env, setId: string, who: Who) {
  const set = await env.DB.prepare('SELECT copy FROM ad_sets WHERE id = ?').bind(setId).first<{ copy: string }>();
  if (!set) return err(404, 'Ad set not found.');
  const cur = parse(set.copy);
  const b: any = await request.json().catch(() => ({}));
  const next = { ...cur };
  const changed: string[] = [];
  for (const [k, n] of Object.entries(LIMITS)) {
    if (!(k in b)) continue;
    const v = clip(b[k], n);
    if (!v && k !== 'longHeadline') return err(400, 'The ' + k + ' can’t be empty.');
    if (v !== cur[k]) { next[k] = v; changed.push(k); }
  }
  if (b.stat && typeof b.stat === 'object') {
    const stat = { ...(cur.stat || {}) };
    // pre (the small lead-in above the big number, e.g. "Can add") may be empty; the rest can't.
    for (const [k, n] of [['line', 50], ['pre', 16], ['big', 8], ['unit', 60], ['note', 60]] as [string, number][]) {
      if (!(k in b.stat)) continue;
      const v = clip(b.stat[k], n);
      if (!v && k !== 'pre') return err(400, 'The stat can’t be empty.');
      if (v !== stat[k]) { stat[k] = v; changed.push('stat.' + k); }
    }
    next.stat = stat;
  }
  if (Array.isArray(b.headlines)) {
    next.headlines = (cur.headlines || []).map((h: any) => {
      const e = b.headlines.find((x: any) => x && x.id === h.id);
      if (!e) return h;
      const text = 'text' in e ? clip(e.text, 60) : h.text;
      const desc = 'desc' in e ? clip(e.desc, 140) : h.desc;
      if (!text) throw new Error('A headline can’t be empty.');
      if (text !== h.text) changed.push(h.id + '.text');
      if (desc !== h.desc) changed.push(h.id + '.desc');
      return { ...h, text, desc };
    });
  }
  if (!changed.length) return json({ copy: cur, changed });
  // Keep every version (the first save also records the copy it started from) so it can be restored.
  const ts = now();
  const hasHistory = await env.DB.prepare('SELECT 1 FROM copy_versions WHERE set_id = ? LIMIT 1').bind(setId).first();
  await env.DB.batch([
    ...(hasHistory ? [] : [env.DB.prepare('INSERT INTO copy_versions (set_id, copy, changed, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(setId, JSON.stringify(cur), '[]', 'original', ts)]),
    env.DB.prepare('INSERT INTO copy_versions (set_id, copy, changed, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(setId, JSON.stringify(next), JSON.stringify(changed), who.email, ts),
    env.DB.prepare('UPDATE ad_sets SET copy = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), ts, setId),
  ]);
  await log(env, who.email, 'copy_updated', setId, { changed, before: Object.fromEntries(changed.map((k) => [k, pick(cur, k)])), after: Object.fromEntries(changed.map((k) => [k, pick(next, k)])) });
  return json({ copy: next, changed });
}
async function copyVersions(env: Env, setId: string, vid?: string) {
  if (vid) {
    const v = await env.DB.prepare('SELECT * FROM copy_versions WHERE set_id = ? AND id = ?').bind(setId, parseInt(vid, 10) || 0).first<any>();
    return v ? json({ ...v, copy: parse(v.copy), changed: parse(v.changed) }) : err(404, 'Version not found.');
  }
  const { results } = await env.DB.prepare('SELECT id, changed, created_by, created_at FROM copy_versions WHERE set_id = ? ORDER BY id DESC LIMIT 50').bind(setId).all<any>();
  return json({ versions: results.map((v) => ({ ...v, changed: parse(v.changed) })) });
}

function pick(copy: any, path: string) {
  const [a, b] = path.split('.');
  if (/^h\d+$/.test(a)) return (copy.headlines || []).find((h: any) => h.id === a)?.[b];
  return b ? copy[a]?.[b] : copy[a];
}

// A re-rendered file for an existing ad: same key, size and type; the ad goes back to "In review".
async function replaceFile(request: Request, env: Env, id: string, who: Who) {
  const ad = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!ad) return err(404, 'Ad not found.');
  const form = await request.formData().catch(() => null);
  const f = form?.get('file');
  if (!form || !f || typeof f === 'string') return err(400, 'No file.');
  if (f.type !== ad.content_type) return err(400, 'The new file must be a ' + ad.format + ', like the old one.');
  const bytes = new Uint8Array(await f.arrayBuffer());
  const dims = dimensions(bytes, f.type);
  if (!dims || dims.width !== ad.width || dims.height !== ad.height) return err(400, `The new file must be ${ad.width}×${ad.height}.`);
  const extra = parse(String(form.get('meta') || '{}'));
  const meta: Record<string, any> = { ...parse(ad.meta), ...pickMeta(extra), rerenderedBy: who.email, rerenderedAt: now() };
  if (meta.overrides && !Object.keys(meta.overrides).length) delete meta.overrides; // back to the shared copy
  await env.AD_ASSETS.put(ad.r2_key, bytes, { httpMetadata: { contentType: f.type }, customMetadata: { uploadedBy: who.email } });
  const posterKey = ad.kind === 'motion' ? await savePoster(env, form, ad.r2_key) : null;
  await env.DB.prepare('UPDATE ads SET bytes = ?, headline = COALESCE(?, headline), title = COALESCE(?, title), meta = ?, status = ?, poster_key = COALESCE(?, poster_key), updated_at = ? WHERE id = ?')
    .bind(bytes.length, clip(form.get('headline'), 200) || null, clip(form.get('title'), 200) || null, JSON.stringify(meta), 'in_review', posterKey, now(), id).run();
  return json({ ok: true, bytes: bytes.length });
}
// Per-ad copy overrides ("Only this ad" in the portal): text this one ad shows instead of the set's shared copy.
const OVERRIDES: Record<string, number> = { headline: 60, desc: 140, eyebrow: 40, cta: 24, source: 140, statLine: 50, statPre: 16, statBig: 8, statUnit: 60, statNote: 60 };
function pickMeta(m: any) {
  const out: Record<string, unknown> = {};
  if (typeof m.desc === 'string') out.desc = m.desc.slice(0, 300);
  if (m.overrides && typeof m.overrides === 'object') {
    const o: Record<string, string> = {};
    for (const [k, n] of Object.entries(OVERRIDES)) if (typeof m.overrides[k] === 'string' && m.overrides[k].trim()) o[k] = m.overrides[k].trim().slice(0, n);
    out.overrides = o;
  }
  for (const k of ['duration', 'frames', 'colors', 'quality']) if (typeof m[k] === 'number') out[k] = m[k];
  return out;
}

// After a batch of edits or uploads: log it and tell the reviewers.
async function logRerender(request: Request, env: Env, setId: string, who: Who, ctx: ExecutionContext) {
  const b: any = await request.json().catch(() => ({}));
  const count = Number(b.count) || 0;
  const uploaded = b.kind === 'upload';
  await log(env, who.email, uploaded ? 'ads_uploaded' : 'ads_rerendered', setId, { count, failed: Number(b.failed) || 0, changed: Array.isArray(b.changed) ? b.changed.slice(0, 40) : [] });
  if (count) await notify(env, await editors(env), { kind: 'review_needed', actor: who.email, setId, adId: count === 1 && typeof b.adId === 'string' ? b.adId : null,
    text: `${who.email.split('@')[0]} ${uploaded ? 'uploaded' : 'updated'} ${count === 1 ? 'an ad' : count + ' ads'}; ${count === 1 ? 'it needs' : 'they need'} review.` }, ctx);
  return json({ ok: true });
}

// ------------------------------------------------------------------ router
async function api(request: Request, env: Env, path: string, email: string, ctx: ExecutionContext): Promise<Response> {
  const m = request.method;
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const who = await whoIs(env, email);
  const me = email;
  // Viewers: read, download, comment. Editors: everything that changes ads, copy or campaigns. Admins: people.
  const editor = (fn: () => Promise<Response>) => (can(who, 'editor') ? fn() : err(403, 'You need editor access for this. Ask an admin.'));

  if (seg[0] === 'me' && seg[1] === 'tour' && m === 'POST') return setTourRole(request, env, who);
  if (seg[0] === 'me') { await seen(env, email); return json({ email, role: who.role, owner: who.owner, tourRole: await tourRole(env, email) }); }
  if (seg[0] === 'help' && seg[1] === 'contacts' && m === 'GET') return helpContacts(env);
  if (seg[0] === 'help' && seg[1] === 'feedback' && m === 'POST') return helpFeedback(request, env, who);
  if (seg[0] === 'users') return usersApi(request, env, who, seg[1], ctx);
  if (seg[0] === 'notifications') return inbox(request, env, email, seg[1]);
  if (seg[0] === 'sets' && seg.length === 1) return m === 'POST' ? editor(() => createSet(request, env, me)) : listSets(env);
  if (seg[0] === 'sets' && seg[1] && ID.test(seg[1])) {
    if (seg.length === 2 && m === 'GET') return getSet(env, seg[1], who);
    if (seg[2] === 'ads' && m === 'POST') return editor(() => upload(request, env, seg[1], me));
    if (seg[2] === 'copy' && m === 'PUT') return editor(() => updateCopy(request, env, seg[1], who).catch((e) => err(400, e.message)));
    if (seg[2] === 'rerendered' && m === 'POST') return editor(() => logRerender(request, env, seg[1], who, ctx));
    if (seg[2] === 'copy' && seg[3] === 'versions' && m === 'GET') return editor(() => copyVersions(env, seg[1], seg[4]));
    if (seg[2] === 'campaigns' && m === 'POST') return editor(() => createCampaign(request, env, seg[1], me));
    if (seg[2] === 'campaigns.csv' && m === 'GET') return campaignsCsv(env, seg[1]);
  }
  if (seg[0] === 'ads' && seg.length === 1 && m === 'PATCH') return editor(() => bulkStatus(request, env, who, ctx));
  if (seg[0] === 'ads' && seg[1] && ID.test(seg[1])) {
    if (seg.length === 2 && m === 'PATCH') return editor(() => updateAd(request, env, seg[1], who, ctx));
    if (seg.length === 2 && m === 'DELETE') return editor(() => deleteAd(env, seg[1], who));
    if (seg[2] === 'file' && m === 'PUT') return editor(() => replaceFile(request, env, seg[1], who));
    if (seg[2] === 'review' && m === 'POST') return editor(() => review(request, env, seg[1], me, who, ctx));
    if (seg[2] === 'comments' && m === 'GET') return comments(env, seg[1]);
    if (seg[2] === 'comments' && m === 'POST') return addComment(request, env, seg[1], me, ctx);
  }
  if (seg[0] === 'campaigns' && seg[1]) {
    const id = parseInt(seg[1], 10);
    if (id) return editor(() => campaignRoute(request, env, id, seg[2], who));
  }
  if (seg[0] === 'downloads' && m === 'POST') return downloads(request, env, me);
  return err(404, 'Not found');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const email = await accessEmail(request, env);
    if (!email) {
      // Pages go to the Yondr Google sign-in and come back; API calls and files get a 401.
      if ((request.method === 'GET' || request.method === 'HEAD') && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/files/'))
        return new Response(null, { status: 302, headers: { location: loginUrl(request), 'cache-control': 'no-store' } });
      return new Response('Sign-in required. Open https://ads.overyondrdev.com and sign in with your Yondr Google account.', {
        status: 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
    }
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url.pathname.slice(5), email, ctx);
      if (url.pathname.startsWith('/files/')) {
        const key = decodeURIComponent(url.pathname.slice(7));
        if (!/^sets\/[a-z0-9-]+\/[a-z0-9./_-]+$/.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });
        return await file(request, env, key);
      }
    } catch (e) {
      console.error(e);
      return err(500, 'Something went wrong. Please try again.');
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    return serveStatic(url.pathname);
  },
} satisfies ExportedHandler<Env>;
