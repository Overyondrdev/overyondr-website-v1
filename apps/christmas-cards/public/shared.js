// Shared helpers for the staff page (app.js) and the admin page (admin.js):
// API calls, countries and states, the add/edit client sheet with its address check, toasts and confirms.

export async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 || (res.redirected && !res.url.includes('/api/'))) {
    location.reload();
    throw new Error('Signed out');
  }
  return { ok: res.ok, status: res.status, data };
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ------------------------------------------------------------------ countries & regions
const CODES = 'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
// Shown first in every country list; everything else follows alphabetically.
export const POPULAR = ['US', 'GB', 'MX'];
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const countryName = (c) => { try { return names.of(c) || c; } catch { return c; } };
export const COUNTRIES = CODES.map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1]));

const ALIASES = { USA: 'US', AMERICA: 'US', 'UNITED STATES OF AMERICA': 'US', UK: 'GB', ENGLAND: 'GB', SCOTLAND: 'GB', WALES: 'GB',
  'NORTHERN IRELAND': 'GB', 'GREAT BRITAIN': 'GB', BRITAIN: 'GB', HOLLAND: 'NL', 'THE NETHERLANDS': 'NL', UAE: 'AE', 'SOUTH KOREA': 'KR', KOREA: 'KR' };
export function toCountryCode(text, fallback = '') {
  const s = String(text || '').trim().toUpperCase().replace(/\./g, '');
  if (!s) return fallback;
  if (s.length === 2 && CODES.includes(s)) return s;
  if (s === 'UK') return 'GB';
  if (ALIASES[s]) return ALIASES[s];
  const hit = COUNTRIES.find(([, n]) => n.toUpperCase() === s);
  if (hit) return hit[0];
  const iso3 = { USA: 'US', GBR: 'GB', CAN: 'CA', DEU: 'DE', FRA: 'FR', NLD: 'NL', IRL: 'IE', AUS: 'AU', ESP: 'ES', ITA: 'IT', SGP: 'SG', JPN: 'JP' }[s];
  return iso3 || fallback; // unknown name: leave it for the person to choose
}

export const US_STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam', AS: 'American Samoa',
  MP: 'Northern Mariana Islands', AA: 'Armed Forces Americas', AE: 'Armed Forces Europe', AP: 'Armed Forces Pacific' };
export const CA_PROVINCES = { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon' };
const REGION = {
  US: { label: 'State', list: US_STATES, postal: 'ZIP code', ph: '94043' },
  CA: { label: 'Province', list: CA_PROVINCES, postal: 'Postal code', ph: 'M5V 2T6' },
  GB: { label: 'County', optional: true, postal: 'Postcode', ph: 'SW1A 1AA', city: 'Town / city' },
  IE: { label: 'County', optional: true, postal: 'Eircode', ph: 'D02 X285', optionalPostal: true },
  MX: { label: 'State', postal: 'Código postal', ph: '06600' },
  AU: { label: 'State / territory', postal: 'Postcode', ph: '2000' },
};
export const regionInfo = (c) => REGION[c] || { label: 'State / region', optional: true, postal: 'Postal code', ph: '' };

// ------------------------------------------------------------------ deadline badge
// "Deadline Wednesday, December 2" plus a countdown. iso = YYYY-MM-DD (the last day entries are accepted).
export function deadlineBadge(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const day = new Date(iso + 'T12:00:00');
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const left = Math.round((day - today) / 864e5);
  const when = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const count = left > 1 ? `${left} days left` : left === 1 ? 'Last day tomorrow' : left === 0 ? 'Last day today' : 'Deadline passed';
  const tone = left < 0 ? 'past' : left <= 3 ? 'soon' : '';
  return `<span class="dl-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
    <span class="dl-text"><small>Deadline for new entries</small><b>${esc(when)}</b></span>
    <span class="dl-count ${tone}">${esc(count)}</span>`;
}

// ------------------------------------------------------------------ formatting
export function addressLines(c) {
  const country = c.country || ''; // never assume a country: show none until one is chosen
  const cityLine = !country || country === 'US' || country === 'CA' || country === 'AU'
    ? [c.city, [c.region, c.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : country === 'GB' || country === 'IE'
      ? [c.city, c.region].filter(Boolean).join(', ')
      : [[c.postal_code, c.city].filter(Boolean).join(' '), c.region].filter(Boolean).join(', ');
  const lines = [c.line1, c.line2, cityLine];
  if (country === 'GB' || country === 'IE') lines.push(c.postal_code);
  if (country) lines.push(country === 'US' ? 'United States' : countryName(country));
  return lines.filter(Boolean);
}
export const addressHtml = (c) => addressLines(c).map(esc).join('<br>');
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
export const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const longDate = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export function relTime(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return shortDate(iso);
}

export const ICONS = {
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  checkBig: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8v5m0 3.5v.5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
  warnBig: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 7v6m0 4v.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  dot: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
  edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 11v5m0-8v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

export const STATUS = {
  verified: { label: 'Address verified', short: 'Verified', icon: ICONS.check, ok: true },
  reviewed: { label: 'Checked by card team', short: 'Checked', icon: ICONS.check, ok: true },
  needs_review: { label: 'Needs a look', short: 'Needs a look', icon: ICONS.warn, ok: false },
  unverified: { label: 'Basic check passed', short: 'Basic check', icon: ICONS.dot, ok: true },
};
export function providerText(provider, country) {
  if (provider === 'google') return 'Checked with Google address validation' + (country === 'US' ? ' and USPS data.' : '.');
  if (provider === 'census') return 'Checked against official US Census Bureau address records.';
  if (provider === 'osm') return 'Checked with OpenStreetMap. Map data © OpenStreetMap contributors.';
  return 'Checked with our built-in address rules.';
}
export function statusPill(status, extraClass = '') {
  const s = STATUS[status] || STATUS.unverified;
  return `<span class="status s-${esc(status)} ${extraClass}" title="${esc(s.label)}">${s.icon}${esc(s.label)}</span>`;
}

// ------------------------------------------------------------------ toasts
export function toast(message, { bad = false, action, onAction, ms = 5000 } = {}) {
  const box = $('[data-toasts]');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.setAttribute('role', bad ? 'alert' : 'status');
  el.innerHTML = `<i class="t-icon">${bad ? ICONS.warn : ICONS.check}</i><span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.remove(); onAction && onAction(); };
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

// ------------------------------------------------------------------ dialogs
function makeDialog(cls, html) {
  const d = document.createElement('dialog');
  d.className = cls;
  d.innerHTML = html;
  document.body.append(d);
  d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
  d.addEventListener('click', (e) => { if (e.target === d && !d.dataset.busy) d.close(); });
  return d;
}
export { makeDialog };

export function confirmBox({ title, body, ok = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const d = makeDialog('modal small', `
      <div class="d-body" style="padding:26px 26px 8px">
        <h2 style="font:500 1.6rem/1.15 var(--serif);color:var(--forest);margin:0 0 10px">${esc(title)}</h2>
        <p style="margin:0;color:var(--moss)">${body}</p>
      </div>
      <div class="d-foot" style="border:0;background:transparent;padding:18px 26px 24px">
        <button class="btn" type="button" data-no>Cancel</button>
        <button class="btn ${danger ? 'btn-primary' : 'btn-primary'}" type="button" data-yes>${esc(ok)}</button>
      </div>`);
    let answer = false;
    d.querySelector('[data-no]').onclick = () => d.close();
    d.querySelector('[data-yes]').onclick = () => { answer = true; d.close(); };
    d.addEventListener('close', () => resolve(answer));
    d.showModal();
    d.querySelector('[data-no]').focus();
  });
}

// ------------------------------------------------------------------ client sheet (add / edit + address check)
const FIELDS = ['department', 'name', 'company', 'title', 'line1', 'line2', 'city', 'region', 'postal_code', 'country', 'email', 'notes'];
const ADDR = ['line1', 'line2', 'city', 'region', 'postal_code', 'country'];

function regionField(country, value) {
  const info = regionInfo(country);
  const label = `${esc(info.label)}${info.optional ? ' <small>(optional)</small>' : ''}`;
  if (info.list) {
    const opts = Object.entries(info.list).map(([k, n]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const unknown = value && !info.list[value] ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : '';
    return `<label class="field" data-f="region"><span>${label}</span><select name="region" autocomplete="address-level1" required><option value="">Choose…</option>${unknown}${opts}</select></label>`;
  }
  return `<label class="field" data-f="region"><span>${label}</span><input name="region" autocomplete="address-level1" value="${esc(value)}" ${info.optional ? '' : 'required'} /></label>`;
}

// US, UK and Mexico first, then every other country A–Z. No preselected country: people must choose.
export function countryOptions(sel) {
  const opt = (c, n) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(n)}</option>`;
  const pop = POPULAR.map((c) => opt(c, countryName(c))).join('');
  const all = COUNTRIES.filter(([c]) => !POPULAR.includes(c)).map(([c, n]) => opt(c, n)).join('');
  return `<option value="" ${sel ? '' : 'selected'} disabled>Choose a country…</option>${pop}<option disabled>──────────</option>${all}`;
}

function diffHtml(entered, sugg, changed) {
  const mark = (f, v) => (changed.includes(f) && v ? `<mark>${esc(v)}</mark>` : esc(v));
  const s = { ...sugg };
  const view = {};
  for (const f of ADDR) view[f] = mark(f, s[f]);
  // Reuse addressLines with pre-escaped pieces.
  const country = s.country || '';
  const cityLine = country === 'US' || country === 'CA' || country === 'AU'
    ? [view.city, [view.region, view.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : country === 'GB' || country === 'IE' ? [view.city, view.region].filter(Boolean).join(', ')
      : [[view.postal_code, view.city].filter(Boolean).join(' '), view.region].filter(Boolean).join(', ');
  const lines = [view.line1, view.line2, cityLine];
  if (country === 'GB' || country === 'IE') lines.push(view.postal_code);
  if (country) lines.push(changed.includes('country') ? `<mark>${esc(countryName(country))}</mark>` : esc(countryName(country)));
  return lines.filter(Boolean).join('<br>');
}
export { diffHtml };

/**
 * Open the add/edit sheet.
 * opts.client   existing values (edit) or defaults
 * opts.title    heading
 * opts.submit   async ({client, mode, allowDuplicate}) => { ok, status, data } — the API call
 * opts.onDone   (data) => void, called when saved
 * opts.saveLabel
 */
function departmentField(list, value) {
  if (!list || !list.length) return '';
  const opts = [...list, ...(value && !list.includes(value) ? [value] : [])]
    .map((d) => `<option ${d === value ? 'selected' : ''}>${esc(d)}</option>`).join('');
  return `<fieldset>
    <legend>Sending on behalf of</legend>
    <label class="field" data-f="department"><span>Your department</span>
      <select name="department" required><option value="">Choose your department…</option>${opts}</select></label>
  </fieldset>`;
}

export function clientSheet(opts) {
  const c = { country: '', ...(opts.client || {}) };
  if (!c.department && opts.defaultDepartment) c.department = opts.defaultDepartment;
  const d = makeDialog('sheet', `
    <div class="d-head">
      <div><h2>${esc(opts.title || 'Add a client')}</h2><p>${esc(opts.subtitle || 'We’ll check the address before it’s saved.')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="Close">${ICONS.close}</button>
    </div>
    <form class="d-body" novalidate data-form>
      <div class="form">
        ${departmentField(opts.departments, c.department)}
        <fieldset>
          <legend>Who is it for?</legend>
          <label class="field" data-f="name"><span>Name on the envelope</span>
            <input name="name" autocomplete="off" required placeholder="e.g. Jane Smith" value="${esc(c.name)}" /></label>
          <div class="cols">
            <label class="field" data-f="company"><span>Organization</span><input name="company" autocomplete="off" required placeholder="e.g. Acme Data Co" value="${esc(c.company)}" /></label>
            <label class="field" data-f="title"><span>Job title <small>(optional)</small></span><input name="title" autocomplete="off" value="${esc(c.title)}" /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Mailing address</legend>
          <label class="field" data-f="country"><span>Country</span><select name="country" autocomplete="country" required>${countryOptions(c.country)}</select></label>
          <label class="field" data-f="line1"><span>Street address</span><input name="line1" autocomplete="address-line1" required placeholder="Building number and street" value="${esc(c.line1)}" /></label>
          <label class="field" data-f="line2"><span>Suite, floor or apartment <small>(optional)</small></span><input name="line2" autocomplete="address-line2" value="${esc(c.line2)}" /></label>
          <div class="cols-3" data-cityrow></div>
        </fieldset>
        <fieldset>
          <legend>Extras</legend>
          <label class="field" data-f="email"><span>Email <small>(optional)</small></span><input name="email" type="email" autocomplete="off" value="${esc(c.email)}" /></label>
          <label class="field" data-f="notes"><span>Note for the card team <small>(optional)</small></span>
            <textarea name="notes" rows="3" placeholder="e.g. Add a handwritten line from me, or send to their home address">${esc(c.notes)}</textarea></label>
        </fieldset>
      </div>
    </form>
    <div class="d-body" data-result hidden></div>
    <div class="d-foot" data-foot>
      <span class="grow" data-foot-note></span>
      <button class="btn btn-text" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${esc(opts.saveLabel || 'Check address & save')}</button>
    </div>`);

  const form = $('[data-form]', d);
  const result = $('[data-result]', d);
  const foot = $('[data-foot]', d);
  const cityRow = $('[data-cityrow]', d);
  let current = { ...c };

  function renderCityRow(country, keep) {
    const info = regionInfo(country);
    cityRow.innerHTML = `
      <label class="field" data-f="city"><span>${esc(info.city || 'City')}</span><input name="city" autocomplete="address-level2" required value="${esc(keep.city)}" /></label>
      ${regionField(country, keep.region)}
      <label class="field" data-f="postal_code"><span>${esc(info.postal)}${info.optionalPostal ? ' <small>(optional)</small>' : ''}</span>
        <input name="postal_code" autocomplete="postal-code" ${info.optionalPostal ? '' : 'required'} placeholder="${esc(info.ph)}" value="${esc(keep.postal_code)}" /></label>`;
  }
  renderCityRow(c.country, c);
  form.elements.country.addEventListener('change', () => {
    const v = read();
    renderCityRow(v.country, { ...v, region: '' });
  });

  function read() {
    const v = {};
    for (const f of FIELDS) v[f] = (form.elements[f] ? form.elements[f].value : c[f] || '').trim();
    return v;
  }
  function fill(v) {
    form.elements.country.value = v.country || '';
    renderCityRow(v.country || '', v);
    for (const f of FIELDS) if (form.elements[f] && f !== 'country') form.elements[f].value = v[f] || '';
  }
  function clearErrors() {
    $$('.field', d).forEach((f) => { f.classList.remove('bad', 'warn'); $('.msg', f)?.remove(); });
  }
  function fieldError(name, msg, warn = false) {
    const f = $(`[data-f="${name}"]`, d);
    if (!f) return;
    f.classList.add(warn ? 'warn' : 'bad');
    $('.msg', f)?.remove();
    const m = document.createElement('span');
    m.className = 'msg';
    m.textContent = msg;
    f.append(m);
  }
  function localCheck(v) {
    clearErrors();
    let first = null;
    const need = (f, msg) => { if (!v[f]) { fieldError(f, msg); first = first || f; } };
    if (opts.departments && opts.departments.length) need('department', 'Choose your department.');
    need('name', 'Add the name that should go on the envelope.');
    need('company', 'Add the organization they work for.');
    need('line1', 'Add the street address.');
    need('country', 'Choose the country. We send cards all over the world.');
    need('city', 'Add the city or town.');
    const info = regionInfo(v.country);
    if (!info.optional) need('region', `Choose the ${info.label.toLowerCase()}.`);
    if (!info.optionalPostal) need('postal_code', `Add the ${info.postal.toLowerCase()}.`);
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { fieldError('email', 'This email doesn’t look right.'); first = first || 'email'; }
    if (first) form.elements[first]?.focus();
    return !first;
  }

  function showForm() {
    result.hidden = true; form.hidden = false;
    foot.innerHTML = `<span class="grow"></span><button class="btn btn-text" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${esc(opts.saveLabel || 'Check address & save')}</button>`;
    form.scrollTop = 0;
  }
  function showResult(html, buttons) {
    form.hidden = true; result.hidden = false;
    result.innerHTML = html;
    foot.innerHTML = `<button class="btn btn-text" type="button" data-back>← Edit</button><span class="grow"></span>${buttons}`;
    result.scrollTop = 0;
    const firstBtn = foot.querySelector('.btn-primary');
    if (firstBtn) firstBtn.focus();
  }
  function busy(btn, label) {
    d.dataset.busy = '1';
    $$('.d-foot button', d).forEach((b) => (b.disabled = true));
    if (btn) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<i class="spin" aria-hidden="true"></i>${esc(label)}`; }
  }
  function idle(btn) {
    delete d.dataset.busy;
    $$('.d-foot button', d).forEach((b) => (b.disabled = false));
    if (btn && btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }

  async function submit(mode, btn, extra = {}) {
    busy(btn, mode === 'check' ? 'Checking address…' : 'Saving…');
    let r;
    try { r = await opts.submit({ client: current, mode, ...extra }); } catch { r = { ok: false, status: 0, data: {} }; }
    idle(btn);
    const data = r.data || {};
    if (data.saved) { d.close(); opts.onDone && opts.onDone(data); return; }
    if (data.duplicate) return showDuplicate(data.duplicate, mode);
    const v = data.verification;
    if (v && v.status === 'invalid') {
      showForm();
      clearErrors();
      for (const i of v.issues) fieldError(i.field, i.message, i.severity !== 'error');
      const first = v.issues[0]; if (first && form.elements[first.field]) form.elements[first.field].focus();
      return;
    }
    if (v && (v.status === 'suggested' || v.status === 'needs_review')) return showCheck(v);
    if (data.field) { showForm(); fieldError(data.field, data.error); return; }
    toast(data.error || 'Something went wrong. Please try again.', { bad: true });
  }

  function issuesHtml(issues) {
    if (!issues || !issues.length) return '';
    return `<ul class="issues">${issues.map((i) => `<li class="${i.severity === 'error' ? 'error' : ''}">${ICONS.info}<span>${esc(i.message)}</span></li>`).join('')}</ul>`;
  }

  function showCheck(v) {
    const entered = { ...current, ...v.cleaned };
    const hasSugg = !!v.suggestion;
    const head = v.status === 'suggested'
      ? { t: 'Did you mean this address?', p: 'We found a closer match. Using it helps the card arrive on time.' }
      : hasSugg ? { t: 'This address needs a look', p: 'We couldn’t fully confirm it. Here’s our closest match.' }
        : { t: 'We couldn’t confirm this address', p: 'Check the details below. You can still save it and the card team will take a look.' };
    showResult(`
      <div class="check">
        <div class="check-head"><span class="badge">${ICONS.warnBig}</span><div><h3>${head.t}</h3><p>${head.p}</p></div></div>
        ${issuesHtml(v.issues)}
        <div class="compare">
          <div class="addr-card ${hasSugg ? '' : 'pick'}"><h4>You entered</h4><address>${addressHtml(entered)}</address></div>
          ${hasSugg ? `<div class="addr-card pick"><h4>Suggested</h4><address>${diffHtml(entered, v.suggestion, v.changed || [])}</address></div>` : ''}
        </div>
        <p class="provider">${providerText(v.provider, entered.country)}</p>
      </div>`,
    hasSugg
      ? `<button class="btn" type="button" data-keep>Keep mine</button><button class="btn btn-primary" type="button" data-accept>Use suggested</button>`
      : `<button class="btn" type="button" data-keep>Save anyway</button><button class="btn btn-primary" type="button" data-back>Edit address</button>`);
  }

  function showDuplicate(dup, mode) {
    showResult(`
      <div class="check">
        <div class="check-head"><span class="badge">${ICONS.warnBig}</span><div><h3>Already on the list</h3>
          <p>${esc(dup.name)}${dup.company ? ' at ' + esc(dup.company) : ''} was added by ${esc(dup.added_by)} on ${esc(shortDate(dup.created_at))}.</p></div></div>
        <div class="dup">To avoid sending two cards, you may not need to add them again. Add anyway if this is a different person.</div>
      </div>`,
    `<button class="btn" type="button" data-close>Don’t add</button><button class="btn btn-primary" type="button" data-dupok data-mode="${esc(mode)}">Add anyway</button>`);
  }

  d.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-close]')) d.close();
    else if (t.matches('[data-back]')) { showForm(); form.elements.line1.focus(); }
    else if (t.matches('[data-save]')) {
      current = read();
      if (localCheck(current)) submit('check', t);
    } else if (t.matches('[data-accept]')) submit('accept', t);
    else if (t.matches('[data-keep]')) submit('keep', t);
    else if (t.matches('[data-dupok]')) submit(t.dataset.mode || 'check', t, { allowDuplicate: true });
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); $('[data-save]', d)?.click(); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('[data-save]', d)?.click(); }
  });
  d.showModal();
  if (opts.focusIssue && opts.client?.verification?.issues?.length) {
    for (const i of opts.client.verification.issues) fieldError(i.field, i.message, true);
  }
  setTimeout(() => (form.elements.department && !form.elements.department.value ? form.elements.department : form.elements.name).focus(), 30);
  return { dialog: d, fill };
}
