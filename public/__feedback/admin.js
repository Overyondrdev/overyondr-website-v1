/* Yondr feedback admin dashboard (overyondrdev.com/admin). Plain JS, no dependencies. */
(function () {
  'use strict';
  var API = '/__feedback/api/';
  var app = document.getElementById('app');
  var TYPES = { bug: 'Bug', design: 'Design', content: 'Copy', idea: 'Idea', question: 'Question', praise: 'Love it', other: 'Other' };
  var STATUS = { new: 'New', reviewing: 'In review', agreed: 'Agreed', planned: 'Planned', done: 'Done', wont_do: 'Won’t do' };
  var STATUS_COLORS = { new: '#c9d3b3', reviewing: '#f3c84b', agreed: '#8fcb63', planned: '#7aa2f0', done: '#1c300b', wont_do: '#bdbdbd' };
  var PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' };
  var SITES = { v1: 'V1', v2: 'V2', portal: 'Both / general', ads: 'Ad library' };

  var S = {
    me: null, view: (location.hash.replace('#', '') || 'overview'), items: [], stats: null, summary: null, admins: [],
    filters: { q: '', status: 'new,reviewing,agreed,planned', type: '', site: '', priority: '', assignee: '', sort: 'new' },
    openId: null, detail: null, lastSync: null, internal: false, generating: false,
  };

  // ------------------------------------------------------------- helpers
  function api(path, opts) {
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Request failed'); e.status = r.status; throw e; } return d; });
    });
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return e;
  }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function name(email) { return (email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function avatar(email) { var n = name(email).split(' '); return h('span', { class: 'avatar', title: email, text: (n[0] || '?')[0] + (n[1] ? n[1][0] : '') }); }
  function statusPill(s) { return h('span', { class: 'pill s-' + s, text: STATUS[s] || s }); }
  function prioDot(p) { return h('span', { class: 'prio p-' + p, title: PRIORITY[p] + ' priority' }); }
  function toast(msg) { var t = h('div', { class: 'toast', role: 'status', text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  var ICONS = {
    overview: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    inbox: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/></svg>',
    board: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/></svg>',
    themes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
    people: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.2A5 5 0 0 1 21.5 19"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
    spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    up: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11l5-5 5 5M12 6v13"/></svg>',
    down: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13l5 5 5-5M12 18V5"/></svg>',
    ext: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
    chat: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
    img: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  };

  // ------------------------------------------------------------- data
  function query() {
    var f = S.filters, p = ['scope=all', 'sort=' + f.sort];
    ['q', 'status', 'type', 'site', 'priority', 'assignee'].forEach(function (k) { if (f[k]) p.push(k + '=' + encodeURIComponent(f[k])); });
    return 'feedback?' + p.join('&');
  }
  function loadItems() { return api(query()).then(function (d) { S.items = d.items; }); }
  function loadAll() {
    return Promise.all([loadItems(), api('stats').then(function (d) { S.stats = d; }), api('summary').then(function (d) { S.summary = d.summary; }),
      api('admins').then(function (d) { S.admins = d.admins; })]).then(function () { S.lastSync = new Date(); });
  }
  function loadDetail(id) { return api('feedback/' + id).then(function (d) { S.detail = d; }); }

  // ------------------------------------------------------------- shell
  function boot() {
    api('me').then(function (me) {
      S.me = me;
      if (!me.isAdmin) return denied();
      return loadAll().then(function () {
        var m = /^item-(\d+)$/.exec(S.view);
        if (m) { S.view = 'inbox'; openItem(parseInt(m[1], 10)); }
        render();
        setInterval(sync, 30000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
      });
    }).catch(function (e) {
      app.innerHTML = '';
      app.appendChild(h('div', { class: 'denied' }, [h('div', {}, [h('h1', { text: 'Something went wrong' }), h('p', { text: e.message })])]));
    });
  }
  function sync() {
    loadAll().then(function () {
      if (S.openId) return loadDetail(S.openId);
    }).then(function () { renderMain(true); if (S.openId) renderDrawer(true); }).catch(function () {});
  }
  function denied() {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'denied' }, [h('div', {}, [
      h('img', { src: '/brand/yondr-lichen.svg', alt: 'Yondr', width: 110 }),
      h('h1', { text: 'Admins only' }),
      h('p', { text: 'You’re signed in as ' + S.me.email + ', which doesn’t have access to the feedback dashboard yet. Ask an existing admin to add you under People & access.' }),
      h('a', { class: 'btn lichen', href: 'https://overyondrdev.com/', text: 'Back to the website preview' }),
    ])]));
  }

  var mainEl, navEl;
  function render() {
    app.innerHTML = '';
    var openCount = S.stats ? Object.keys(S.stats.byStatus).filter(function (k) { return k !== 'done' && k !== 'wont_do'; }).reduce(function (a, k) { return a + S.stats.byStatus[k]; }, 0) : 0;
    navEl = h('nav', { class: 'nav', 'aria-label': 'Dashboard' });
    [['overview', 'Overview'], ['inbox', 'Inbox', openCount], ['board', 'Board'], ['themes', 'Themes & summary'], ['people', 'People & access']].forEach(function (n) {
      navEl.appendChild(h('button', { type: 'button', 'aria-current': S.view === n[0] ? 'page' : null, onclick: function () { go(n[0]); } }, [
        h('span', { html: ICONS[n[0]] }), n[1], n[2] ? h('span', { class: 'n', text: n[2] }) : null,
      ]));
    });
    var side = h('aside', { class: 'side' }, [
      h('a', { class: 'brand', href: 'https://overyondrdev.com/' }, [h('img', { src: '/brand/yondr-lichen.svg', alt: 'Yondr' }), h('span', { text: 'Feedback' })]),
      navEl,
      h('div', { class: 'spacer' }),
      h('div', { class: 'me' }, ['Signed in as', h('b', { text: S.me.email }), h('div', { style: 'margin-top:8px;display:flex;gap:12px' }, [
        h('a', { href: 'https://overyondrdev.com/', text: 'Preview ↗' }), h('a', { href: '/cdn-cgi/access/logout', text: 'Sign out' }),
      ])]),
    ]);
    mainEl = h('main', { class: 'main', id: 'main' });
    app.appendChild(h('div', { class: 'app' }, [side, mainEl]));
    renderMain();
  }
  function go(view) { S.view = view; history.replaceState(null, '', '#' + view); render(); window.scrollTo(0, 0); }
  function head(title, sub, actions) {
    return h('div', { class: 'page-head' }, [
      h('div', {}, [h('h1', { text: title }), sub ? h('p', { text: sub }) : null]),
      h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
        h('span', { class: 'live', title: 'Refreshes every 30 seconds' }, [h('i'), 'Live · ' + (S.lastSync ? ago(S.lastSync.toISOString()) : '')]),
      ].concat(actions || [])),
    ]);
  }
  function renderMain(soft) {
    if (!mainEl) return;
    var y = window.scrollY;
    mainEl.innerHTML = '';
    ({ overview: overview, inbox: inbox, board: board, themes: themes, people: people }[S.view] || overview)();
    if (soft) window.scrollTo(0, y);
  }

  // ------------------------------------------------------------- overview
  function overview() {
    var st = S.stats;
    var open = Object.keys(st.byStatus).filter(function (k) { return k !== 'done' && k !== 'wont_do'; }).reduce(function (a, k) { return a + st.byStatus[k]; }, 0);
    var week = st.byDay.filter(function (d) { return (Date.now() - new Date(d.k).getTime()) < 7 * 864e5; }).reduce(function (a, d) { return a + d.n; }, 0);
    var urgent = S.items.filter(function (i) { return i.priority === 'critical' || i.priority === 'high'; }).length;
    mainEl.appendChild(head('Overview', 'Everything the team has said about the Yondr website, in one place.', [
      h('a', { class: 'btn', href: API + 'export.csv', html: ICONS.download + ' Export CSV' }),
    ]));
    mainEl.appendChild(h('div', { class: 'grid kpis' }, [
      kpi(st.total, 'Total feedback', true), kpi(open, 'Open'), kpi(week, 'Last 7 days'), kpi(urgent, 'High / critical open'),
      kpi(st.people.length, 'Contributors'), kpi(st.comments, 'Comments'),
    ]));
    if (!st.total) {
      mainEl.appendChild(h('div', { class: 'card empty' }, [h('h3', { text: 'No feedback yet' }),
        h('p', { text: 'Feedback sent from the widget on v1.overyondrdev.com and v2.overyondrdev.com will appear here.' })]));
      return;
    }
    // AI summary preview
    var sum = S.summary;
    var sumCard = h('div', { class: 'card summary', style: 'margin-bottom:16px' }, [
      h('h2', {}, ['What matters most', h('button', { class: 'btn lichen', type: 'button', html: ICONS.spark + (S.generating ? ' Summarising…' : sum ? ' Refresh' : ' Summarise'), disabled: S.generating, onclick: generate })]),
    ]);
    if (sum) {
      sumCard.appendChild(h('p', { class: 'headline', text: sum.content.headline || '' }));
      var th = h('div', { class: 'grid three' });
      (sum.content.themes || []).slice(0, 3).forEach(function (t) { th.appendChild(themeCard(t)); });
      sumCard.appendChild(th);
      sumCard.appendChild(h('p', { class: 'meta', style: 'margin:14px 0 0' }, [
        'Based on ' + sum.item_count + ' open items · ' + ago(sum.created_at) + ' by ' + name(sum.created_by) + ' · ',
        h('a', { href: '#themes', style: 'color:var(--l)', onclick: function (e) { e.preventDefault(); go('themes'); }, text: 'See all themes →' }),
      ]));
    } else {
      sumCard.appendChild(h('p', { class: 'meta', text: 'Generate an AI summary to group feedback into themes, rank them by impact and suggest next steps.' }));
    }
    mainEl.appendChild(sumCard);

    var statusBar = h('div', { class: 'bar' });
    var legend = h('div', { class: 'legend' });
    Object.keys(STATUS).forEach(function (s) {
      var n = st.byStatus[s] || 0; if (!n) return;
      statusBar.appendChild(h('span', { style: 'width:' + (100 * n / st.total) + '%;background:' + STATUS_COLORS[s], title: STATUS[s] + ': ' + n }));
      legend.appendChild(h('span', {}, [h('i', { style: 'background:' + STATUS_COLORS[s] }), STATUS[s] + ' ' + n]));
    });
    var max = Math.max.apply(null, st.byDay.map(function (d) { return d.n; }).concat([1]));
    var days = []; for (var i = 29; i >= 0; i--) { var k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); var f = st.byDay.filter(function (d) { return d.k === k; })[0]; days.push({ k: k, n: f ? f.n : 0 }); }
    mainEl.appendChild(h('div', { class: 'grid two', style: 'margin-bottom:16px' }, [
      h('div', { class: 'card' }, [h('h2', { text: 'Pipeline' }), statusBar, legend,
        h('div', { class: 'sec', text: 'New feedback · last 30 days' }),
        h('div', { class: 'spark' }, days.map(function (d) { return h('span', { style: 'height:' + (100 * d.n / max) + '%', title: d.k + ': ' + d.n }); }))]),
      h('div', { class: 'card' }, [h('h2', { text: 'V1 vs V2' }), rows(st.bySite, SITES),
        h('div', { class: 'sec', text: 'By type' }), rows(st.byType, TYPES)]),
    ]));
    var top = h('div', { class: 'rows' });
    st.topVoted.forEach(function (t) {
      top.appendChild(h('div', { class: 'feed' }, [h('div', { class: 'ev' }, [h('span', { class: 'avatar', style: 'background:var(--l)', text: (t.score > 0 ? '+' : '') + t.score }),
        h('div', {}, [h('span', { class: 'clickable', text: '#' + t.id + ' ' + (t.title || t.message).slice(0, 120), onclick: function () { openItem(t.id); } }), ' ', statusPill(t.status)])])]));
    });
    var feed = h('div', { class: 'feed' });
    st.recent.forEach(function (a) { feed.appendChild(event(a)); });
    mainEl.appendChild(h('div', { class: 'grid three' }, [
      h('div', { class: 'card' }, [h('h2', { text: 'Most agreed' }), st.topVoted.length ? top : h('p', { class: 'meta', text: 'No votes yet.' })]),
      h('div', { class: 'card' }, [h('h2', { text: 'Pages with most feedback' }), pageRows(st.topPages)]),
      h('div', { class: 'card' }, [h('h2', { text: 'Latest activity' }), feed]),
    ]));
  }
  function kpi(v, k, accent) { return h('div', { class: 'card kpi' + (accent ? ' accent' : '') }, [h('div', { class: 'v', text: String(v || 0) }), h('div', { class: 'k', text: k })]); }
  function rows(obj, labels) {
    var total = Object.keys(obj).reduce(function (a, k) { return a + obj[k]; }, 0) || 1;
    var r = h('div', { class: 'rows' });
    Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).forEach(function (k) {
      r.appendChild(h('div', { class: 'rowbar' }, [h('span', { class: 't', text: labels[k] || k }), h('span', { class: 'n', text: obj[k] }),
        h('span', { class: 'track' }, [h('b', { style: 'width:' + (100 * obj[k] / total) + '%' })])]));
    });
    return r;
  }
  function pageRows(list) {
    var max = Math.max.apply(null, list.map(function (p) { return p.n; }).concat([1]));
    var r = h('div', { class: 'rows' });
    list.forEach(function (p) {
      var parts = p.k.split(' ');
      r.appendChild(h('div', { class: 'rowbar' }, [
        h('span', { class: 't clickable', title: p.k, onclick: function () { S.filters = Object.assign({}, S.filters, { q: parts.slice(1).join(' '), status: '' }); loadItems().then(function () { go('inbox'); }); } },
          [h('span', { class: 'pill site', text: SITES[parts[0]] || parts[0] }), ' ' + (parts.slice(1).join(' ') || '/')]),
        h('span', { class: 'n', text: p.n }), h('span', { class: 'track' }, [h('b', { style: 'width:' + (100 * p.n / max) + '%' })])]));
    });
    return r;
  }
  function event(a) {
    var verb = { created: 'added feedback', updated: 'updated', commented: 'replied on', noted: 'added a note to', deleted: 'deleted',
      admin_added: 'added an admin', admin_removed: 'removed an admin' }[a.action] || a.action;
    var what = a.feedback_id ? '#' + a.feedback_id : (a.detail && a.detail.email) || '';
    var extra = a.action === 'updated' ? Object.keys(a.detail || {}).map(function (k) { var c = a.detail[k]; return k + ' → ' + (k === 'status' ? (STATUS[c.to] || c.to) : Array.isArray(c.to) ? c.to.join(', ') : (c.to || '—')); }).join(', ') : '';
    return h('div', { class: 'ev' }, [avatar(a.actor), h('div', {}, [
      h('b', { text: name(a.actor) }), ' ' + verb + ' ',
      a.feedback_id && a.action !== 'deleted' ? h('span', { class: 'clickable', style: 'font-weight:700;color:var(--g)', text: what, onclick: function () { openItem(a.feedback_id); } }) : what,
      extra ? h('div', { class: 'when', text: extra }) : null,
      h('div', { class: 'when', text: ago(a.created_at) }),
    ])]);
  }

  // ------------------------------------------------------------- inbox
  function filterBar() {
    var f = S.filters;
    function sel(key, label, opts) {
      var s = h('select', { class: 'input', 'aria-label': label, onchange: function () { f[key] = s.value; loadItems().then(function () { renderMain(true); }); } });
      s.appendChild(h('option', { value: '', text: label }));
      Object.keys(opts).forEach(function (k) { s.appendChild(h('option', { value: k, text: opts[k], selected: f[key] === k })); });
      return s;
    }
    var statusSel = sel('status', 'Any status', Object.assign({ 'new,reviewing,agreed,planned': 'Open (all)' }, STATUS));
    var assignees = {}; S.admins.forEach(function (a) { assignees[a.email] = name(a.email); });
    var search = h('input', { class: 'input search', type: 'search', placeholder: 'Search feedback, pages, people…', value: f.q });
    var t; search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { f.q = search.value.trim(); loadItems().then(function () { renderMain(true); var s2 = mainEl.querySelector('.search'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } }); }, 250); });
    return h('div', { class: 'toolbar' }, [search, statusSel, sel('type', 'Any type', TYPES), sel('site', 'V1 + V2', SITES), sel('priority', 'Any priority', PRIORITY),
      sel('assignee', 'Anyone', assignees),
      sel('sort', 'Sort', { new: 'Newest', updated: 'Recently active', votes: 'Most agreed', discussed: 'Most discussed', priority: 'Priority', old: 'Oldest' })]);
  }
  function inbox() {
    mainEl.appendChild(head('Inbox', S.items.length + ' item' + (S.items.length === 1 ? '' : 's'), [h('a', { class: 'btn', href: API + 'export.csv', html: ICONS.download + ' CSV' })]));
    mainEl.appendChild(filterBar());
    if (!S.items.length) { mainEl.appendChild(h('div', { class: 'card empty' }, [h('h3', { text: 'Nothing matches' }), h('p', { text: 'Try clearing a filter.' })])); return; }
    var list = h('div', { class: 'items' });
    S.items.forEach(function (i) {
      list.appendChild(h('button', { class: 'it' + (S.openId === i.id ? ' sel' : ''), type: 'button', onclick: function () { openItem(i.id); } }, [
        h('span', { class: 'id', text: '#' + i.id }),
        h('span', {}, [
          h('span', { class: 'meta' }, [prioDot(i.priority), h('span', { class: 'pill t', text: TYPES[i.type] }), statusPill(i.status), h('span', { class: 'pill site', text: SITES[i.site] }),
            h('span', { text: i.path }), h('span', { text: '· ' + name(i.author_email) + ' · ' + ago(i.created_at) })]),
          h('p', { class: 'msg', text: i.message }),
        ]),
        h('span', { class: 'right' }, [
          i.assignee ? avatar(i.assignee) : null,
          i.attachment_count ? h('span', { html: ICONS.img + ' ' + i.attachment_count }) : null,
          h('span', { html: ICONS.chat + ' ' + i.comment_count }),
          h('b', { text: (i.score > 0 ? '+' : '') + i.score }),
        ]),
      ]));
    });
    mainEl.appendChild(list);
  }

  // ------------------------------------------------------------- board
  function board() {
    mainEl.appendChild(head('Board', 'Drag cards between columns to move them through the process.'));
    var saved = S.filters.status;
    var b = h('div', { class: 'board' });
    Object.keys(STATUS).forEach(function (s) {
      var items = S.items.filter(function (i) { return i.status === s; });
      var col = h('div', { class: 'col', 'data-status': s }, [h('h3', {}, [STATUS[s], h('span', { text: items.length })])]);
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', function () { col.classList.remove('over'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('over');
        var id = parseInt(e.dataTransfer.getData('text/plain'), 10);
        var item = S.items.filter(function (i) { return i.id === id; })[0];
        if (!item || item.status === s) return;
        item.status = s; renderMain(true);
        api('feedback/' + id, { method: 'PATCH', body: { status: s } }).then(function () { toast('#' + id + ' moved to ' + STATUS[s]); sync(); }).catch(function (er) { toast(er.message); sync(); });
      });
      items.forEach(function (i) {
        var t = h('div', { class: 'tile', draggable: 'true', onclick: function () { openItem(i.id); } }, [
          h('div', { class: 'meta' }, [prioDot(i.priority), h('b', { style: 'color:var(--g)', text: '#' + i.id }), h('span', { class: 'pill t', text: TYPES[i.type] }), h('span', { class: 'pill site', text: SITES[i.site] })]),
          h('p', { class: 'msg', text: i.message }),
          h('div', { class: 'meta' }, [h('span', { text: i.path }), h('span', { style: 'margin-left:auto', html: ICONS.chat + ' ' + i.comment_count + ' · ' + (i.score > 0 ? '+' : '') + i.score }), i.assignee ? avatar(i.assignee) : null]),
        ]);
        t.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(i.id)); });
        col.appendChild(t);
      });
      b.appendChild(col);
    });
    if (saved !== '') { S.filters.status = ''; loadItems().then(function () { renderMain(true); }); }
    mainEl.appendChild(b);
  }

  // ------------------------------------------------------------- themes
  function generate() {
    S.generating = true; renderMain(true);
    api('summary', { method: 'POST' }).then(function (d) { S.summary = d.summary; toast('Summary updated'); })
      .catch(function (e) { toast(e.message); })
      .then(function () { S.generating = false; renderMain(true); });
  }
  function refs(ids) {
    return h('div', { class: 'refs' }, (ids || []).map(function (id) { return h('button', { class: 'ref', type: 'button', text: '#' + id, onclick: function () { openItem(id); } }); }));
  }
  function themeCard(t) {
    return h('div', { class: 'theme' }, [
      h('h3', {}, [t.title, h('span', { class: 'impact ' + (t.impact || 'low'), text: (t.impact || 'low') + ' impact' })]),
      h('p', { text: t.summary }),
      t.recommendation ? h('div', { class: 'rec' }, [h('b', { text: 'Recommendation: ' }), t.recommendation]) : null,
      refs(t.item_ids),
    ]);
  }
  function themes() {
    var sum = S.summary;
    mainEl.appendChild(head('Themes & summary', 'AI-grouped themes across all open feedback, ranked by impact. Review together and agree what to build.', [
      h('button', { class: 'btn primary', type: 'button', disabled: S.generating, html: ICONS.spark + (S.generating ? ' Summarising…' : sum ? ' Generate new summary' : ' Generate summary'), onclick: generate }),
    ]));
    if (!sum) { mainEl.appendChild(h('div', { class: 'card empty' }, [h('h3', { text: 'No summary yet' }), h('p', { text: 'Generate one to see themes, quick wins and open questions.' })])); return; }
    var c = sum.content;
    mainEl.appendChild(h('div', { class: 'card summary', style: 'margin-bottom:16px' }, [
      h('h2', { text: 'The overall read' }), h('p', { class: 'headline', text: c.headline || '' }),
      c.sentiment ? h('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' }, [
        h('div', { class: 'theme' }, [h('h3', { text: 'V1' }), h('p', { text: c.sentiment.v1 || '—' })]),
        h('div', { class: 'theme' }, [h('h3', { text: 'V2' }), h('p', { text: c.sentiment.v2 || '—' })]),
      ]) : null,
      h('p', { class: 'meta', style: 'margin:14px 0 0', text: 'Generated ' + ago(sum.created_at) + ' by ' + name(sum.created_by) + ' from ' + sum.item_count + ' open items. AI can be wrong — check the linked items.' }),
    ]));
    var th = h('div', { class: 'themes', style: 'margin-bottom:16px' });
    (c.themes || []).forEach(function (t) { th.appendChild(themeCard(t)); });
    mainEl.appendChild(th);
    mainEl.appendChild(h('div', { class: 'grid two' }, [
      h('div', { class: 'card' }, [h('h2', { text: 'Quick wins' }), h('ul', { class: 'list-plain' }, (c.quick_wins || []).map(function (q) { return h('li', {}, [q.text, refs(q.item_ids)]); }))]),
      h('div', { class: 'card' }, [h('h2', { text: 'Open questions' }), h('ul', { class: 'list-plain' }, (c.open_questions || []).map(function (q) { return h('li', {}, [q.text, refs(q.item_ids)]); }))]),
    ]));
  }

  // ------------------------------------------------------------- people
  function people() {
    var isOwner = S.me.role === 'owner';
    mainEl.appendChild(head('People & access', 'Admins can see and manage all feedback. Everyone at @overyondr.com can leave feedback.'));
    var list = h('div', { class: 'people' });
    S.admins.forEach(function (a) {
      var canRemove = a.email !== S.me.email && (a.role !== 'owner' || isOwner);
      list.appendChild(h('div', { class: 'person' }, [avatar(a.email), h('span', { class: 'e' }, [h('b', { text: name(a.email) }), ' · ' + a.email]),
        h('span', { class: 'role ' + a.role, text: a.role }),
        canRemove ? h('button', { class: 'btn danger', type: 'button', text: 'Remove', onclick: function () {
          if (!confirm('Remove ' + a.email + ' as an admin?')) return;
          api('admins', { method: 'DELETE', body: { email: a.email } }).then(function (d) { S.admins = d.admins; toast('Removed ' + a.email); renderMain(true); }).catch(function (e) { toast(e.message); });
        } }) : null]));
    });
    var email = h('input', { class: 'input', type: 'email', placeholder: 'name@overyondr.com', 'aria-label': 'Email address' });
    var role = h('select', { class: 'input', 'aria-label': 'Role' }, [h('option', { value: 'admin', text: 'Admin' }), isOwner ? h('option', { value: 'owner', text: 'Owner (can manage owners)' }) : null]);
    var add = h('button', { class: 'btn primary', type: 'button', text: 'Add admin', onclick: function () {
      api('admins', { method: 'POST', body: { email: email.value, role: role.value } }).then(function (d) { S.admins = d.admins; toast('Added ' + email.value); renderMain(true); }).catch(function (e) { toast(e.message); });
    } });
    email.addEventListener('keydown', function (e) { if (e.key === 'Enter') add.click(); });
    var contrib = h('div', { class: 'people' });
    S.stats.people.forEach(function (p) { contrib.appendChild(h('div', { class: 'person' }, [avatar(p.k), h('span', { class: 'e', text: p.k }),
      h('button', { class: 'btn', type: 'button', text: p.n + ' item' + (p.n === 1 ? '' : 's'), onclick: function () { S.filters = Object.assign({}, S.filters, { q: p.k, status: '' }); loadItems().then(function () { go('inbox'); }); } })])); });
    mainEl.appendChild(h('div', { class: 'grid two' }, [
      h('div', { class: 'card' }, [h('h2', { text: 'Admins' }), list, h('div', { class: 'addrow' }, [email, role, add])]),
      h('div', { class: 'card' }, [h('h2', { text: 'Contributors' }), S.stats.people.length ? contrib : h('p', { class: 'meta', text: 'No one has left feedback yet.' })]),
    ]));
  }

  // ------------------------------------------------------------- drawer
  var drawerEl, scrimEl;
  function openItem(id) {
    S.openId = id; S.detail = null;
    history.replaceState(null, '', '#item-' + id);
    renderDrawer();
    loadDetail(id).then(function () { renderDrawer(); renderMain(true); }).catch(function (e) { toast(e.message); closeItem(); });
  }
  function closeItem() {
    S.openId = null; S.detail = null;
    if (drawerEl) drawerEl.remove(); if (scrimEl) scrimEl.remove();
    drawerEl = scrimEl = null;
    history.replaceState(null, '', '#' + S.view);
    renderMain(true);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.openId && !document.querySelector('.lightbox')) closeItem(); });

  function renderDrawer(soft) {
    var scrollTop = drawerEl ? drawerEl.querySelector('.db').scrollTop : 0;
    var draft = drawerEl && drawerEl.querySelector('.composer textarea') ? drawerEl.querySelector('.composer textarea').value : '';
    if (drawerEl) drawerEl.remove();
    if (!scrimEl) { scrimEl = h('div', { class: 'scrim', onclick: closeItem }); document.body.appendChild(scrimEl); }
    drawerEl = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Feedback #' + S.openId });
    document.body.appendChild(drawerEl);
    var d = S.detail;
    var body = h('div', { class: 'db' });
    drawerEl.appendChild(h('div', { class: 'dh' }, [h('h2', { text: '#' + S.openId }), d ? statusPill(d.item.status) : null,
      d ? h('a', { class: 'btn', href: d.item.url, target: '_blank', rel: 'noopener', html: 'Open page ' + ICONS.ext }) : null,
      h('button', { class: 'btn x', type: 'button', 'aria-label': 'Close', html: ICONS.close, onclick: closeItem })]));
    drawerEl.appendChild(body);
    if (!d) { body.appendChild(h('div', { class: 'spinner' })); return; }
    var i = d.item;

    function patch(field, value) {
      var b = {}; b[field] = value;
      api('feedback/' + i.id, { method: 'PATCH', body: b }).then(function (nd) { S.detail = nd; renderDrawer(true); sync(); }).catch(function (e) { toast(e.message); });
    }
    function select(field, label, opts, value, allowEmpty) {
      var s = h('select', { class: 'input', onchange: function () { patch(field, s.value || null); } });
      if (allowEmpty) s.appendChild(h('option', { value: '', text: 'Unassigned' }));
      Object.keys(opts).forEach(function (k) { s.appendChild(h('option', { value: k, text: opts[k], selected: value === k })); });
      return h('label', {}, [label, s]);
    }
    var assignees = {}; S.admins.forEach(function (a) { assignees[a.email] = name(a.email); });
    if (i.assignee && !assignees[i.assignee]) assignees[i.assignee] = name(i.assignee);
    body.appendChild(h('div', { class: 'controls' }, [
      select('status', 'Status', STATUS, i.status), select('priority', 'Priority', PRIORITY, i.priority),
      select('type', 'Type', TYPES, i.type), select('assignee', 'Owner', assignees, i.assignee, true),
    ]));

    // Tags
    var tagWrap = h('div', { class: 'tags', style: 'margin-bottom:14px' });
    i.tags.forEach(function (t) { tagWrap.appendChild(h('span', { class: 'tag' }, [t, h('button', { type: 'button', 'aria-label': 'Remove tag ' + t, text: '×', onclick: function () { patch('tags', i.tags.filter(function (x) { return x !== t; })); } })])); });
    var tagIn = h('input', { placeholder: i.tags.length ? 'Add tag…' : '+ Add tags (e.g. navigation, mobile)', 'aria-label': 'Add tag' });
    tagIn.addEventListener('keydown', function (e) { if (e.key === 'Enter' && tagIn.value.trim()) { patch('tags', i.tags.concat([tagIn.value.trim()])); } });
    tagWrap.appendChild(tagIn);
    body.appendChild(tagWrap);

    body.appendChild(h('div', { class: 'message' }, [
      h('div', { class: 'by' }, [avatar(i.author_email), h('b', { text: name(i.author_email) }), h('span', { text: '· ' + ago(i.created_at) }), h('span', { class: 'pill t', text: TYPES[i.type] }), h('span', { class: 'pill site', text: SITES[i.site] })]),
      i.message,
    ]));

    if (d.attachments.length) {
      var shots = h('div', { class: 'shots' });
      d.attachments.forEach(function (a) {
        var src = API + 'attachments/' + a.id;
        shots.appendChild(h('button', { type: 'button', 'aria-label': 'Enlarge screenshot', onclick: function () {
          var lb = h('div', { class: 'lightbox', onclick: function () { lb.remove(); } }, [h('img', { src: src, alt: 'Screenshot' })]);
          document.body.appendChild(lb);
        } }, [h('img', { src: src, alt: 'Screenshot', loading: 'lazy' })]));
      });
      body.appendChild(shots);
    }

    // Votes
    var mine = (d.votes.filter(function (v) { return v.email === S.me.email; })[0] || {}).value || 0;
    function castVote(v) { api('feedback/' + i.id + '/vote', { method: 'POST', body: { value: mine === v ? 0 : v } }).then(function () { return loadDetail(i.id); }).then(function () { renderDrawer(true); sync(); }); }
    var ups = d.votes.filter(function (v) { return v.value > 0; }), downs = d.votes.filter(function (v) { return v.value < 0; });
    body.appendChild(h('div', { class: 'votes' }, [
      h('button', { class: 'vote up', type: 'button', 'aria-pressed': mine === 1 ? 'true' : 'false', html: ICONS.up + ' Agree ' + ups.length, onclick: function () { castVote(1); } }),
      h('button', { class: 'vote down', type: 'button', 'aria-pressed': mine === -1 ? 'true' : 'false', html: ICONS.down + ' Disagree ' + downs.length, onclick: function () { castVote(-1); } }),
      h('span', { class: 'voters' }, ups.concat(downs).map(function (v) { return avatar(v.email); })),
    ]));

    // Context
    var c = i.context || {};
    var ctx = h('dl', { class: 'ctx' });
    function row(k, v) { if (v) { ctx.appendChild(h('dt', { text: k })); ctx.appendChild(h('dd', {}, [v])); } }
    row('Page', h('a', { href: i.url, target: '_blank', rel: 'noopener', text: (SITES[i.site] || i.site) + ' ' + i.path }));
    row('Page title', i.page_title);
    if (c.pinned) row('Pointed at', h('span', {}, [h('code', { text: c.pinned.selector }), c.pinned.text ? h('div', { style: 'color:var(--muted)', text: '“' + c.pinned.text + '”' }) : null]));
    if (c.viewport) row('Screen', c.viewport.w + ' × ' + c.viewport.h + (c.viewport.dpr > 1 ? ' @' + c.viewport.dpr + 'x' : '') + (c.scroll ? ' · scrolled ' + c.scroll.y + 'px' : ''));
    if (c.userAgent) row('Browser', browser(c.userAgent));
    body.appendChild(ctx);

    // Discussion
    body.appendChild(h('div', { class: 'sec', text: 'Discussion' }));
    if (!d.comments.length) body.appendChild(h('p', { style: 'color:var(--muted);margin:0 0 12px', text: 'No comments yet. Start the conversation — replies are visible to ' + name(i.author_email) + ' unless marked as an internal note.' }));
    d.comments.forEach(function (cm) {
      body.appendChild(h('div', { class: 'cm' + (cm.internal ? ' internal' : '') }, [avatar(cm.author_email), h('div', { class: 'bubble' }, [
        h('div', { class: 'who' }, [name(cm.author_email), cm.internal ? h('span', { text: 'Internal note' }) : null, h('span', { text: ago(cm.created_at) })]),
        h('p', { text: cm.body }),
      ])]));
    });
    var ta = h('textarea', { class: 'input', placeholder: 'Write a reply… (⌘ Enter to send)', 'aria-label': 'Comment' });
    ta.value = draft;
    var internal = h('input', { type: 'checkbox' }); internal.checked = S.internal;
    internal.addEventListener('change', function () { S.internal = internal.checked; });
    var send = h('button', { class: 'btn primary', type: 'button', text: 'Send', onclick: function () {
      if (!ta.value.trim()) return;
      send.disabled = true;
      api('feedback/' + i.id + '/comments', { method: 'POST', body: { body: ta.value, internal: internal.checked } }).then(function (nd) { ta.value = ''; S.detail = nd; renderDrawer(true); sync(); })
        .catch(function (e) { send.disabled = false; toast(e.message); });
    } });
    ta.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send.click(); });
    body.appendChild(h('div', { class: 'composer' }, [ta, h('div', { class: 'row' }, [
      h('label', { class: 'toggle' }, [internal, 'Internal note (team only)']), send])]));

    // Activity
    body.appendChild(h('div', { class: 'sec', text: 'History' }));
    var tl = h('div', { class: 'timeline' });
    d.activity.slice().reverse().forEach(function (a) { tl.appendChild(event(a)); });
    body.appendChild(tl);
    body.appendChild(h('div', { style: 'margin-top:28px' }, [h('button', { class: 'btn danger', type: 'button', text: 'Delete feedback', onclick: function () {
      if (!confirm('Delete #' + i.id + ' and its screenshots and comments? This can’t be undone.')) return;
      api('feedback/' + i.id, { method: 'DELETE' }).then(function () { toast('Deleted #' + i.id); closeItem(); sync(); });
    } })]));
    if (soft) body.scrollTop = scrollTop;
  }
  function browser(ua) {
    var b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    var os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    return b + (os ? ' on ' + os : '');
  }

  window.addEventListener('hashchange', function () {
    var v = location.hash.replace('#', '');
    if (/^item-/.test(v)) return;
    if (v && v !== S.view && ['overview', 'inbox', 'board', 'themes', 'people'].indexOf(v) >= 0) { S.view = v; render(); }
  });
  boot();
})();
