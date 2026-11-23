// Reading client lists: CSV / TSV text, pasted spreadsheet cells, and .xlsx files (read natively, no library).

export function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  const delim = [['\t', count('\t')], [',', count(',')], [';', count(';')]].sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

// ------------------------------------------------------------------ xlsx (zip + XML)
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid Excel file.');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: (name) => files.has(name),
    async text(name) {
      const f = files.get(name);
      if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
      const raw = u8.subarray(start, start + f.size);
      const out = f.method === 0 ? raw : f.method === 8 ? await inflate(raw) : null;
      if (!out) throw new Error('Unsupported compression in Excel file.');
      return dec.decode(out);
    },
  };
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const colIndex = (ref) => {
  const letters = /^[A-Z]+/.exec(ref || '')?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const textOf = (el) => [...el.getElementsByTagName('t')].filter((t) => t.parentNode.nodeName !== 'rPh').map((t) => t.textContent).join('');

export async function parseXlsx(buf) {
  const zip = await unzip(buf);
  const wb = xml(await zip.text('xl/workbook.xml'));
  const firstSheet = wb.getElementsByTagName('sheet')[0];
  let path = 'xl/worksheets/sheet1.xml';
  const rid = firstSheet && (firstSheet.getAttribute('r:id') || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
  const relsText = await zip.text('xl/_rels/workbook.xml.rels');
  if (rid && relsText) {
    const rel = [...xml(relsText).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
    if (rel) {
      const t = rel.getAttribute('Target');
      path = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    }
  }
  const sstText = await zip.text('xl/sharedStrings.xml');
  const shared = sstText ? [...xml(sstText).getElementsByTagName('si')].map(textOf) : [];
  const sheet = xml(await zip.text(path));
  const rows = [];
  for (const r of sheet.getElementsByTagName('row')) {
    const out = [];
    for (const c of r.getElementsByTagName('c')) {
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let val;
      if (type === 's') val = shared[parseInt(v, 10)] ?? '';
      else if (type === 'inlineStr') val = textOf(c);
      else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else val = v;
      const idx = colIndex(c.getAttribute('r'));
      out[idx >= 0 ? idx : out.length] = String(val).trim();
    }
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
    if (out.some((x) => x !== '')) rows.push(out);
  }
  return rows;
}

export async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return parseXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls') || name.endsWith('.numbers')) {
    throw new Error('Please save the file as .xlsx or .csv first (File › Save As), or copy the cells and paste them here.');
  }
  return parseDelimited(await file.text());
}

// ------------------------------------------------------------------ column matching
export const TARGETS = [
  { key: 'name', label: 'Name', hint: 'Name on the envelope', required: true },
  { key: 'first', label: 'First name', hint: 'Combined with last name', alt: true },
  { key: 'last', label: 'Last name', hint: 'Combined with first name', alt: true },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Job title' },
  { key: 'line1', label: 'Street address', required: true },
  { key: 'line2', label: 'Address line 2', hint: 'Suite, floor, apartment' },
  { key: 'city', label: 'City', required: true },
  { key: 'region', label: 'State / region' },
  { key: 'postal_code', label: 'ZIP / postal code' },
  { key: 'country', label: 'Country' },
  { key: 'email', label: 'Email' },
  { key: 'notes', label: 'Notes' },
  { key: 'department', label: 'Department', hint: 'Yondr department sending the card' },
];
const SYN = {
  name: ['name', 'full name', 'fullname', 'recipient', 'recipient name', 'contact', 'contact name', 'client', 'client name', 'addressee', 'display name'],
  first: ['first name', 'first', 'firstname', 'given name', 'forename'],
  last: ['last name', 'last', 'lastname', 'surname', 'family name'],
  company: ['company', 'company name', 'organization', 'organisation', 'org', 'account', 'account name', 'business', 'employer', 'firm'],
  title: ['title', 'job title', 'position', 'role', 'jobtitle'],
  line1: ['address', 'address 1', 'address1', 'address line 1', 'street', 'street address', 'street 1', 'mailing address', 'mailing street', 'address line one', 'addr1'],
  line2: ['address 2', 'address2', 'address line 2', 'street 2', 'suite', 'apt', 'unit', 'apartment', 'floor', 'addr2', 'address line two'],
  city: ['city', 'town', 'town city', 'locality', 'mailing city', 'city town'],
  region: ['state', 'province', 'region', 'state province', 'state region', 'county', 'mailing state', 'state province region', 'st'],
  postal_code: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode', 'post code', 'postal', 'mailing zip', 'zip postal code', 'eircode'],
  country: ['country', 'country code', 'nation', 'mailing country', 'country region'],
  email: ['email', 'e mail', 'email address', 'work email'],
  notes: ['notes', 'note', 'message', 'comments', 'comment', 'card message'],
  department: ['department', 'dept', 'team', 'yondr department', 'business unit', 'sending department'],
};
const normH = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function looksLikeHeader(row) {
  const hits = row.filter((h) => Object.values(SYN).some((list) => list.includes(normH(h)))).length;
  return hits >= 2;
}

export function guessMapping(headers) {
  const map = {};
  const used = new Set();
  for (const t of TARGETS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && SYN[t.key].includes(normH(h)));
    if (i >= 0) { map[t.key] = i; used.add(i); }
  }
  // Fuzzy second pass: header contains a synonym.
  for (const t of TARGETS) {
    if (map[t.key] !== undefined) continue;
    const i = headers.findIndex((h, idx) => !used.has(idx) && SYN[t.key].some((s) => s.length > 3 && normH(h).includes(s)));
    if (i >= 0) { map[t.key] = i; used.add(i); }
  }
  if (map.name === undefined && map.first !== undefined) { /* first + last is fine */ }
  else { delete map.first; delete map.last; }
  return map;
}

export function applyMapping(rows, map) {
  return rows.map((r) => {
    const get = (k) => (map[k] === undefined || map[k] === '' ? '' : String(r[map[k]] ?? '').trim());
    const name = get('name') || [get('first'), get('last')].filter(Boolean).join(' ');
    return {
      name, company: get('company'), title: get('title'), line1: get('line1'), line2: get('line2'), city: get('city'),
      region: get('region'), postal_code: get('postal_code'), country: get('country'), email: get('email'), notes: get('notes'),
      department: get('department'),
    };
  }).filter((r) => Object.values(r).some(Boolean));
}
