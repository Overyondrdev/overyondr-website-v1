// Staff page: add clients one by one or upload a list; see, search, edit and remove your own.
import { api, esc, $, $$, addressHtml, addressLines, initials, statusPill, STATUS, ICONS, toast, confirmBox, clientSheet, makeDialog, diffHtml, toCountryCode, countryName } from './shared.js';
import { readFile, parseDelimited, looksLikeHeader, guessMapping, applyMapping, TARGETS } from './sheet.js';

const state = { me: null, items: [], filter: 'all', q: '' };

// ------------------------------------------------------------------ boot
async function boot() {
  $('[data-year]').textContent = 'Christmas ' + new Date().getFullYear();
  const me = await api('me');
  if (!me.ok) { $('[data-clients]').innerHTML = `<div class="empty"><h3>We couldn’t load the page</h3><p>${esc(me.data.error || 'Please refresh.')}</p></div>`; return; }
  state.me = me.data;
  $('[data-who]').textContent = me.data.email;
  if (me.data.isAdmin) $('[data-admin]').hidden = false;
  const s = me.data.settings;
  if (s.deadline) {
    const d = new Date(s.deadline + 'T12:00:00');
    const el = $('[data-deadline]');
    el.innerHTML = `<span>Please add your clients by <b>${esc(d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</b></span>`;
    el.hidden = false;
  }
  if (s.message) { const p = $('.lede'); p.textContent = s.message; }
  if (s.closed && !me.data.isAdmin) { $('[data-closed]').hidden = false; $('[data-actions]').hidden = true; $('.hero-help').hidden = true; }
  setupSignout(me.data.via);
  await load();
  if (!me.data.tutorialDone && !(s.closed && !me.data.isAdmin)) tour();
}

async function load() {
  const r = await api('clients');
  state.items = r.ok ? r.data.items : [];
  render();
}

const canEdit = () => !(state.me.settings.closed && !state.me.isAdmin);
const needsLook = (c) => c.status === 'needs_review';

// ------------------------------------------------------------------ list
function render() {
  const all = state.items;
  const attention = all.filter(needsLook);
  $('[data-n="all"]').textContent = all.length;
  $('[data-n="attention"]').textContent = attention.length;
  $('[data-n="ok"]').textContent = all.length - attention.length;
  $('[data-summary]').textContent = !all.length ? 'No clients yet.'
    : `${all.length} client${all.length === 1 ? '' : 's'}` + (attention.length ? ` · ${attention.length} need${attention.length === 1 ? 's' : ''} a look` : ' · all set');
  $('[data-filters]').hidden = all.length < 2;
  $('.tools').hidden = all.length < 4;

  const q = state.q.toLowerCase();
  let list = all.filter((c) => state.filter === 'all' || (state.filter === 'attention' ? needsLook(c) : !needsLook(c)));
  if (q) list = list.filter((c) => [c.name, c.company, c.city, c.line1, c.postal_code, c.region].join(' ').toLowerCase().includes(q));
  const box = $('[data-clients]');

  if (!all.length) {
    box.innerHTML = `<div class="empty">
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true"><rect x="8" y="18" width="60" height="42" rx="8" fill="#eef2e6"/><path d="m10 22 28 20 28-20" fill="none" stroke="#1c300b" stroke-width="3" stroke-linejoin="round"/><circle cx="58" cy="18" r="12" fill="#daff6b"/><rect x="54" y="2" width="8" height="6" rx="2" fill="#c9b86a"/></svg>
      <h3>Your list is empty</h3>
      <p>Start with one client, or upload a spreadsheet if you have several. It takes about a minute.</p>
      ${canEdit() ? `<div class="row"><button class="btn btn-primary" type="button" data-add>Add a client</button><button class="btn" type="button" data-upload>Upload a list</button></div>` : ''}
    </div>`;
    return;
  }
  if (!list.length) { box.innerHTML = `<div class="empty"><h3>No matches</h3><p>Try a different search or filter.</p></div>`; return; }
  box.innerHTML = list.map((c, i) => card(c, i)).join('');
}

function card(c, i) {
  const v = c.verification || {};
  const hint = needsLook(c) && canEdit()
    ? `<div class="hint"><span>${esc((v.issues && v.issues[0] && v.issues[0].message) || (v.suggestion ? 'We suggested a correction to this address.' : 'We couldn’t fully confirm this address.'))}</span>
       <button class="btn btn-sm" type="button" data-edit="${c.id}">Review address</button></div>` : '';
  return `<article class="client" data-id="${c.id}" style="animation-delay:${Math.min(i, 12) * 25}ms">
    <div class="avatar" aria-hidden="true">${esc(initials(c.name))}</div>
    <div class="who-line">
      <h3>${esc(c.name)}</h3>
      ${c.company || c.title ? `<p class="co">${esc([c.title, c.company].filter(Boolean).join(', '))}</p>` : ''}
      ${statusPill(c.status, 'status-m')}
    </div>
    <address>${addressHtml(c)}</address>
    <div class="side">
      ${statusPill(c.status)}
      ${canEdit() ? `<div class="acts">
        <button class="icon-btn" type="button" data-edit="${c.id}" aria-label="Edit ${esc(c.name)}" title="Edit">${ICONS.edit}</button>
        <button class="icon-btn" type="button" data-del="${c.id}" aria-label="Remove ${esc(c.name)}" title="Remove">${ICONS.trash}</button>
      </div>` : ''}
    </div>
    ${hint}
  </article>`;
}

function flash(id) {
  const el = $(`.client[data-id="${id}"]`);
  if (el) { el.classList.add('flash'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(() => el.classList.remove('flash'), 1700); }
}

// ------------------------------------------------------------------ add / edit / delete
const deptOpts = (c) => ({ departments: state.me.settings.departments, defaultDepartment: (c && c.department) || state.me.department });
function addClient() {
  clientSheet({
    title: 'Add a client', ...deptOpts(),
    submit: (body) => api('clients', { method: 'POST', body }),
    onDone(data) {
      state.me.department = data.client.department || state.me.department;
      state.items.unshift(data.client);
      state.filter = 'all'; syncChips(); render(); flash(data.client.id);
      const s = STATUS[data.client.status];
      toast(`${data.client.name} added${s && data.client.status === 'verified' ? ' · address verified' : ''}`, { action: 'Add another', onAction: addClient });
    },
  });
}

function editClient(id) {
  const c = state.items.find((x) => x.id === id);
  if (!c) return;
  clientSheet({
    title: 'Edit client', subtitle: `Added ${new Date(c.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`,
    client: c, focusIssue: needsLook(c), saveLabel: 'Save changes', ...deptOpts(c),
    submit: (body) => api('clients/' + id, { method: 'PUT', body }),
    onDone(data) {
      Object.assign(c, data.client);
      render(); flash(id);
      toast('Changes saved');
    },
  });
}

async function deleteClient(id) {
  const c = state.items.find((x) => x.id === id);
  if (!c) return;
  const ok = await confirmBox({ title: `Remove ${c.name}?`, body: 'They won’t get a card from this list. You can add them again later.', ok: 'Remove' });
  if (!ok) return;
  const r = await api('clients/' + id, { method: 'DELETE' });
  if (!r.ok) return toast(r.data.error || 'Couldn’t remove. Please try again.', { bad: true });
  state.items = state.items.filter((x) => x.id !== id);
  render();
  toast(`${c.name} removed`);
}

// ------------------------------------------------------------------ bulk upload
const CHECK_CHUNK = 25;
// Same rules as the server's duplicate check: ignore case, punctuation and "Street" vs "St".
const ABBR = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln', court: 'ct', place: 'pl', suite: 'ste',
  north: 'n', south: 's', east: 'e', west: 'w', parkway: 'pkwy', highway: 'hwy', floor: 'fl', apartment: 'apt', building: 'bldg' };
const normWords = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map((w) => ABBR[w] || w).join(' ');
const SAVE_CHUNK = 100;

function uploadFlow() {
  const d = makeDialog('modal', `
    <div class="d-head"><div><h2>Upload a list</h2><p>Excel, CSV, or cells copied from a spreadsheet.</p></div>
      <button class="icon-btn" type="button" data-x aria-label="Close">${ICONS.close}</button></div>
    <ol class="stepper" data-stepper>
      <li data-s="1"><b>1</b>Add your list</li><li data-s="2"><b>2</b>Match columns</li><li data-s="3"><b>3</b>Review addresses</li><li data-s="4"><b>4</b>Done</li>
    </ol>
    <div class="d-body" data-body></div>
    <div class="d-foot" data-foot></div>`);
  const body = $('[data-body]', d);
  const foot = $('[data-foot]', d);
  const u = { filename: '', rows: [], headers: [], hasHeader: true, map: {}, defaultCountry: 'US', defaultDepartment: state.me.department || '', items: [] };

  function step(n) {
    $$('[data-s]', d).forEach((li) => {
      const s = +li.dataset.s;
      li.classList.toggle('done', s < n);
      if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    body.scrollTop = 0;
  }
  const close = async () => {
    if (u.items.length && !u.finished) {
      const ok = await confirmBox({ title: 'Stop uploading?', body: 'The clients in this list haven’t been added yet.', ok: 'Stop', danger: false });
      if (!ok) return;
    }
    d.close();
  };
  $('[data-x]', d).onclick = close;
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  // Step 1: file or paste
  function stepFile(error) {
    step(1);
    body.innerHTML = `
      <label class="drop" data-drop tabindex="0">
        <span class="doc"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <h3>Drop your file here</h3>
        <p>or <u>choose a file</u> · .xlsx or .csv</p>
        <input type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv" hidden data-file />
      </label>
      ${error ? `<ul class="issues" style="margin-top:14px"><li class="error">${ICONS.info}<span>${esc(error)}</span></li></ul>` : ''}
      <div class="or">or paste</div>
      <label class="paste"><span class="sr">Paste rows from a spreadsheet</span>
        <textarea data-paste placeholder="Copy the rows in Excel or Google Sheets (including the header row) and paste them here"></textarea></label>
      <div class="tips"><span>One row per client. We’ll match your columns in the next step.</span><a href="/template.csv" download>Download a template</a></div>
      <details class="drop-help"><summary>What should my spreadsheet include?</summary>${SPREADSHEET_HELP}</details>`;
    foot.innerHTML = `<span class="grow"></span><button class="btn btn-text" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-next disabled>Continue</button>`;
    const drop = $('[data-drop]', d);
    const input = $('[data-file]', d);
    const paste = $('[data-paste]', d);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) useFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => input.files[0] && useFile(input.files[0]));
    paste.addEventListener('input', () => { $('[data-next]', d).disabled = !paste.value.trim(); });
    $('[data-cancel]', foot).onclick = close;
    $('[data-next]', foot).onclick = () => { u.filename = 'Pasted list'; useRows(parseDelimited(paste.value)); };
  }
  async function useFile(file) {
    if (file.size > 10 * 1024 * 1024) return stepFile('That file is over 10 MB. Try saving just the sheet with your clients.');
    try {
      u.filename = file.name;
      useRows(await readFile(file));
    } catch (e) { stepFile(e.message || 'We couldn’t read that file.'); }
  }
  function useRows(rows) {
    if (!rows.length) return stepFile('We didn’t find any rows in that list.');
    u.hasHeader = looksLikeHeader(rows[0]);
    const width = Math.max(...rows.map((r) => r.length));
    u.headers = u.hasHeader ? rows[0].map((h, i) => h || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${String.fromCharCode(65 + (i % 26))}`);
    u.rows = u.hasHeader ? rows.slice(1) : rows;
    if (!u.rows.length) return stepFile('We found a header row but no clients under it.');
    if (u.rows.length > 2000) return stepFile('That’s more than 2,000 rows. Please split the list into smaller files.');
    u.map = u.hasHeader ? guessMapping(u.headers) : {};
    stepMap();
  }

  // Step 2: column mapping
  function stepMap() {
    step(2);
    const opts = (sel) => `<option value="">— Not in my list —</option>` + u.headers.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(h)}</option>`).join('');
    const sample = (k) => {
      const i = u.map[k];
      if (i === undefined || i === '') return '';
      return u.rows.slice(0, 3).map((r) => r[i]).filter(Boolean).map(esc).join(' · ');
    };
    const useFirstLast = u.splitName ?? (u.map.name === undefined && u.map.first !== undefined);
    const targets = TARGETS.filter((t) => (useFirstLast ? t.key !== 'name' : !t.alt));
    body.innerHTML = `
      <p style="margin:0 0 6px;color:var(--moss)">We found <b style="color:var(--forest)">${u.rows.length} row${u.rows.length === 1 ? '' : 's'}</b> in ${esc(u.filename)}.
        ${Object.keys(u.map).length ? 'We matched the columns we recognised. Check them and fill any gaps.' : 'Tell us which column holds what.'}</p>
      <p style="margin:0 0 18px"><button class="btn btn-text btn-sm" type="button" data-toggle-name>${useFirstLast ? 'Use a single name column instead' : 'My list has first and last names in separate columns'}</button></p>
      <div class="map">${targets.map((t) => `
        <div class="map-row ${u.map[t.key] !== undefined && u.map[t.key] !== '' ? 'auto' : ''}">
          <label for="m-${t.key}">${esc(t.label)}${t.required || t.key === 'first' ? ' *' : ''}${t.hint ? `<small>${esc(t.hint)}</small>` : ''}</label>
          <select id="m-${t.key}" data-map="${t.key}">${opts(u.map[t.key])}</select>
          <span class="sample" data-sample="${t.key}">${sample(t.key)}</span>
        </div>`).join('')}
        <div class="map-row" data-defdept ${u.map.department !== undefined && u.map.department !== '' ? 'hidden' : ''}>
          <label for="m-defd">Department for every row *<small>The Yondr department sending these cards</small></label>
          <select id="m-defd" data-defd><option value="">Choose your department…</option>${state.me.settings.departments.map((x) => `<option ${x === u.defaultDepartment ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><span></span>
        </div>
        <div class="map-row" data-defcountry ${u.map.country !== undefined && u.map.country !== '' ? 'hidden' : ''}>
          <label for="m-defc">Country for every row<small>Your list has no country column</small></label>
          <select id="m-defc" data-defc>${COUNTRY_OPTS(u.defaultCountry)}</select><span></span>
        </div>
      </div>`;
    foot.innerHTML = `<span class="grow" data-msg></span><button class="btn btn-text" type="button" data-back>Back</button><button class="btn btn-primary" type="button" data-next>Check ${u.rows.length} address${u.rows.length === 1 ? '' : 'es'}</button>`;
    $$('[data-map]', d).forEach((s) => s.addEventListener('change', () => {
      if (s.value === '') delete u.map[s.dataset.map]; else u.map[s.dataset.map] = +s.value;
      s.closest('.map-row').classList.toggle('auto', s.value !== '');
      $(`[data-sample="${s.dataset.map}"]`, d).innerHTML = sample(s.dataset.map);
      if (s.dataset.map === 'country') $('[data-defcountry]', d).hidden = s.value !== '';
      if (s.dataset.map === 'department') $('[data-defdept]', d).hidden = s.value !== '';
    }));
    $('[data-defc]', d).addEventListener('change', (e) => { u.defaultCountry = e.target.value; });
    $('[data-defd]', d).addEventListener('change', (e) => { u.defaultDepartment = e.target.value; });
    $('[data-toggle-name]', d).onclick = () => {
      u.splitName = !useFirstLast;
      if (u.splitName) delete u.map.name; else { delete u.map.first; delete u.map.last; }
      stepMap();
    };
    $('[data-back]', foot).onclick = () => stepFile();
    $('[data-next]', foot).onclick = () => {
      const has = (k) => u.map[k] !== undefined && u.map[k] !== '';
      const missing = [];
      if (!has('name') && !has('first')) missing.push('Name');
      if (!has('line1')) missing.push('Street address');
      if (!has('city')) missing.push('City');
      if (!has('department') && !u.defaultDepartment) missing.push('Department');
      if (missing.length) { $('[data-msg]', d).innerHTML = `<span style="color:#a3311f;font-weight:600">Choose a column for: ${esc(missing.join(', '))}</span>`; return; }
      u.items = applyMapping(u.rows, u.map).map((c, i) => ({
        i, client: { ...c, country: has('country') ? toCountryCode(c.country, u.defaultCountry) : u.defaultCountry,
          department: (has('department') && c.department) || u.defaultDepartment },
        include: true, choice: 'suggested', check: null, dup: null,
      }));
      stepCheck();
    };
  }

  // Step 3a: checking with progress
  async function stepCheck() {
    step(3);
    const total = u.items.length;
    body.innerHTML = `<div class="checking"><h3>Checking addresses…</h3><p data-count>0 of ${total}</p><div class="progress"><i data-bar></i></div>
      <p style="font-size:14px">${state.me.verifier === 'google' ? 'Each address is checked against Google and USPS data.' : 'Each address is checked against our address rules.'}</p></div>`;
    foot.innerHTML = `<span class="grow"></span><button class="btn btn-text" type="button" data-cancel>Cancel</button>`;
    let cancelled = false;
    $('[data-cancel]', foot).onclick = () => { cancelled = true; close(); };
    const todo = u.items.filter((it) => !it.check);
    let done = total - todo.length;
    for (let i = 0; i < todo.length; i += CHECK_CHUNK) {
      if (cancelled || !d.open) return;
      const part = todo.slice(i, i + CHECK_CHUNK);
      const r = await api('check/batch', { method: 'POST', body: { rows: part.map((it) => it.client) } });
      if (!r.ok) { toast(r.data.error || 'Checking stopped. Please try again.', { bad: true }); return stepMap(); }
      r.data.results.forEach((res, k) => applyCheck(part[k], res));
      done += part.length;
      const bar = $('[data-bar]', d); if (!bar) return;
      bar.style.width = (done / total) * 100 + '%';
      $('[data-count]', d).textContent = `${done} of ${total}`;
    }
    // Duplicates inside the file itself.
    const seen = new Map();
    for (const it of u.items) {
      const k = [it.client.name, it.check.cleaned?.line1, (it.check.cleaned?.postal_code || '').slice(0, 5)].map(normWords).join('|');
      if (seen.has(k) && !it.dup) { it.dup = { inFile: true, name: it.client.name }; it.include = false; } else seen.set(k, it);
    }
    stepReview();
  }
  function applyCheck(it, res) {
    it.check = res.verification;
    it.dup = res.duplicate;
    it.client = { ...it.client, ...pick(res.verification.cleaned) };
    it.include = res.verification.status !== 'invalid' && !res.duplicate;
    it.choice = res.verification.suggestion ? 'suggested' : 'entered';
  }
  const pick = (a) => (a ? { line1: a.line1, line2: a.line2, city: a.city, region: a.region, postal_code: a.postal_code, country: a.country } : {});

  // Step 3b: review
  let tab = 'attention';
  const kind = (it) => (it.dup ? 'dup' : it.check.status === 'invalid' ? 'invalid' : it.check.status === 'suggested' ? 'suggested'
    : it.check.status === 'needs_review' ? 'review' : 'ok');
  function stepReview() {
    step(3);
    const counts = { ok: 0, suggested: 0, review: 0, invalid: 0, dup: 0 };
    u.items.forEach((it) => counts[kind(it)]++);
    const attention = u.items.length - counts.ok;
    if (!attention) tab = 'all';
    const list = u.items.filter((it) => tab === 'all' || kind(it) !== 'ok');
    const chip = (label, n, cls = '') => (n ? `<span class="status ${cls}">${n} ${esc(label)}</span>` : '');
    body.innerHTML = `
      <div class="summary">
        ${chip('ready', counts.ok, 's-verified')}${chip(counts.suggested === 1 ? 'suggested fix' : 'suggested fixes', counts.suggested, 's-needs_review')}
        ${chip('need a look', counts.review, 's-needs_review')}${chip('missing details', counts.invalid, 's-needs_review')}${chip(counts.dup === 1 ? 'duplicate' : 'duplicates', counts.dup, 's-unverified')}
      </div>
      <div class="chips" role="group" aria-label="Show">
        <button type="button" class="chip" data-tab="attention" aria-pressed="${tab === 'attention'}" ${attention ? '' : 'disabled'}>Needs your attention <i>${attention}</i></button>
        <button type="button" class="chip" data-tab="all" aria-pressed="${tab === 'all'}">All rows <i>${u.items.length}</i></button>
        ${counts.suggested > 1 ? `<button type="button" class="btn btn-sm btn-text" data-all-sugg>Use all suggested fixes</button>` : ''}
      </div>
      <div class="rows">${list.length ? list.map(rowHtml).join('') : `<div class="empty"><h3>Everything looks good</h3><p>All ${u.items.length} addresses checked out.</p></div>`}</div>`;
    const n = u.items.filter((it) => it.include).length;
    foot.innerHTML = `<span class="grow">${n} of ${u.items.length} will be added</span><button class="btn btn-text" type="button" data-back>Back</button>
      <button class="btn btn-primary" type="button" data-save ${n ? '' : 'disabled'}>Add ${n} client${n === 1 ? '' : 's'}</button>`;
    $('[data-back]', foot).onclick = () => stepMap();
    $('[data-save]', foot).onclick = save;
  }
  function rowHtml(it) {
    const k = kind(it);
    const v = it.check;
    const c = it.client;
    let extra = '';
    if (k === 'dup') extra = `<ul class="issues"><li>${ICONS.info}<span>${it.dup.inFile ? 'This client appears twice in your list.' : `Already on the list, added by ${esc(it.dup.added_by)}.`}</span></li></ul>`;
    else if (k === 'invalid') extra = `<ul class="issues">${v.issues.filter((x) => x.severity === 'error').map((x) => `<li class="error">${ICONS.info}<span>${esc(x.message)}</span></li>`).join('')}</ul>`;
    else if (k === 'review' && v.issues.length) extra = `<ul class="issues">${v.issues.slice(0, 3).map((x) => `<li>${ICONS.info}<span>${esc(x.message)}</span></li>`).join('')}</ul>`;
    if (v.suggestion && k !== 'dup' && k !== 'invalid') {
      extra += `<div class="sugg"><div><b>Suggested:</b> ${diffHtml(c, v.suggestion, v.changed || []).replace(/<br>/g, ', ')}</div>
        <div class="seg" role="group" aria-label="Which address"><button type="button" data-choice="suggested" data-i="${it.i}" aria-pressed="${it.choice === 'suggested'}">Use suggested</button><button type="button" data-choice="entered" data-i="${it.i}" aria-pressed="${it.choice === 'entered'}">Keep mine</button></div></div>`;
    }
    const pillFor = { ok: statusPill(v.status === 'verified' ? 'verified' : 'unverified'), suggested: '', review: statusPill('needs_review'), invalid: '', dup: '' }[k];
    return `<div class="brow ${it.include ? '' : 'off'}">
      <input type="checkbox" data-inc="${it.i}" ${it.include ? 'checked' : ''} ${k === 'invalid' ? 'disabled' : ''} aria-label="Include ${esc(c.name || 'row ' + (it.i + 1))}" />
      <div><h4>${esc(c.name || '(no name)')}${c.company ? ` <span style="font-weight:400;color:var(--moss)">· ${esc(c.company)}</span>` : ''}</h4>
        <p class="addr">${esc(addressLines(c).join(', '))}</p>${extra}</div>
      <div style="display:grid;gap:8px;justify-items:end">${pillFor}<button class="btn btn-sm" type="button" data-fix="${it.i}">${k === 'invalid' ? 'Fix' : 'Edit'}</button></div>
    </div>`;
  }
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button, input[type="checkbox"]');
    if (!t) return;
    const it = (sel) => u.items[+t.dataset[sel]];
    if (t.dataset.tab) { tab = t.dataset.tab; stepReview(); }
    else if (t.matches('[data-all-sugg]')) { u.items.forEach((x) => { if (x.check?.suggestion) x.choice = 'suggested'; }); stepReview(); toast('Using all suggested fixes'); }
    else if (t.dataset.choice) { it('i').choice = t.dataset.choice; stepReview(); }
    else if (t.dataset.inc !== undefined) { it('inc').include = t.checked; stepReview(); }
    else if (t.dataset.fix !== undefined) fixRow(it('fix'));
  });
  function fixRow(item) {
    const base = item.choice === 'suggested' && item.check.suggestion ? { ...item.client, ...item.check.suggestion } : item.client;
    clientSheet({
      title: 'Fix this row', subtitle: 'Changes apply to this upload only, until you add the list.',
      client: { ...base, verification: item.check }, focusIssue: true, saveLabel: 'Check address',
      async submit({ client, mode }) {
        const r = await api('check/batch', { method: 'POST', body: { rows: [client] } });
        if (!r.ok) return r;
        const res = r.data.results[0];
        const v = res.verification;
        if (v.status === 'invalid') return { ok: false, data: { verification: v } };
        if (mode === 'check' && (v.status === 'suggested' || v.status === 'needs_review')) return { ok: true, data: { verification: v } };
        return { ok: true, data: { saved: true, client, res, mode } };
      },
      onDone({ client, res, mode }) {
        item.client = { ...client };
        applyCheck(item, res);
        if (res.duplicate) { item.dup = res.duplicate; item.include = false; }
        item.choice = mode === 'keep' ? 'entered' : res.verification.suggestion ? 'suggested' : 'entered';
        stepReview();
        toast('Row updated');
      },
    });
  }

  async function save() {
    const chosen = u.items.filter((it) => it.include);
    const btn = $('[data-save]', foot);
    btn.disabled = true; btn.innerHTML = '<i class="spin" aria-hidden="true"></i>Adding…';
    d.dataset.busy = '1';
    let uploadId = 0;
    let added = 0;
    for (let i = 0; i < chosen.length; i += SAVE_CHUNK) {
      const part = chosen.slice(i, i + SAVE_CHUNK);
      const r = await api('clients/bulk', { method: 'POST', body: { filename: u.filename, uploadId, rows: part.map((it) => ({ client: it.client, choice: it.choice })) } });
      if (!r.ok) {
        delete d.dataset.busy;
        toast(`${added ? `${added} added, but the rest` : 'The list'} couldn’t be saved: ${r.data.error || 'please try again.'}`, { bad: true, ms: 8000 });
        u.items = u.items.filter((x) => !chosen.slice(0, i).includes(x));
        await load();
        return stepReview();
      }
      uploadId = r.data.uploadId; added += r.data.added;
    }
    delete d.dataset.busy;
    u.finished = true;
    step(4);
    body.innerHTML = `<div class="finish"><span class="big">${ICONS.checkBig.replace('width="24" height="24"', 'width="40" height="40"')}</span>
      <h3>${added} client${added === 1 ? '' : 's'} added</h3>
      <p>Thank you! They’re on your list now. You can edit any of them at any time before the deadline.</p></div>`;
    foot.innerHTML = `<span class="grow"></span><button class="btn btn-primary" type="button" data-fin>See my list</button>`;
    $('[data-fin]', foot).onclick = () => d.close();
    await load();
  }

  d.showModal();
  stepFile();
}

const COUNTRY_OPTS = (sel) => ['US', 'CA', 'GB', 'IE', 'DE', 'FR', 'NL', 'ES', 'IT', 'AU', 'SG', 'JP']
  .map((c) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(countryName(c))}</option>`).join('');

// ------------------------------------------------------------------ sign out
function setupSignout(via) {
  const b = $('[data-signout]');
  if (via === 'dev') return;
  b.hidden = false;
  b.onclick = async () => {
    await fetch('/api/signin/logout', { method: 'POST' }).catch(() => {});
    location.href = via === 'access' ? '/cdn-cgi/access/logout' : '/signin';
  };
}

// ------------------------------------------------------------------ first-visit tutorial
const SPREADSHEET_HELP = `
  <table class="cols-table">
    <thead><tr><th>Column</th><th></th><th>Example</th></tr></thead>
    <tbody>
      <tr><td>Name</td><td><span class="req">Required</span></td><td>Jane Smith (or First name + Last name columns)</td></tr>
      <tr><td>Street address</td><td><span class="req">Required</span></td><td>1600 Amphitheatre Pkwy</td></tr>
      <tr><td>City</td><td><span class="req">Required</span></td><td>Mountain View</td></tr>
      <tr><td>State / region</td><td><span class="req">Required</span></td><td>CA (US, Canada and Australia)</td></tr>
      <tr><td>ZIP / postal code</td><td><span class="req">Required</span></td><td>94043</td></tr>
      <tr><td>Country</td><td><span class="opt">If mixed</span></td><td>United States, UK, Germany…</td></tr>
      <tr><td>Company, Job title</td><td><span class="opt">Optional</span></td><td>Acme Data Co, Head of Infrastructure</td></tr>
      <tr><td>Address line 2</td><td><span class="opt">Optional</span></td><td>Suite 200, Floor 4</td></tr>
      <tr><td>Department</td><td><span class="opt">Optional</span></td><td>Or pick one for the whole list</td></tr>
      <tr><td>Email, Notes</td><td><span class="opt">Optional</span></td><td>Notes go to the card team</td></tr>
    </tbody>
  </table>
  <ul class="ticks">
    <li>One row per person, with a header row at the top. Column names don’t need to match exactly.</li>
    <li>Excel (.xlsx), CSV, or copy the cells and paste them in.</li>
    <li>If every client is in one country, you can leave the Country column out and choose it while uploading.</li>
  </ul>
  <p><a href="/template.csv" download>Download the template</a> to start from a blank sheet.</p>`;

const TOUR_ICONS = {
  card: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="m4 8 8 6 8-6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  person: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sheet: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M4 9h16M4 15h16M10 3v18" stroke="currentColor" stroke-width="2"/></svg>',
  check: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function tour(start = 0) {
  const s = state.me.settings;
  const deadline = s.deadline ? new Date(s.deadline + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  const slides = [
    { icon: 'card', title: 'Welcome to the Christmas card list', html: `
      <p>Each December, Yondr sends Christmas cards to the clients and partners we work with. Use this page to tell the card team who should get one from you.</p>
      <ul class="ticks">
        <li>Add clients one at a time, or upload a spreadsheet if you have several.</li>
        <li>We check every address and suggest fixes, so cards arrive.</li>
        <li>Only you and the card team can see the clients you add.</li>
      </ul>
      ${deadline ? `<p><b>Please add your clients by ${esc(deadline)}.</b></p>` : ''}` },
    { icon: 'person', title: 'Adding one client', html: `
      <p>Choose <b>Add a client</b> and fill in:</p>
      <ul class="ticks">
        <li><b>Your department</b>, so we know who the card is from.</li>
        <li>The <b>name as it should appear on the envelope</b>, plus company and job title if you know them.</li>
        <li>The <b>full mailing address</b>, including suite or floor number, postal code and country.</li>
        <li>Anything the card team should know, such as a personal note, goes in <b>Note for the card team</b>.</li>
      </ul>
      <p>When you save, we check the address. If something looks off, we show a suggested fix you can accept with one click.</p>` },
    { icon: 'sheet', title: 'Uploading a spreadsheet', html: `<p>Got a list? Choose <b>Upload a list</b>. Include these columns:</p>${SPREADSHEET_HELP}` },
    { icon: 'check', title: 'Review, and you’re done', html: `
      <ul class="ticks">
        <li>Your clients appear under <b>Your clients</b>. Anything marked <b>Needs a look</b> has an address we couldn’t fully confirm. Open it to fix it.</li>
        <li>If someone is already on the list from a colleague, we’ll tell you so they don’t get two cards.</li>
        <li>You can edit or remove clients any time before the deadline.</li>
      </ul>
      <p>You can see this guide again any time with <b>See how it works</b> at the top of the page.</p>` },
  ];
  let i = Math.min(start, slides.length - 1);
  const d = makeDialog('modal tour', `
    <div class="tour-art"><div class="snow" aria-hidden="true"></div><span class="art" data-art></span>
      <button class="icon-btn x" type="button" data-skip aria-label="Close guide">${ICONS.close}</button></div>
    <div class="tour-body" data-body></div>
    <div class="tour-foot"><div class="dots" aria-hidden="true">${slides.map(() => '<i></i>').join('')}</div>
      <button class="btn btn-text" type="button" data-prev>Back</button><button class="btn btn-primary" type="button" data-next>Next</button></div>`);
  d.setAttribute('aria-labelledby', 'tour-title');
  const finish = () => { api('tutorial', { method: 'POST', body: {} }); state.me.tutorialDone = true; };
  d.addEventListener('close', finish);
  function show() {
    const sl = slides[i];
    $('[data-art]', d).innerHTML = TOUR_ICONS[sl.icon];
    $('[data-body]', d).innerHTML = `<p class="count">Step ${i + 1} of ${slides.length}</p><h2 id="tour-title">${esc(sl.title)}</h2>${sl.html}`;
    $('[data-body]', d).scrollTop = 0;
    $$('.dots i', d).forEach((dot, k) => dot.classList.toggle('on', k === i));
    $('[data-prev]', d).hidden = i === 0;
    $('[data-next]', d).textContent = i === slides.length - 1 ? (state.items.length ? 'Got it' : 'Add my first client') : 'Next';
    $('[data-next]', d).focus();
  }
  $('[data-prev]', d).onclick = () => { i--; show(); };
  $('[data-next]', d).onclick = () => {
    if (i < slides.length - 1) { i++; show(); return; }
    d.close();
    if (!state.items.length && canEdit()) addClient();
  };
  $('[data-skip]', d).onclick = () => d.close();
  d.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && i < slides.length - 1) { i++; show(); }
    if (e.key === 'ArrowLeft' && i > 0) { i--; show(); }
  });
  d.showModal();
  show();
}

// ------------------------------------------------------------------ events
function syncChips() { $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter))); }
document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.matches('[data-tour]')) tour();
  else if (t.matches('[data-tour-sheet]')) tour(2);
  else if (t.matches('[data-add]')) addClient();
  else if (t.matches('[data-upload]')) uploadFlow();
  else if (t.dataset.edit) editClient(+t.dataset.edit);
  else if (t.dataset.del) deleteClient(+t.dataset.del);
  else if (t.dataset.filter) { state.filter = t.dataset.filter; syncChips(); render(); }
});
$('[data-search]').addEventListener('input', (e) => { state.q = e.target.value; render(); });

boot();
