/* Help center app: home, sections, articles, instant search and a ⌘K palette. No dependencies.
 * Routes (hash): '' home · '#<article>' · '#s-<section>' · '#q=<search>'. Content: help-content.js. */
(function () {
  'use strict';
  var C = window.YONDR_HELP, view = document.querySelector('[data-view]');
  var role = 'viewer', admins = [];
  var RANK = { viewer: 0, editor: 1, admin: 2 };
  var ROLE_LABEL = { editor: 'For editors and admins', admin: 'For admins' };
  var ICONS = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 20 12Z"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  };
  function icon(n, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 22) + '" height="' + (s || 22) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function text(html) { var d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); }
  function toast(m) { var t = document.querySelector('[data-toast]'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function person(e) { var n = e.split('@')[0].split(/[._-]/)[0]; return n.charAt(0).toUpperCase() + n.slice(1); }

  // Viewers and editors don't need the admin articles; everyone sees editing articles (marked "For editors").
  function shown(a) { return a.roles !== 'admin' || RANK[role] >= 2; }
  function articles() { return C.articles.filter(shown); }
  function sections() { return C.sections.filter(function (s) { return s.roles !== 'admin' || RANK[role] >= 2; }); }
  function byId(id) { return C.articles.find(function (a) { return a.id === id; }); }
  function section(id) { return C.sections.find(function (s) { return s.id === id; }); }
  C.articles.forEach(function (a) { a.text = text(a.body); });

  // ------------------------------------------------------------------ search: weighted token match with prefixes
  var STOP = ' how do does did i im me my we our you your can could should would is are was be the a an to of on in at for with and or it this that what where when why which who there get got '.split(' ').reduce(function (o, w) { if (w) o[w] = 1; return o; }, {});
  function tokens(q) {
    var all = q.toLowerCase().replace(/[^a-z0-9× ]+/g, ' ').split(/\s+/).filter(function (t) { return t.length > 1 || /\d/.test(t); });
    var kept = all.filter(function (t) { return !STOP[t]; });
    return kept.length ? kept : all;   // "who can see" still searches if it's all common words
  }
  function search(q) {
    var ts = tokens(q);
    if (!ts.length) return [];
    var phrase = q.trim().toLowerCase();
    return articles().map(function (a) {
      var title = a.title.toLowerCase(), keys = a.keys.toLowerCase(), body = a.text.toLowerCase(), score = 0, hits = 0;
      ts.forEach(function (t) {
        var re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        var s = 0;
        var stem = t.length > 4 ? t.replace(/(ing|ed|es|s|e)$/, '') : t;   // "approve" finds "Approving"
        if (re.test(title)) s += 8; else if (title.indexOf(t) >= 0) s += 4; else if (stem !== t && new RegExp('\\b' + stem).test(title)) s += 7;
        if (re.test(keys)) s += 5;
        if (re.test(body)) s += 2; else if (body.indexOf(t) >= 0) s += 1;
        if (s) hits++;
        score += s;
      });
      if (title.indexOf(phrase) >= 0) score += 12;
      if (hits < ts.length) score *= hits / ts.length / 2;   // prefer articles that match every word
      return { a: a, score: score };
    }).filter(function (r) { return r.score > 1; }).sort(function (x, y) { return y.score - x.score; }).slice(0, 12).map(function (r) { return r.a; });
  }
  function mark(str, q) {
    var out = esc(str);
    tokens(q).sort(function (a, b) { return b.length - a.length; }).forEach(function (t) {
      out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return out;
  }
  function snippet(a, q) {
    var b = a.text, ts = tokens(q), i = -1;
    ts.some(function (t) { i = b.toLowerCase().indexOf(t); return i >= 0; });
    if (i < 0) return mark(b.slice(0, 140) + (b.length > 140 ? '…' : ''), q);
    var s = Math.max(0, i - 50);
    return (s ? '…' : '') + mark(b.slice(s, s + 150), q) + (s + 150 < b.length ? '…' : '');
  }

  // ------------------------------------------------------------------ views
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function render(quiet) {
    var h = decodeURIComponent(location.hash.slice(1));
    var paint = function () {
      if (!h) home();
      else if (h.indexOf('q=') === 0) results(h.slice(2));
      else if (h.indexOf('s-') === 0 && section(h.slice(2))) sectionView(section(h.slice(2)));
      else if (byId(h)) article(byId(h));
      else home();
      window.scrollTo({ top: 0 });
      var t = view.querySelector('h1'); if (t) { t.setAttribute('tabindex', '-1'); if (h) t.focus({ preventScroll: true }); }
    };
    // View Transitions where supported: pages morph instead of jumping.
    if (quiet !== true && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var vt = document.startViewTransition(paint);
      [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (pr) { if (pr) pr.catch(function () {}); });  // a newer page replaced it: fine
    } else paint();
  }
  function roleBadge(a) { return a.roles !== 'all' ? '<span class="badge ' + a.roles + '">' + ROLE_LABEL[a.roles] + '</span>' : ''; }
  function card(a, q) {
    return '<a class="hc-result" href="#' + a.id + '"><span class="hc-r-sec">' + icon(section(a.section).icon, 16) + esc(section(a.section).title) + '</span>' +
      '<b>' + (q ? mark(a.title, q) : esc(a.title)) + '</b><span class="hc-r-snip">' + (q ? snippet(a, q) : esc(a.text.slice(0, 120)) + '…') + '</span>' + roleBadge(a) + '</a>';
  }
  function searchBox(value, big) {
    return '<form class="hc-search' + (big ? ' big' : '') + '" role="search" data-search><label class="visually-hidden" for="hc-q">Search help</label>' + icon('search', 22) +
      '<input id="hc-q" type="search" placeholder="' + (matchMedia('(max-width: 640px)').matches ? 'Search the help center' : 'Search: “download zip”, “edit headline”, “150 KB”…') + '" value="' + esc(value || '') + '" autocomplete="off" data-q />' +
      '<button type="submit" class="btn forest sm">Search</button><div class="hc-live" data-live role="listbox" aria-label="Suggestions"></div></form>';
  }
  function stuck() {
    var list = admins.length ? admins.map(function (e) { return '<a href="mailto:' + esc(e) + '">' + esc(person(e)) + '</a>'; }).join(', ') : 'an admin';
    return '<aside class="hc-stuck"><div><h2>Still stuck?</h2><p>Ask ' + list + '. Admins can also give you more access.</p></div>' +
      '<form data-suggest><label class="visually-hidden" for="hc-suggest">What were you looking for?</label><input id="hc-suggest" class="input" placeholder="What were you looking for? We’ll add it." maxlength="500" /><button class="btn line sm" type="submit">Send</button></form></aside>';
  }
  function home() {
    var pop = C.popular.map(byId).filter(Boolean).filter(shown);
    var you = { viewer: 'browse, download and comment', editor: 'browse, download, edit copy, upload and run campaigns', admin: 'do everything, including giving people roles' }[role];
    view.innerHTML =
      '<section class="hc-hero"><p class="eyebrow">Help center</p><h1>How can we <em>help?</em></h1>' + searchBox('', true) +
      '<div class="hc-chips" aria-label="Popular questions">' + pop.map(function (a) { return '<a class="chip" href="#' + a.id + '">' + esc(a.title) + '</a>'; }).join('') + '</div></section>' +
      '<section class="hc-you" aria-label="Your access"><div><span class="badge ' + role + '">' + role.charAt(0).toUpperCase() + role.slice(1) + '</span><p>You can ' + you + '. <a href="#roles">What each role can do</a></p></div>' +
      '<a class="btn line sm" href="/?tour=1">Take the tour</a></section>' +
      '<section class="hc-grid" aria-label="Topics">' + sections().map(function (s) {
        var n = C.articles.filter(function (a) { return a.section === s.id && shown(a); }).length;
        return '<a class="hc-sec" href="#s-' + s.id + '" style="view-transition-name:sec-' + s.id + '"><span class="hc-ico">' + icon(s.icon) + '</span><b>' + esc(s.title) + '</b><span>' + esc(s.blurb) + '</span><small>' + n + (n === 1 ? ' article' : ' articles') + (s.roles === 'editor' ? ' · for editors' : s.roles === 'admin' ? ' · for admins' : '') + '</small></a>';
      }).join('') + '</section>' + stuck();
    wire();
  }
  function sectionView(s) {
    var list = C.articles.filter(function (a) { return a.section === s.id && shown(a); });
    view.innerHTML = crumbs([[s.title]]) +
      '<header class="hc-head" style="view-transition-name:sec-' + s.id + '"><span class="hc-ico">' + icon(s.icon, 26) + '</span><div><h1>' + esc(s.title) + '</h1><p>' + esc(s.blurb) + '</p></div></header>' +
      '<div class="hc-list">' + list.map(function (a) { return card(a); }).join('') + '</div>' + stuck();
    wire();
  }
  function results(q) {
    var r = search(q);
    view.innerHTML = crumbs([['Search']]) + searchBox(q) +
      '<h1 class="hc-rh">' + (r.length ? r.length + ' result' + (r.length > 1 ? 's' : '') + ' for “' + esc(q) + '”' : 'No results for “' + esc(q) + '”') + '</h1>' +
      (r.length ? '<div class="hc-list">' + r.map(function (a) { return card(a, q); }).join('') + '</div>'
        : '<p class="hc-none">Try fewer or different words, or browse a topic below.</p><div class="hc-chips">' + sections().map(function (s) { return '<a class="chip" href="#s-' + s.id + '">' + esc(s.title) + '</a>'; }).join('') + '</div>') + stuck();
    wire();
  }
  function crumbs(parts) {
    return '<nav class="hc-crumbs" aria-label="Breadcrumb"><a href="#">Help center</a>' + parts.map(function (p) { return '<span aria-hidden="true">/</span>' + (p[1] ? '<a href="' + p[1] + '">' + esc(p[0]) + '</a>' : '<span aria-current="page">' + esc(p[0]) + '</span>'); }).join('') + '</nav>';
  }
  function article(a) {
    var s = section(a.section);
    var sibs = C.articles.filter(function (x) { return x.section === a.section && shown(x); });
    var i = sibs.indexOf(a), prev = sibs[i - 1], next = sibs[i + 1];
    var related = sibs.filter(function (x) { return x !== a; }).slice(0, 4);
    view.innerHTML = crumbs([[s.title, '#s-' + s.id], [a.title]]) +
      '<div class="hc-art">' +
      '<nav class="hc-side" aria-label="' + esc(s.title) + '"><p class="hc-side-h">' + icon(s.icon, 16) + esc(s.title) + '</p>' + sibs.map(function (x) {
        return '<a href="#' + x.id + '"' + (x === a ? ' aria-current="page"' : '') + '>' + esc(x.title) + '</a>'; }).join('') +
      '<p class="hc-side-h" style="margin-top:18px">Other topics</p>' + sections().filter(function (x) { return x !== s; }).map(function (x) { return '<a href="#s-' + x.id + '">' + esc(x.title) + '</a>'; }).join('') + '</nav>' +
      '<article class="hc-body"><header>' + roleBadge(a) + '<h1 style="view-transition-name:art-title">' + esc(a.title) + '</h1></header>' +
      '<div class="hc-prose">' + a.body + '</div>' +
      '<div class="hc-helpful" data-helpful><span>Was this helpful?</span><button type="button" class="btn line sm" data-yes>👍 Yes</button><button type="button" class="btn line sm" data-no>👎 No</button></div>' +
      '<div class="hc-pn">' + (prev ? '<a href="#' + prev.id + '"><small>Previous</small>' + esc(prev.title) + '</a>' : '<span></span>') + (next ? '<a class="next" href="#' + next.id + '"><small>Next</small>' + esc(next.title) + '</a>' : '') + '</div>' +
      '</article>' +
      '<aside class="hc-rel">' + (related.length ? '<p class="hc-side-h">Related</p>' + related.map(function (x) { return '<a href="#' + x.id + '">' + esc(x.title) + '</a>'; }).join('') : '') +
      '<a class="btn line sm" href="/" style="margin-top:16px">Open the ad library</a></aside>' +
      '</div>' + stuck();
    wire(a);
  }

  // ------------------------------------------------------------------ interactions
  function feedback(body) {
    return fetch('/api/help/feedback', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error(); });
  }
  function wire(a) {
    var form = view.querySelector('[data-search]');
    if (form) {
      var q = form.querySelector('[data-q]'), live = form.querySelector('[data-live]'), sel = -1;
      var paintLive = function () {
        var r = search(q.value).slice(0, 6); sel = -1;
        live.innerHTML = r.map(function (x, i) { return '<a role="option" id="lv-' + i + '" href="#' + x.id + '"><b>' + mark(x.title, q.value) + '</b><span>' + esc(section(x.section).title) + '</span></a>'; }).join('');
        live.classList.toggle('open', !!r.length && document.activeElement === q);
      };
      q.addEventListener('input', paintLive);
      q.addEventListener('focus', paintLive);
      q.addEventListener('blur', function () { setTimeout(function () { live.classList.remove('open'); }, 150); });
      q.addEventListener('keydown', function (e) {
        var items = live.querySelectorAll('a');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); if (!items.length) return;
          sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items.forEach(function (x, i) { x.setAttribute('aria-selected', String(i === sel)); });
          q.setAttribute('aria-activedescendant', 'lv-' + sel);
        } else if (e.key === 'Enter' && sel >= 0 && items[sel]) { e.preventDefault(); go(items[sel].getAttribute('href')); }
      });
      form.addEventListener('submit', function (e) { e.preventDefault(); if (q.value.trim()) go('#q=' + encodeURIComponent(q.value.trim())); });
    }
    var hp = view.querySelector('[data-helpful]');
    if (hp && a) {
      var answer = function (yes) {
        feedback({ article: a.id, helpful: yes }).catch(function () {});
        hp.innerHTML = yes ? '<span>Thanks! Glad it helped.</span>'
          : '<form class="hc-more"><label for="hc-more">Sorry about that. What were you trying to do?</label><div class="addrow"><input id="hc-more" class="input" maxlength="1000" /><button class="btn forest sm" type="submit">Send</button></div></form>';
        var f = hp.querySelector('form');
        if (f) {
          f.querySelector('input').focus();
          f.addEventListener('submit', function (e) { e.preventDefault(); var v = f.querySelector('input').value.trim(); if (!v) return;
            feedback({ article: a.id, comment: v }).then(function () { hp.innerHTML = '<span>Thanks. Admins will see this and improve the article.</span>'; }).catch(function () { toast('Couldn’t send. Please try again.'); }); });
        }
      };
      hp.querySelector('[data-yes]').onclick = function () { answer(true); };
      hp.querySelector('[data-no]').onclick = function () { answer(false); };
    }
    var sug = view.querySelector('[data-suggest]');
    if (sug) sug.addEventListener('submit', function (e) {
      e.preventDefault(); var inp = sug.querySelector('input'), v = inp.value.trim(); if (!v) return;
      feedback({ article: a ? a.id : 'general', comment: v }).then(function () { inp.value = ''; toast('Thanks. Admins will see it.'); }).catch(function () { toast('Couldn’t send. Please try again.'); });
    });
  }

  // ------------------------------------------------------------------ ⌘K palette
  var pal = document.querySelector('[data-palette]'), pin = pal.querySelector('[data-pal-input]'), plist = pal.querySelector('[data-pal-list]'), psel = 0, pitems = [];
  function paintPalette() {
    var q = pin.value;
    pitems = q.trim() ? search(q) : C.popular.map(byId).filter(Boolean).filter(shown);
    psel = 0;
    plist.innerHTML = (q.trim() ? '' : '<li class="pal-h" role="presentation">Popular</li>') + (pitems.length ? pitems.map(function (a, i) {
      return '<li role="option" id="po-' + i + '" aria-selected="' + (i === 0) + '" data-i="' + i + '">' + icon(section(a.section).icon, 18) + '<span><b>' + (q ? mark(a.title, q) : esc(a.title)) + '</b><small>' + esc(section(a.section).title) + '</small></span></li>';
    }).join('') : '<li class="pal-empty" role="presentation">No matches. Try another word.</li>');
    pin.setAttribute('aria-activedescendant', pitems.length ? 'po-0' : '');
  }
  function openPalette() { if (pal.open) return; pin.value = ''; paintPalette(); pal.showModal(); pin.focus(); }
  function pick(i) { var a = pitems[i]; if (!a) return; pal.close(); go('#' + a.id); }
  pin.addEventListener('input', paintPalette);
  pin.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!pitems.length) return;
      psel = (psel + (e.key === 'ArrowDown' ? 1 : -1) + pitems.length) % pitems.length;
      plist.querySelectorAll('[role=option]').forEach(function (x, i) { x.setAttribute('aria-selected', String(i === psel)); if (i === psel) x.scrollIntoView({ block: 'nearest' }); });
      pin.setAttribute('aria-activedescendant', 'po-' + psel);
    } else if (e.key === 'Enter') { e.preventDefault(); pick(psel); }
  });
  plist.addEventListener('click', function (e) { var li = e.target.closest('[data-i]'); if (li) pick(+li.dataset.i); });
  pal.addEventListener('click', function (e) { if (e.target === pal) pal.close(); });
  document.querySelector('[data-palette-open]').addEventListener('click', openPalette);
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !/input|textarea/i.test(e.target.tagName) && !pal.open) { e.preventDefault(); openPalette(); }
  });
  if (/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelector('[data-kbd]').textContent = '⌘K';

  // ------------------------------------------------------------------ boot
  window.addEventListener('hashchange', function () { render(); });
  render();
  Promise.all([
    fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch('/api/help/contacts', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
  ]).then(function (res) {
    if (res[0] && res[0].role) role = res[0].role;
    if (res[1] && res[1].admins) admins = res[1].admins;
    render(true);   // fill in role and contacts without animating
  });
})();
