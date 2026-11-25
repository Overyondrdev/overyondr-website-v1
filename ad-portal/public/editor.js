/* "Edit copy" tab (editors and admins). Change the tagline, CTA, stat, source lines, headlines and descriptions,
 * see the ad update as you type, then save: the affected ads are re-rendered in this browser (render.js),
 * uploaded over the old files, and go back to "In review". Ads uploaded by hand aren't touched. */
(function () {
  'use strict';
  var GOOGLE = { headline: 30, desc: 90 };
  var VIEWS = { pouch: 'Pouch still', 'in-use': 'In-use still', motion: 'Motion' };
  var GLOBAL = [
    ['eyebrow', 'Tagline', 40, 'The label above the headline, e.g. “New Harvard study”.'],
    ['cta', 'Button', 24, 'The call to action on every size except 320×50.'],
    ['ctaShort', 'Button on 320×50', 14, 'The mobile banner has less room. Keep it short.'],
  ];
  var STAT = [['big', 'Stat number', 8, ''], ['unit', 'Stat words', 60, 'Shown big in the motion ads.'], ['note', 'Stat note', 60, 'Small line under the stat in the motion ads.']];
  var SOURCE = [['source', 'Source line (Half Page)', 140, ''], ['sourceShort', 'Source line (other sizes)', 60, '']];

  var ctx, h, panel, draft, saved, busy = false, cancel = false;
  var preview = { headline: 'h1', size: '300x250', view: 'in-use', playing: 0 };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function get(c, path) { var p = path.split('.'); return p.length > 1 ? (c[p[0]] || {})[p[1]] : c[p[0]]; }
  function set(c, path, v) { var p = path.split('.'); if (p.length > 1) { c[p[0]] = c[p[0]] || {}; c[p[0]][p[1]] = v; } else c[p[0]] = v; }

  // Which copy fields changed, and which ads they appear on (mirrors generator/ad.html).
  function changes() {
    var out = [];
    GLOBAL.concat(SOURCE).forEach(function (f) { if (draft[f[0]] !== saved[f[0]]) out.push(f[0]); });
    STAT.forEach(function (f) { if (get(draft, 'stat.' + f[0]) !== get(saved, 'stat.' + f[0])) out.push('stat.' + f[0]); });
    (draft.headlines || []).forEach(function (x, i) {
      var o = saved.headlines[i];
      if (x.text !== o.text) out.push(x.id + '.text');
      if (x.desc !== o.desc) out.push(x.id + '.desc');
    });
    return out;
  }
  function affected(changed) {
    var M = ctx.model();
    return M.ads.filter(function (a) {
      var m = a.meta || {};
      if (!m.generated || a.status === 'archived') return false;
      var big = a.size === '300x600';
      return changed.some(function (k) {
        if (k === 'eyebrow' || k === 'stat.big') return true;
        if (k === 'cta') return a.size !== '320x50';
        if (k === 'ctaShort') return a.size === '320x50';
        if (k === 'source') return big;
        if (k === 'sourceShort') return !big;
        if (k === 'stat.unit' || k === 'stat.note') return a.variant === 'motion';
        var hm = /^(h\d+)\.(text|desc)$/.exec(k);
        return hm && m.headlineId === hm[1];
      });
    });
  }
  function estimate(list) {
    var s = list.reduce(function (n, a) { return n + (a.variant === 'motion' ? (a.w * a.h > 100000 ? 28 : 18) : 0.6); }, 0);
    return s < 60 ? 'under a minute' : 'about ' + Math.ceil(s / 60) + ' minute' + (s >= 120 ? 's' : '');
  }

  // ------------------------------------------------------------------ preview
  var pv = { frame: null, ready: null };
  // Moving an iframe in the page reloads it, so wait for its load event each time it's (re)mounted.
  function mount(stage) {
    if (!pv.frame) pv.frame = h('iframe', { title: 'Ad preview', tabindex: '-1', class: 'pv-frame' });
    if (pv.frame.parentNode === stage) return;
    pv.ready = new Promise(function (ok) { pv.frame.addEventListener('load', function () { ok(pv.frame); }, { once: true }); });
    if (!pv.frame.getAttribute('src')) pv.frame.src = '/render/ad.html';
    stage.appendChild(pv.frame);
  }
  function previewFrame() { return pv.ready || Promise.reject(new Error('no preview')); }
  function sizeOf(id) { return (draft.sizes || []).find(function (s) { return s.id === id; }) || { id: id, w: +id.split('x')[0], h: +id.split('x')[1] }; }
  var pending = 0;
  function drawPreview(play) {
    var my = ++pending;
    previewFrame().catch(function () {}).then(function (fr) {
      if (!fr) return;
      var win = fr.contentWindow;
      if (!win || !win.build) return;
      var size = sizeOf(preview.size), hd = draft.headlines.find(function (x) { return x.id === preview.headline; }) || draft.headlines[0];
      return win.build({ c: draft, size: size, h: hd, view: preview.view, base: '' }).then(function (info) {
        if (my !== pending) return;
        var box = panel.querySelector('.pv-stage');
        var scale = Math.min(1.6, (box.clientWidth - 24) / size.w, 560 / size.h);
        fr.style.width = size.w + 'px'; fr.style.height = size.h + 'px';
        fr.style.transform = 'scale(' + scale + ')';
        box.style.height = Math.round(size.h * scale + 24) + 'px';
        fr.contentDocument.body.style.margin = '0';
        cancelAnimationFrame(preview.playing);
        if (preview.view === 'motion' && play) {
          var t0 = performance.now();
          var tick = function (now) { var t = (now - t0) / 1000; win.seek(Math.min(t, info.duration)); if (t < info.duration && my === pending) preview.playing = requestAnimationFrame(tick); };
          preview.playing = requestAnimationFrame(tick);
        } else win.seek(1e6);
      });
    });
  }

  // ------------------------------------------------------------------ form
  function field(path, lbl, max, hint, multiline) {
    var v = get(draft, path) || '';
    var input = h(multiline ? 'textarea' : 'input', { class: 'input', value: multiline ? null : v, text: multiline ? v : null, rows: multiline ? 2 : null, maxlength: max * 2, 'data-path': path });
    var count = h('span', { class: 'n' });
    var paint = function () {
      var n = input.value.length;
      count.textContent = n + '/' + max;
      count.className = 'n' + (n > max ? ' over' : '');
      var changedNow = input.value !== (get(saved, path) || '');
      input.classList.toggle('changed', changedNow);
    };
    input.addEventListener('input', function () {
      set(draft, path, input.value);
      paint(); summary();
      clearTimeout(input._t); input._t = setTimeout(function () { drawPreview(false); syncPickers(); }, 120);
    });
    paint();
    return h('label', { class: 'ef' }, [h('span', { class: 'ef-top' }, [lbl, count]), input, hint ? h('span', { class: 'hint', text: hint }) : null]);
  }
  // Headline fields live in draft.headlines[i]; give them paths the generic field() understands.
  function headlineField(i, key, lbl, max, hint, multiline) {
    var path = 'headlines.' + i;
    var x = draft.headlines[i];
    var input = h(multiline ? 'textarea' : 'input', { class: 'input', value: multiline ? null : x[key], text: multiline ? x[key] : null, rows: multiline ? 2 : null, maxlength: max * 2 });
    var count = h('span', { class: 'n' });
    var paint = function () {
      var n = input.value.length;
      count.textContent = n + '/' + max; count.className = 'n' + (n > max ? ' over' : '');
      input.classList.toggle('changed', input.value !== saved.headlines[i][key]);
    };
    input.addEventListener('focus', function () { if (preview.headline !== x.id) { preview.headline = x.id; syncPickers(); drawPreview(false); } });
    input.addEventListener('input', function () {
      x[key] = input.value; paint(); summary();
      preview.headline = x.id;
      clearTimeout(input._t); input._t = setTimeout(function () { drawPreview(false); syncPickers(); }, 120);
    });
    paint();
    return h('label', { class: 'ef' }, [h('span', { class: 'ef-top' }, [lbl, count]), input, hint ? h('span', { class: 'hint', text: hint }) : null]);
  }

  function syncPickers() {
    panel.querySelectorAll('[data-pv]').forEach(function (s) { s.value = preview[s.dataset.pv]; });
  }
  function summary() {
    var bar = panel.querySelector('.ed-bar');
    if (!bar || busy) return;
    var ch = changes(), list = affected(ch);
    bar.innerHTML = '';
    var over = panel.querySelectorAll('.n.over').length;
    bar.appendChild(h('div', { class: 'ed-sum' }, ch.length
      ? [h('b', { text: ch.length + ' change' + (ch.length > 1 ? 's' : '') }), list.length ? ' · re-renders ' + list.length + ' ad' + (list.length > 1 ? 's' : '') + ' (' + estimate(list) + ')' : ' · no ad images change',
        over ? h('span', { class: 'danger', text: ' · ' + over + ' over the suggested length' }) : null]
      : ['No changes yet. Edit a field to see the ad update.']));
    bar.appendChild(h('button', { type: 'button', class: 'btn line sm', text: 'Discard', disabled: !ch.length, onclick: function () { draft = clone(saved); paint(); } }));
    bar.appendChild(h('button', { type: 'button', class: 'btn forest sm', text: list.length ? 'Save and update ' + list.length + ' ads' : 'Save', disabled: !ch.length, onclick: function () { save(ch, list); } }));
  }

  function paint() {
    panel.innerHTML = '';
    var M = ctx.model();
    if (!saved.headlines || !saved.cta) {
      panel.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'This ad set has no editable copy' }), h('p', { text: 'Only ads made with the ad template can be edited here. To change an uploaded ad, upload a new file.' })]));
      return;
    }
    var gen = M.ads.filter(function (a) { return a.meta && a.meta.generated; }).length;
    panel.appendChild(h('div', { class: 'camp-head' }, [h('h2', { text: 'Edit ad copy' }),
      h('p', { text: 'Changes apply to every ad that shows them (' + gen + ' template ads in this set). Saving re-renders those ads in this browser and uploads them; they go back to “In review” so they can be checked. Ads uploaded by hand aren’t changed.' })]));

    var form = h('div', { class: 'ed-form' }, [
      h('fieldset', { class: 'panel' }, [h('legend', { text: 'On every ad' })].concat(GLOBAL.map(function (f) { return field(f[0], f[1], f[2], f[3]); }))),
      h('fieldset', { class: 'panel' }, [h('legend', { text: 'Headlines and descriptions' }),
        h('p', { class: 'hint', text: 'Each headline has its own set of ads in every size. Descriptions show on the Half Page and Wide Skyscraper. Counts are Google Ads limits.' })]
        .concat(draft.headlines.map(function (x, i) {
          return h('div', { class: 'ed-head' }, [h('span', { class: 'pill', text: 'Headline ' + (i + 1) }),
            headlineField(i, 'text', 'Headline', GOOGLE.headline), headlineField(i, 'desc', 'Description', GOOGLE.desc, '', true)]);
        }))),
      h('fieldset', { class: 'panel' }, [h('legend', { text: 'Stat and source' })].concat(STAT.map(function (f) { return field('stat.' + f[0], f[1], f[2], f[3]); }), SOURCE.map(function (f) { return field(f[0], f[1], f[2], f[3]); }))),
    ]);

    var pick = function (key, opts) {
      return h('select', { class: 'input', 'data-pv': key, 'aria-label': 'Preview ' + key, onchange: function (e) { preview[key] = e.target.value; drawPreview(preview.view === 'motion'); } },
        opts.map(function (o) { return h('option', { value: o[0], selected: preview[key] === o[0], text: o[1] }); }));
    };
    var side = h('div', { class: 'ed-preview' }, [h('div', { class: 'panel' }, [
      h('h3', { text: 'Preview' }),
      h('div', { class: 'addrow' }, [
        pick('headline', draft.headlines.map(function (x, i) { return [x.id, 'Headline ' + (i + 1)]; })),
        pick('size', (draft.sizes || []).map(function (s) { return [s.id, s.w + '×' + s.h]; })),
        pick('view', Object.keys(VIEWS).map(function (k) { return [k, VIEWS[k]]; })),
      ]),
      h('div', { class: 'pv-stage' }),
      h('div', { class: 'addrow' }, [h('button', { type: 'button', class: 'btn line sm', text: '▶ Play motion', onclick: function () { preview.view = 'motion'; syncPickers(); drawPreview(true); } }),
        h('span', { class: 'hint', text: 'Updates as you type. Text that doesn’t fit shrinks; keep an eye on long lines.' })]),
    ])]);
    panel.appendChild(h('div', { class: 'ed-grid' }, [form, side]));
    panel.appendChild(h('div', { class: 'ed-bar', role: 'region', 'aria-label': 'Save changes' }));
    mount(panel.querySelector('.pv-stage'));
    drawPreview(false);
    summary();
  }

  // ------------------------------------------------------------------ save: render, then copy, then upload
  function save(changed, list) {
    if (busy) return;
    busy = true; cancel = false;
    var bar = panel.querySelector('.ed-bar');
    var prog = h('progress', { max: list.length || 1, value: 0 });
    var status = h('span', { class: 'ed-sum', text: 'Starting…' });
    bar.innerHTML = '';
    bar.appendChild(h('div', { class: 'ed-prog' }, [status, prog]));
    bar.appendChild(h('button', { type: 'button', class: 'btn line sm', text: 'Stop', onclick: function () { cancel = true; status.textContent = 'Stopping…'; } }));
    var leave = function (e) { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    var host = document.createElement('div');
    document.body.appendChild(host);
    var rendered = [], failed = [];
    var byId = {};
    draft.headlines.forEach(function (x) { byId[x.id] = x; });
    var oldText = {};
    saved.headlines.forEach(function (x) { oldText[x.id] = x.text; });

    window.YondrRender.open(host).then(function (R) {
      var i = 0;
      function next() {
        if (cancel) throw new Error('stopped');
        if (i >= list.length) return R;
        var a = list[i];
        status.textContent = 'Rendering ' + (i + 1) + ' of ' + list.length + ': ' + a.w + '×' + a.h + ' ' + VIEWS[a.variant] + ' (headline ' + a.meta.headlineId.slice(1) + ')';
        var spec = { c: draft, size: sizeOf(a.size), h: byId[a.meta.headlineId], view: a.variant, base: '' };
        var job = a.variant === 'motion'
          ? R.motion(spec, function (f, n) { prog.value = i + f / n; })
          : R.still(spec);
        return job.then(function (out) { rendered.push({ ad: a, out: out }); i++; prog.value = i; return next(); });
      }
      return next();
    }).then(function (R) {
      R.close();
      status.textContent = 'Saving copy…';
      var body = {};
      changed.forEach(function (k) { if (!/^h\d+\./.test(k) && k.indexOf('stat.') !== 0) body[k] = draft[k]; });
      if (changed.some(function (k) { return k.indexOf('stat.') === 0; })) body.stat = draft.stat;
      body.headlines = draft.headlines.map(function (x) { return { id: x.id, text: x.text, desc: x.desc }; });
      return ctx.api('sets/' + ctx.model().set.id + '/copy', { method: 'PUT', body: body });
    }).then(function () {
      var j = 0;
      prog.max = rendered.length || 1; prog.value = 0;
      function up() {
        if (j >= rendered.length) return;
        var r = rendered[j], a = r.ad, hd = byId[a.meta.headlineId];
        status.textContent = 'Uploading ' + (j + 1) + ' of ' + rendered.length + '…';
        var fd = new FormData();
        fd.append('file', new File([r.out.blob], a.key.split('/').pop(), { type: a.variant === 'motion' ? 'image/gif' : 'image/jpeg' }));
        fd.append('headline', hd.text);
        var old = oldText[a.meta.headlineId];
        if (old && a.title.indexOf(old) >= 0) fd.append('title', a.title.split(old).join(hd.text));
        fd.append('meta', JSON.stringify({ desc: hd.desc, duration: r.out.duration, frames: r.out.frames, colors: r.out.colors, quality: r.out.quality }));
        return ctx.api('ads/' + a.id + '/file', { method: 'PUT', body: fd })
          .catch(function (e) { failed.push(a.w + '×' + a.h + ' ' + VIEWS[a.variant] + ': ' + e.message); })
          .then(function () { j++; prog.value = j; return up(); });
      }
      return up();
    }).then(function () {
      return ctx.api('sets/' + ctx.model().set.id + '/rerendered', { method: 'POST', body: { count: rendered.length - failed.length, failed: failed.length, changed: changed } }).catch(function () {});
    }).then(function () {
      saved = clone(draft);
      ctx.toast(failed.length ? 'Saved. ' + failed.length + ' ads didn’t upload; see the list below.' : 'Saved. ' + rendered.length + ' ads updated and back in review.');
      return ctx.refresh();
    }).catch(function (e) {
      ctx.toast(e.message === 'stopped' ? 'Stopped. Nothing was changed.' : 'Not saved: ' + e.message);
    }).then(function () {
      window.removeEventListener('beforeunload', leave);
      host.remove();
      busy = false;
      if (ctx.model()) paint();
      if (failed.length) {
        panel.insertBefore(h('div', { class: 'notice' }, [h('b', { text: 'These ads didn’t upload. Save again to retry: ' }), h('ul', {}, failed.map(function (t) { return h('li', { text: t }); }))]), panel.firstChild);
      }
    });
  }

  window.YondrEditor = {
    render: function (el, c) {
      ctx = c; h = c.h; panel = el;
      if (busy) return;
      var cur = ctx.model().set.copy || {};
      if (!saved || JSON.stringify(saved) !== JSON.stringify(cur) || !draft || !changes().length) { saved = clone(cur); draft = clone(cur); }
      if (saved.headlines && !saved.headlines.some(function (x) { return x.id === preview.headline; })) preview.headline = saved.headlines[0].id;
      paint();
    },
  };
})();
