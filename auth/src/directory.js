// The Yondr people directory: the "Yondr Team Contact List" Google Sheet, copied a few times a day into KV so every
// overyondrdev.com site can autofill names and emails (README "People directory").
//
// - Read with a read-only Google service account (secret DIRECTORY_SA_KEY = its JSON key; the sheet is shared with
//   it as Viewer). Sheet id: var DIRECTORY_SHEET_ID.
// - Only first name, last name, @overyondr.com email and title are kept. Phone numbers and locations never leave the
//   sheet.
// - Safety: rows without a valid work email are skipped (and counted); an update that would remove more than 20 % of
//   people at once is not applied (a sorting or filtering slip in the sheet can't wipe the directory). People who leave
//   the sheet are kept as inactive, so existing records can still show their name, but they are no longer suggested.

import { b64u } from './jwt.js';

export const KV_DATA = 'directory:v1';
export const KV_META = 'directory:meta';
export const MAX_REMOVED_SHARE = 0.2;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const enc = new TextEncoder();

const clean = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const key = (h) => String(h || '').toLowerCase().replace(/[^a-z]/g, '');

/** Which column holds what, by header name ("First", "Last Name", "E-Mail", "Title"); tolerant of small renames. */
export function columns(header) {
  const k = (header || []).map(key);
  const find = (...names) => k.findIndex((h) => names.includes(h));
  const cols = { first: find('first', 'firstname', 'givenname'), last: find('last', 'lastname', 'surname', 'familyname'), email: find('email', 'emailaddress', 'workemail'), title: find('title', 'jobtitle', 'role', 'position') };
  return cols.first < 0 || cols.email < 0 ? null : cols;
}

/** Sheet rows → people. Pure. Returns { people, skipped } (skipped = row numbers without a valid work email). */
export function parseRows(values, domains = ['overyondr.com']) {
  const [header, ...rows] = values || [];
  const cols = columns(header);
  if (!cols) throw new Error('The sheet has no "First" and "E-Mail" columns.');
  const people = new Map();
  const skipped = [];
  rows.forEach((r, i) => {
    const first = clean(r[cols.first], 60);
    const last = cols.last >= 0 ? clean(r[cols.last], 60) : '';
    const email = clean(r[cols.email], 120).toLowerCase();
    if (!first && !last && !email) return; // blank row
    const domain = email.slice(email.lastIndexOf('@') + 1);
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) || !domains.includes(domain)) {
      skipped.push(i + 2);
      return;
    }
    people.set(email, { first, last, name: clean(`${first} ${last}`, 120) || email, email, title: cols.title >= 0 ? clean(r[cols.title], 120) : '' });
  });
  return { people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), skipped };
}

/** Merge a fresh list into the stored one. Pure. Refuses (guard) when too many active people would disappear. */
export function merge(previous, fresh, now = new Date().toISOString()) {
  const prev = new Map((previous || []).map((p) => [p.email, p]));
  const next = new Map(fresh.map((p) => [p.email, p]));
  const prevActive = [...prev.values()].filter((p) => p.active !== false);
  const removed = prevActive.filter((p) => !next.has(p.email)).map((p) => p.email);
  if (prevActive.length >= 10 && removed.length / prevActive.length > MAX_REMOVED_SHARE) {
    return { guard: true, removed };
  }
  const added = [];
  const changed = [];
  const out = [];
  for (const p of fresh) {
    const old = prev.get(p.email);
    if (!old || old.active === false) added.push(p.email);
    else if (old.name !== p.name || old.title !== p.title) changed.push(p.email);
    out.push({ ...p, active: true, since: old && old.active !== false ? old.since || now : now });
  }
  for (const p of prev.values()) if (!next.has(p.email)) out.push({ ...p, active: false, left: p.active === false ? p.left || now : now });
  out.sort((a, b) => a.name.localeCompare(b.name));
  return { people: out, added, removed, changed };
}

function pemToPkcs8(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** A Google access token for the service account (JWT bearer grant, RS256 on WebCrypto). */
export async function serviceAccountToken(saJson, fetchFn = fetch) {
  const sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('DIRECTORY_SA_KEY is not a service account JSON key.');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = b64u(enc.encode(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })));
  const k = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64u(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, enc.encode(`${head}.${body}`))));
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google refused the service account (${res.status} ${j.error || ''}).`);
  return j.access_token;
}

async function readSheet(env, fetchFn) {
  const token = await serviceAccountToken(env.DIRECTORY_SA_KEY, fetchFn);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.DIRECTORY_SHEET_ID)}/values/${encodeURIComponent(env.DIRECTORY_RANGE || 'A1:Z2000')}?majorDimension=ROWS`;
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 404 ? ' Is the sheet shared with the service account as Viewer, and is the Google Sheets API enabled?' : '';
    throw new Error(`Couldn't read the sheet (${res.status}).${hint}`);
  }
  return j.values || [];
}

export const domainsOf = (env) => String(env.ALLOWED_EMAIL_DOMAINS || 'overyondr.com').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);

/** Read the sheet and store the directory. Never throws: the outcome is written to KV_META (no personal data). */
export async function syncDirectory(env, { fetchFn = fetch, now = new Date().toISOString() } = {}) {
  const meta = (await env.DIRECTORY.get(KV_META, 'json')) || {};
  meta.last_attempt = now;
  try {
    if (!env.DIRECTORY_SA_KEY || !env.DIRECTORY_SHEET_ID) throw new Error('Not set up: DIRECTORY_SA_KEY or DIRECTORY_SHEET_ID is missing.');
    const { people: fresh, skipped } = parseRows(await readSheet(env, fetchFn), domainsOf(env));
    if (!fresh.length) throw new Error('The sheet has no rows with a valid work email; nothing was changed.');
    const stored = (await env.DIRECTORY.get(KV_DATA, 'json')) || { people: [] };
    const m = merge(stored.people, fresh, now);
    if (m.guard) {
      Object.assign(meta, { ok: false, error: `Not applied: ${m.removed.length} of ${stored.people.filter((p) => p.active !== false).length} people would have been removed at once (limit ${MAX_REMOVED_SHARE * 100} %). Check the sheet's filters and sorting.`, guard: true });
    } else {
      await env.DIRECTORY.put(KV_DATA, JSON.stringify({ updated: now, people: m.people }));
      const history = [{ at: now, added: m.added.length, removed: m.removed.length, changed: m.changed.length }, ...(meta.history || [])].slice(0, 30);
      Object.assign(meta, { ok: true, error: null, guard: false, last_ok: now, active: fresh.length, inactive: m.people.length - fresh.length, skipped_rows: skipped, last_change: m.added.length + m.removed.length + m.changed.length ? { at: now, added: m.added, removed: m.removed, changed: m.changed } : meta.last_change || null, history });
    }
  } catch (e) {
    Object.assign(meta, { ok: false, error: String(e && e.message ? e.message : e).slice(0, 300) });
  }
  await env.DIRECTORY.put(KV_META, JSON.stringify(meta));
  return meta;
}

/** What the picker gets: active people only, the fields it shows. */
export async function activePeople(env) {
  const d = (await env.DIRECTORY.get(KV_DATA, 'json')) || { people: [] };
  return { updated: d.updated || null, people: d.people.filter((p) => p.active !== false).map(({ name, email, title }) => ({ name, email, title })) };
}

/** Names for known addresses, former staff included (so old records still show a name). */
export async function lookup(env, emails) {
  const want = new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean).slice(0, 100));
  const d = (await env.DIRECTORY.get(KV_DATA, 'json')) || { people: [] };
  return d.people.filter((p) => want.has(p.email)).map(({ name, email, title, active }) => ({ name, email, title, active: active !== false }));
}
