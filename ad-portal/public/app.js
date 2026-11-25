/* Yondr ad library (ads.overyondrdev.com). No dependencies.
 * Data: /api (src/index.ts, D1). Files: /files/<R2 key>. Sign-in: Cloudflare Access. */
(function () {
  'use strict';
  var CHANNELS = { 'google-display': 'Google Display', dv360: 'DV360', linkedin: 'LinkedIn', meta: 'Meta', programmatic: 'Programmatic', 'direct-buy': 'Direct buy', email: 'Email', website: 'Website', other: 'Other' };
  var CSTATUS = { planned: 'Planned', live: 'Live', paused: 'Paused', ended: 'Ended' };
  var ASTATUS = { in_review: 'In review', approved: 'Approved', needs_changes: 'Needs changes', archived: 'Archived' };
  var VARIANTS = { pouch: 'Pouch still', 'in-use': 'In-use still', motion: 'Motion', other: 'Other' };
  var STANDARD = { '300x250': 'Inline Rectangle', '336x280': 'Large Rectangle', '728x90': 'Leaderboard', '320x50': 'Mobile Leaderboard',
    '300x600': 'Half Page', '160x600': 'Wide Skyscraper', '970x250': 'Billboard', '970x90': 'Large Leaderboard', '320x100': 'Large Mobile Banner',
    '250x250': 'Square', '200x200': 'Small Square', '468x60': 'Banner', '120x600': 'Skyscraper', '300x1050': 'Portrait', '1200x628': 'Social landscape',
    '1080x1080': 'Social square', '1080x1920': 'Story' };
  var FB_TYPES = [['design', 'Design'], ['content', 'Copy'], ['bug', 'Problem'], ['idea', 'Idea'], ['question', 'Question'], ['praise', 'Love it']];
  var LIMIT = 150000;

  var sets = [];
  var D = null;            // current set: { set, ads, files, campaigns, me }
  var M = null;            // view model built from D
  var me = null;
  var role = 'viewer';      // viewer | editor | admin (src/roles.ts); the API enforces it, the UI just hides what you can't do
  var ROLE_NAMES = { viewer: 'Viewer', editor: 'Editor', admin: 'Admin' };
  function isEditor() { return role === 'editor' || role === 'admin'; }
  function isAdmin() { return role === 'admin'; }
  var picked = new Set();
  // Filters are remembered per browser. Viewers see approved ads by default, editors everything but archived.
  var f = load('filters2', null);
  function defaults() { return { show: 'all', sizes: [], headline: 'all', status: isEditor() ? 'active' : 'approved', group: 'size', q: '', view: 'grid', matrix: 'in-use' }; }
  var tab = 'ads';
  var openCampaign = null;
  var detailId = null;

  // ---------------------------------------------------------------- helpers
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem('yads:' + k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem('yads:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function $(s, r) { return (r || document).querySelector(s); }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    [].concat(kids || []).forEach(function (c) { if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  var ICON = {
    pen: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.2"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.6"><path d="M12 5v14M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.2"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.2"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
    dl: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  };
  // An icon as a node, for buttons built with children: [svg('pen'), 'Edit text'].
  function svg(n) { var t = document.createElement('template'); t.innerHTML = ICON[n]; return t.content.firstChild; }
  function kb(n) { return Math.round(n / 1000) + ' KB'; }
  function person(email) { if (!email) return 'Someone'; var n = email.split('@')[0].split(/[._-]/)[0]; return n.charAt(0).toUpperCase() + n.slice(1); }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 604800) return Math.floor(s / 86400) + ' d ago'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function dates(a, b) { return [fmtDate(a), fmtDate(b)].filter(Boolean).join(' – '); }
  function toast(msg) { var t = $('[data-toast]'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2800); }
  function copy(text, what) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast((what || 'Text') + ' copied'); }, function () { window.prompt('Copy this:', text); });
  }
  function api(path, opts) {
    opts = opts || {};
    var isForm = opts.body instanceof FormData;
    return fetch('/api/' + path, {
      method: opts.method || 'GET', credentials: 'same-origin', keepalive: !!opts.keepalive,
      headers: opts.body && !isForm ? { 'content-type': 'application/json' } : {},
      body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ').'); return j; });
    });
  }
  // ?v= changes when a file is replaced (same key, new bytes), so browsers never show a stale copy.
  var scripts = {};
  function loadScript(src) {
    return scripts[src] || (scripts[src] = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { delete scripts[src]; no(new Error('Couldn’t load ' + src + '. Check your connection.')); };
      document.head.appendChild(s);
    }));
  }
  // The editor and renderer (~60 KB) load only for editors, when first needed (and in idle time after the page loads).
  function needEditor() { return Promise.all([loadScript('/render.js'), loadScript('/editor.js')]); }
  function canEditText(c) { return !!(c.meta && c.meta.generated && c.meta.headlineId && c.meta.headlineId !== 'other'); }
  function updating(c) { return !!(window.YondrEditor && window.YondrEditor.updating(c.id)); }
  // Motion ads show their poster (end card) until you hover or focus them: the grid stays light.
  function posterUrl(c) { return c.posterKey ? '/files/' + c.posterKey + '?v=' + encodeURIComponent(c.updated || c.bytes) : fileUrl(c); }
  function adImg(c, attrs) {
    var still = c.kind === 'motion' && c.posterKey;
    var img = h('img', Object.assign({ src: still ? posterUrl(c) : fileUrl(c), loading: 'lazy', decoding: 'async', alt: (c.kind === 'motion' ? 'Animated ad: ' : 'Ad: ') + c.headlineText }, attrs || {}));
    if (still) img.dataset.anim = fileUrl(c);
    return img;
  }
  function playOnHover(el) {
    var img = el.querySelector('img[data-anim]');
    if (!img) return;
    var still = img.src, on = function () { img.src = img.dataset.anim; }, off = function () { img.src = still; };
    el.addEventListener('mouseenter', on); el.addEventListener('focus', on);
    el.addEventListener('mouseleave', off); el.addEventListener('blur', off);
  }
  function fileUrl(c) { return '/files/' + c.key + '?v=' + encodeURIComponent(c.updated || c.bytes); }
  function byId(id) { for (var i = 0; i < M.ads.length; i++) if (M.ads[i].id === id) return M.ads[i]; return null; }
  function campaign(id) { for (var i = 0; i < D.campaigns.length; i++) if (D.campaigns[i].id === id) return D.campaigns[i]; return null; }
  function label(c) { return c.sizeName + ' ' + c.w + '×' + c.h + ' · ' + (VARIANTS[c.variant] || 'Other'); }
  function fileName(c) { return c.key.split('/').pop(); }
  function statusPill(s) { return h('span', { class: 'pill status-' + s, text: ASTATUS[s] || s }); }

  // Turn the API's set into what the views use.
  function model(d) {
    var copyData = d.set.copy || {};
    var heads = (copyData.headlines || []).map(function (x) { return { id: x.id, text: x.text, desc: x.desc }; });
    var ads = d.ads.map(function (a) {
      var size = a.width + 'x' + a.height;
      var m = a.meta || {};
      return {
        id: a.id, key: a.r2_key, title: a.title, status: a.status, variant: a.variant, kind: a.kind, format: a.format,
        w: a.width, h: a.height, size: size, sizeName: STANDARD[size] || 'Custom size', bytes: a.bytes,
        headline: m.headlineId || 'other', headlineText: a.headline || a.title, desc: m.desc || '', duration: m.duration,
        start: a.campaign_start, end: a.campaign_end, uploadedBy: a.uploaded_by, created: a.created_at, updated: a.updated_at, stats: a.stats, meta: m, posterKey: a.poster_key,
      };
    });
    var order = (copyData.sizes || []).map(function (s) { return s.id; });
    var sizes = [];
    order.concat(ads.map(function (a) { return a.size; })).forEach(function (s) { if (sizes.indexOf(s) < 0 && ads.some(function (a) { return a.size === s; })) sizes.push(s); });
    sizes = sizes.map(function (s) { var p = s.split('x'); return { id: s, w: +p[0], h: +p[1], name: STANDARD[s] || 'Custom size' }; });
    if (ads.some(function (a) { return a.headline === 'other'; })) heads.push({ id: 'other', text: 'Other ads' });
    var variants = Object.keys(VARIANTS).filter(function (v) { return ads.some(function (a) { return a.variant === v; }); });
    return { set: d.set, copy: copyData, ads: ads, sizes: sizes, headlines: heads, variants: variants, files: d.files };
  }

  // ---------------------------------------------------------------- zip (store only: JPEG/GIF are already compressed)
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, time, true); lh.setUint16(12, day, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, time, true); ch.setUint16(14, day, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  function saveBlob(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function logDownloads(list) {
    if (!list.length) return;
    api('downloads', { method: 'POST', body: { ids: list.map(function (c) { return c.id; }) }, keepalive: true }).then(function () {
      list.forEach(function (c) { c.stats.downloads = (c.stats.downloads || 0) + 1; });
    }).catch(function () {});
  }
  function downloadZip(list, name) {
    if (!list.length) return;
    if (list.length === 1) return downloadOne(list[0]);
    toast('Preparing ' + list.length + ' files…');
    Promise.all(list.map(function (c) {
      return fetch(fileUrl(c)).then(function (r) { if (!r.ok) throw new Error(); return r.arrayBuffer(); }).then(function (b) {
        return { name: (c.kind === 'motion' ? 'motion/' : 'still/') + c.size + '/' + fileName(c), data: new Uint8Array(b) };
      });
    })).then(function (files) { saveBlob(zip(files), name); toast('Downloaded ' + files.length + ' ads'); logDownloads(list); })
      .catch(function () { toast('Download failed. Please try again.'); });
  }
  function downloadOne(c) {
    var a = h('a', { href: fileUrl(c) + '&download', download: fileName(c) });
    document.body.appendChild(a); a.click(); a.remove();
    logDownloads([c]);
  }

  // ---------------------------------------------------------------- hero
  function renderHero() {
    var s = M.set, live = M.ads.filter(function (a) { return a.status !== 'archived'; });
    var stills = live.filter(function (a) { return a.kind === 'still'; }).length;
    var largest = live.reduce(function (n, a) { return Math.max(n, a.bytes); }, 0);
    var approved = live.filter(function (a) { return a.status === 'approved'; }).length;
    var hero = live.find(function (a) { return a.kind === 'motion' && a.size === '300x600'; }) || live.find(function (a) { return a.h > a.w; }) || live[0];
    var el = $('[data-hero]');
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'hero-copy' }, [
      h('p', { class: 'eyebrow', text: 'Ad library · ' + s.name }),
      h('h1', { id: 'lib-title', html: s.id === 'harvard-study-2026' ? 'Harvard study ads, <em>ready to run.</em>' : '' }, s.id === 'harvard-study-2026' ? null : [s.name + ' ', h('em', { text: 'ads.' })]),
      h('p', { class: 'lede', text: (s.summary ? s.summary + ' ' : '') + 'Preview the ads, download what you need, review them and log the campaigns they run in.' }),
      h('ul', { class: 'facts', 'aria-label': 'About this ad set' }, [
        h('li', {}, [h('b', { text: String(live.length) }), ' ads']),
        h('li', {}, [h('b', { text: String(M.sizes.length) }), ' sizes']),
        h('li', {}, [h('b', { text: String(stills) }), ' stills · ', h('b', { text: String(live.length - stills) }), ' motion']),
        live.length ? h('li', {}, [largest <= LIMIT ? 'All under ' : 'Largest ', h('b', { text: largest <= LIMIT ? '150 KB' : kb(largest) })]) : null,
        h('li', {}, [h('b', { text: String(approved) }), ' approved']),
      ]),
      h('div', { class: 'actions' }, [
        live.length ? h('button', { type: 'button', class: 'btn lime', html: ICON.dl + ' Download all (' + live.length + ')', onclick: function () { downloadZip(live, s.id + '-all-ads.zip'); } }) : null,
        isEditor() ? h('button', { type: 'button', class: 'btn ghost', text: 'Upload ads', onclick: uploadForm }) : null,
        isEditor() ? h('button', { type: 'button', class: 'btn ghost', text: 'Edit copy', onclick: function () { setTab('edit'); } }) : null,
      ]),
    ]));
    if (hero) el.appendChild(h('figure', { class: 'hero-ad' }, [h('img', { src: fileUrl(hero), width: hero.w, height: hero.h, alt: (hero.kind === 'motion' ? 'Motion ad: ' : 'Ad: ') + hero.headlineText }),
      h('figcaption', { text: hero.sizeName + ' · ' + (hero.kind === 'motion' ? 'motion' : 'still') })]));
    $('[data-ad-count]').textContent = String(live.length);
    $('[data-campaign-count]').textContent = String(D.campaigns.length);
  }

  // ---------------------------------------------------------------- filtering
  function visible() {
    return M.ads.filter(function (c) {
      if (f.status === 'active' ? c.status === 'archived' : f.status !== 'all' && c.status !== f.status) return false;
      if (f.show !== 'all' && c.variant !== f.show) return false;
      if (f.sizes.length && f.sizes.indexOf(c.size) < 0) return false;
      if (f.headline !== 'all' && c.headline !== f.headline) return false;
      if (!matches(c, f.q)) return false;
      return true;
    });
  }
  function setF(k, v) { f[k] = v; save('filters2', f); renderToolbar(); renderGrid(); }
  function words(s) { return String(s || '').toLowerCase(); }
  function matches(c, q) {
    if (!q) return true;
    var hay = words([c.headlineText, c.title, c.desc, c.size, c.w + '×' + c.h, c.sizeName, VARIANTS[c.variant], ASTATUS[c.status], c.format].join(' '));
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (t) { return hay.indexOf(t) >= 0; });
  }

  function renderToolbar() {
    var bar = $('[data-toolbar]');
    bar.innerHTML = '';
    var show = h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Show' }, [h('span', { class: 'lbl', 'aria-hidden': 'true', text: 'Show' })]);
    [['all', 'All']].concat(M.variants.map(function (v) { return [v, VARIANTS[v]]; })).forEach(function (s) {
      show.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.show === s[0]), text: s[1], onclick: function () { setF('show', s[0]); } }));
    });
    var sizes = h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Sizes' }, [h('span', { class: 'lbl', 'aria-hidden': 'true', text: 'Size' })]);
    M.sizes.forEach(function (s) {
      var on = f.sizes.indexOf(s.id) >= 0, k = 14 / Math.max(s.w, s.h);
      sizes.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), title: s.name, 'aria-label': s.name + ' ' + s.w + ' by ' + s.h,
        onclick: function () { var a = f.sizes.slice(), i = a.indexOf(s.id); if (i < 0) a.push(s.id); else a.splice(i, 1); setF('sizes', a); } },
        [h('span', { class: 'shape', 'aria-hidden': 'true', style: 'width:' + Math.max(3, Math.round(s.w * k)) + 'px;height:' + Math.max(3, Math.round(s.h * k)) + 'px' }), s.w + '×' + s.h]));
    });
    var hs = h('select', { class: 'input', 'aria-label': 'Headline', onchange: function (e) { setF('headline', e.target.value); } },
      [h('option', { value: 'all', text: 'All headlines' })].concat(M.headlines.map(function (x) { return h('option', { value: x.id, selected: f.headline === x.id, text: x.text }); })));
    var st = h('select', { class: 'input', 'aria-label': 'Status', onchange: function (e) { setF('status', e.target.value); } },
      [['active', 'All but archived'], ['all', 'Every status']].concat(Object.keys(ASTATUS).map(function (k) { return [k, ASTATUS[k]]; }))
        .map(function (o) { return h('option', { value: o[0], selected: f.status === o[0], text: o[1] }); }));
    var grp = h('select', { class: 'input', 'aria-label': 'Group by', onchange: function (e) { setF('group', e.target.value); } }, [
      h('option', { value: 'size', selected: f.group === 'size', text: 'Group by size' }),
      h('option', { value: 'headline', selected: f.group === 'headline', text: 'Group by headline' })]);
    var d0 = defaults();
    var any = f.show !== 'all' || f.sizes.length || f.headline !== 'all' || f.status !== d0.status || f.q;
    var search = h('input', { class: 'input tb-search', type: 'search', placeholder: 'Search ads…', value: f.q || '', 'aria-label': 'Search ads' });
    search.addEventListener('input', function () { clearTimeout(search._t); search._t = setTimeout(function () { f.q = search.value.trim(); save('filters2', f); renderGrid(); }, 150); });
    var views = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, [['grid', 'Grid'], ['matrix', 'Matrix']].map(function (v) {
      return h('button', { type: 'button', 'aria-pressed': String(f.view === v[0]), text: v[1], onclick: function () { setF('view', v[0]); } });
    }));
    var inReview = M.ads.filter(function (a) { return a.status === 'in_review'; }).length;
    bar.appendChild(h('div', { class: 'tb-top' }, [search, views,
      h('button', { type: 'button', class: 'btn line sm', html: ICON.dl + ' Download kit', onclick: kitForm }),
      isEditor() && inReview ? h('button', { type: 'button', class: 'btn forest sm', text: 'Review (' + inReview + ')', title: 'Step through ads waiting for review', onclick: reviewQueue }) : null]));
    if (f.view !== 'matrix') bar.appendChild(show);
    bar.appendChild(sizes);
    bar.appendChild(h('div', { class: 'fgroup' }, [hs, st, f.view !== 'matrix' ? grp : null, any ? h('button', { type: 'button', class: 'linkbtn', text: 'Clear filters', onclick: function () {
      var keep = { group: f.group, view: f.view, matrix: f.matrix }; f = Object.assign(defaults(), keep); save('filters2', f); renderToolbar(); renderGrid(); } }) : null]));
  }

  // ---------------------------------------------------------------- grid
  function card(c) {
    var x = c.stats, on = picked.has(c.id), badges = [statusPill(c.status)];
    if (x.up) badges.push(h('span', { class: 'pill up', title: 'Approved by ' + x.up, }, [svg('check'), String(x.up)]));
    if (x.down) badges.push(h('span', { class: 'pill down', title: x.down + ' asked for changes', }, [svg('pen'), String(x.down)]));
    if (x.comments) badges.push(h('span', { class: 'pill', title: x.comments + ' comments', }, [svg('chat'), String(x.comments)]));
    if (x.campaigns.length) badges.push(h('span', { class: 'pill live', text: 'In ' + x.campaigns.length + ' campaign' + (x.campaigns.length > 1 ? 's' : '') }));
    if (c.meta && c.meta.overrides) badges.push(h('span', { class: 'pill', title: 'This ad has its own text, different from the rest of the set', text: 'Own copy' }));
    if (updating(c)) badges.unshift(h('span', { class: 'pill updating', text: 'Updating…' }));
    var w = Math.min(c.w, 728), scale = w / c.w;
    var frame = h('button', { type: 'button', class: 'frame' + (c.kind === 'motion' ? ' is-motion' : ''), 'aria-label': 'Open ' + label(c), onclick: function () { openDetail(c.id); } },
      [adImg(c, { width: w, height: Math.round(c.h * scale) })]);
    playOnHover(frame);
    return h('article', { class: 'card' + (on ? ' picked' : ''), style: 'width:' + (w + 28) + 'px', 'data-id': c.id }, [
      h('button', { type: 'button', class: 'pick', role: 'checkbox', 'aria-checked': String(on), 'aria-label': 'Select ' + label(c), html: on ? ICON.check : '', onclick: function () { togglePick(c.id); } }),
      frame,
      h('div', { class: 'meta' }, [
        h('p', { class: 'title', text: c.headlineText }),
        h('div', { class: 'sub' }, [h('span', { class: 'pill' + (c.kind === 'motion' ? ' motion' : ''), text: VARIANTS[c.variant] || 'Other' }),
          h('span', { class: c.bytes > LIMIT ? 'danger' : null, text: c.format + ' · ' + kb(c.bytes) })]),
        h('div', { class: 'sub' }, badges),
        c.start || c.end ? h('div', { class: 'sub', text: 'Runs ' + dates(c.start, c.end) }) : null,
        h('div', { class: 'row' }, [
          h('button', { type: 'button', class: 'btn line sm', text: 'Details', onclick: function () { openDetail(c.id); } }),
          isEditor() ? h('button', { type: 'button', class: 'btn forest sm', text: 'Edit', 'aria-label': 'Edit ' + label(c), onclick: function () { openDetail(c.id, false, true); } }) : null,
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'iconbtn', title: 'Download ' + fileName(c), 'aria-label': 'Download ' + fileName(c), html: ICON.dl, onclick: function () { downloadOne(c); } }),
        ]),
      ]),
    ]);
  }
  function renderGrid() {
    var grid = $('[data-grid]');
    grid.innerHTML = '';
    if (!M.ads.length) {
      grid.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'No ads in this set yet' }), h('p', { text: 'Upload JPEG, GIF, PNG or WebP files to start.' }),
        h('button', { type: 'button', class: 'btn forest', style: 'margin-top:14px', text: 'Upload ads', onclick: uploadForm })]));
      return;
    }
    var list = visible();
    if (!list.length) {
      var waiting = f.status === 'approved' && M.ads.some(function (a) { return a.status === 'in_review'; }) && !M.ads.some(function (a) { return a.status === 'approved'; });
      grid.appendChild(h('div', { class: 'empty' }, waiting
        ? [h('h3', { text: 'No approved ads yet' }), h('p', { text: 'These ads are still being reviewed and may change. You can look at them, but check with an editor before using one.' }),
          h('button', { type: 'button', class: 'btn line', style: 'margin-top:14px', text: 'Show ads in review', onclick: function () { setF('status', 'active'); } })]
        : [h('h3', { text: 'No ads match these filters' }), h('p', { text: 'Try another size, headline or status, or clear the filters.' })]));
      return;
    }
    if (f.view === 'matrix') { renderMatrix(grid, list); return; }
    var groups = f.group === 'headline'
      ? M.headlines.map(function (x) { return { title: x.text, dim: '', items: list.filter(function (c) { return c.headline === x.id; }) }; })
      : M.sizes.map(function (s) { return { title: s.name, dim: s.w + ' × ' + s.h, items: list.filter(function (c) { return c.size === s.id; }) }; });
    groups.forEach(function (g) {
      if (!g.items.length) return;
      var all = g.items.every(function (c) { return picked.has(c.id); });
      grid.appendChild(h('section', { class: 'group', 'aria-label': g.title }, [
        h('div', { class: 'group-head' }, [h('h2', { text: g.title }), g.dim ? h('span', { class: 'dim', text: g.dim }) : null, h('span', { class: 'dim', text: g.items.length + ' ads' }),
          h('button', { type: 'button', class: 'linkbtn', text: all ? 'Clear selection' : 'Select all ' + g.items.length, onclick: function () {
            g.items.forEach(function (c) { if (all) picked.delete(c.id); else picked.add(c.id); }); renderGrid(); renderSelbar(); } })]),
        h('div', { class: 'cards' }, g.items.map(card)),
      ]));
    });
    grid.classList.toggle('selecting', picked.size > 0);
  }
  // Matrix: headlines down, sizes across, one version at a time. The whole set on one screen.
  function renderMatrix(grid, list) {
    var vs = M.variants.length ? M.variants : ['other'];
    if (vs.indexOf(f.matrix) < 0) f.matrix = vs[0];
    grid.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'Version', style: 'margin-bottom:14px' }, vs.map(function (v) {
      return h('button', { type: 'button', 'aria-pressed': String(f.matrix === v), text: VARIANTS[v], onclick: function () { setF('matrix', v); } });
    })));
    var inView = list.filter(function (c) { return c.variant === f.matrix; });
    var sizes = M.sizes.filter(function (s) { return inView.some(function (c) { return c.size === s.id; }); });
    var heads = M.headlines.filter(function (x) { return inView.some(function (c) { return c.headline === x.id; }); });
    var cell = function (x, s) {
      var c = list.find(function (a) { return a.headline === x.id && a.size === s.id && a.variant === f.matrix; });
      if (!c) return h('td', { class: 'mx-empty', text: '—' });
      var k = Math.min(1, 150 / c.w, 110 / c.h);
      var b = h('button', { type: 'button', class: 'mx-cell', 'aria-label': 'Open ' + label(c) + ': ' + c.headlineText, onclick: function () { openDetail(c.id); } },
        [adImg(c, { width: Math.round(c.w * k), height: Math.round(c.h * k) }), h('span', { class: 'dot status-' + c.status, title: ASTATUS[c.status] })]);
      playOnHover(b);
      return h('td', {}, [b]);
    };
    grid.appendChild(h('div', { class: 'mx-wrap' }, [h('table', { class: 'matrix' }, [
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Headline' })].concat(sizes.map(function (s) { return h('th', { scope: 'col' }, [s.w + '×' + s.h, h('small', { text: s.name })]); })))]),
      h('tbody', {}, heads.map(function (x) { return h('tr', {}, [h('th', { scope: 'row', text: x.text })].concat(sizes.map(function (s) { return cell(x, s); }))); })),
    ])]));
  }
  function togglePick(id) {
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    var el = document.querySelector('.card[data-id="' + id + '"]');
    if (el) { var on = picked.has(id); el.classList.toggle('picked', on); var b = $('.pick', el); b.setAttribute('aria-checked', String(on)); b.innerHTML = on ? ICON.check : ''; }
    $('[data-grid]').classList.toggle('selecting', picked.size > 0);
    renderSelbar();
  }

  function renderSelbar() {
    var bar = $('[data-selbar]');
    bar.innerHTML = '';
    bar.hidden = picked.size === 0 || tab !== 'ads';
    if (!picked.size) return;
    var list = M.ads.filter(function (c) { return picked.has(c.id); });
    var sel = h('select', { class: 'input', 'aria-label': 'Add selected ads to a campaign', style: 'min-height:36px;padding:6px 46px 6px 12px' },
      [h('option', { value: '', text: 'Add to campaign…' })].concat(D.campaigns.map(function (c) { return h('option', { value: c.id, text: c.name }); }), [h('option', { value: 'new', text: '+ New campaign' })]));
    sel.addEventListener('change', function () {
      if (sel.value === 'new') return campaignForm(null, Array.from(picked));
      if (sel.value) addToCampaign(parseInt(sel.value, 10), Array.from(picked)).then(function () { picked.clear(); renderGrid(); renderSelbar(); });
    });
    var st = h('select', { class: 'input', 'aria-label': 'Set status of selected ads', style: 'min-height:36px;padding:6px 46px 6px 12px' },
      [h('option', { value: '', text: 'Set status…' })].concat(Object.keys(ASTATUS).map(function (k) { return h('option', { value: k, text: ASTATUS[k] }); })));
    st.addEventListener('change', function () {
      if (!st.value) return;
      var v = st.value;
      bulkStatus(list, v);
    });
    [h('span', {}, [h('b', { text: String(picked.size) }), ' selected']),
      h('button', { type: 'button', class: 'btn lime sm', html: ICON.dl + ' Download .zip', onclick: function () { downloadZip(list, M.set.id + '-' + list.length + '-ads.zip'); } }),
      isEditor() ? h('button', { type: 'button', class: 'btn forest sm', onclick: function () { bulkStatus(list, 'approved'); } }, [svg('check'), 'Approve']) : null,
      isEditor() ? sel : null, isEditor() ? st : null,
      h('button', { type: 'button', class: 'linkbtn', text: 'Clear', onclick: function () { picked.clear(); renderGrid(); renderSelbar(); } }),
    ].forEach(function (k) { bar.appendChild(k); });
  }

  function bulkStatus(list, v) {
    return api('ads', { method: 'PATCH', body: { ids: list.map(function (c) { return c.id; }), status: v } })
      .then(function () { toast(list.length + ' ad' + (list.length > 1 ? 's' : '') + ' marked ' + ASTATUS[v].toLowerCase()); picked.clear(); return refresh(); })
      .catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- review queue (editors): step through ads in review
  function reviewQueue() {
    var queue = M.ads.filter(function (a) { return a.status === 'in_review'; }), i = 0, approved = 0, changes = 0;
    if (!queue.length) return toast('Nothing waiting for review.');
    var body = h('div', { class: 'rq' });
    var dlg = $('[data-form]');
    dlg.classList.add('wide');
    var act = function (status) {
      var c = queue[i], note = body.querySelector('.rq-note');
      var reqs = [api('ads/' + c.id, { method: 'PATCH', body: { status: status } }), api('ads/' + c.id + '/review', { method: 'POST', body: { value: status === 'approved' ? 1 : -1 } })];
      if (status === 'needs_changes' && note && note.value.trim()) reqs.push(api('ads/' + c.id + '/comments', { method: 'POST', body: { type: 'design', body: note.value.trim() } }));
      Promise.all(reqs).then(function () { c.status = status; if (status === 'approved') approved++; else changes++; i++; paint(); }).catch(function (e) { toast(e.message); });
    };
    function paint() {
      body.innerHTML = '';
      if (i >= queue.length) {
        body.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'All done' }), h('p', { text: approved + ' approved, ' + changes + ' sent back for changes.' }),
          h('button', { type: 'button', class: 'btn forest', style: 'margin-top:14px', text: 'Close', onclick: function () { dlg.close(); } })]));
        return;
      }
      var c = queue[i];
      body.appendChild(h('p', { class: 'rq-count', text: (i + 1) + ' of ' + queue.length + ' · ' + label(c) }));
      body.appendChild(h('div', { class: 'rq-stage' }, [h('img', { src: fileUrl(c), width: c.w, height: c.h, alt: 'Ad: ' + c.headlineText })]));
      body.appendChild(h('p', { class: 'rq-head', text: c.headlineText }));
      body.appendChild(h('input', { class: 'input rq-note', placeholder: 'What should change? (optional, sent as a comment with “Needs changes”)', 'aria-label': 'Note for needs changes' }));
      body.appendChild(h('div', { class: 'rq-actions' }, [
        h('button', { type: 'button', class: 'btn line', text: '← Back', disabled: i === 0, onclick: function () { i--; paint(); } }),
        h('button', { type: 'button', class: 'btn line', onclick: function () { i++; paint(); } }, ['Skip', svg('arrow')]),
        h('span', { style: 'flex:1' }),
        h('button', { type: 'button', class: 'btn line', html: ICON.pen + ' Needs changes <kbd>N</kbd>', onclick: function () { act('needs_changes'); } }),
        h('button', { type: 'button', class: 'btn forest', html: ICON.check + ' Approve <kbd>A</kbd>', onclick: function () { act('approved'); } }),
      ]));
    }
    var key = function (e) {
      if (!dlg.open || /input|textarea/i.test(e.target.tagName) || i >= queue.length) return;
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); act('approved'); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); act('needs_changes'); }
      else if (e.key === 'ArrowRight') { i++; paint(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; paint(); }
    };
    document.addEventListener('keydown', key);
    dlg.addEventListener('close', function done() { document.removeEventListener('keydown', key); dlg.classList.remove('wide'); dlg.removeEventListener('close', done); refresh(); });
    paint();
    sheet('Review ads', body).querySelector('.sheet-head h2').after(helpLink('review-queue', 'The review queue'));
  }

  // ---------------------------------------------------------------- download kits
  var KITS = [['every', 'Every size', null], ['mobile', 'Mobile', ['320x50', '300x250', '336x280']], ['desktop', 'Desktop', ['728x90', '300x600', '160x600', '300x250', '336x280']]];
  function kitForm() {
    var kit = 'every', head = 'all', vs = {}, approvedOnly = !isEditor() || M.ads.some(function (a) { return a.status === 'approved'; });
    M.variants.forEach(function (v) { vs[v] = true; });
    var out = h('div', { class: 'kit' });
    var pick = function () {
      var sizes = KITS.find(function (k) { return k[0] === kit; })[2];
      return M.ads.filter(function (a) {
        return a.status !== 'archived' && (!approvedOnly || a.status === 'approved') && vs[a.variant] && (head === 'all' || a.headline === head) && (!sizes || sizes.indexOf(a.size) >= 0);
      });
    };
    function paint() {
      var list = pick(), bytes = list.reduce(function (n, a) { return n + a.bytes; }, 0);
      out.innerHTML = '';
      out.appendChild(h('fieldset', { class: 'kit-set' }, [h('legend', { text: 'Sizes' }), h('div', { class: 'seg' }, KITS.map(function (k) {
        return h('button', { type: 'button', 'aria-pressed': String(kit === k[0]), text: k[1] + (k[2] ? ' (' + k[2].length + ')' : ''), onclick: function () { kit = k[0]; paint(); } });
      }))]));
      out.appendChild(h('label', { class: 'ef' }, ['Headline', h('select', { class: 'input', onchange: function (e) { head = e.target.value; paint(); } },
        [h('option', { value: 'all', text: 'All headlines' })].concat(M.headlines.map(function (x) { return h('option', { value: x.id, selected: head === x.id, text: x.text }); })))]));
      out.appendChild(h('fieldset', { class: 'kit-set' }, [h('legend', { text: 'Versions' })].concat(M.variants.map(function (v) {
        var cb = h('input', { type: 'checkbox', checked: vs[v] }); cb.addEventListener('change', function () { vs[v] = cb.checked; paint(); });
        return h('label', { class: 'kit-check' }, [cb, VARIANTS[v]]);
      }))));
      var ap = h('input', { type: 'checkbox', checked: approvedOnly }); ap.addEventListener('change', function () { approvedOnly = ap.checked; paint(); });
      out.appendChild(h('label', { class: 'kit-check' }, [ap, 'Approved ads only (recommended)']));
      out.appendChild(h('div', { class: 'foot' }, [h('span', { class: 'ed-sum', style: 'color:var(--yondr-moss)', text: list.length ? list.length + ' ads · ' + (bytes / 1e6).toFixed(1) + ' MB' : 'No ads match. ' + (approvedOnly ? 'None are approved yet; untick “Approved only” to include ads in review.' : '') }),
        h('button', { type: 'button', class: 'btn lime', disabled: !list.length, html: ICON.dl + ' Download zip', onclick: function () {
          var name = M.set.id + '-' + kit + (head !== 'all' ? '-' + head : '') + '.zip';
          downloadZip(list, name); $('[data-form]').close();
        } })]));
    }
    paint();
    var dlg = sheet('Download a kit', h('div', { style: 'padding:20px' }, [h('p', { class: 'hint', style: 'margin:0 0 14px;font-size:14px;color:var(--yondr-moss)', text: 'Pick what the campaign needs and get it as one zip, sorted into still/ and motion/ folders by size.' }), out]));
    dlg.querySelector('.sheet-head h2').after(helpLink('kits', 'Download kits'));
  }

  // ---------------------------------------------------------------- detail
  // edit: open straight into edit mode (editors). Deep link: #ad=<id>/edit
  function openDetail(id, keepHash, edit) {
    var c = byId(id);
    if (!c) return;
    var dlg = $('[data-detail]');
    if (dlg._busy) return;
    detailId = id;
    dlg._edit = !!edit && isEditor();
    if (!keepHash) history.replaceState(null, '', '#ad=' + id + (dlg._edit ? '/edit' : ''));
    renderDetail(c);
    if (!dlg.open) dlg.showModal();
    if (!dlg._edit) loadComments(c);
  }
  function editHere(c) { openDetail(c.id, false, true); }
  function renderEdit(c) {
    var dlg = $('[data-detail]');
    var body = h('div', { class: 'sheet-body' });
    var done = function () { dlg._edit = false; history.replaceState(null, '', '#ad=' + c.id); };
    dlg.innerHTML = '';
    dlg.appendChild(h('div', { class: 'sheet-head' }, [
      h('h2', { id: 'detail-title', text: 'Editing · ' + label(c) }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close', html: ICON.x, onclick: function () { if (!dlg._busy) dlg.close(); } }),
    ]));
    dlg.appendChild(body);
    var cb = {
      cancel: function () { done(); renderDetail(c); loadComments(c); },
      busy: function (b) { dlg._busy = b; dlg.classList.toggle('is-busy', b); },
      saved: function () { done(); refresh().then(function () { var n = byId(c.id); if (n && dlg.open) { renderDetail(n); loadComments(n); } }); },
    };
    body.appendChild(h('p', { class: 'loading', style: 'padding:24px', text: 'Loading the editor…' }));
    needEditor().then(function () {
      if (!dlg.open || !dlg._edit) return;
      if (canEditText(c)) window.YondrEditor.editAd(editorApi(), c, body, cb);
      else window.YondrEditor.replaceFile(editorApi(), c, body, cb);
    }).catch(function (e) { body.innerHTML = ''; body.appendChild(h('p', { class: 'notice', text: e.message })); });
  }
  function step(d) {
    var list = visible(), i = list.findIndex(function (c) { return c.id === detailId; });
    if (i < 0) { list = M.ads; i = list.findIndex(function (c) { return c.id === detailId; }); }
    openDetail(list[(i + d + list.length) % list.length].id);
  }
  function renderDetail(c) {
    var dlg = $('[data-detail]'), x = c.stats, zoom = dlg._zoom || 1;
    if (dlg._edit) return renderEdit(c);
    var img = h('img', { src: fileUrl(c), width: c.w * zoom, height: c.h * zoom, alt: (c.kind === 'motion' ? 'Animated ad: ' : 'Ad: ') + c.headlineText });
    var tools = [h('button', { type: 'button', class: 'btn line sm', 'aria-pressed': String(zoom === 2), text: zoom === 2 ? 'Actual size' : 'Zoom 2×', onclick: function () { dlg._zoom = zoom === 2 ? 1 : 2; renderDetail(c); } })];
    if (c.kind === 'motion') tools.unshift(h('button', { type: 'button', class: 'btn line sm', text: '↻ Replay', onclick: function () { img.src = fileUrl(c) + '&r=' + Date.now(); } }));
    var specs = [['File', fileName(c)], ['Size', c.sizeName + ', ' + c.w + ' × ' + c.h + ' px'], ['Format', c.format + (c.kind === 'motion' ? ' (animated)' : '')],
      ['File size', kb(c.bytes) + (c.bytes > LIMIT ? ' — over the 150 KB limit most ad networks set' : ' (limit 150 KB)')]];
    if (c.duration) specs.push(['Animation', c.duration + ' s, plays twice (' + Math.round(c.duration * 2) + ' s), ends on the call to action']);
    specs.push(['Headline', c.headlineText]);
    if (c.desc && (c.size === '300x600' || c.size === '160x600' || c.headline === 'other')) specs.push(['Description', c.desc]);
    specs.push(['Added', person(c.uploadedBy) + ', ' + ago(c.created)]);

    // Status, title and campaign dates (editable).
    var title = h('input', { class: 'input', value: c.title, maxlength: 200 });
    var status = h('select', { class: 'input' }, Object.keys(ASTATUS).map(function (k) { return h('option', { value: k, selected: k === c.status, text: ASTATUS[k] }); }));
    var start = h('input', { class: 'input', type: 'date', value: c.start || '' });
    var end = h('input', { class: 'input', type: 'date', value: c.end || '' });
    var saveBtn = h('button', { type: 'submit', class: 'btn forest sm', text: 'Save' });
    var edit = h('form', { class: 'inline-form', onsubmit: function (e) {
      e.preventDefault(); saveBtn.disabled = true;
      api('ads/' + c.id, { method: 'PATCH', body: { title: title.value, status: status.value, campaign_start: start.value, campaign_end: end.value } })
        .then(function () { toast('Saved'); return refresh(); }).catch(function (er) { toast(er.message); }).then(function () { saveBtn.disabled = false; });
    } }, [
      h('label', {}, ['Status', status]),
      h('label', {}, ['Title', title]),
      h('label', {}, ['Runs from', start]),
      h('label', {}, ['Until', end]),
      h('div', { class: 'full', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [saveBtn,
        h('span', { style: 'font-size:12.5px;color:var(--yondr-moss)', text: 'Archived ads are hidden from the library but kept.' }),
        me && (c.uploadedBy === me || isAdmin()) ? h('button', { type: 'button', class: 'linkbtn danger', style: 'margin-left:auto', text: 'Delete ad', onclick: function () {
          if (!confirm('Delete this ad for everyone? Its file, reviews and comments are removed. To keep it, archive it instead.')) return;
          api('ads/' + c.id, { method: 'DELETE' }).then(function () { dlg.close(); toast('Ad deleted'); return refresh(); }).catch(function (er) { toast(er.message); });
        } }) : null]),
    ]);

    var canText = canEditText(c);
    var side = h('div', { class: 'side' }, [
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' }, [
        h('button', { type: 'button', class: 'btn lime', html: ICON.dl + ' Download ' + c.format, onclick: function () { downloadOne(c); } }),
        isEditor() ? h('button', { type: 'button', class: 'btn forest', onclick: function () { editHere(c); } }, [svg('pen'), canText ? 'Edit text' : 'Replace file'])
          : h('button', { type: 'button', class: 'btn line', onclick: function () { suggest(c); } }, [svg('chat'), 'Suggest a change']),
        h('button', { type: 'button', class: 'btn line', text: 'Copy file name', onclick: function () { copy(fileName(c), 'File name'); } }),
      ]),
      !isEditor() && c.status !== 'approved' ? h('p', { class: 'notice', style: 'margin:0', text: 'Not approved yet. It may still change, so check with an editor before using it in a campaign.' }) : null,
      updating(c) ? h('p', { class: 'notice', style: 'margin:0', text: 'This ad is being updated. The new version appears when the update finishes.' }) : null,
      c.meta && c.meta.overrides ? h('p', { class: 'notice', style: 'margin:0', text: 'This ad has its own text, different from the rest of the set' + (isEditor() ? '. Edit text to change it or go back to the shared copy.' : '.') }) : null,
      h('section', {}, [h('h3', { text: 'Details' }), h('dl', { class: 'specs' }, specs.reduce(function (a, s) { return a.concat([h('dt', { text: s[0] }), h('dd', { text: s[1] })]); }, []))]),
      isEditor() ? h('section', {}, [h('h3', { text: 'Status & dates' }), edit])
        : h('section', {}, [h('h3', { text: 'Status' }), h('div', { class: 'sub' }, [statusPill(c.status), c.start || c.end ? ' Runs ' + dates(c.start, c.end) : null])]),
      h('section', {}, [h('h3', { text: 'Review' }), isEditor() ? h('div', { class: 'react' }, [
        h('button', { type: 'button', class: 'btn line sm up', 'aria-pressed': String(x.mine === 1), html: ICON.check + ' Approve' + (x.up ? ' · ' + x.up : ''), onclick: function () { review(c, x.mine === 1 ? 0 : 1); } }),
        h('button', { type: 'button', class: 'btn line sm down', 'aria-pressed': String(x.mine === -1), html: ICON.pen + ' Needs changes' + (x.down ? ' · ' + x.down : ''), onclick: function () { review(c, x.mine === -1 ? 0 : -1); } }),
      ]) : null, h('p', { 'data-reviewers': '', style: 'margin:8px 0 0;font-size:12.5px;color:var(--yondr-moss)' })]),
      usesSection(c),
      commentsSection(c),
    ]);
    dlg.innerHTML = '';
    dlg.appendChild(h('div', { class: 'sheet-head' }, [
      h('h2', { id: 'detail-title', text: label(c) }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Previous ad', html: ICON.prev, onclick: function () { step(-1); } }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Next ad', html: ICON.next, onclick: function () { step(1); } }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close', html: ICON.x, onclick: function () { dlg.close(); } }),
    ]));
    dlg.appendChild(h('div', { class: 'sheet-body' }, [h('div', { class: 'detail' }, [
      h('div', { class: 'stagebox' }, [h('div', { class: 'canvas' }, [img]), h('div', { class: 'tools' }, tools)]), side])]));
  }
  function usesSection(c) {
    var used = c.stats.campaigns.map(campaign).filter(Boolean);
    var avail = D.campaigns.filter(function (k) { return c.stats.campaigns.indexOf(k.id) < 0; });
    var sel = h('select', { class: 'input', 'aria-label': 'Campaign to add this ad to' },
      [h('option', { value: '', text: avail.length ? 'Choose a campaign…' : 'No other campaigns yet' })].concat(avail.map(function (k) { return h('option', { value: k.id, text: k.name }); })));
    return h('section', {}, [
      h('h3', { text: 'Campaigns' }),
      used.length ? h('ul', { class: 'uses' }, used.map(function (k) {
        return h('li', {}, [h('span', { class: 'pill ' + k.status, text: CSTATUS[k.status] }), h('span', { class: 'name', text: k.name }),
          !isEditor() ? null : h('button', { type: 'button', class: 'iconbtn', title: 'Remove from campaign', 'aria-label': 'Remove from ' + k.name, html: ICON.x, onclick: function () { removeFromCampaign(k.id, [c.id]); } })]);
      })) : h('p', { style: 'margin:0;font-size:14px;color:var(--yondr-moss)', text: 'Not used in a campaign yet.' }),
      !isEditor() ? null : h('div', { class: 'addrow', style: 'margin-top:10px' }, [sel,
        h('button', { type: 'button', class: 'btn forest sm', text: 'Add', onclick: function () { if (sel.value) addToCampaign(parseInt(sel.value, 10), [c.id]); } }),
        h('button', { type: 'button', class: 'btn line sm', onclick: function () { campaignForm(null, [c.id]); } }, [svg('plus'), 'New campaign'])]),
    ]);
  }
  // Viewers can't edit, so "Suggest a change" jumps to a copy comment on this ad.
  function suggest(c) {
    var chip = Array.prototype.find.call(document.querySelectorAll('[data-detail] .fgroup .chip'), function (b) { return b.textContent === 'Copy'; });
    if (chip) chip.click();
    var ta = $('[data-detail] textarea');
    if (ta) { ta.placeholder = 'What should this ad say or look like instead? Editors will see it on the ad.'; ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); ta.focus(); }
  }
  function commentsSection(c) {
    var type = 'design';
    var ta = h('textarea', { class: 'input', rows: 3, maxlength: 5000, placeholder: 'What works, what should change? Be specific: copy, colour, image, legibility…', 'aria-label': 'Your comment on this ad' });
    var chips = h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Kind of comment' });
    FB_TYPES.forEach(function (t) {
      chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(t[0] === type), text: t[1], onclick: function (e) {
        type = t[0]; chips.querySelectorAll('.chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b === e.currentTarget)); });
      } }));
    });
    var errEl = h('p', { class: 'err', role: 'alert' });
    var send = h('button', { type: 'submit', class: 'btn forest sm', text: 'Post comment' });
    var form = h('form', { class: 'form', onsubmit: function (e) {
      e.preventDefault();
      if (!ta.value.trim()) { errEl.textContent = 'Write a comment first.'; ta.focus(); return; }
      send.disabled = true; errEl.textContent = '';
      api('ads/' + c.id + '/comments', { method: 'POST', body: { type: type, body: ta.value } })
        .then(function (r) { ta.value = ''; c.stats.comments = r.items.length; paintComments(r); toast('Comment posted'); renderGrid(); })
        .catch(function (er) { errEl.textContent = er.message; })
        .then(function () { send.disabled = false; });
    } }, [chips, ta, errEl, h('div', { class: 'foot' }, [send])]);
    return h('section', {}, [h('h3', { text: 'Comments' }), h('ul', { class: 'fb-list', 'data-comments': '' }, [h('li', { text: 'Loading…' })]), h('div', { style: 'height:12px' }), form]);
  }
  function paintComments(r) {
    var ul = $('[data-comments]');
    if (!ul) return;
    ul.innerHTML = '';
    if (!r.items.length) ul.appendChild(h('li', { style: 'color:var(--yondr-moss)', text: 'No comments yet. Be the first.' }));
    r.items.forEach(function (i) {
      var t = FB_TYPES.find(function (x) { return x[0] === i.type; });
      var ad = byId(i.ad_id);
      ul.appendChild(h('li', {}, [h('div', { class: 'by' }, [h('b', { text: person(i.author_email) }), '· ' + ago(i.created_at), h('span', { class: 'pill', text: t ? t[1] : 'Other' }),
        isEditor() && ad && i.type === 'content' ? h('button', { type: 'button', class: 'linkbtn', style: 'margin-left:auto', onclick: function () { editHere(ad); } }, [svg('pen'), 'Edit text']) : null]),
        h('p', { text: i.body })]));
    });
    var who = $('[data-reviewers]');
    if (who) {
      var up = r.reviews.filter(function (x) { return x.value === 1; }).map(function (x) { return person(x.email); });
      var dn = r.reviews.filter(function (x) { return x.value === -1; }).map(function (x) { return person(x.email); });
      who.textContent = [up.length ? 'Approved by ' + up.join(', ') : '', dn.length ? 'Changes asked by ' + dn.join(', ') : ''].filter(Boolean).join(' · ');
    }
  }
  function loadComments(c) { api('ads/' + c.id + '/comments').then(function (r) { if (detailId === c.id) paintComments(r); }).catch(function () {}); }
  function review(c, v) {
    api('ads/' + c.id + '/review', { method: 'POST', body: { value: v } }).then(function (r) {
      c.stats.up = r.up; c.stats.down = r.down; c.stats.mine = r.mine;
      renderDetail(c); loadComments(c); renderGrid();
    }).catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- data
  function refresh() {
    return api('sets/' + encodeURIComponent(M ? M.set.id : D.set.id)).then(function (r) { D = r; me = r.me.email; M = model(D); rerender(); });
  }
  function rerender() {
    renderHero(); renderToolbar(); renderGrid(); renderSelbar();
    if (tab === 'campaigns') renderCampaigns();
    if (tab === 'copy') renderCopy();
    if (tab === 'edit' && window.YondrEditor) window.YondrEditor.render($('[data-panel="edit"]'), editorApi());
    var dlg = $('[data-detail]');
    if (dlg.open && detailId && byId(detailId)) { renderDetail(byId(detailId)); loadComments(byId(detailId)); }
  }
  function addToCampaign(id, ids) {
    return api('campaigns/' + id + '/ads', { method: 'POST', body: { add: ids } }).then(function () {
      toast('Added ' + ids.length + ' ad' + (ids.length > 1 ? 's' : '') + ' to ' + (campaign(id) || {}).name); return refresh();
    }).catch(function (e) { toast(e.message); });
  }
  function removeFromCampaign(id, ids) {
    return api('campaigns/' + id + '/ads', { method: 'POST', body: { remove: ids } }).then(function () { toast('Removed'); return refresh(); }).catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- forms (campaign, upload, new set)
  function sheet(titleText, body) {
    var dlg = $('[data-form]');
    dlg.innerHTML = '';
    dlg.appendChild(h('div', { class: 'sheet-head' }, [h('h2', { id: 'form-title', text: titleText }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close', html: ICON.x, onclick: function () { dlg.close(); } })]));
    dlg.appendChild(h('div', { class: 'sheet-body' }, [body]));
    var det = $('[data-detail]');
    if (det.open) det.close();
    dlg.showModal();
    return dlg;
  }
  function field(name, lbl, input, hint) { input.name = name; return h('label', {}, [lbl, input, hint ? h('span', { class: 'hint', text: hint }) : null]); }
  function options(map, cur) { return Object.keys(map).map(function (k) { return h('option', { value: k, selected: k === cur, text: map[k] }); }); }

  function campaignForm(existing, ids) {
    var c = existing || { name: '', channel: 'google-display', status: 'planned', start_date: '', end_date: '', owner_email: me || '', notes: '' };
    var name = h('input', { class: 'input', required: true, maxlength: 120, value: c.name || '', placeholder: 'e.g. Google Display, school leaders, Dec 2026' });
    var errEl = h('p', { class: 'err', role: 'alert' });
    var withSel = ids && ids.length ? h('input', { type: 'checkbox', checked: true }) : null;
    var form = h('form', { class: 'form', style: 'padding:20px', onsubmit: function (e) {
      e.preventDefault();
      var fd = new FormData(form), body = {};
      ['name', 'channel', 'status', 'start_date', 'end_date', 'owner_email', 'notes'].forEach(function (k) { body[k] = fd.get(k) || ''; });
      if (!existing && withSel && withSel.checked) body.ads = ids;
      errEl.textContent = '';
      (existing ? api('campaigns/' + existing.id, { method: 'PATCH', body: body }) : api('sets/' + M.set.id + '/campaigns', { method: 'POST', body: body }))
        .then(function (r) { dlg.close(); toast(existing ? 'Campaign saved' : 'Campaign added'); if (!existing) { openCampaign = r.id; if (body.ads) picked.clear(); } return refresh(); })
        .catch(function (er) { errEl.textContent = er.message; });
    } }, [
      field('name', 'Campaign name', name),
      h('div', { class: 'two' }, [field('channel', 'Channel', h('select', { class: 'input' }, options(CHANNELS, c.channel))), field('status', 'Status', h('select', { class: 'input' }, options(CSTATUS, c.status)))]),
      h('div', { class: 'two' }, [field('start_date', 'Starts', h('input', { class: 'input', type: 'date', value: c.start_date || '' })), field('end_date', 'Ends', h('input', { class: 'input', type: 'date', value: c.end_date || '' }))]),
      field('owner_email', 'Owner', h('input', { class: 'input', type: 'email', value: c.owner_email || '', placeholder: 'name@overyondr.com' })),
      field('notes', 'Notes', h('textarea', { class: 'input', rows: 3, maxlength: 4000, placeholder: 'Audience, budget, placements, results…', text: c.notes || '' })),
      withSel ? h('label', { style: 'flex-direction:row;align-items:center;gap:10px;font-weight:600' }, [withSel, 'Include the ' + ids.length + ' selected ad' + (ids.length > 1 ? 's' : '')]) : null,
      errEl,
      h('div', { class: 'foot' }, [h('button', { type: 'button', class: 'btn line', text: 'Cancel', onclick: function () { dlg.close(); } }), h('button', { type: 'submit', class: 'btn forest', text: existing ? 'Save campaign' : 'Add campaign' })]),
    ]);
    var dlg = sheet(existing ? 'Edit campaign' : 'New campaign', form);
    name.focus();
  }

  function uploadForm() {
    var queue = [];
    var list = h('ul', { class: 'uplist' });
    var input = h('input', { type: 'file', accept: 'image/jpeg,image/gif,image/png,image/webp', multiple: true, class: 'visually-hidden', id: 'up-files' });
    var drop = h('label', { class: 'drop', for: 'up-files' }, [h('b', { text: 'Drop ad files here or choose files' }), h('span', { text: 'JPEG, GIF, PNG or WebP. Most ad networks need each file under 150 KB.' })]);
    function add(files) {
      Array.prototype.forEach.call(files, function (file) {
        if (!/^image\/(jpeg|gif|png|webp)$/.test(file.type)) { toast(file.name + ' isn’t a JPEG, GIF, PNG or WebP'); return; }
        var item = { file: file, title: h('input', { class: 'input', value: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), 'aria-label': 'Title for ' + file.name }) };
        var src = URL.createObjectURL(file), dim = h('span', { class: 'ok', text: '…' });
        var img = h('img', { src: src, alt: '' });
        img.onload = function () { var s = img.naturalWidth + 'x' + img.naturalHeight; dim.textContent = img.naturalWidth + '×' + img.naturalHeight + (STANDARD[s] ? ' · ' + STANDARD[s] : ' · custom size'); };
        item.row = h('li', {}, [img, h('div', {}, [item.title, h('div', { style: 'margin-top:4px;display:flex;gap:10px;flex-wrap:wrap' }, [dim,
          h('span', { class: file.size > LIMIT ? 'warn' : 'ok', text: kb(file.size) + (file.size > LIMIT ? ' · over 150 KB' : '') })])]),
          h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Remove ' + file.name, html: ICON.x, onclick: function () { queue.splice(queue.indexOf(item), 1); item.row.remove(); } })]);
        queue.push(item); list.appendChild(item.row);
      });
    }
    input.addEventListener('change', function () { add(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { add(e.dataTransfer.files); });
    var variant = h('select', { class: 'input' }, [h('option', { value: '', text: 'Work it out (GIFs that move = motion)' })].concat(options({ pouch: 'Pouch still', 'in-use': 'In-use still', motion: 'Motion', other: 'Other' })));
    var errEl = h('p', { class: 'err', role: 'alert' });
    var go = h('button', { type: 'submit', class: 'btn forest', text: 'Upload' });
    var form = h('form', { class: 'form', style: 'padding:20px', onsubmit: function (e) {
      e.preventDefault();
      if (!queue.length) { errEl.textContent = 'Add at least one file.'; return; }
      var fd0 = new FormData(form), done = 0;
      go.disabled = true; errEl.textContent = '';
      queue.reduce(function (p, item) {
        return p.then(function () {
          var fd = new FormData();
          fd.append('file', item.file);
          fd.append('title', item.title.value);
          ['headline', 'status', 'campaign_start', 'campaign_end'].forEach(function (k) { fd.append(k, fd0.get(k) || ''); });
          if (variant.value) fd.append('variant', variant.value);
          go.textContent = 'Uploading ' + (done + 1) + ' of ' + queue.length + '…';
          var poster = item.file.type === 'image/gif' ? needEditor().then(function () { return window.YondrRender.posterFromFile(item.file); }).catch(function () { return null; }) : Promise.resolve(null);
          return poster.then(function (pb) {
            if (pb) fd.append('poster', new File([pb], 'poster.jpg', { type: 'image/jpeg' }));
            return api('sets/' + M.set.id + '/ads', { method: 'POST', body: fd });
          }).then(function () { done++; item.row.style.opacity = '.45'; });
        });
      }, Promise.resolve()).then(function () {
        api('sets/' + M.set.id + '/rerendered', { method: 'POST', body: { kind: 'upload', count: done } }).catch(function () {});
        dlg.close(); toast('Uploaded ' + done + ' ad' + (done > 1 ? 's' : '') + '. Reviewers have been told.'); f.status = 'active'; save('filters2', f); return refresh();
      })
        .catch(function (er) { errEl.textContent = er.message + (done ? ' (' + done + ' uploaded before this.)' : ''); go.disabled = false; go.textContent = 'Upload'; });
    } }, [
      input, drop, list,
      field('headline', 'Headline the ads show', h('input', { class: 'input', maxlength: 200, placeholder: 'Optional' })),
      h('div', { class: 'two' }, [h('label', {}, ['Type', variant]), field('status', 'Status', h('select', { class: 'input' }, options(ASTATUS, 'in_review')))]),
      h('div', { class: 'two' }, [field('campaign_start', 'Runs from', h('input', { class: 'input', type: 'date' })), field('campaign_end', 'Until', h('input', { class: 'input', type: 'date' }))]),
      h('p', { class: 'hint', style: 'margin:0;font-size:13px;color:var(--yondr-moss)', text: 'Ads go into “' + M.set.name + '”. Size and animation are read from each file.' }),
      errEl,
      h('div', { class: 'foot' }, [h('button', { type: 'button', class: 'btn line', text: 'Cancel', onclick: function () { dlg.close(); } }), go]),
    ]);
    var dlg = sheet('Upload ads', form);
    dlg.querySelector('.sheet-head h2').after(helpLink('upload', 'Uploading ads'));
  }

  function setForm() {
    var errEl = h('p', { class: 'err', role: 'alert' });
    var form = h('form', { class: 'form', style: 'padding:20px', onsubmit: function (e) {
      e.preventDefault();
      var fd = new FormData(form), body = {};
      ['name', 'summary'].forEach(function (k) { body[k] = fd.get(k) || ''; });
      api('sets', { method: 'POST', body: body }).then(function (r) { dlg.close(); toast('Ad set added'); return boot(r.id); }).catch(function (er) { errEl.textContent = er.message; });
    } }, [
      field('name', 'Name', h('input', { class: 'input', required: true, maxlength: 120, placeholder: 'e.g. Back to school 2027' })),
      field('summary', 'What the ads are for', h('textarea', { class: 'input', rows: 2, maxlength: 1000 })),
      errEl,
      h('div', { class: 'foot' }, [h('button', { type: 'button', class: 'btn line', text: 'Cancel', onclick: function () { dlg.close(); } }), h('button', { type: 'submit', class: 'btn forest', text: 'Add ad set' })]),
    ]);
    var dlg = sheet('New ad set', form);
  }

  // ---------------------------------------------------------------- campaigns tab
  function renderCampaigns() {
    var p = $('[data-panel="campaigns"]');
    p.innerHTML = '';
    p.appendChild(h('div', { class: 'camp-head' }, [
      h('h2', { text: 'Campaigns' }), helpLink('campaigns', 'Campaigns'),
      h('a', { class: 'btn line sm', href: '/api/sets/' + M.set.id + '/campaigns.csv', text: 'Export CSV' }),
      isEditor() ? h('button', { type: 'button', class: 'btn forest sm', onclick: function () { campaignForm(null, Array.from(picked)); } }, [svg('plus'), 'New campaign']) : null,
      h('p', { text: 'Log every campaign these ads run in: channel, dates, owner and which ads it uses.' }),
    ]));
    if (!D.campaigns.length) {
      p.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'No campaigns yet' }),
        h('p', { text: 'Add the first one, then pick its ads: select ads on the Ads tab and choose “Add to campaign”.' }),
        isEditor() ? h('button', { type: 'button', class: 'btn forest', style: 'margin-top:14px', onclick: function () { campaignForm(null, Array.from(picked)); } }, [svg('plus'), 'New campaign']) : null]));
      return;
    }
    var wrap = h('div', { class: 'camps' });
    D.campaigns.forEach(function (k) {
      var ads = M.ads.filter(function (c) { return c.stats.campaigns.indexOf(k.id) >= 0; });
      var det = h('details', { class: 'camp', open: openCampaign === k.id, ontoggle: function () { if (det.open) openCampaign = k.id; } }, [
        h('summary', {}, [
          h('div', {}, [h('p', { class: 'cname', text: k.name }), h('div', { class: 'cmeta' }, [h('span', { class: 'pill ' + k.status, text: CSTATUS[k.status] }),
            h('span', { text: CHANNELS[k.channel] || k.channel }), dates(k.start_date, k.end_date) ? h('span', { text: dates(k.start_date, k.end_date) }) : null,
            k.owner_email ? h('span', { text: 'Owner: ' + person(k.owner_email) }) : null])]),
          h('div', { class: 'nads' }, [String(ads.length), h('small', { text: ads.length === 1 ? 'ad' : 'ads' })]),
        ]),
        h('div', { class: 'camp-body' }, [
          h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:center' }, [
            !isEditor() ? null : h('button', { type: 'button', class: 'btn forest sm', onclick: function () { setTab('ads'); toast('Select ads, then choose “' + k.name + '” in the bar below'); } }, [svg('plus'), 'Add ads']),
            ads.length ? h('button', { type: 'button', class: 'btn lime sm', html: ICON.dl + ' Download ' + ads.length + ' ads (.zip)', onclick: function () { downloadZip(ads, k.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.zip'); } }) : null,
            !isEditor() ? null : h('button', { type: 'button', class: 'btn line sm', text: 'Edit details', onclick: function () { campaignForm(k); } }),
            !isEditor() ? null : h('select', { class: 'input', 'aria-label': 'Campaign status', style: 'min-height:36px;padding:6px 46px 6px 12px', onchange: function (e) {
              api('campaigns/' + k.id, { method: 'PATCH', body: { status: e.target.value } }).then(function () { toast('Status updated'); return refresh(); }).catch(function (er) { toast(er.message); });
            } }, Object.keys(CSTATUS).map(function (s) { return h('option', { value: s, selected: s === k.status, text: 'Status: ' + CSTATUS[s] }); })),
            h('span', { style: 'flex:1' }),
            me && (k.created_by === me || isAdmin()) ? h('button', { type: 'button', class: 'linkbtn danger', text: 'Delete campaign', onclick: function () {
              if (!confirm('Delete “' + k.name + '”? The ads stay in the library.')) return;
              api('campaigns/' + k.id, { method: 'DELETE' }).then(function () { toast('Campaign deleted'); return refresh(); }).catch(function (er) { toast(er.message); });
            } }) : null,
          ]),
          h('dl', { class: 'specs' }, [h('dt', { text: 'Added' }), h('dd', { text: person(k.created_by) + ', ' + ago(k.created_at) }),
            k.notes ? h('dt', { text: 'Notes' }) : null, k.notes ? h('dd', { style: 'white-space:pre-wrap;font-weight:400', text: k.notes }) : null]),
          ads.length ? h('div', { class: 'thumbs' }, ads.map(function (c) {
            return h('div', { class: 'thumb' }, [
              h('button', { type: 'button', class: 'tframe', 'aria-label': 'Open ' + label(c), onclick: function () { openDetail(c.id); } }, [h('img', { src: posterUrl(c), alt: '', loading: 'lazy', decoding: 'async' })]),
              h('span', { text: c.w + '×' + c.h + ' · ' + (VARIANTS[c.variant] || 'Other') }),
              h('div', { class: 'tools' }, [
                h('button', { type: 'button', class: 'btn line', html: ICON.dl + ' Download', onclick: function () { downloadOne(c); } }),
                !isEditor() ? null : h('button', { type: 'button', class: 'btn line', text: 'Remove', 'aria-label': 'Remove ' + label(c) + ' from ' + k.name, onclick: function () { removeFromCampaign(k.id, [c.id]); } })]),
            ]);
          })) : h('p', { style: 'margin:0;color:var(--yondr-moss)', text: 'No ads in this campaign yet. Use “Add ads”.' }),
        ]),
      ]);
      wrap.appendChild(det);
    });
    p.appendChild(wrap);
  }

  // ---------------------------------------------------------------- copy & specs tab
  function renderCopy() {
    var p = $('[data-panel="copy"]');
    p.innerHTML = '';
    var C = M.copy;
    var line = function (text, limit) {
      var n = text.length;
      return h('li', {}, [h('span', { class: 'txt', text: text }), limit ? h('span', { class: 'n' + (n > limit ? ' over' : ''), title: 'Google Ads limit: ' + limit, text: n + '/' + limit }) : null,
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Copy: ' + text, title: 'Copy', html: ICON.copy, onclick: function () { copy(text); } })]);
    };
    var sub = function (t) { return h('h3', { style: 'font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--yondr-moss);margin:18px 0 8px', text: t }); };
    var heads = (C.headlines || []);
    var copyPanel = heads.length ? h('section', { class: 'panel' }, [h('div', { style: 'display:flex;align-items:center;gap:10px' }, [h('h2', { text: 'Ad copy' }), helpLink('copy-specs', 'Ad copy and specs')]),
      h('p', { text: 'Text for responsive display, search and social ads. Counts show Google Ads limits.' }),
      sub('Headlines'), h('ul', { class: 'lines' }, heads.map(function (x) { return line(x.text, 30); })),
      C.longHeadline ? sub('Long headline') : null, C.longHeadline ? h('ul', { class: 'lines' }, [line(C.longHeadline, 90)]) : null,
      sub('Descriptions'), h('ul', { class: 'lines' }, heads.filter(function (x) { return x.desc; }).map(function (x) { return line(x.desc, 90); })),
      C.cta ? sub('Call to action') : null, C.cta ? h('ul', { class: 'lines' }, [line(C.cta, 0)]) : null,
      C.source ? sub('Source line') : null, C.source ? h('ul', { class: 'lines' }, [line(C.source, 0)]) : null,
      h('button', { type: 'button', class: 'btn forest sm', style: 'margin-top:16px', text: 'Copy all as text', onclick: function () {
        copy(['HEADLINES (30 characters max)'].concat(heads.map(function (x) { return x.text; }), ['', 'LONG HEADLINE (90 max)', C.longHeadline || '', '', 'DESCRIPTIONS (90 max)'],
          heads.map(function (x) { return x.desc || ''; }), ['', 'CALL TO ACTION', C.cta || '', '', 'SOURCE', C.source || '']).join('\n'), 'All ad copy');
      } }),
    ]) : h('section', { class: 'panel' }, [h('h2', { text: 'Ad copy' }), h('p', { text: 'No copy has been recorded for this ad set.' })]);
    var live = M.ads.filter(function (a) { return a.status !== 'archived'; });
    var motion = live.find(function (c) { return c.duration; });
    var rows = [
      ['Sizes', M.sizes.map(function (s) { return s.name + ' ' + s.w + '×' + s.h; }).join(' · ')],
      ['Stills', live.filter(function (a) { return a.kind === 'still'; }).length + ' (' + Array.from(new Set(live.filter(function (a) { return a.kind === 'still'; }).map(function (a) { return a.format; }))).join(', ') + ')'],
      ['Motion', motion ? 'Animated GIF, ' + motion.duration + ' s, plays twice (about ' + Math.round(motion.duration * 2) + ' s, under the 30 s limit) and stops on the end card' : live.filter(function (a) { return a.kind === 'motion'; }).length + ' animated'],
      ['File size', live.length ? (live.every(function (a) { return a.bytes <= LIMIT; }) ? 'Every file is under 150 KB' : 'Some files are over 150 KB') + ' (largest ' + kb(Math.max.apply(null, live.map(function (c) { return c.bytes; }))) + ')' : '—'],
      ['Click-through', 'Set by the ads team in each ad platform'],
    ];
    if (heads.length) rows.splice(4, 0, ['Headlines', heads.length + ' variants']);
    if (C.source) rows.push(['Claim source', C.source]);
    p.appendChild(h('div', { class: 'copy-grid' }, [copyPanel,
      h('div', { style: 'display:flex;flex-direction:column;gap:24px' }, [
        h('section', { class: 'panel' }, [h('h2', { text: 'Specs' }), h('table', { class: 'spec' }, [h('tbody', {}, rows.map(function (r) { return h('tr', {}, [h('th', { scope: 'row', text: r[0] }), h('td', { text: r[1] })]); }))])]),
        M.files.length ? h('section', { class: 'panel' }, [h('h2', { text: 'Source images' }), h('p', { text: 'The pouch and photos used in these ads, for other formats.' }),
          h('div', { class: 'sources' }, M.files.map(function (s) {
            return h('a', { href: '/files/' + s.r2_key + '?download', download: s.r2_key.split('/').pop() }, [h('img', { src: '/files/' + s.r2_key, alt: s.alt || '', loading: 'lazy', class: /png$/.test(s.content_type) ? 'contain' : null }), s.name + ' ↓']);
          }))]) : null,
      ]),
    ]));
  }

  // ---------------------------------------------------------------- tabs, routing, boot
  function setTab(t, fromHash) {
    tab = t;
    document.querySelectorAll('[data-tab]').forEach(function (b) { var on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== t; });
    // On narrow screens the tab row scrolls: keep the chosen tab fully in view.
    var tb = document.querySelector('[data-tab="' + t + '"]'), row = tb && tb.parentNode;
    if (row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: Math.max(0, tb.offsetLeft - row.offsetLeft - 16), behavior: fromHash ? 'auto' : 'smooth' });
    renderSelbar();
    if (t === 'campaigns') renderCampaigns();
    if (t === 'copy') renderCopy();
    if (t === 'edit') {
      var ep = $('[data-panel="edit"]');
      if (!window.YondrEditor) { ep.innerHTML = ''; ep.appendChild(h('p', { class: 'loading', text: 'Loading the editor…' })); }
      needEditor().then(function () { if (tab === 'edit') window.YondrEditor.render(ep, editorApi()); }).catch(function (e) { toast(e.message); });
    }
    if (t === 'people') renderPeople();
    if (!fromHash) history.replaceState(null, '', t === 'ads' ? location.pathname + location.search : '#' + t);
  }
  document.querySelectorAll('[data-tab]').forEach(function (b, i, all) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var vis = Array.prototype.filter.call(all, function (x) { return !x.hidden; }), j = vis.indexOf(b);
      var n = vis[(j + d + vis.length) % vis.length]; n.focus(); setTab(n.dataset.tab);
    });
  });
  var detailDlg = $('[data-detail]');
  detailDlg.addEventListener('close', function () { detailId = null; detailDlg._edit = false; if (/^#ad=/.test(location.hash)) history.replaceState(null, '', tab === 'ads' ? location.pathname + location.search : '#' + tab); });
  detailDlg.addEventListener('click', function (e) { if (e.target === detailDlg && !detailDlg._busy && !detailDlg._edit) detailDlg.close(); });
  detailDlg.addEventListener('cancel', function (e) {
    if (detailDlg._busy) { e.preventDefault(); toast('Still saving. Use Stop to cancel.'); return; }
    if (detailDlg._edit) { e.preventDefault(); detailDlg._edit = false; var c = byId(detailId); if (c) { renderDetail(c); loadComments(c); history.replaceState(null, '', '#ad=' + c.id); } }
  });
  $('[data-form]').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
  document.addEventListener('keydown', function (e) {
    if (!detailDlg.open || detailDlg._edit || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
  });
  $('[data-upload]').addEventListener('click', function () { if (M) uploadForm(); });

  function route() {
    var m = /^#ad=([a-z0-9-]+)(\/edit)?/.exec(location.hash);
    if (m) { setTab('ads', true); openDetail(m[1], true, !!m[2]); return; }
    var t = location.hash.slice(1);
    if (t === 'campaigns' || t === 'copy' || (t === 'edit' && isEditor()) || (t === 'people' && isAdmin())) setTab(t, true);
  }
  // Links pasted into an open tab (#ad=<id>, #ad=<id>/edit, #campaigns…) work without a reload.
  window.addEventListener('hashchange', function () { if (M) route(); });
  function renderPicker(current) {
    var sel = $('[data-set-picker]');
    sel.innerHTML = '';
    sets.forEach(function (s) { sel.appendChild(h('option', { value: s.id, selected: s.id === current, text: s.name + ' (' + s.ad_count + ')' })); });
    if (isEditor()) sel.appendChild(h('option', { value: '__new', text: '+ New ad set…' }));
    sel.hidden = false;
    sel.onchange = function () { if (sel.value === '__new') { sel.value = current; setForm(); } else boot(sel.value); };
  }
  // One request to start: the remembered set (with the sets list and who you are). Falls back to the first set.
  function boot(want) {
    var q = new URLSearchParams(location.search).get('set');
    var id = want || q || load('set', null);
    var first = id ? api('sets/' + encodeURIComponent(id)).catch(function () { return null; }) : Promise.resolve(null);
    return first.then(function (d) {
      if (d) return d;
      return api('sets').then(function (r) { return r.sets.length ? api('sets/' + encodeURIComponent(r.sets[0].id)) : { empty: true }; });
    }).then(function (d) {
      if (d.empty) {
        $('[data-grid]').innerHTML = '';
        $('[data-grid]').appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'No ad sets yet' }), h('p', { text: 'Create a set, then upload its ads.' }),
          h('button', { type: 'button', class: 'btn forest', style: 'margin-top:14px', onclick: setForm }, [svg('plus'), 'New ad set'])]));
        return;
      }
      sets = d.sets; id = d.set.id;
      save('set', id);
      if (sets.length > 1 || q) history.replaceState(null, '', '?set=' + id + location.hash);
      picked.clear();
      D = d; me = d.me.email; role = d.me.role || 'viewer'; M = model(d);
      if (!f) f = defaults();
      f = Object.assign(defaults(), f);
      $('[data-email]').textContent = me || '';
      var rb = $('[data-role]'); rb.textContent = (d.me.owner ? 'Owner' : ROLE_NAMES[role]); rb.hidden = false;
      rb.title = { viewer: 'You can view, download and comment', editor: 'You can also edit copy, upload, review and manage campaigns', admin: 'You can also manage people' }[role];
      $('[data-upload]').hidden = !isEditor();
      $('[data-tab="edit"]').hidden = !isEditor();
      $('[data-tab="people"]').hidden = !isAdmin();
      renderPicker(id);
      rerender();
      route();
      startTour(d.me);
      startInbox();
      if (isEditor()) (window.requestIdleCallback || setTimeout)(function () { needEditor().catch(function () {}); });
    }).catch(function (e) { $('[data-grid]').innerHTML = ''; $('[data-grid]').appendChild(h('p', { class: 'notice', text: 'The ad library couldn’t load: ' + e.message })); });
  }
  // ---------------------------------------------------------------- notifications (the bell)
  var inboxTimer = null;
  function startInbox() {
    if (inboxTimer) return;
    loadInbox();
    // Check every minute while the tab is visible, and when you come back to it.
    inboxTimer = setInterval(function () { if (document.visibilityState === 'visible') loadInbox(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') loadInbox(); });
  }
  function loadInbox() {
    return api('notifications').then(function (r) {
      var badge = $('[data-bell-count]'), bell = $('[data-bell]');
      badge.textContent = r.unread > 9 ? '9+' : String(r.unread);
      badge.hidden = !r.unread;
      bell.setAttribute('aria-label', 'Notifications' + (r.unread ? ', ' + r.unread + ' unread' : ''));
      paintInbox(r);
    }).catch(function () {});
  }
  function paintInbox(r) {
    var box = $('#inbox');
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'inbox-head' }, [h('b', { text: 'Notifications' }),
      r.unread ? h('button', { type: 'button', class: 'linkbtn', text: 'Mark all read', onclick: function () { api('notifications/read', { method: 'POST', body: { all: true } }).then(loadInbox); } }) : null]));
    if (!r.items.length) { box.appendChild(h('p', { class: 'inbox-empty', text: 'Nothing yet. Suggestions, comments, reviews and role changes show up here.' })); return; }
    var ICONS = { suggestion: 'pen', comment: 'chat', review_needed: 'eye', changes_requested: 'undo', role: 'star' };
    box.appendChild(h('ul', { class: 'inbox-list' }, r.items.map(function (n) {
      return h('li', {}, [h('button', { type: 'button', class: n.read_at ? '' : 'unread', onclick: function () {
        if (!n.read_at) api('notifications/read', { method: 'POST', body: { id: n.id } }).then(loadInbox);
        if (box.hidePopover) box.hidePopover();
        var go = function () { if (n.ad_id && byId(n.ad_id)) openDetail(n.ad_id); else if (n.kind === 'review_needed' && isEditor()) { setTab('ads'); setF('status', 'in_review'); } };
        if (n.set_id && M && n.set_id !== M.set.id) boot(n.set_id).then(go); else go();
      } }, [h('span', { class: 'inbox-ico', 'aria-hidden': 'true' }, [svg(ICONS[n.kind] || 'chat')]), h('span', {}, [n.text, h('small', { text: ago(n.created_at) })])])]);
    })));
  }

  // ---------------------------------------------------------------- tour + help
  var tourStarted = false;
  function saveTour(r) { return api('me/tour', { method: 'POST', body: { role: r } }).catch(function () {}); }
  function startTour(meInfo) {
    if (tourStarted || !window.YondrTour) return;
    tourStarted = true;
    var q = new URLSearchParams(location.search);
    if (q.has('tour')) { // /?tour=1 (from the help center) replays the tour
      q.delete('tour'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
      setTimeout(function () { window.YondrTour.start(role, saveTour); }, 500);
      return;
    }
    if (!location.hash || location.hash === '#') window.YondrTour.maybe(meInfo, saveTour);
  }
  document.querySelector('[data-tour-replay]').addEventListener('click', function () {
    var menu = document.getElementById('help-menu');
    if (menu.hidePopover) menu.hidePopover();
    if (detailDlg.open) detailDlg.close();
    setTab('ads');
    window.scrollTo({ top: 0 });
    setTimeout(function () { window.YondrTour.start(role, saveTour); }, 150);
  });
  // A small "?" that opens the matching help article in a new tab (so nothing in progress is lost).
  function helpLink(id, what) { return h('a', { class: 'helplink', href: '/help#' + id, target: '_blank', rel: 'noopener', title: 'Help: ' + what, 'aria-label': 'Help: ' + what, text: '?' }); }

  // Shared with editor.js (the Edit copy tab).
  function editorApi() {
    return { api: api, toast: toast, refresh: refresh, rerender: function () { renderGrid(); }, h: h, helpLink: helpLink, model: function () { return M; }, data: function () { return D; }, me: function () { return me; }, setTab: setTab };
  }

  // ---------------------------------------------------------------- People tab (admins)
  function renderPeople() {
    var p = $('[data-panel="people"]');
    p.innerHTML = '';
    p.appendChild(h('p', { class: 'loading', text: 'Loading people…' }));
    api('users').then(function (r) { paintPeople(p, r); }).catch(function (e) { p.innerHTML = ''; p.appendChild(h('p', { class: 'notice', text: e.message })); });
  }
  function paintPeople(p, r) {
    p.innerHTML = '';
    var setRole = function (email, value) {
      return (value === r.defaultRole ? api('users/' + encodeURIComponent(email), { method: 'DELETE' }) : api('users/' + encodeURIComponent(email), { method: 'PUT', body: { role: value } }))
        .then(function (res) { toast(person(email) + ' is now ' + ROLE_NAMES[value].toLowerCase()); paintPeople(p, res); }).catch(function (e) { toast(e.message); renderPeople(); });
    };
    var email = h('input', { class: 'input', type: 'email', placeholder: 'name@overyondr.com', 'aria-label': 'Email address', required: true });
    var roleSel = h('select', { class: 'input', 'aria-label': 'Role' }, ['editor', 'admin', 'viewer'].map(function (k) { return h('option', { value: k, text: ROLE_NAMES[k] }); }));
    var errEl = h('p', { class: 'err', role: 'alert' });
    var ROLE_HELP = [
      ['viewer', 'Viewer', 'Browse every ad, download them (one or a zip) and comment. Everyone who signs in starts here.'],
      ['editor', 'Editor', 'Everything viewers can do, plus edit taglines, headlines, descriptions and the CTA (the ads re-render), upload ads, set status and run dates, approve, and manage campaigns.'],
      ['admin', 'Admin', 'Everything editors can do, plus give people roles here and delete any ad or campaign.'],
    ];
    p.appendChild(h('div', { class: 'camp-head' }, [h('h2', { text: 'People & permissions' }), helpLink('people', 'People & permissions'),
      h('p', { text: 'Anyone with an @overyondr.com email can sign in and starts as a viewer. Give people editor or admin access here.' })]));
    p.appendChild(h('div', { class: 'roles' }, ROLE_HELP.map(function (x) { return h('div', { class: 'panel role-card' }, [h('span', { class: 'pill role-' + x[0], text: x[1] }), h('p', { text: x[2] })]); })));
    p.appendChild(h('form', { class: 'panel people-add', onsubmit: function (e) {
      e.preventDefault(); errEl.textContent = '';
      var v = email.value.trim().toLowerCase();
      if (!/^[^@\s]+@overyondr\.com$/.test(v)) { errEl.textContent = 'Use an @overyondr.com email address.'; return; }
      setRole(v, roleSel.value).then(function () { email.value = ''; });
    } }, [h('h3', { text: 'Give someone access' }), h('div', { class: 'addrow' }, [email, roleSel, h('button', { type: 'submit', class: 'btn forest sm', text: 'Save' })]), errEl]));
    var rows = r.users.map(function (u) {
      var sel = h('select', { class: 'input', 'aria-label': 'Role for ' + u.email, disabled: u.owner || u.email === me, onchange: function (e) { setRole(u.email, e.target.value); } },
        r.roles.map(function (k) { return h('option', { value: k, selected: k === u.role, text: ROLE_NAMES[k] }); }));
      return h('tr', {}, [
        h('td', {}, [h('b', { text: person(u.email) }), h('br'), h('span', { class: 'muted-ink', text: u.email })]),
        h('td', {}, [u.owner ? h('span', { class: 'pill role-admin', text: 'Owner' }) : sel, u.email === me && !u.owner ? h('span', { class: 'muted-ink', text: ' (you)' }) : null]),
        h('td', { text: u.last_seen_at ? ago(u.last_seen_at) : 'Not yet' }),
        h('td', { text: u.owner ? 'Set in configuration' : u.added_by ? person(u.added_by) : 'Signed in' }),
      ]);
    });
    p.appendChild(h('div', { class: 'panel', style: 'margin-top:20px;overflow-x:auto' }, [h('table', { class: 'spec people' }, [
      h('thead', {}, [h('tr', {}, ['Person', 'Role', 'Last visit', 'Role set by'].map(function (t) { return h('th', { scope: 'col', text: t }); }))]),
      h('tbody', {}, rows)])]));
    var say = function (a) {
      var d = a.detail || {};
      if (a.action === 'role_set') return person(a.actor) + ' made ' + person(a.target) + ' ' + (ROLE_NAMES[d.role] || d.role).toLowerCase();
      if (a.action === 'role_removed') return person(a.actor) + ' set ' + person(a.target) + ' back to viewer';
      if (a.action === 'copy_updated') return person(a.actor) + ' edited the copy (' + (d.changed || []).length + ' change' + ((d.changed || []).length === 1 ? '' : 's') + ')';
      if (a.action === 'ads_rerendered') return person(a.actor) + ' re-rendered ' + d.count + ' ads' + (d.failed ? ' (' + d.failed + ' failed)' : '');
      return person(a.actor) + ' ' + a.action;
    };
    if (r.help && r.help.length) p.appendChild(h('div', { class: 'panel', style: 'margin-top:20px' }, [h('h3', { text: 'Help center feedback' }),
      h('p', { class: 'hint', style: 'margin:0 0 10px', text: 'What people said under “Was this helpful?” and “Still stuck?”. Use it to fix confusing articles or features.' }),
      h('ul', { class: 'fb-list' }, r.help.map(function (f) {
        return h('li', {}, [h('div', { class: 'by' }, [h('b', { text: person(f.email) }), '· ' + ago(f.created_at), h('span', { class: 'pill' + (f.helpful === 0 ? ' down' : f.helpful === 1 ? ' up' : ''), text: f.helpful === 1 ? 'Helpful' : f.helpful === 0 ? 'Not helpful' : 'Suggestion' }),
          h('a', { href: '/help#' + f.article, target: '_blank', rel: 'noopener', text: f.article === 'general' ? 'Help center' : f.article })]), f.comment ? h('p', { text: f.comment }) : null]);
      }))]));
    p.appendChild(h('div', { class: 'panel', style: 'margin-top:20px' }, [h('h3', { text: 'Recent changes' }),
      r.activity.length ? h('ul', { class: 'fb-list' }, r.activity.map(function (a) { return h('li', {}, [h('div', { class: 'by' }, [h('b', { text: say(a) }), '· ' + ago(a.created_at)])]); }))
        : h('p', { style: 'margin:0;color:var(--yondr-moss)', text: 'Nothing yet.' })]));
  }

  boot();
})();
