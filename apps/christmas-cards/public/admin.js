// Card team admin: everyone's clients and who added them, contributors, uploads, export, access and settings.
import { api, esc, $, $$, addressHtml, addressLines, statusPill, STATUS, ICONS, toast, confirmBox, clientSheet, relTime, longDate, shortDate, countryName, diffHtml } from './shared.js';

const root = $('[data-root]');
const state = { me: null, tab: 'overview', ov: null, items: [], filters: { q: '', added_by: '', status: '', country: '', upload: '', department: '' } };

async function boot() {
  const me = await api('me');
  if (!me.ok) { root.innerHTML = `<div class="gate"><div><h1>Something went wrong</h1><p>${esc(me.data.error || 'Please refresh.')}</p></div></div>`; return; }
  state.me = me.data;
  $('[data-who]').textContent = me.data.email;
  if (!me.data.isAdmin) {
    root.innerHTML = `<div class="gate"><div><h1>Card team only</h1><p>This page is for the people sending the cards. Ask an admin to add you if you need access.</p>
      <a class="btn btn-primary" href="/">Go to my list</a></div></div>`;
    return;
  }
  if (me.data.via !== 'dev') {
    const b = $('[data-signout]'); b.hidden = false;
    b.onclick = async () => { await fetch('/api/signin/logout', { method: 'POST' }).catch(() => {}); location.href = me.data.via === 'access' ? '/cdn-cgi/access/logout' : '/signin'; };
  }
  const fromHash = location.hash.slice(1);
  if (['overview', 'clients', 'people', 'access', 'settings'].includes(fromHash)) state.tab = fromHash;
  shell();
  await refresh();
}

function shell() {
  root.innerHTML = `
    <div class="admin-head">
      <div><h1>Christmas card list</h1><p data-head-sub>Everything your colleagues have added, in one place.</p></div>
      <div class="tools"><a class="btn btn-primary" href="/api/admin/export.csv" data-export download>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v12m0 0-5-5m5 5 5-5M4 20h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Export all (CSV)</a></div>
    </div>
    <div class="tabs" role="tablist">
      ${[['overview', 'Overview'], ['clients', 'All clients'], ['people', 'Who added what'], ['access', 'Admins'], ['settings', 'Settings']]
        .map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join('')}
    </div>
    <section data-view></section>`;
}

async function refresh() {
  const [ov, list] = await Promise.all([api('admin/overview'), api('clients?scope=all')]);
  state.ov = ov.data;
  state.items = list.data.items || [];
  const t = state.ov.totals || {};
  $('[data-head-sub]').textContent = t.total ? `${t.total} clients from ${t.contributors} colleague${t.contributors === 1 ? '' : 's'}${t.needs_review ? ` · ${t.needs_review} need a look` : ''}` : 'Nothing added yet. Share cards.overyondrdev.com with the team.';
  view();
}

function view() {
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  history.replaceState(null, '', '#' + state.tab);
  const v = $('[data-view]');
  ({ overview, clients, people, access, settings })[state.tab](v);
}

// ------------------------------------------------------------------ overview
function overview(v) {
  const t = state.ov.totals || {};
  const total = t.total || 0;
  const ok = (t.verified || 0) + (t.reviewed || 0);
  const max = Math.max(1, ...state.ov.contributors.map((c) => c.total));
  const verb = { added: 'added', imported: 'uploaded', edited: 'edited', deleted: 'removed', reviewed: 'marked as checked' };
  v.innerHTML = `
    <div class="kpis">
      <div class="kpi dark"><small>Cards to send</small><b>${total}</b><span>${t.countries || 0} countr${t.countries === 1 ? 'y' : 'ies'}</span></div>
      <div class="kpi"><small>Ready to send</small><b>${total ? Math.round(((total - (t.needs_review || 0)) / total) * 100) : 0}%</b><span>${ok} verified · ${t.unverified || 0} basic check</span></div>
      <div class="kpi"><small>Need a look</small><b>${t.needs_review || 0}</b><span>${t.needs_review ? '<button class="btn btn-text btn-sm" type="button" data-goto-review style="padding:0">Review them →</button>' : 'All clear'}</span></div>
      <div class="kpi"><small>Colleagues</small><b>${t.contributors || 0}</b><span>have added clients</span></div>
    </div>
    <div class="split split-3">
      <div class="panel"><h3>Who has added clients</h3>
        ${state.ov.contributors.length ? `<div class="bars">${state.ov.contributors.map((c) => `
          <div class="bar"><button type="button" data-person="${esc(c.added_by)}" title="${esc(c.added_by)}">${esc(c.added_by)}</button>
            <span class="track"><i style="width:${(c.total / max) * 100}%"></i></span><b>${c.total}</b></div>`).join('')}</div>` : '<p class="sub">No one yet.</p>'}
      </div>
      <div class="panel"><h3>By department</h3>
        ${(state.ov.departments || []).length ? `<div class="bars">${state.ov.departments.map((x) => `
          <div class="bar"><button type="button" data-dept="${esc(x.department)}">${esc(x.department)}</button>
            <span class="track"><i style="width:${(x.total / Math.max(1, ...state.ov.departments.map((y) => y.total))) * 100}%"></i></span><b>${x.total}</b></div>`).join('')}</div>` : '<p class="sub">No clients yet.</p>'}
      </div>
      <div class="panel"><h3>Recent activity</h3>
        ${state.ov.activity.length ? `<ul class="feed">${state.ov.activity.slice(0, 8).map((a) => `
          <li><span><b>${esc(a.actor.split('@')[0])}</b> ${verb[a.action] || esc(a.action)} ${a.action === 'imported'
            ? `${a.detail.count} client${a.detail.count === 1 ? '' : 's'}${a.detail.filename ? ` from ${esc(a.detail.filename)}` : ''}`
            : esc(a.detail.name || '')}</span><time datetime="${esc(a.created_at)}" title="${esc(longDate(a.created_at))}">${esc(relTime(a.created_at))}</time></li>`).join('')}</ul>` : '<p class="sub">Nothing yet.</p>'}
      </div>
    </div>`;
}

// ------------------------------------------------------------------ all clients
function filtered() {
  const f = state.filters;
  const q = f.q.toLowerCase();
  return state.items.filter((c) => (!f.added_by || c.added_by === f.added_by) && (!f.status || c.status === f.status)
    && (!f.country || c.country === f.country) && (!f.upload || String(c.upload_id) === f.upload)
    && (!f.department || (f.department === 'Not set' ? !c.department : c.department === f.department))
    && (!q || [c.name, c.company, c.title, c.line1, c.city, c.region, c.postal_code, c.added_by, c.email, c.department].join(' ').toLowerCase().includes(q)));
}
function exportHref() {
  const p = new URLSearchParams();
  for (const [k, val] of Object.entries(state.filters)) if (val) p.set(k, val);
  return '/api/admin/export.csv' + (p.toString() ? '?' + p : '');
}
function clients(v) {
  const f = state.filters;
  const people = [...new Set(state.items.map((c) => c.added_by))].sort();
  const countries = [...new Set(state.items.map((c) => c.country))].sort();
  const depts = [...new Set(state.items.map((c) => c.department || 'Not set'))].sort();
  const uploads = state.ov.uploads || [];
  v.innerHTML = `
    <div class="filters">
      <label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span class="sr">Search</span><input type="search" placeholder="Search everything" value="${esc(f.q)}" data-f="q" /></label>
      <select data-f="added_by" aria-label="Added by"><option value="">Everyone</option>${people.map((p) => `<option ${p === f.added_by ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <select data-f="status" aria-label="Address status"><option value="">Any status</option>${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      <select data-f="department" aria-label="Department"><option value="">All departments</option>${depts.map((x) => `<option ${x === f.department ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select data-f="country" aria-label="Country"><option value="">All countries</option>${countries.map((c) => `<option value="${c}" ${c === f.country ? 'selected' : ''}>${esc(countryName(c))}</option>`).join('')}</select>
      ${uploads.length ? `<select data-f="upload" aria-label="Upload"><option value="">Any upload</option>${uploads.map((u) => `<option value="${u.id}" ${String(u.id) === f.upload ? 'selected' : ''}>${esc(u.filename || 'Upload')} · ${esc(u.added_by.split('@')[0])} · ${esc(shortDate(u.created_at))}</option>`).join('')}</select>` : ''}
      <span class="grow" style="flex:1"></span>
      <a class="btn btn-sm" href="${esc(exportHref())}" download data-export-filtered>Export these</a>
    </div>
    <div data-table></div>`;
  $$('[data-f]', v).forEach((el) => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
    state.filters[el.dataset.f] = el.value;
    $('[data-export-filtered]', v).href = exportHref();
    table();
  }));
  table();
}
function table() {
  const list = filtered();
  const box = $('[data-table]');
  if (!list.length) { box.innerHTML = `<div class="empty"><h3>${state.items.length ? 'No matches' : 'No clients yet'}</h3><p>${state.items.length ? 'Try clearing a filter.' : 'Once colleagues add clients, they’ll appear here.'}</p></div>`; return; }
  box.innerHTML = `<p class="sub" style="margin:0 0 10px">${list.length} client${list.length === 1 ? '' : 's'}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Recipient</th><th>Address</th><th>Status</th><th>Department</th><th>Added by</th><th>Added</th></tr></thead>
      <tbody>${list.map((c) => `<tr data-id="${c.id}" tabindex="0">
        <td><b>${esc(c.name)}</b>${c.company || c.title ? `<div class="muted">${esc([c.title, c.company].filter(Boolean).join(', '))}</div>` : ''}${c.notes ? `<div class="muted" title="${esc(c.notes)}">📝 ${esc(c.notes.slice(0, 60))}${c.notes.length > 60 ? '…' : ''}</div>` : ''}</td>
        <td class="addr">${esc(addressLines(c).join(', '))}</td>
        <td>${statusPill(c.status)}${c.kept_as_entered ? '<div class="muted" style="margin-top:4px">Kept as entered</div>' : ''}</td>
        <td>${c.department ? esc(c.department) : '<span class="muted">Not set</span>'}</td>
        <td>${esc(c.added_by)}${c.source === 'bulk' ? '<div class="muted">From an upload</div>' : ''}</td>
        <td><span title="${esc(longDate(c.created_at))}">${esc(shortDate(c.created_at))}</span></td>
      </tr>`).join('')}</tbody></table></div>`;
}

function openClient(id) {
  const c = state.items.find((x) => x.id === id);
  if (!c) return;
  const v = c.verification || {};
  const s = clientSheet({
    title: c.name, subtitle: `Added by ${c.added_by} · ${longDate(c.created_at)}${c.updated_by && c.updated_at !== c.created_at ? ` · edited by ${c.updated_by}` : ''}`,
    client: c, saveLabel: 'Save changes', focusIssue: c.status === 'needs_review', departments: state.me.settings.departments,
    submit: (body) => api('clients/' + id, { method: 'PUT', body }),
    async onDone(data) { Object.assign(c, data.client); toast('Saved'); await refresh(); },
  });
  // Admin extras at the top of the form: status, suggestion, mark as checked, delete.
  const extras = document.createElement('div');
  extras.className = 'note-box';
  extras.style.cssText = 'display:grid;gap:10px;margin-bottom:18px;background:#fff;border:1px solid var(--line)';
  extras.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${statusPill(c.status)}<span class="provider">${v.provider === 'google' ? 'Checked with Google' : 'Built-in checks'}${v.checkedAt ? ' · ' + esc(shortDate(v.checkedAt)) : ''}${c.reviewed_by ? ' · checked by ' + esc(c.reviewed_by) : ''}</span></div>
    ${(v.issues || []).length ? `<ul class="issues">${v.issues.map((i) => `<li>${ICONS.info}<span>${esc(i.message)}</span></li>`).join('')}</ul>` : ''}
    ${v.suggestion && c.status === 'needs_review' ? `<div class="addr-card"><h4>Suggested address</h4><address>${diffHtml(c, v.suggestion, v.changed || [])}</address>
      <button class="btn btn-sm btn-primary" type="button" data-apply style="margin-top:10px">Use this address</button></div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${c.status === 'needs_review' || c.status === 'unverified' ? '<button class="btn btn-sm" type="button" data-reviewed>Mark address as checked</button>' : ''}
      <button class="btn btn-sm btn-danger" type="button" data-remove>Remove client</button>
    </div>`;
  $('[data-form]', s.dialog).prepend(extras);
  extras.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-apply]')) {
      s.fill({ ...c, ...v.suggestion });
      $('[data-save]', s.dialog).click();
    } else if (t.matches('[data-reviewed]')) {
      const r = await api(`clients/${id}/review`, { method: 'POST', body: {} });
      if (!r.ok) return toast(r.data.error || 'Couldn’t update.', { bad: true });
      s.dialog.close(); toast('Marked as checked'); await refresh();
    } else if (t.matches('[data-remove]')) {
      const ok = await confirmBox({ title: `Remove ${c.name}?`, body: `Added by ${esc(c.added_by)}. They won’t get a card.`, ok: 'Remove' });
      if (!ok) return;
      const r = await api('clients/' + id, { method: 'DELETE' });
      if (!r.ok) return toast(r.data.error || 'Couldn’t remove.', { bad: true });
      s.dialog.close(); toast(`${c.name} removed`); await refresh();
    }
  });
}

// ------------------------------------------------------------------ people
function people(v) {
  const list = state.ov.contributors;
  const uploads = state.ov.uploads || [];
  v.innerHTML = `
    <div class="split">
      <div class="panel"><h3>Colleagues</h3>
        ${list.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Who</th><th>Clients</th><th>Need a look</th><th>Last added</th></tr></thead>
          <tbody>${list.map((p) => `<tr data-person-row="${esc(p.added_by)}" tabindex="0"><td><b>${esc(p.added_by)}</b>${p.bulk ? `<div class="muted">${p.bulk} from uploads</div>` : ''}</td>
          <td>${p.total}</td><td>${p.needs_review ? `<span class="status s-needs_review">${p.needs_review}</span>` : '–'}</td><td>${esc(relTime(p.last_at))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">No one has added clients yet.</p>'}
      </div>
      <div class="panel"><h3>Uploads</h3>
        ${uploads.length ? `<ul class="feed">${uploads.map((u) => `<li><span><b>${esc(u.filename || 'Upload')}</b> · ${u.row_count} client${u.row_count === 1 ? '' : 's'}</span>
          <time>${esc(u.added_by)} · ${esc(longDate(u.created_at))}</time>
          <span><button class="btn btn-text btn-sm" type="button" data-upload-view="${u.id}" style="padding-left:0">View these clients →</button></span></li>`).join('')}</ul>` : '<p class="sub">No uploads yet.</p>'}
      </div>
    </div>`;
}

// ------------------------------------------------------------------ access
async function access(v) {
  v.innerHTML = '<div class="spinner"></div>';
  const r = await api('admin/admins');
  const list = r.data.admins || [];
  v.innerHTML = `<div class="panel" style="max-width:680px"><h3>Who can open this admin page</h3>
    <p class="sub" style="margin:-6px 0 14px">Everyone with an @overyondr.com email can add clients. Admins can also see everyone’s clients, edit them and export the list.</p>
    <div class="people">${list.map((a) => `<div class="person"><div><b>${esc(a.email)}</b><div class="muted" style="font-size:13px;color:var(--moss)">${a.added_by ? 'Added by ' + esc(a.added_by) : 'Set up with the app'}</div></div>
      <div style="display:flex;gap:8px;align-items:center"><span class="role">${esc(a.role)}</span>${a.role !== 'owner' && a.email !== state.me.email ? `<button class="icon-btn" type="button" data-rm-admin="${esc(a.email)}" aria-label="Remove ${esc(a.email)}">${ICONS.trash}</button>` : ''}</div></div>`).join('')}</div>
    <form class="inline-form" data-add-admin><label class="sr" for="new-admin">Email</label><input id="new-admin" type="email" placeholder="name@overyondr.com" required /><button class="btn btn-primary" type="submit">Add admin</button></form></div>`;
  $('[data-add-admin]', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#new-admin', v).value.trim();
    const res = await api('admin/admins', { method: 'POST', body: { email } });
    if (!res.ok) return toast(res.data.error || 'Couldn’t add.', { bad: true });
    toast(`${email} is now an admin`); access(v);
  });
}

// ------------------------------------------------------------------ settings
function settings(v) {
  const s = state.me.settings;
  v.innerHTML = `<div class="panel settings">
    <h3>Settings</h3>
    <label class="field"><span>Deadline for adding clients <small>(shown on the staff page)</small></span><input type="date" data-s="deadline" value="${esc(s.deadline)}" /></label>
    <label class="field"><span>Message under the headline <small>(optional, replaces the default)</small></span>
      <textarea data-s="message" rows="3" placeholder="Add the clients and partners you’d like us to send a card to…">${esc(s.message)}</textarea></label>
 <label class="field"><span>Departments <small>(one per line, shown in the dropdown)</small></span>
      <textarea data-s="departments" rows="8">${esc(s.departments.join('\n'))}</textarea></label>
    <label class="switch"><input type="checkbox" data-s="closed" ${s.closed ? 'checked' : ''} /> Close the list (staff can see their clients but can’t add or change them)</label>
    <div><button class="btn btn-primary" type="button" data-save-settings>Save settings</button></div>
  </div>`;
  $('[data-save-settings]', v).onclick = async () => {
    const body = { deadline: $('[data-s="deadline"]', v).value, message: $('[data-s="message"]', v).value.trim(), closed: $('[data-s="closed"]', v).checked,
      departments: $('[data-s="departments"]', v).value.split('\n').map((x) => x.trim()).filter(Boolean) };
    const r = await api('admin/settings', { method: 'PUT', body });
    if (!r.ok) return toast(r.data.error || 'Couldn’t save.', { bad: true });
    state.me.settings = r.data.settings;
    toast('Settings saved');
  };
}

// ------------------------------------------------------------------ events
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, tr[data-id], tr[data-person-row]');
  if (!t) return;
  if (t.dataset.tab) { state.tab = t.dataset.tab; view(); }
  else if (t.dataset.id) openClient(+t.dataset.id);
  else if (t.dataset.person || t.dataset.personRow) { state.filters = { ...state.filters, added_by: t.dataset.person || t.dataset.personRow, status: '', upload: '' }; state.tab = 'clients'; view(); }
  else if (t.dataset.dept) { state.filters = { q: '', added_by: '', status: '', country: '', upload: '', department: t.dataset.dept }; state.tab = 'clients'; view(); }
  else if (t.dataset.uploadView) { state.filters = { q: '', added_by: '', status: '', country: '', department: '', upload: t.dataset.uploadView }; state.tab = 'clients'; view(); }
  else if (t.matches('[data-goto-review]')) { state.filters = { q: '', added_by: '', status: 'needs_review', country: '', department: '', upload: '' }; state.tab = 'clients'; view(); }
  else if (t.dataset.rmAdmin) {
    const ok = await confirmBox({ title: 'Remove admin?', body: `${esc(t.dataset.rmAdmin)} will no longer see the admin page.`, ok: 'Remove' });
    if (!ok) return;
    const r = await api('admin/admins', { method: 'DELETE', body: { email: t.dataset.rmAdmin } });
    if (!r.ok) return toast(r.data.error || 'Couldn’t remove.', { bad: true });
    access($('[data-view]'));
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('tr[data-id], tr[data-person-row]')) e.target.click();
});

boot();
