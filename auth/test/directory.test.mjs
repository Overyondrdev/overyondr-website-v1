import test from 'node:test';
import assert from 'node:assert/strict';
import { columns, parseRows, merge, syncDirectory, activePeople, lookup, KV_DATA } from '../src/directory.js';

const header = ['First', 'Last Name', 'City', 'State', 'Country', 'Phone #', 'E-Mail', 'Title'];
const row = (f, l, e, t = 'Manager') => [f, l, 'Somewhere', 'n/a', 'USA', '555 - 0100', e, t];

function kv() {
  const m = new Map();
  return { get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), m };
}

test('columns are found by header name', () => {
  assert.deepEqual(columns(header), { first: 0, last: 1, email: 6, title: 7 });
  assert.equal(columns(['Name', 'Phone']), null);
});

test('rows: keeps name, email and title only; skips bad emails; no phone or city', () => {
  const { people, skipped } = parseRows([header, row('Sam', 'Lee', ' Sam@Overyondr.com '), row('Pat', 'Kim', 'pat@gmail.com'), row('', '', ''), row('Ana', 'Ruiz', 'not-an-email')]);
  assert.deepEqual(people, [{ first: 'Sam', last: 'Lee', name: 'Sam Lee', email: 'sam@overyondr.com', title: 'Manager' }]);
  assert.deepEqual(skipped, [3, 5]);
  assert.ok(!JSON.stringify(people).includes('555'));
  assert.ok(!JSON.stringify(people).includes('Somewhere'));
});

test('merge: added, changed, leavers kept inactive', () => {
  const a = parseRows([header, row('Sam', 'Lee', 'sam@overyondr.com'), row('Pat', 'Kim', 'pat@overyondr.com')]).people;
  const first = merge([], a, 't1');
  assert.deepEqual(first.added.sort(), ['pat@overyondr.com', 'sam@overyondr.com']);
  const b = parseRows([header, row('Sam', 'Lee', 'sam@overyondr.com', 'Director')]).people;
  const second = merge(first.people, b, 't2');
  assert.deepEqual(second.changed, ['sam@overyondr.com']);
  assert.deepEqual(second.removed, ['pat@overyondr.com']);
  const pat = second.people.find((p) => p.email === 'pat@overyondr.com');
  assert.equal(pat.active, false);
  assert.equal(pat.left, 't2');
});

test('merge guard: refuses to remove more than 20 % at once', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ first: 'P' + i, last: 'X', name: 'P' + i + ' X', email: `p${i}@overyondr.com`, title: '' }));
  const base = merge([], many).people;
  assert.equal(merge(base, many.slice(0, 15)).guard, true); // 25 % gone
  assert.ok(!merge(base, many.slice(0, 17)).guard); // 15 % gone
});

test('sync: not set up is reported, nothing stored', async () => {
  const env = { DIRECTORY: kv() };
  const m = await syncDirectory(env);
  assert.equal(m.ok, false);
  assert.match(m.error, /Not set up/);
  assert.equal(env.DIRECTORY.m.has(KV_DATA), false);
});

test('sync: reads the sheet with a service account token and stores active people', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  const sa = JSON.stringify({ client_email: 'reader@example.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----\n` });
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).includes('oauth2')) {
      assert.match(String(init.body), /jwt-bearer/);
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    }
    assert.equal(init.headers.authorization, 'Bearer tok');
    return new Response(JSON.stringify({ values: [header, row('Sam', 'Lee', 'sam@overyondr.com'), row('Pat', 'Kim', 'pat@overyondr.com')] }), { status: 200 });
  };
  const env = { DIRECTORY: kv(), DIRECTORY_SA_KEY: sa, DIRECTORY_SHEET_ID: 'sheet123' };
  const m = await syncDirectory(env, { fetchFn });
  assert.equal(m.ok, true);
  assert.equal(m.active, 2);
  assert.ok(calls[1].includes('/spreadsheets/sheet123/values/'));
  const out = await activePeople(env);
  assert.deepEqual(out.people.map((p) => Object.keys(p).sort()), [['email', 'name', 'title'], ['email', 'name', 'title']]);
  assert.equal((await lookup(env, ['PAT@overyondr.com']))[0].name, 'Pat Kim');
});

test('API: signed-out gets 401 with CORS only for overyondrdev.com origins', async () => {
  const worker = (await import('../src/index.js')).default;
  const env = { DIRECTORY: kv(), SITE_DOMAIN: 'overyondrdev.com' };
  const r = await worker.fetch(new Request('https://auth.overyondrdev.com/api/people', { headers: { origin: 'https://ads.overyondrdev.com' } }), env, { waitUntil() {} });
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://ads.overyondrdev.com');
  const evil = await worker.fetch(new Request('https://auth.overyondrdev.com/api/people', { headers: { origin: 'https://evil.example' } }), env, { waitUntil() {} });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const pre = await worker.fetch(new Request('https://auth.overyondrdev.com/api/people', { method: 'OPTIONS', headers: { origin: 'https://overyondrdev.com' } }), env, {});
  assert.equal(pre.status, 204);
});
