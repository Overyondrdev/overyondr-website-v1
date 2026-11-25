/* Ad library app for ads.overyondrdev.com. No dependencies.
 * Ads: /__ads/<set>/manifest.json (static). Team data: /__ads/api (src/worker/ads/api.js).
 * Works read-only (view + download) when the API is unavailable, e.g. under `astro dev`. */
(function () {
  'use strict';
  var SET = window.YONDR_AD_SET;
  var BASE = '/__ads/' + SET + '/';
  var API = '/__ads/api/';
  var CHANNELS = { 'google-display': 'Google Display', dv360: 'DV360', linkedin: 'LinkedIn', meta: 'Meta', programmatic: 'Programmatic', 'direct-buy': 'Direct buy', email: 'Email', website: 'Website', other: 'Other' };
  var SOURCE = { 'google-display': 'google', dv360: 'dv360', linkedin: 'linkedin', meta: 'facebook', programmatic: 'programmatic', 'direct-buy': 'direct', email: 'email', website: 'website', other: 'other' };
  var STATUS = { planned: 'Planned', live: 'Live', paused: 'Paused', ended: 'Ended' };
  var SHOW = [['all', 'All'], ['pouch', 'Pouch still'], ['in-use', 'In-use still'], ['motion', 'Motion']];
  var FB_TYPES = [['design', 'Design'], ['content', 'Copy'], ['bug', 'Problem'], ['idea', 'Idea'], ['question', 'Question'], ['praise', 'Love it']];

  var M = null;                       // manifest
  var S = { campaigns: [], creatives: {}, me: null };   // server state
  var online = false;
  var picked = new Set();
  var f = load('filters', { show: 'all', sizes: [], headline: 'all', group: 'size' });
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
    dl: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  };
  function kb(n) { return Math.round(n / 1000) + ' KB'; }
  function person(email) { if (!email) return 'Someone'; var n = email.split('@')[0].split(/[._-]/)[0]; return n.charAt(0).toUpperCase() + n.slice(1); }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 604800) return Math.floor(s / 86400) + ' d ago'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function toast(msg) { var t = $('[data-toast]'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function copy(text, what) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast((what || 'Text') + ' copied'); }, function () { window.prompt('Copy this:', text); });
  }
  function api(path, opts) {
    opts = opts || {};
    var sep = path.indexOf('?') < 0 ? '?' : '&';
    return fetch(API + path + sep + 'set=' + encodeURIComponent(SET), {
      method: opts.method || 'GET', credentials: 'same-origin', keepalive: !!opts.keepalive,
      headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ').'); return j; }); });
  }
  function byId(id) { for (var i = 0; i < M.creatives.length; i++) if (M.creatives[i].id === id) return M.creatives[i]; return null; }
  function info(id) { return S.creatives[id] || { campaigns: [], up: 0, down: 0, mine: 0, downloads: 0, feedback: 0 }; }
  function label(c) { return c.sizeName + ' ' + c.w + '×' + c.h + ' · ' + (c.kind === 'motion' ? 'Motion' : c.conceptName + ' still'); }
  function fileName(c) { return c.file.split('/').pop(); }
  function shortId(c) { return c.id.replace(SET + '-', ''); }
  function campaign(id) { for (var i = 0; i < S.campaigns.length; i++) if (S.campaigns[i].id === id) return S.campaigns[i]; return null; }
  function tracked(camp, c) {
    if (!camp || !camp.landing_url) return '';
    var u = new URL(camp.landing_url);
    var medium = camp.channel === 'email' ? 'email' : camp.channel === 'website' ? 'referral' : /linkedin|meta/.test(camp.channel) ? 'paid_social' : 'display';
    u.searchParams.set('utm_source', SOURCE[camp.channel] || 'other');
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', camp.utm_campaign || 'campaign-' + camp.id);
    u.searchParams.set('utm_content', shortId(c));
    return u.href;
  }

  // ---------------------------------------------------------------- zip (store only: JPEG/GIF are already compressed)
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  function save_(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function logDownloads(ids) {
    if (!online || !ids.length) return;
    api('downloads', { method: 'POST', body: { ids: ids }, keepalive: true }).then(function () {
      ids.forEach(function (id) { var x = S.creatives[id] || (S.creatives[id] = info(id)); x.downloads = (x.downloads || 0) + 1; });
    }).catch(function () {});
  }
  function downloadZip(list, name) {
    if (!list.length) return;
    if (list.length === 1) return downloadOne(list[0]);
    toast('Preparing ' + list.length + ' files…');
    Promise.all(list.map(function (c) {
      return fetch(BASE + c.file).then(function (r) { if (!r.ok) throw new Error(); return r.arrayBuffer(); }).then(function (b) {
        return { name: (c.kind === 'motion' ? 'motion/' : 'still/') + c.size + '/' + fileName(c), data: new Uint8Array(b) };
      });
    })).then(function (files) {
      save_(zip(files), name);
      toast('Downloaded ' + files.length + ' ads');
      logDownloads(list.map(function (c) { return c.id; }));
    }).catch(function () { toast('Download failed. Please try again.'); });
  }
  function downloadOne(c) {
    var a = h('a', { href: BASE + c.file, download: fileName(c) });
    document.body.appendChild(a); a.click(); a.remove();
    logDownloads([c.id]);
  }

  // ---------------------------------------------------------------- filtering
  function visible() {
    return M.creatives.filter(function (c) {
      if (f.show !== 'all' && c.concept !== f.show) return false;
      if (f.sizes.length && f.sizes.indexOf(c.size) < 0) return false;
      if (f.headline !== 'all' && c.headline !== f.headline) return false;
      return true;
    });
  }
  function setF(k, v) { f[k] = v; save('filters', f); renderToolbar(); renderGrid(); }

  // ---------------------------------------------------------------- toolbar
  function renderToolbar() {
    var bar = $('[data-toolbar]');
    bar.innerHTML = '';
    var show = h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Show' }, [h('span', { class: 'lbl', 'aria-hidden': 'true', text: 'Show' })]);
    SHOW.forEach(function (s) { show.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.show === s[0]), text: s[1], onclick: function () { setF('show', s[0]); } })); });
    var sizes = h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Sizes' }, [h('span', { class: 'lbl', 'aria-hidden': 'true', text: 'Size' })]);
    M.sizes.forEach(function (s) {
      var on = f.sizes.indexOf(s.id) >= 0;
      var k = 14 / Math.max(s.w, s.h);
      sizes.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), title: s.name, 'aria-label': s.name + ' ' + s.w + ' by ' + s.h,
        onclick: function () { var a = f.sizes.slice(); var i = a.indexOf(s.id); if (i < 0) a.push(s.id); else a.splice(i, 1); setF('sizes', a); } },
        [h('span', { class: 'shape', 'aria-hidden': 'true', style: 'width:' + Math.max(3, Math.round(s.w * k)) + 'px;height:' + Math.max(3, Math.round(s.h * k)) + 'px' }), s.w + '×' + s.h]));
    });
    var hs = h('select', { class: 'input', 'aria-label': 'Headline', onchange: function (e) { setF('headline', e.target.value); } },
      [h('option', { value: 'all', text: 'All headlines' })].concat(M.headlines.map(function (x) { return h('option', { value: x.id, selected: f.headline === x.id, text: x.text }); })));
    var grp = h('select', { class: 'input', 'aria-label': 'Group by', onchange: function (e) { setF('group', e.target.value); } }, [
      h('option', { value: 'size', selected: f.group === 'size', text: 'Group by size' }),
      h('option', { value: 'headline', selected: f.group === 'headline', text: 'Group by headline' })]);
    var any = f.show !== 'all' || f.sizes.length || f.headline !== 'all';
    bar.appendChild(show);
    bar.appendChild(sizes);
    bar.appendChild(h('div', { class: 'fgroup' }, [hs, grp, any ? h('button', { type: 'button', class: 'linkbtn', text: 'Clear filters', onclick: function () { f = { show: 'all', sizes: [], headline: 'all', group: f.group }; save('filters', f); renderToolbar(); renderGrid(); } }) : null]));
  }

  // ---------------------------------------------------------------- grid
  function card(c) {
    var x = info(c.id), on = picked.has(c.id);
    var badges = [];
    if (x.up) badges.push(h('span', { class: 'pill up', title: 'Approved by ' + x.up, text: '✓ ' + x.up }));
    if (x.down) badges.push(h('span', { class: 'pill down', title: x.down + ' asked for changes', text: '✎ ' + x.down }));
    if (x.feedback) badges.push(h('span', { class: 'pill', title: x.feedback + ' comments', text: '💬 ' + x.feedback }));
    if (x.campaigns.length) badges.push(h('span', { class: 'pill live', title: 'Used in ' + x.campaigns.length + ' campaign(s)', text: 'In ' + x.campaigns.length + ' campaign' + (x.campaigns.length > 1 ? 's' : '') }));
    return h('article', { class: 'card' + (on ? ' picked' : ''), style: 'width:' + (c.w + 28) + 'px', 'data-id': c.id }, [
      h('button', { type: 'button', class: 'pick', role: 'checkbox', 'aria-checked': String(on), 'aria-label': 'Select ' + label(c), html: on ? ICON.check : '',
        onclick: function () { togglePick(c.id); } }),
      h('button', { type: 'button', class: 'frame', 'aria-label': 'Open ' + label(c), onclick: function () { openDetail(c.id); } },
        [h('img', { src: BASE + c.file, width: c.w, height: c.h, loading: 'lazy', decoding: 'async', alt: (c.kind === 'motion' ? 'Animated ad: ' : 'Ad: ') + c.headlineText })]),
      h('div', { class: 'meta' }, [
        h('p', { class: 'title', text: c.w <= 200 ? c.headlineText : c.headlineText }),
        h('div', { class: 'sub' }, [h('span', { class: 'pill' + (c.kind === 'motion' ? ' motion' : ''), text: c.kind === 'motion' ? 'Motion' : c.conceptName }), c.format + ' · ' + kb(c.bytes)]),
        badges.length ? h('div', { class: 'sub' }, badges) : null,
        h('div', { class: 'row' }, [
          h('button', { type: 'button', class: 'btn line sm', text: 'Details', onclick: function () { openDetail(c.id); } }),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'iconbtn', title: 'Download ' + fileName(c), 'aria-label': 'Download ' + fileName(c), html: ICON.dl, onclick: function () { downloadOne(c); } }),
        ]),
      ]),
    ]);
  }
  function renderGrid() {
    var grid = $('[data-grid]');
    grid.innerHTML = '';
    var list = visible();
    if (!list.length) {
      grid.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'No ads match these filters' }), h('p', { text: 'Try another size or headline, or clear the filters.' })]));
      return;
    }
    var groups = f.group === 'headline'
      ? M.headlines.map(function (x) { return { key: x.id, title: x.text, dim: '', items: list.filter(function (c) { return c.headline === x.id; }) }; })
      : M.sizes.map(function (s) { return { key: s.id, title: s.name, dim: s.w + ' × ' + s.h, items: list.filter(function (c) { return c.size === s.id; }) }; });
    groups.forEach(function (g) {
      if (!g.items.length) return;
      var all = g.items.every(function (c) { return picked.has(c.id); });
      grid.appendChild(h('section', { class: 'group', 'aria-label': g.title }, [
        h('div', { class: 'group-head' }, [
          h('h2', { text: g.title }), g.dim ? h('span', { class: 'dim', text: g.dim }) : null,
          h('span', { class: 'dim', text: g.items.length + ' ads' }),
          h('button', { type: 'button', class: 'linkbtn', text: all ? 'Clear selection' : 'Select all ' + g.items.length,
            onclick: function () { g.items.forEach(function (c) { if (all) picked.delete(c.id); else picked.add(c.id); }); renderGrid(); renderSelbar(); } }),
        ]),
        h('div', { class: 'cards' }, g.items.map(card)),
      ]));
    });
    grid.classList.toggle('selecting', picked.size > 0);
  }
  function togglePick(id) {
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    var el = document.querySelector('.card[data-id="' + id + '"]');
    if (el) {
      var on = picked.has(id);
      el.classList.toggle('picked', on);
      var b = $('.pick', el); b.setAttribute('aria-checked', String(on)); b.innerHTML = on ? ICON.check : '';
    }
    $('[data-grid]').classList.toggle('selecting', picked.size > 0);
    renderSelbar();
  }

  // ---------------------------------------------------------------- selection bar
  function renderSelbar() {
    var bar = $('[data-selbar]');
    bar.innerHTML = '';
    bar.hidden = picked.size === 0;
    if (!picked.size) return;
    var list = M.creatives.filter(function (c) { return picked.has(c.id); });
    var kids = [h('span', {}, [h('b', { text: String(picked.size) }), ' selected']),
      h('button', { type: 'button', class: 'btn lime sm', html: ICON.dl + ' Download .zip', onclick: function () { downloadZip(list, SET + '-' + list.length + '-ads.zip'); } })];
    if (online) {
      var sel = h('select', { class: 'input', 'aria-label': 'Add selected ads to a campaign', style: 'min-height:36px;padding:6px 30px 6px 10px' },
        [h('option', { value: '', text: 'Add to campaign…' })].concat(S.campaigns.map(function (c) { return h('option', { value: c.id, text: c.name }); }), [h('option', { value: 'new', text: '+ New campaign' })]));
      sel.addEventListener('change', function () {
        var v = sel.value;
        if (v === 'new') return campaignForm(null, Array.from(picked));
        if (v) addToCampaign(parseInt(v, 10), Array.from(picked)).then(function () { picked.clear(); renderGrid(); renderSelbar(); });
      });
      kids.push(sel);
    }
    kids.push(h('button', { type: 'button', class: 'linkbtn', text: 'Clear', onclick: function () { picked.clear(); renderGrid(); renderSelbar(); } }));
    kids.forEach(function (k) { bar.appendChild(k); });
  }

  // ---------------------------------------------------------------- detail
  function openDetail(id, keepHash) {
    var c = byId(id);
    if (!c) return;
    detailId = id;
    var dlg = $('[data-detail]');
    if (!keepHash) history.replaceState(null, '', '#ad=' + id);
    renderDetail(c);
    if (!dlg.open) dlg.showModal();
    if (online) loadFeedback(c);
  }
  function step(d) {
    var list = visible();
    var i = list.findIndex(function (c) { return c.id === detailId; });
    if (i < 0) list = M.creatives, i = list.findIndex(function (c) { return c.id === detailId; });
    var n = list[(i + d + list.length) % list.length];
    openDetail(n.id);
  }
  function renderDetail(c) {
    var dlg = $('[data-detail]');
    var x = info(c.id);
    var zoom = dlg._zoom || 1;
    var img = h('img', { src: BASE + c.file, width: c.w * zoom, height: c.h * zoom, alt: (c.kind === 'motion' ? 'Animated ad: ' : 'Ad: ') + c.headlineText });
    var tools = [
      h('button', { type: 'button', class: 'btn line sm', 'aria-pressed': String(zoom === 2), text: zoom === 2 ? 'Actual size' : 'Zoom 2×', onclick: function () { dlg._zoom = zoom === 2 ? 1 : 2; renderDetail(c); } }),
    ];
    if (c.kind === 'motion') tools.unshift(h('button', { type: 'button', class: 'btn line sm', text: '↻ Replay', onclick: function () { img.src = BASE + c.file + '?r=' + Date.now(); } }));
    var specs = [['File', fileName(c)], ['Size', c.sizeName + ', ' + c.w + ' × ' + c.h + ' px'], ['Format', c.format + (c.kind === 'motion' ? ' (animated)' : '')], ['File size', kb(c.bytes) + ' (limit 150 KB)']];
    if (c.kind === 'motion') specs.push(['Animation', c.duration + ' s, plays twice (' + Math.round(c.duration * 2) + ' s), ends on the call to action']);
    specs.push(['Headline', c.headlineText]);
    if (c.size === '300x600' || c.size === '160x600') specs.push(['Description', c.desc]);
    specs.push(['Click-through', M.landingUrl]);

    var side = h('div', { class: 'side' }, [
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' }, [
        h('button', { type: 'button', class: 'btn lime', html: ICON.dl + ' Download ' + c.format, onclick: function () { downloadOne(c); } }),
        h('button', { type: 'button', class: 'btn line', text: 'Copy file name', onclick: function () { copy(fileName(c), 'File name'); } }),
      ]),
      h('section', {}, [h('h3', { text: 'Details' }), h('dl', { class: 'specs' }, specs.reduce(function (a, s) { return a.concat([h('dt', { text: s[0] }), h('dd', { text: s[1] })]); }, []))]),
    ]);
    if (online) {
      side.appendChild(h('section', { 'aria-labelledby': 'rv-h' }, [h('h3', { id: 'rv-h', text: 'Review' }), h('div', { class: 'react' }, [
        h('button', { type: 'button', class: 'btn line sm up', 'aria-pressed': String(x.mine === 1), text: '✓ Approve' + (x.up ? ' · ' + x.up : ''), onclick: function () { react(c, x.mine === 1 ? 0 : 1); } }),
        h('button', { type: 'button', class: 'btn line sm down', 'aria-pressed': String(x.mine === -1), text: '✎ Needs changes' + (x.down ? ' · ' + x.down : ''), onclick: function () { react(c, x.mine === -1 ? 0 : -1); } }),
      ]), h('p', { class: 'hint', 'data-who-reacted': '', style: 'margin:8px 0 0;font-size:12.5px;color:var(--yondr-moss)' })]));
      side.appendChild(usesSection(c));
      side.appendChild(feedbackSection(c));
    } else {
      side.appendChild(h('p', { class: 'notice', text: 'Sign in at ads.overyondrdev.com to review, comment and add ads to campaigns.' }));
    }

    dlg.innerHTML = '';
    dlg.appendChild(h('div', { class: 'sheet-head' }, [
      h('h2', { id: 'detail-title', text: label(c) }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Previous ad', html: ICON.prev, onclick: function () { step(-1); } }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Next ad', html: ICON.next, onclick: function () { step(1); } }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close', html: ICON.x, onclick: function () { dlg.close(); } }),
    ]));
    dlg.appendChild(h('div', { class: 'sheet-body' }, [h('div', { class: 'detail' }, [
      h('div', { class: 'stagebox' }, [h('div', { class: 'canvas' }, [img]), h('div', { class: 'tools' }, tools)]),
      side,
    ])]));
  }
  function usesSection(c) {
    var x = info(c.id);
    var used = x.campaigns.map(campaign).filter(Boolean);
    var avail = S.campaigns.filter(function (k) { return x.campaigns.indexOf(k.id) < 0; });
    var sel = h('select', { class: 'input', 'aria-label': 'Campaign to add this ad to' },
      [h('option', { value: '', text: avail.length ? 'Choose a campaign…' : 'No other campaigns yet' })].concat(avail.map(function (k) { return h('option', { value: k.id, text: k.name }); })));
    return h('section', {}, [
      h('h3', { text: 'Campaigns' }),
      used.length ? h('ul', { class: 'uses' }, used.map(function (k) {
        return h('li', {}, [h('span', { class: 'pill ' + k.status, text: STATUS[k.status] }), h('span', { class: 'name', text: k.name }),
          k.landing_url ? h('button', { type: 'button', class: 'iconbtn', title: 'Copy tracked link', 'aria-label': 'Copy tracked link for ' + k.name, html: ICON.link, onclick: function () { copy(tracked(k, c), 'Tracked link'); } }) : null,
          h('button', { type: 'button', class: 'iconbtn', title: 'Remove from campaign', 'aria-label': 'Remove from ' + k.name, html: ICON.x, onclick: function () { removeFromCampaign(k.id, [c.id]); } })]);
      })) : h('p', { style: 'margin:0 0 10px;font-size:14px;color:var(--yondr-moss)', text: 'Not used in a campaign yet.' }),
      h('div', { class: 'addrow', style: 'margin-top:10px' }, [sel,
        h('button', { type: 'button', class: 'btn forest sm', text: 'Add', onclick: function () { if (sel.value) addToCampaign(parseInt(sel.value, 10), [c.id]); } }),
        h('button', { type: 'button', class: 'btn line sm', text: '+ New campaign', onclick: function () { campaignForm(null, [c.id]); } })]),
    ]);
  }
  function feedbackSection(c) {
    var type = 'design';
    var ta = h('textarea', { class: 'input', rows: 3, maxlength: 5000, placeholder: 'What works, what should change? Be specific: copy, colour, image, legibility…', 'aria-label': 'Your feedback on this ad' });
    var chips = h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Kind of feedback' });
    FB_TYPES.forEach(function (t) {
      chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(t[0] === type), text: t[1], onclick: function (e) {
        type = t[0]; chips.querySelectorAll('.chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b === e.currentTarget)); });
      } }));
    });
    var errEl = h('p', { class: 'err', role: 'alert' });
    var send = h('button', { type: 'submit', class: 'btn forest sm', text: 'Send feedback' });
    var form = h('form', { class: 'form', onsubmit: function (e) {
      e.preventDefault();
      if (!ta.value.trim()) { errEl.textContent = 'Write a comment first.'; ta.focus(); return; }
      send.disabled = true; errEl.textContent = '';
      api('creatives/' + c.id + '/feedback', { method: 'POST', body: { type: type, message: ta.value, adTitle: label(c) + ' · ' + c.headlineText, file: c.file } })
        .then(function (r) { ta.value = ''; info(c.id); (S.creatives[c.id] = S.creatives[c.id] || info(c.id)).feedback = r.items.length; paintFeedback(r); toast('Thanks! Your feedback is in.'); renderGrid(); })
        .catch(function (e2) { errEl.textContent = e2.message; })
        .then(function () { send.disabled = false; });
    } }, [chips, ta, errEl, h('div', { class: 'foot' }, [send])]);
    return h('section', {}, [h('h3', { text: 'Feedback' }), h('ul', { class: 'fb-list', 'data-fb-list': '' }, [h('li', { text: 'Loading…' })]), h('div', { style: 'height:12px' }), form]);
  }
  function paintFeedback(r) {
    var ul = $('[data-fb-list]');
    if (!ul) return;
    ul.innerHTML = '';
    if (!r.items.length) ul.appendChild(h('li', { style: 'color:var(--yondr-moss)', text: 'No comments yet. Be the first.' }));
    r.items.forEach(function (i) {
      var t = FB_TYPES.find(function (x) { return x[0] === i.type; });
      ul.appendChild(h('li', {}, [h('div', { class: 'by' }, [h('b', { text: person(i.author_email) }), '· ' + ago(i.created_at), h('span', { class: 'pill', text: t ? t[1] : i.type }),
        i.status !== 'new' ? h('span', { class: 'pill', text: i.status.replace('_', ' ') }) : null]), h('p', { text: i.message })]));
    });
    var who = $('[data-who-reacted]');
    if (who) {
      var up = r.reactions.filter(function (x) { return x.value === 1; }).map(function (x) { return person(x.email); });
      var dn = r.reactions.filter(function (x) { return x.value === -1; }).map(function (x) { return person(x.email); });
      who.textContent = [up.length ? 'Approved by ' + up.join(', ') : '', dn.length ? 'Changes asked by ' + dn.join(', ') : ''].filter(Boolean).join(' · ');
    }
  }
  function loadFeedback(c) {
    api('creatives/' + c.id + '/feedback').then(function (r) { if (detailId === c.id) paintFeedback(r); }).catch(function () {});
  }
  function react(c, v) {
    api('creatives/' + c.id + '/reaction', { method: 'POST', body: { value: v } }).then(function (r) {
      var x = S.creatives[c.id] = S.creatives[c.id] || info(c.id);
      x.up = r.up; x.down = r.down; x.mine = r.mine;
      renderDetail(c); loadFeedback(c); renderGrid();
    }).catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- campaigns: data
  function refresh() {
    return api('state').then(function (r) {
      online = true; S = r;
      $('[data-campaign-count]').textContent = String(S.campaigns.length);
      $('[data-notice]').hidden = true;
    }).catch(function (e) {
      online = false;
      var n = $('[data-notice]');
      n.hidden = false;
      n.textContent = 'You can view and download every ad. Reviews, comments and campaign tracking need you to be signed in at ads.overyondrdev.com (' + e.message + ')';
    });
  }
  function rerender() {
    renderGrid(); renderSelbar();
    if (tab === 'campaigns') renderCampaigns();
    var dlg = $('[data-detail]');
    if (dlg.open && detailId) { renderDetail(byId(detailId)); loadFeedback(byId(detailId)); }
  }
  function addToCampaign(id, ids) {
    return api('campaigns/' + id + '/items', { method: 'POST', body: { add: ids } }).then(function () {
      toast('Added ' + ids.length + ' ad' + (ids.length > 1 ? 's' : '') + ' to ' + (campaign(id) || {}).name);
      return refresh().then(rerender);
    }).catch(function (e) { toast(e.message); });
  }
  function removeFromCampaign(id, ids) {
    return api('campaigns/' + id + '/items', { method: 'POST', body: { remove: ids } }).then(function () { toast('Removed'); return refresh().then(rerender); })
      .catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- campaign form
  function campaignForm(existing, ids) {
    var dlg = $('[data-campaign-form]');
    var c = existing || { name: '', channel: 'google-display', status: 'planned', start_date: '', end_date: '', landing_url: M.landingUrl, utm_campaign: '', owner_email: S.me ? S.me.email : '', notes: '' };
    var field = function (name, lbl, input, hint) { input.name = name; return h('label', {}, [lbl, input, hint ? h('span', { class: 'hint', text: hint }) : null]); };
    var name = h('input', { class: 'input', required: true, maxlength: 120, value: c.name || '', placeholder: 'e.g. Google Display, school leaders, Dec 2026' });
    var utm = h('input', { class: 'input', maxlength: 80, value: c.utm_campaign || '', placeholder: 'harvard-study-google-dec' });
    name.addEventListener('input', function () { if (!existing && !utm.dataset.touched) utm.value = name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
    utm.addEventListener('input', function () { utm.dataset.touched = '1'; });
    var opt = function (map, cur) { return Object.keys(map).map(function (k) { return h('option', { value: k, selected: k === cur, text: map[k] }); }); };
    var errEl = h('p', { class: 'err', role: 'alert' });
    var withSel = ids && ids.length ? h('input', { type: 'checkbox', checked: true }) : null;
    var form = h('form', { class: 'form', style: 'padding:20px', onsubmit: function (e) {
      e.preventDefault();
      var fd = new FormData(form), body = {};
      ['name', 'channel', 'status', 'start_date', 'end_date', 'landing_url', 'utm_campaign', 'owner_email', 'notes'].forEach(function (k) { body[k] = fd.get(k) || ''; });
      if (!existing && withSel && withSel.checked) body.creatives = ids;
      errEl.textContent = '';
      var p = existing ? api('campaigns/' + existing.id, { method: 'PATCH', body: body }) : api('campaigns', { method: 'POST', body: body });
      p.then(function (r) {
        dlg.close();
        toast(existing ? 'Campaign saved' : 'Campaign added');
        if (!existing) { openCampaign = r.id; if (body.creatives) { picked.clear(); } }
        return refresh().then(rerender);
      }).catch(function (e2) { errEl.textContent = e2.message; });
    } }, [
      field('name', 'Campaign name', name),
      h('div', { class: 'two' }, [
        field('channel', 'Channel', h('select', { class: 'input' }, opt(CHANNELS, c.channel))),
        field('status', 'Status', h('select', { class: 'input' }, opt(STATUS, c.status)))]),
      h('div', { class: 'two' }, [
        field('start_date', 'Starts', h('input', { class: 'input', type: 'date', value: c.start_date || '' })),
        field('end_date', 'Ends', h('input', { class: 'input', type: 'date', value: c.end_date || '' }))]),
      field('landing_url', 'Landing page', h('input', { class: 'input', type: 'url', value: c.landing_url || '', placeholder: 'https://www.overyondr.com/…' }), 'Where clicks go. Tracked links add UTM tags for each ad.'),
      h('div', { class: 'two' }, [
        field('utm_campaign', 'UTM campaign', utm, 'utm_campaign in tracked links'),
        field('owner_email', 'Owner', h('input', { class: 'input', type: 'email', value: c.owner_email || '', placeholder: 'name@overyondr.com' }))]),
      field('notes', 'Notes', h('textarea', { class: 'input', rows: 3, maxlength: 4000, placeholder: 'Audience, budget, placements, results…', text: c.notes || '' })),
      withSel ? h('label', { style: 'flex-direction:row;align-items:center;gap:10px;font-weight:600' }, [withSel, 'Include the ' + ids.length + ' selected ad' + (ids.length > 1 ? 's' : '')]) : null,
      errEl,
      h('div', { class: 'foot' }, [h('button', { type: 'button', class: 'btn line', text: 'Cancel', onclick: function () { dlg.close(); } }),
        h('button', { type: 'submit', class: 'btn forest', text: existing ? 'Save campaign' : 'Add campaign' })]),
    ]);
    dlg.innerHTML = '';
    dlg.appendChild(h('div', { class: 'sheet-head' }, [h('h2', { id: 'cf-title', text: existing ? 'Edit campaign' : 'New campaign' }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close', html: ICON.x, onclick: function () { dlg.close(); } })]));
    dlg.appendChild(h('div', { class: 'sheet-body' }, [form]));
    var det = $('[data-detail]');
    if (det.open) det.close();
    dlg.showModal();
    name.focus();
  }

  // ---------------------------------------------------------------- campaigns tab
  function renderCampaigns() {
    var p = $('[data-panel="campaigns"]');
    p.innerHTML = '';
    p.appendChild(h('div', { class: 'camp-head' }, [
      h('h2', { text: 'Campaigns' }),
      online ? h('a', { class: 'btn line sm', href: API + 'campaigns.csv?set=' + SET, text: 'Export CSV' }) : null,
      online ? h('button', { type: 'button', class: 'btn forest sm', text: '+ New campaign', onclick: function () { campaignForm(null, Array.from(picked)); } }) : null,
      h('p', { text: 'Log every campaign these ads run in: channel, dates, landing page and which ads it uses. Each ad gets a tracked link with UTM tags so results can be compared ad by ad.' }),
    ]));
    if (!online) { p.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'Sign in to see campaigns' }), h('p', { text: 'Campaign tracking is saved on ads.overyondrdev.com.' })])); return; }
    if (!S.campaigns.length) {
      p.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'No campaigns yet' }),
        h('p', { text: 'Add the first one, then pick the ads it uses: select ads on the Ads tab and choose “Add to campaign”.' }),
        h('button', { type: 'button', class: 'btn forest', style: 'margin-top:14px', text: '+ New campaign', onclick: function () { campaignForm(null, Array.from(picked)); } })]));
      return;
    }
    var wrap = h('div', { class: 'camps' });
    S.campaigns.forEach(function (k) {
      var ads = M.creatives.filter(function (c) { return info(c.id).campaigns.indexOf(k.id) >= 0; });
      var dates = [fmtDate(k.start_date), fmtDate(k.end_date)].filter(Boolean).join(' – ');
      var det = h('details', { class: 'camp', open: openCampaign === k.id, ontoggle: function () { if (det.open) openCampaign = k.id; } }, [
        h('summary', {}, [
          h('div', {}, [h('p', { class: 'cname', text: k.name }), h('div', { class: 'cmeta' }, [
            h('span', { class: 'pill ' + k.status, text: STATUS[k.status] }), h('span', { text: CHANNELS[k.channel] || k.channel }),
            dates ? h('span', { text: dates }) : null, k.owner_email ? h('span', { text: 'Owner: ' + person(k.owner_email) }) : null])]),
          h('div', { class: 'nads' }, [String(ads.length), h('small', { text: ads.length === 1 ? 'ad' : 'ads' })]),
        ]),
        h('div', { class: 'camp-body' }, [
          h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' }, [
            h('button', { type: 'button', class: 'btn forest sm', text: '+ Add ads', onclick: function () { addAdsMode(k); } }),
            ads.length ? h('button', { type: 'button', class: 'btn lime sm', html: ICON.dl + ' Download ' + ads.length + ' ads (.zip)', onclick: function () { downloadZip(ads, (k.utm_campaign || 'campaign-' + k.id) + '.zip'); } }) : null,
            h('button', { type: 'button', class: 'btn line sm', text: 'Edit details', onclick: function () { campaignForm(k); } }),
            h('select', { class: 'input', 'aria-label': 'Status', style: 'min-height:36px;padding:6px 30px 6px 10px', onchange: function (e) {
              api('campaigns/' + k.id, { method: 'PATCH', body: { status: e.target.value } }).then(function () { toast('Status updated'); return refresh().then(rerender); }).catch(function (er) { toast(er.message); });
            } }, Object.keys(STATUS).map(function (s) { return h('option', { value: s, selected: s === k.status, text: 'Status: ' + STATUS[s] }); })),
            h('span', { style: 'flex:1' }),
            (S.me && (S.me.isAdmin || k.created_by === S.me.email)) ? h('button', { type: 'button', class: 'linkbtn', style: 'color:#a3260b', text: 'Delete campaign', onclick: function () {
              if (!confirm('Delete “' + k.name + '”? The ads stay in the library.')) return;
              api('campaigns/' + k.id, { method: 'DELETE' }).then(function () { toast('Campaign deleted'); return refresh().then(rerender); }).catch(function (er) { toast(er.message); });
            } }) : null,
          ]),
          h('dl', { class: 'specs' }, [
            h('dt', { text: 'Landing page' }), h('dd', {}, [k.landing_url ? h('a', { href: k.landing_url, target: '_blank', rel: 'noopener', text: k.landing_url }) : 'Not set']),
            h('dt', { text: 'UTM campaign' }), h('dd', { text: k.utm_campaign || '—' }),
            h('dt', { text: 'Added' }), h('dd', { text: person(k.created_by) + ', ' + ago(k.created_at) }),
            k.notes ? h('dt', { text: 'Notes' }) : null, k.notes ? h('dd', { style: 'white-space:pre-wrap;font-weight:400', text: k.notes }) : null,
          ]),
          ads.length ? h('div', { class: 'thumbs' }, ads.map(function (c) {
            return h('div', { class: 'thumb' }, [
              h('button', { type: 'button', class: 'tframe', 'aria-label': 'Open ' + label(c), onclick: function () { openDetail(c.id); } }, [h('img', { src: BASE + c.file, alt: '', loading: 'lazy' })]),
              h('span', { text: c.w + '×' + c.h + ' · ' + (c.kind === 'motion' ? 'Motion' : c.conceptName) + ' · ' + c.headline.toUpperCase() }),
              h('div', { class: 'tools' }, [
                k.landing_url ? h('button', { type: 'button', class: 'btn line', html: ICON.link + ' Tracked link', onclick: function () { copy(tracked(k, c), 'Tracked link'); } }) : null,
                h('button', { type: 'button', class: 'btn line', text: 'Remove', 'aria-label': 'Remove ' + label(c) + ' from ' + k.name, onclick: function () { removeFromCampaign(k.id, [c.id]); } }),
              ]),
            ]);
          })) : h('p', { style: 'margin:0;color:var(--yondr-moss)', text: 'No ads in this campaign yet. Use “Add ads”.' }),
        ]),
      ]);
      wrap.appendChild(det);
    });
    p.appendChild(wrap);
  }
  function addAdsMode(k) {
    setTab('ads');
    toast('Select ads, then choose “' + k.name + '” in the bar below');
    picked.clear(); renderGrid(); renderSelbar();
  }

  // ---------------------------------------------------------------- copy & specs tab
  function renderCopy() {
    var p = $('[data-panel="copy"]');
    if (p.childNodes.length) return;
    var line = function (text, limit) {
      var n = text.length;
      return h('li', {}, [h('span', { class: 'txt', text: text }), limit ? h('span', { class: 'n' + (n > limit ? ' over' : ''), title: 'Google Ads limit: ' + limit, text: n + '/' + limit }) : null,
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Copy: ' + text, title: 'Copy', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>', onclick: function () { copy(text); } })]);
    };
    var all = ['HEADLINES (30 characters max)'].concat(M.headlines.map(function (x) { return x.text; }), ['', 'LONG HEADLINE (90 max)', M.longHeadline, '', 'DESCRIPTIONS (90 max)'],
      M.headlines.map(function (x) { return x.desc; }), ['', 'CALL TO ACTION', M.cta, '', 'FINAL URL', M.landingUrl]).join('\n');
    var motion = M.creatives.find(function (c) { return c.kind === 'motion'; });
    var rows = [
      ['Sizes', M.sizes.map(function (s) { return s.name + ' ' + s.w + '×' + s.h; }).join(' · ')],
      ['Stills', 'JPEG, sRGB, baseline. Two visuals per headline: the pouch on its own, and students using it'],
      ['Motion', 'Animated GIF, ' + (motion ? motion.duration : 13.6) + ' s, plays twice (about 27 s, under the 30 s limit) and stops on the end card with logo and call to action'],
      ['File size', 'Every file is under 150 KB (largest ' + kb(Math.max.apply(null, M.creatives.map(function (c) { return c.bytes; }))) + ')'],
      ['Headlines', M.headlines.length + ' variants, each in every size'],
      ['Claim source', 'Center for Education Policy Research (CEPR), Harvard University, 2026. Shown on the larger sizes'],
      ['Click-through', M.landingUrl],
      ['Made with', 'scripts/ads in the website repo (V2 design: Fraunces + Instrument Sans, forest, lime and cream)'],
    ];
    p.appendChild(h('div', { class: 'copy-grid' }, [
      h('section', { class: 'panel' }, [h('h2', { text: 'Ad copy' }),
        h('p', { text: 'Text for responsive display, search and social ads. Counts show Google Ads limits.' }),
        h('h3', { class: 'lbl', style: 'font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--yondr-moss);margin:0 0 8px', text: 'Headlines' }),
        h('ul', { class: 'lines' }, M.headlines.map(function (x) { return line(x.text, 30); })),
        h('h3', { style: 'font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--yondr-moss);margin:18px 0 8px', text: 'Long headline' }),
        h('ul', { class: 'lines' }, [line(M.longHeadline, 90)]),
        h('h3', { style: 'font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--yondr-moss);margin:18px 0 8px', text: 'Descriptions' }),
        h('ul', { class: 'lines' }, M.headlines.map(function (x) { return line(x.desc, 90); })),
        h('h3', { style: 'font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--yondr-moss);margin:18px 0 8px', text: 'Call to action' }),
        h('ul', { class: 'lines' }, [line(M.cta, 0)]),
        h('button', { type: 'button', class: 'btn forest sm', style: 'margin-top:16px', text: 'Copy all as text', onclick: function () { copy(all, 'All ad copy'); } }),
      ]),
      h('div', { style: 'display:flex;flex-direction:column;gap:24px' }, [
        h('section', { class: 'panel' }, [h('h2', { text: 'Specs' }), h('table', { class: 'spec' }, [h('tbody', {}, rows.map(function (r) { return h('tr', {}, [h('th', { scope: 'row', text: r[0] }), h('td', { text: r[1] })]); }))])]),
        M.sources && M.sources.length ? h('section', { class: 'panel' }, [h('h2', { text: 'Source images' }), h('p', { text: 'The pouch and photos used in these ads, for other formats.' }),
          h('div', { class: 'sources' }, M.sources.map(function (s) {
            return h('a', { href: BASE + s.file, download: s.file.split('/').pop() }, [h('img', { src: BASE + s.file, alt: s.alt, loading: 'lazy', class: /\.png$/.test(s.file) ? 'contain' : null }), s.name + ' ↓']);
          }))]) : null,
      ]),
    ]));
  }

  // ---------------------------------------------------------------- tabs + routing
  function setTab(t, fromHash) {
    tab = t;
    document.querySelectorAll('[data-tab]').forEach(function (b) { var on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== t; });
    $('[data-selbar]').hidden = t !== 'ads' || picked.size === 0;
    if (t === 'campaigns') renderCampaigns();
    if (t === 'copy') renderCopy();
    if (!fromHash) history.replaceState(null, '', t === 'ads' ? location.pathname : '#' + t);
  }
  document.querySelectorAll('[data-tab]').forEach(function (b, i, all) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var n = all[(i + d + all.length) % all.length]; n.focus(); setTab(n.dataset.tab);
    });
  });
  var detailDlg = $('[data-detail]');
  detailDlg.addEventListener('close', function () { detailId = null; if (/^#ad=/.test(location.hash)) history.replaceState(null, '', tab === 'ads' ? location.pathname : '#' + tab); });
  detailDlg.addEventListener('click', function (e) { if (e.target === detailDlg) detailDlg.close(); });
  $('[data-campaign-form]').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
  document.addEventListener('keydown', function (e) {
    if (!detailDlg.open || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
  });
  $('[data-download-all]').addEventListener('click', function () { if (M) downloadZip(M.creatives, SET + '-all-ads.zip'); });

  function route() {
    var m = /^#ad=([a-z0-9-]+)/.exec(location.hash);
    if (m) { setTab('ads', true); openDetail(m[1], true); return; }
    var t = location.hash.slice(1);
    if (t === 'campaigns' || t === 'copy') setTab(t, true);
  }

  // ---------------------------------------------------------------- boot
  fetch(BASE + 'manifest.json').then(function (r) { return r.json(); }).then(function (m) {
    M = m;
    renderToolbar(); renderGrid();
    route();
    return refresh().then(rerender);
  }).catch(function () { $('[data-grid]').innerHTML = '<p class="notice">The ads couldn’t be loaded. Please refresh the page.</p>'; });
})();
