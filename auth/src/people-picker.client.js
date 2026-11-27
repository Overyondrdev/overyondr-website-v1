/*! Yondr people picker \u2014 https://auth.overyondrdev.com/people-picker.js (source: overyondr-website-v1 auth/)
 *
 * Autofills names and emails from the Yondr directory on every overyondrdev.com site. No dependencies.
 *
 *   <script src="https://auth.overyondrdev.com/people-picker.js" defer></script>
 *   <input type="email" data-people>                       one person; the field gets their email
 *   <input data-people data-people-fill="name">            the field gets their name instead
 *   <input data-people data-people-external>               also accepts addresses outside the directory (owners' guests)
 *
 * Works on fields added later too (single-page apps). When someone picks a person the field's value is set, `input`
 * and `change` fire, and a `people:select` event carries { name, email, title } (bubbles) for apps that also fill a
 * name field or add the person straight away. Keyboard: \u2193/\u2191 to move, Enter to pick, Esc to close. Shows at most
 * 6 matches; an empty field shows your recent picks. ARIA 1.2 combobox pattern.
 */
(function () {
  'use strict';
  if (window.YondrPeople) return;
  var SRC = 'https://auth.overyondrdev.com/api/people';
  var MAX = 6;
  var RECENT_KEY = 'yondr-people-recent';
  var CACHE_KEY = 'yondr-people-cache';
  var CACHE_MS = 30 * 60 * 1000;
  var people = null;
  var loading = null;
  var uid = 0;

  // ---- data
  function fold(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function prepare(list) {
    return list.map(function (p) {
      var name = fold(p.name);
      return { p: p, name: name, words: name.split(/[\s'-]+/), local: fold(p.email.split('@')[0]), title: fold(p.title) };
    });
  }
  function load() {
    if (people) return Promise.resolve(people);
    if (loading) return loading;
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.at < CACHE_MS && c.people) { people = prepare(c.people); return Promise.resolve(people); }
    } catch (e) {}
    loading = fetch(SRC, { credentials: 'include', headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { people: [] }; })
      .then(function (d) {
        var list = (d && d.people) || [];
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), people: list })); } catch (e) {}
        people = prepare(list);
        loading = null;
        return people;
      })
      .catch(function () { loading = null; return []; });
    return loading;
  }
  /** Rank: whole name starts with the query, a first/last name starts with it, the email starts with it, then title. */
  function search(q, list) {
    var terms = fold(q).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var out = [];
    list.forEach(function (x) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i];
        var s = 0;
        if (x.words.some(function (w) { return w.indexOf(t) === 0; })) s = 3;
        else if (x.local.indexOf(t) === 0) s = 2;
        else if (x.name.indexOf(t) >= 0 || x.local.indexOf(t) >= 0) s = 1;
        else if (terms.length === 1 && t.length >= 3 && x.title.indexOf(t) >= 0) s = 0.5;
        if (!s) return;
        score += s;
      }
      if (x.name.indexOf(fold(q).trim()) === 0) score += 2;
      out.push({ x: x, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score || a.x.name.localeCompare(b.x.name); });
    return out.slice(0, MAX).map(function (o) { return o.x.p; });
  }
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 5); } catch (e) { return []; } }
  function remember(p) {
    try {
      var r = recent().filter(function (x) { return x.email !== p.email; });
      r.unshift({ name: p.name, email: p.email, title: p.title });
      localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 5)));
    } catch (e) {}
  }

  // ---- styles (a constructed stylesheet: works under strict CSPs without 'unsafe-inline')
  var CSS = [
    '.ypp{position:fixed;z-index:2147483000;margin:0;padding:6px;list-style:none;background:#fff;color:#1e1e1e;border:1px solid #d3d6c8;border-radius:12px;box-shadow:0 18px 40px -18px rgba(28,48,11,.45);font:400 14px/1.35 "Inter Tight",Arial,sans-serif;max-height:min(340px,60vh);overflow:auto;box-sizing:border-box}',
    '.ypp[hidden]{display:none}',
    '.ypp li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;min-height:44px;box-sizing:border-box}',
    '.ypp li[aria-selected="true"]{background:#e7ecdf;outline:2px solid #1c300b;outline-offset:-2px}',
    '.ypp li:hover{background:#f1f4ea}',
    '.ypp .yi{flex:0 0 32px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#1c300b;color:#daff6b;font-weight:700;font-size:12px;letter-spacing:.02em}',
    '.ypp .yt{min-width:0;display:flex;flex-direction:column}',
    '.ypp .yn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ypp .ys{color:#4f6b35;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ypp mark{background:transparent;color:inherit;text-decoration:underline;text-decoration-color:#9dae7e;text-underline-offset:3px}',
    '.ypp .yh{display:block;padding:6px 10px 4px;min-height:0;cursor:default;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f6b35;background:none!important;outline:none!important}',
    '.ypp .ye{display:block;min-height:0;cursor:default;color:#4f6b35;background:none!important;outline:none!important}',
    '@media (prefers-reduced-motion:no-preference){.ypp{animation:ypp-in .12s ease-out}@keyframes ypp-in{from{opacity:0;transform:translateY(-4px)}}}'
  ].join('');
  function addStyles() {
    try {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
    } catch (e) {
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    }
  }

  // ---- one listbox, shared by every field
  var box, active = null, items = [], index = -1;
  function initials(p) {
    var parts = String(p.name || p.email).split(/\s+/).filter(Boolean);
    return ((parts[0] || '')[0] || '').toUpperCase() + ((parts.length > 1 ? parts[parts.length - 1][0] : '') || '').toUpperCase();
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function highlight(target, text, q) {
    var t = fold(q).trim().split(/\s+/)[0];
    var i = t ? fold(text).indexOf(t) : -1;
    if (i < 0) { target.textContent = text; return; }
    target.appendChild(document.createTextNode(text.slice(0, i)));
    target.appendChild(el('mark', null, text.slice(i, i + t.length)));
    target.appendChild(document.createTextNode(text.slice(i + t.length)));
  }
  function ensureBox() {
    if (box) return box;
    box = el('ul', 'ypp');
    box.id = 'ypp-list';
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    box.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the field
    box.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-i]');
      if (li) choose(+li.getAttribute('data-i'));
    });
    document.body.appendChild(box);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return box;
  }
  function place() {
    if (!box || box.hidden || !active) return;
    var r = active.getBoundingClientRect();
    var below = window.innerHeight - r.bottom;
    var w = Math.max(r.width, Math.min(320, window.innerWidth - 16));
    box.style.width = w + 'px';
    box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    if (below < 220 && r.top > below) { box.style.top = ''; box.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
    else { box.style.bottom = ''; box.style.top = (r.bottom + 4) + 'px'; }
  }
  function close() {
    if (!box) return;
    box.hidden = true;
    if (active) { active.setAttribute('aria-expanded', 'false'); active.removeAttribute('aria-activedescendant'); }
    items = []; index = -1;
  }
  function render(list, q, heading) {
    ensureBox();
    box.textContent = '';
    items = list;
    index = -1;
    if (!list.length) {
      if (!q) { close(); return; }
      var external = active.hasAttribute('data-people-external');
      box.appendChild(el('li', 'ye', external ? 'Not in the Yondr directory. You can still type the full email address.' : 'No one in the Yondr directory matches \u201c' + q + '\u201d.'));
    } else {
      if (heading) { var h = el('li', 'yh', heading); h.setAttribute('role', 'presentation'); box.appendChild(h); }
      list.forEach(function (p, i) {
        var li = el('li');
        li.id = 'ypp-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.setAttribute('data-i', i);
        var av = el('span', 'yi', initials(p)); av.setAttribute('aria-hidden', 'true');
        var txt = el('span', 'yt');
        var n = el('span', 'yn'); highlight(n, p.name, q);
        var s = el('span', 'ys'); highlight(s, p.title ? p.title + ' \u00b7 ' + p.email : p.email, q);
        txt.appendChild(n); txt.appendChild(s);
        li.appendChild(av); li.appendChild(txt);
        box.appendChild(li);
      });
    }
    box.hidden = false;
    active.setAttribute('aria-expanded', 'true');
    place();
  }
  function move(d) {
    if (!items.length) return;
    index = (index + d + items.length) % items.length;
    box.querySelectorAll('li[role="option"]').forEach(function (li, i) { li.setAttribute('aria-selected', i === index ? 'true' : 'false'); if (i === index) li.scrollIntoView({ block: 'nearest' }); });
    active.setAttribute('aria-activedescendant', 'ypp-' + index);
  }
  function setValue(input, value) {
    var proto = Object.getPrototypeOf(input);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(input, value); else input.value = value; // works with framework-controlled inputs
  }
  function choose(i) {
    var p = items[i];
    if (!p || !active) return;
    var input = active;
    setValue(input, input.getAttribute('data-people-fill') === 'name' ? p.name : p.email);
    remember(p);
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new CustomEvent('people:select', { bubbles: true, detail: { name: p.name, email: p.email, title: p.title } }));
  }
  function update(input) {
    active = input;
    var q = input.value;
    if (!q.trim()) {
      var r = recent();
      if (r.length) render(r, '', 'Recent'); else close();
      return;
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim()) && !people) { close(); return; }
    load().then(function (list) { if (active === input && input.value === q) render(search(q, list), q.trim()); });
  }

  // ---- enhance fields
  function enhance(input) {
    if (input.__ypp) return;
    input.__ypp = true;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'ypp-list');
    input.setAttribute('autocomplete', 'off');
    if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', 'Type a name or email');
    input.removeAttribute('list'); // replaces any <datalist> the app had
    input.addEventListener('focus', function () { load(); update(input); });
    input.addEventListener('input', function (e) { if (e.isTrusted) update(input); });
    input.addEventListener('blur', function () { if (active === input) close(); });
    input.addEventListener('keydown', function (e) {
      var open = box && !box.hidden && active === input;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) update(input); else move(1); }
      else if (e.key === 'ArrowUp') { if (open) { e.preventDefault(); move(-1); } }
      else if (e.key === 'Enter') { if (open && index >= 0) { e.preventDefault(); e.stopPropagation(); choose(index); } }
      else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
      else if (e.key === 'Tab') { if (open && index >= 0) choose(index); }
    });
    uid++;
  }
  function scan(root) {
    if (root.matches && root.matches('input[data-people]')) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll('input[data-people]').forEach(enhance);
  }
  function start() {
    addStyles();
    scan(document);
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  window.YondrPeople = { search: function (q) { return load().then(function (l) { return search(q, l); }); }, enhance: enhance, version: 1 };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
