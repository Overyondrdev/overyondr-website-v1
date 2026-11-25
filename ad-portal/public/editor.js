/* Copy editing for editors and admins. Two ways in, one pipeline:
 *   - On an ad (Edit on the card or in its details): only the text that ad shows, a live preview of that exact ad,
 *     and a choice: change it on every ad that shares the text, or on this ad only (a per-ad override).
 *   - The Edit copy tab: every shared field at once, with a preview picker.
 * Saving re-renders the affected ads in this browser (render.js), saves the copy, uploads the new files over the old
 * ones and puts those ads back "In review". Ads uploaded by hand can't be re-rendered; on them, Edit offers "Replace file". */
(function () {
  'use strict';
  var VIEWS = { pouch: 'Pouch still', 'in-use': 'In-use still', motion: 'Motion' };
  var TPL_SOURCE = ['300x250', '336x280', '300x600', '160x600'];   // sizes that show a source line (generator/ad.html)

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  // Copy paths: 'eyebrow', 'cta', 'stat.big', 'h1.text', 'h3.desc'.
  function getPath(c, path) {
    var p = path.split('.');
    if (/^h\d+$/.test(p[0])) { var x = (c.headlines || []).find(function (y) { return y.id === p[0]; }); return x ? x[p[1]] : ''; }
    return p.length > 1 ? (c[p[0]] || {})[p[1]] : c[p[0]];
  }
  function setPath(c, path, v) {
    var p = path.split('.');
    if (/^h\d+$/.test(p[0])) { var x = (c.headlines || []).find(function (y) { return y.id === p[0]; }); if (x) x[p[1]] = v; return; }
    if (p.length > 1) { c[p[0]] = c[p[0]] || {}; c[p[0]][p[1]] = v; } else c[p[0]] = v;
  }
  // Which per-ad override replaces a shared copy path.
  function overrideFor(path) {
    if (path === 'cta' || path === 'ctaShort') return 'cta';
    if (path === 'source' || path === 'sourceShort') return 'source';
    if (path === 'stat.big') return 'statBig';
    if (path === 'stat.unit') return 'statUnit';
    if (path === 'stat.note') return 'statNote';
    var m = /^h\d+\.(text|desc)$/.exec(path);
    if (m) return m[1] === 'text' ? 'headline' : 'desc';
    return path;
  }

  // The text fields one ad shows, mirroring generator/ad.html.
  function fieldsFor(a) {
    var hid = a.meta.headlineId, small = a.size === '320x50', half = a.size === '300x600';
    var out = [{ key: 'headline', label: 'Headline', max: 30, path: hid + '.text' }];
    if (half || (a.size === '160x600' && a.variant !== 'pouch' && a.variant !== 'motion')) out.push({ key: 'desc', label: 'Description', max: 90, path: hid + '.desc', multiline: true });
    if (!small) out.push({ key: 'eyebrow', label: 'Tagline', max: 40, path: 'eyebrow' });
    out.push({ key: 'cta', label: 'Button', max: small ? 14 : 24, path: small ? 'ctaShort' : 'cta' });
    if (!small) out.push({ key: 'statBig', label: 'Stat number', max: 8, path: 'stat.big', hint: 'In “+1–2 weeks of learning a year”' + (a.variant === 'motion' ? ' and the big stat' : '') + '.' });
    if (a.variant === 'motion' && !small) {
      out.push({ key: 'statUnit', label: 'Stat words', max: 60, path: 'stat.unit' });
      if (a.size !== '728x90') out.push({ key: 'statNote', label: 'Stat note', max: 60, path: 'stat.note' });
    }
    if (TPL_SOURCE.indexOf(a.size) >= 0) out.push({ key: 'source', label: 'Source line', max: half ? 140 : 60, path: half ? 'source' : 'sourceShort' });
    return out;
  }
  // Ads that show a changed shared path, unless the ad has its own override for it.
  function affected(changed, ads) {
    return ads.filter(function (a) {
      var m = a.meta || {}, o = m.overrides || {};
      if (!m.generated || a.status === 'archived') return false;
      var half = a.size === '300x600';
      return changed.some(function (k) {
        if (o[overrideFor(k)] != null) return false;
        if (k === 'eyebrow') return a.size !== '320x50';
        if (k === 'stat.big') return a.size !== '320x50';
        if (k === 'cta') return a.size !== '320x50';
        if (k === 'ctaShort') return a.size === '320x50';
        if (k === 'source') return half;
        if (k === 'sourceShort') return TPL_SOURCE.indexOf(a.size) >= 0 && !half;
        if (k === 'stat.unit' || k === 'stat.note') return a.variant === 'motion';
        var hm = /^(h\d+)\.(text|desc)$/.exec(k);
        return hm && m.headlineId === hm[1];
      });
    });
  }
  function estimate(list) {
    var s = list.reduce(function (n, a) { return n + (a.variant === 'motion' ? (a.w * a.h > 100000 ? 28 : 18) : 0.6); }, 0);
    return s < 45 ? 'under a minute' : 'about ' + Math.ceil(s / 60) + ' minute' + (s >= 90 ? 's' : '');
  }
  function sizeOf(c, id) { return (c.sizes || []).find(function (s) { return s.id === id; }) || { id: id, w: +id.split('x')[0], h: +id.split('x')[1] }; }
  // The template spec for one ad: the shared copy with that ad's overrides applied.
  function specFor(a, copy, overrides) {
    var c = clone(copy), o = overrides || {};
    var hd = clone((c.headlines || []).find(function (x) { return x.id === a.meta.headlineId; }) || c.headlines[0]);
    if (o.headline != null) hd.text = o.headline;
    if (o.desc != null) hd.desc = o.desc;
    if (o.eyebrow != null) c.eyebrow = o.eyebrow;
    if (o.cta != null) { c.cta = o.cta; c.ctaShort = o.cta; }
    if (o.source != null) { c.source = o.source; c.sourceShort = o.source; }
    c.stat = Object.assign({}, c.stat);
    if (o.statBig != null) c.stat.big = o.statBig;
    if (o.statUnit != null) c.stat.unit = o.statUnit;
    if (o.statNote != null) c.stat.note = o.statNote;
    return { c: c, size: sizeOf(c, a.size), h: hd, view: a.variant, base: '' };
  }
  function copyBody(copy, changed) {
    var body = {};
    changed.forEach(function (k) { if (!/^h\d+\./.test(k) && k.indexOf('stat.') !== 0) body[k] = copy[k]; });
    if (changed.some(function (k) { return k.indexOf('stat.') === 0; })) body.stat = copy.stat;
    body.headlines = copy.headlines.map(function (x) { return { id: x.id, text: x.text, desc: x.desc }; });
    return body;
  }
  function newTitle(a, text) { return a.headlineText && a.title.indexOf(a.headlineText) >= 0 ? a.title.split(a.headlineText).join(text) : null; }

  // ------------------------------------------------------------------ live preview of one ad in the template
  function Preview(h, stage, maxH) {
    var frame = h('iframe', { title: 'Live preview', tabindex: '-1', class: 'pv-frame' });
    var ready = null, pending = 0, raf = 0;
    function mount() {
      if (frame.parentNode === stage) return;
      ready = new Promise(function (ok) { frame.addEventListener('load', function () { ok(frame); }, { once: true }); });
      if (!frame.getAttribute('src')) frame.src = '/render/ad.html';
      stage.appendChild(frame);
    }
    // at: the moment of a motion ad to show (seconds); default the end card.
    function draw(spec, play, at) {
      mount();
      var my = ++pending;
      return ready.then(function () {
        var win = frame.contentWindow;
        if (!win || !win.build || my !== pending) return;
        return win.build(spec).then(function (info) {
          if (my !== pending) return;
          var size = spec.size;
          var scale = Math.min(2, Math.max(0.3, (stage.clientWidth - 24) / size.w), (maxH || 560) / size.h);
          frame.style.width = size.w + 'px'; frame.style.height = size.h + 'px';
          frame.style.transform = 'scale(' + scale + ')';
          stage.style.height = Math.round(size.h * scale + 24) + 'px';
          stage.style.width = '';
          cancelAnimationFrame(raf);
          if (spec.view === 'motion' && play) {
            var t0 = performance.now();
            var tick = function (now) { var t = (now - t0) / 1000; win.seek(Math.min(t, info.duration)); if (t < info.duration && my === pending) raf = requestAnimationFrame(tick); };
            raf = requestAnimationFrame(tick);
          } else win.seek(at != null ? at : 1e6);
        });
      });
    }
    return { draw: draw };
  }

  // ------------------------------------------------------------------ the pipeline: render all, then save copy, then upload
  var busy = false;
  // jobs: [{ ad, spec, headline, desc, overrides (undefined = keep) }]. ui: { status(text), progress(value, max), stopped() }.
  function run(ctx, jobs, opts, ui) {
    busy = true;
    var leave = function (e) { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    var host = document.createElement('div');
    document.body.appendChild(host);
    var rendered = [], failed = [], R = null;
    var setId = ctx.model().set.id;
    ui.progress(0, jobs.length);
    return window.YondrRender.open(host).then(function (r) {
      R = r;
      var i = 0;
      function next() {
        if (ui.stopped()) throw new Error('stopped');
        if (i >= jobs.length) return;
        var j = jobs[i], a = j.ad;
        ui.status('Rendering ' + (jobs.length > 1 ? (i + 1) + ' of ' + jobs.length + ': ' : '') + a.w + '×' + a.h + ' ' + VIEWS[a.variant] + '…');
        var job = a.variant === 'motion' ? R.motion(j.spec, function (f, n) { ui.progress(i + f / n, jobs.length); }) : R.still(j.spec);
        return job.then(function (out) { rendered.push({ job: j, out: out }); i++; ui.progress(i, jobs.length); return next(); });
      }
      return next();
    }).then(function () {
      if (!opts.copyBody) return;
      ui.status('Saving copy…');
      return ctx.api('sets/' + setId + '/copy', { method: 'PUT', body: opts.copyBody });
    }).then(function () {
      var k = 0;
      ui.progress(0, rendered.length);
      function up() {
        if (k >= rendered.length) return;
        var r = rendered[k], j = r.job, a = j.ad;
        ui.status('Uploading ' + (rendered.length > 1 ? (k + 1) + ' of ' + rendered.length : 'the new file') + '…');
        var fd = new FormData();
        fd.append('file', new File([r.out.blob], a.key.split('/').pop(), { type: a.variant === 'motion' ? 'image/gif' : 'image/jpeg' }));
        fd.append('headline', j.headline);
        var t = newTitle(a, j.headline);
        if (t) fd.append('title', t);
        var meta = { desc: j.desc, duration: r.out.duration, frames: r.out.frames, colors: r.out.colors, quality: r.out.quality };
        if (j.overrides !== undefined) meta.overrides = j.overrides;
        fd.append('meta', JSON.stringify(meta));
        return ctx.api('ads/' + a.id + '/file', { method: 'PUT', body: fd })
          .catch(function (e) { failed.push({ ad: a, error: e.message }); })
          .then(function () { k++; ui.progress(k, rendered.length); return up(); });
      }
      return up();
    }).then(function () {
      return ctx.api('sets/' + setId + '/rerendered', { method: 'POST', body: { count: rendered.length - failed.length, failed: failed.length, changed: opts.changed || [] } }).catch(function () {});
    }).then(function () { return { done: rendered.length - failed.length, failed: failed }; })
      .finally(function () { if (R) R.close(); host.remove(); window.removeEventListener('beforeunload', leave); busy = false; });
  }

  function progressBar(h, el, onStop) {
    var prog = h('progress', { max: 1, value: 0 });
    var status = h('span', { class: 'ed-sum', text: 'Starting…' });
    var stopped = false;
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'ed-prog' }, [status, prog]));
    el.appendChild(h('button', { type: 'button', class: 'btn line sm', text: 'Stop', onclick: function () { stopped = true; status.textContent = 'Stopping…'; if (onStop) onStop(); } }));
    return { status: function (t) { status.textContent = t; }, progress: function (v, max) { prog.max = max || 1; prog.value = v; }, stopped: function () { return stopped; } };
  }
  function input(h, f, value, onInput) {
    var el = h(f.multiline ? 'textarea' : 'input', { class: 'input', rows: f.multiline ? 2 : null, maxlength: f.max * 2, 'aria-label': f.label });
    el.value = value || '';
    var count = h('span', { class: 'n' });
    var paint = function (changed) { var n = el.value.length; count.textContent = n + '/' + f.max; count.className = 'n' + (n > f.max ? ' over' : ''); el.classList.toggle('changed', !!changed); };
    el.addEventListener('input', function () { paint(onInput(el.value)); });
    paint(false);
    return { el: el, count: count, paint: paint };
  }

  // ------------------------------------------------------------------ edit one ad (inside its details)
  function editAd(ctx, a, body, cb) {
    var h = ctx.h, M = ctx.model(), shared = M.set.copy || {};
    var own = clone((a.meta && a.meta.overrides) || {});
    var hasOwn = Object.keys(own).length > 0;
    var fields = fieldsFor(a);
    var orig = {}, vals = {};
    fields.forEach(function (f) { orig[f.key] = own[f.key] != null ? own[f.key] : getPath(shared, f.path); vals[f.key] = orig[f.key]; });
    var scope = hasOwn ? 'one' : 'all';

    var stage = h('div', { class: 'pv-stage' });
    var pv = Preview(h, stage, 520);
    var previewSpec = function () { return specFor(a, shared, vals); };
    // In motion ads the stat words and note only show in the middle scene: jump there while they're being edited.
    var STAT_SCENE = 6.5, at = null;
    var redraw = function (play) { pv.draw(previewSpec(), play, at); };
    var focusField = function (f) {
      var want = a.variant === 'motion' && (f.key === 'statUnit' || f.key === 'statNote' || f.key === 'statBig') ? STAT_SCENE : null;
      if (want !== at) { at = want; redraw(false); sceneNote.textContent = at ? 'Showing the stat scene of the animation.' : 'Showing the end of the animation.'; }
    };
    var sceneNote = h('span', { class: 'hint', text: a.variant === 'motion' ? 'Showing the end of the animation.' : 'Live preview of this ad.' });
    var changed = function () { return fields.filter(function (f) { return vals[f.key] !== orig[f.key]; }); };
    var sharedCount = function (f) { return affected([f.path], M.ads.map(function (x) { return x.id === a.id ? Object.assign({}, x, { meta: Object.assign({}, x.meta, { overrides: {} }) }) : x; })).length; };

    var foot = h('div', { class: 'ed-bar in-dialog' });
    var list = h('div', { class: 'ed-fields' });
    var scopeEl = h('div', { class: 'scope', role: 'radiogroup', 'aria-label': 'Where to make the change' });
    function plan() {
      var ch = changed();
      if (!ch.length) return { jobs: [], text: 'Change any text to see the ad update.' };
      if (scope === 'one') {
        var ov = {};
        fields.forEach(function (f) { if (vals[f.key] !== getPath(shared, f.path)) ov[f.key] = vals[f.key]; });
        Object.keys(own).forEach(function (k) { if (!fields.some(function (f) { return f.key === k; })) ov[k] = own[k]; });
        return { jobs: [{ ad: a, spec: specFor(a, shared, ov), headline: ov.headline != null ? ov.headline : getPath(shared, a.meta.headlineId + '.text'), desc: ov.desc != null ? ov.desc : getPath(shared, a.meta.headlineId + '.desc'), overrides: ov }],
          text: 'Updates only this ad (' + estimate([a]) + ')' };
      }
      var next = clone(shared), paths = [];
      ch.forEach(function (f) { setPath(next, f.path, vals[f.key]); paths.push(f.path); });
      var others = affected(paths, M.ads).filter(function (x) { return x.id !== a.id; });
      var jobs = [{ ad: a, spec: specFor(a, next, {}), headline: getPath(next, a.meta.headlineId + '.text'), desc: getPath(next, a.meta.headlineId + '.desc'), overrides: {} }]
        .concat(others.map(function (x) { var s = specFor(x, next, x.meta.overrides); return { ad: x, spec: s, headline: s.h.text, desc: s.h.desc }; }));
      return { jobs: jobs, copy: next, paths: paths, text: 'Updates ' + jobs.length + ' ad' + (jobs.length > 1 ? 's' : '') + ' that share this text (' + estimate(jobs.map(function (j) { return j.ad; })) + ')' };
    }
    function paintFoot() {
      if (busy) return;
      var p = plan(), over = list.querySelectorAll('.n.over').length;
      foot.innerHTML = '';
      foot.appendChild(h('div', { class: 'ed-sum' }, [p.jobs.length ? h('b', { text: p.text }) : p.text, over ? h('span', { class: 'danger', text: ' · ' + over + ' over the suggested length' }) : null]));
      foot.appendChild(h('button', { type: 'button', class: 'btn line sm', text: 'Cancel', onclick: cb.cancel }));
      foot.appendChild(h('button', { type: 'button', class: 'btn forest sm', text: p.jobs.length > 1 ? 'Save and update ' + p.jobs.length + ' ads' : 'Save', disabled: !p.jobs.length, onclick: function () { save(p); } }));
    }
    function paintScope() {
      scopeEl.innerHTML = '';
      [['all', 'Every ad with this text', 'Keeps the set consistent. Recommended.'], ['one', 'Only this ad', 'For a fix that only this size or version needs.']].forEach(function (s) {
        scopeEl.appendChild(h('button', { type: 'button', role: 'radio', class: 'scope-opt', 'aria-checked': String(scope === s[0]), onclick: function () { scope = s[0]; paintScope(); paintFields(); paintFoot(); } },
          [h('b', { text: s[1] }), h('span', { text: s[2] })]));
      });
    }
    function paintFields() {
      list.innerHTML = '';
      fields.forEach(function (f) {
        var inp = input(h, f, vals[f.key], function (v) {
          vals[f.key] = v; paintFoot();
          clearTimeout(inp._t); inp._t = setTimeout(function () { redraw(false); }, 100);
          return v !== orig[f.key];
        });
        inp.paint(vals[f.key] !== orig[f.key]);
        inp.el.addEventListener('focus', function () { focusField(f); });
        var note = scope === 'all' ? 'Shared by ' + sharedCount(f) + ' ad' + (sharedCount(f) === 1 ? '' : 's') : own[f.key] != null ? 'Custom on this ad' : null;
        list.appendChild(h('label', { class: 'ef' }, [h('span', { class: 'ef-top' }, [f.label, inp.count]), inp.el,
          note || f.hint ? h('span', { class: 'hint', text: [note, f.hint].filter(Boolean).join(' · ') }) : null]));
      });
    }
    function save(p) {
      var ui = progressBar(h, foot);
      list.querySelectorAll('input,textarea').forEach(function (x) { x.disabled = true; });
      scopeEl.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
      cb.busy(true);
      run(ctx, p.jobs, { copyBody: p.copy ? copyBody(p.copy, p.paths) : null, changed: p.paths || fields.filter(function (f) { return vals[f.key] !== orig[f.key]; }).map(function (f) { return 'ad:' + f.key; }) }, ui)
        .then(function (r) {
          cb.busy(false);
          if (r.failed.length) ctx.toast(r.done + ' updated, ' + r.failed.length + ' didn’t upload: ' + r.failed[0].error);
          else ctx.toast(r.done > 1 ? 'Saved. ' + r.done + ' ads updated and back in review.' : 'Saved. This ad is updated and back in review.');
          cb.saved();
        }).catch(function (e) {
          cb.busy(false);
          ctx.toast(e.message === 'stopped' ? 'Stopped. Nothing was changed.' : 'Not saved: ' + e.message);
          list.querySelectorAll('input,textarea').forEach(function (x) { x.disabled = false; });
          scopeEl.querySelectorAll('button').forEach(function (x) { x.disabled = false; });
          paintFoot();
        });
    }

    body.innerHTML = '';
    body.appendChild(h('div', { class: 'detail' }, [
      h('div', { class: 'stagebox' }, [stage, h('div', { class: 'tools' }, [
        a.variant === 'motion' ? h('button', { type: 'button', class: 'btn line sm', text: '▶ Play', onclick: function () { redraw(true); } }) : null,
        sceneNote, h('span', { class: 'hint', text: 'Text that doesn’t fit shrinks.' })])]),
      h('div', { class: 'side' }, [
        h('section', {}, [h('h3', {}, ['Where to change it ', ctx.helpLink('edit-scope', 'Every ad or only this ad')]), scopeEl,
          hasOwn ? h('div', { class: 'notice', style: 'margin-top:12px' }, ['This ad has its own copy. ',
            h('button', { type: 'button', class: 'linkbtn', text: 'Go back to the shared copy', onclick: function () {
              save({ jobs: [{ ad: a, spec: specFor(a, shared, {}), headline: getPath(shared, a.meta.headlineId + '.text'), desc: getPath(shared, a.meta.headlineId + '.desc'), overrides: {} }] });
            } })]) : null]),
        h('section', {}, [h('h3', { text: 'Text on this ad' }), list]),
        h('p', { class: 'hint', text: 'Saving re-renders the ads in this browser and puts them back “In review”. Keep this window open until it finishes.' }),
      ]),
    ]));
    body.appendChild(foot);
    paintScope(); paintFields(); paintFoot();
    redraw(false);
    var first = list.querySelector('input,textarea');
    if (first) setTimeout(function () { first.focus(); first.select(); }, 50);
  }

  // ------------------------------------------------------------------ replace the file of an ad uploaded by hand
  function replaceFile(ctx, a, body, cb) {
    var h = ctx.h, file = null;
    var errEl = h('p', { class: 'err', role: 'alert' });
    var preview = h('img', { alt: 'Current ad', src: '/files/' + a.key + '?v=' + encodeURIComponent(a.updated || a.bytes), width: a.w, height: a.h });
    var inp = h('input', { type: 'file', accept: a.format === 'GIF' ? 'image/gif' : a.format === 'PNG' ? 'image/png' : a.format === 'WEBP' ? 'image/webp' : 'image/jpeg', class: 'visually-hidden', id: 'rf-file' });
    var save = h('button', { type: 'button', class: 'btn forest sm', text: 'Replace file', disabled: true });
    var note = h('span', { class: 'ed-sum', text: 'Choose a ' + a.format + ' that is ' + a.w + '×' + a.h + '.' });
    inp.addEventListener('change', function () {
      file = inp.files[0]; errEl.textContent = ''; save.disabled = true;
      if (!file) return;
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        if (img.naturalWidth !== a.w || img.naturalHeight !== a.h) { errEl.textContent = 'That file is ' + img.naturalWidth + '×' + img.naturalHeight + '. It needs to be ' + a.w + '×' + a.h + '.'; return; }
        preview.src = url; save.disabled = false;
        note.textContent = file.name + ' · ' + Math.round(file.size / 1000) + ' KB' + (file.size > 150000 ? ' (over the 150 KB most ad networks allow)' : '');
      };
      img.src = url;
    });
    save.addEventListener('click', function () {
      if (!file) return;
      save.disabled = true; note.textContent = 'Uploading…'; cb.busy(true);
      var fd = new FormData();
      fd.append('file', file);
      ctx.api('ads/' + a.id + '/file', { method: 'PUT', body: fd }).then(function () { cb.busy(false); ctx.toast('File replaced. The ad is back in review.'); cb.saved(); })
        .catch(function (e) { cb.busy(false); errEl.textContent = e.message; save.disabled = false; note.textContent = ''; });
    });
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'detail' }, [
      h('div', { class: 'stagebox' }, [h('div', { class: 'canvas' }, [preview])]),
      h('div', { class: 'side' }, [
        h('section', {}, [h('h3', { text: 'Replace this ad’s file' }),
          ctx.helpLink('replace-file', 'Replacing a file'), h('p', { style: 'margin:0 0 12px;font-size:14px', text: 'This ad was uploaded as a finished file, so its text can’t be edited here. Upload the corrected version: same size and format. It keeps its comments, campaigns and history.' }),
          inp, h('label', { class: 'drop', for: 'rf-file' }, [h('b', { text: 'Choose the new file' }), h('span', { text: a.format + ', ' + a.w + '×' + a.h })]), errEl]),
      ]),
    ]));
    body.appendChild(h('div', { class: 'ed-bar in-dialog' }, [note, h('button', { type: 'button', class: 'btn line sm', text: 'Cancel', onclick: cb.cancel }), save]));
  }

  // ------------------------------------------------------------------ the Edit copy tab (every shared field)
  var GLOBAL = [
    ['eyebrow', 'Tagline', 40, 'The label above the headline, e.g. “New Harvard study”.'],
    ['cta', 'Button', 24, 'The call to action on every size except 320×50.'],
    ['ctaShort', 'Button on 320×50', 14, 'The mobile banner has less room. Keep it short.'],
  ];
  var STAT = [['stat.big', 'Stat number', 8, ''], ['stat.unit', 'Stat words', 60, 'Shown big in the motion ads.'], ['stat.note', 'Stat note', 60, 'Small line under the stat in the motion ads.']];
  var SOURCE = [['source', 'Source line (Half Page)', 140, ''], ['sourceShort', 'Source line (other sizes)', 60, '']];
  var tab = { saved: null, draft: null, preview: { headline: 'h1', size: '300x250', view: 'in-use' } };

  function renderTab(panel, ctx) {
    var h = ctx.h, M = ctx.model();
    if (busy) return;
    var cur = M.set.copy || {};
    var dirty = tab.saved && tabChanges().length;
    if (!dirty || JSON.stringify(tab.saved) !== JSON.stringify(cur)) { tab.saved = clone(cur); tab.draft = clone(cur); }
    var saved = tab.saved, draft = tab.draft, pvs = tab.preview;
    panel.innerHTML = '';
    if (!saved.headlines || !saved.cta) {
      panel.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'This ad set has no editable copy' }), h('p', { text: 'Only ads made with the ad template can be edited. To change an uploaded ad, open it and choose Edit to replace its file.' })]));
      return;
    }
    if (!saved.headlines.some(function (x) { return x.id === pvs.headline; })) pvs.headline = saved.headlines[0].id;
    var gen = M.ads.filter(function (a) { return a.meta && a.meta.generated; }).length;
    panel.appendChild(h('div', { class: 'camp-head' }, [h('h2', { text: 'Edit ad copy' }), ctx.helpLink('edit-copy-tab', 'The Edit copy tab'),
      h('p', { text: 'Every shared text in one place (' + gen + ' template ads). To change one ad, or the text on one ad only, open the ad and choose Edit. Saving re-renders the ads that show what you changed and puts them back “In review”.' })]));

    var stage = h('div', { class: 'pv-stage' });
    var pv = Preview(h, stage, 560);
    var bar = h('div', { class: 'ed-bar', role: 'region', 'aria-label': 'Save changes' });
    var previewAd = function () {
      var ad = M.ads.find(function (x) { return x.meta && x.meta.generated && x.meta.headlineId === pvs.headline && x.size === pvs.size && x.variant === pvs.view; });
      return ad || { meta: { headlineId: pvs.headline }, size: pvs.size, variant: pvs.view };
    };
    var redraw = function (play) { var a = previewAd(); pv.draw(specFor(a, draft, a.meta.overrides), play); };
    var syncPickers = function () { panel.querySelectorAll('[data-pv]').forEach(function (s) { s.value = pvs[s.dataset.pv]; }); };

    function paintBar() {
      if (busy) return;
      var ch = tabChanges(), list = affected(ch, M.ads), over = panel.querySelectorAll('.n.over').length;
      bar.innerHTML = '';
      bar.appendChild(h('div', { class: 'ed-sum' }, ch.length
        ? [h('b', { text: ch.length + ' change' + (ch.length > 1 ? 's' : '') }), list.length ? ' · updates ' + list.length + ' ad' + (list.length > 1 ? 's' : '') + ' (' + estimate(list) + ')' : ' · no ad images change',
          over ? h('span', { class: 'danger', text: ' · ' + over + ' over the suggested length' }) : null]
        : ['No changes yet. Edit a field to see the ad update.']));
      bar.appendChild(h('button', { type: 'button', class: 'btn line sm', text: 'Discard', disabled: !ch.length, onclick: function () { tab.draft = clone(tab.saved); renderTab(panel, ctx); } }));
      bar.appendChild(h('button', { type: 'button', class: 'btn forest sm', text: list.length ? 'Save and update ' + list.length + ' ads' : 'Save', disabled: !ch.length, onclick: function () { save(ch, list); } }));
    }
    function fieldEl(path, lbl, max, hint, multiline, onFocus) {
      var f = { label: lbl, max: max, multiline: multiline };
      var inp = input(h, f, getPath(draft, path), function (v) {
        setPath(draft, path, v); paintBar();
        clearTimeout(inp._t); inp._t = setTimeout(function () { redraw(false); }, 120);
        return v !== getPath(saved, path);
      });
      inp.paint(getPath(draft, path) !== getPath(saved, path));
      if (onFocus) inp.el.addEventListener('focus', onFocus);
      return h('label', { class: 'ef' }, [h('span', { class: 'ef-top' }, [lbl, inp.count]), inp.el, hint ? h('span', { class: 'hint', text: hint }) : null]);
    }
    function save(ch, list) {
      var ui = progressBar(h, bar);
      var jobs = list.map(function (a) { var s = specFor(a, draft, a.meta.overrides); return { ad: a, spec: s, headline: s.h.text, desc: s.h.desc }; });
      run(ctx, jobs, { copyBody: copyBody(draft, ch), changed: ch }, ui).then(function (r) {
        tab.saved = clone(draft);
        ctx.toast(r.failed.length ? 'Saved. ' + r.failed.length + ' ads didn’t upload; save again to retry.' : 'Saved. ' + r.done + ' ads updated and back in review.');
        return ctx.refresh();
      }).catch(function (e) { ctx.toast(e.message === 'stopped' ? 'Stopped. Nothing was changed.' : 'Not saved: ' + e.message); })
        .then(function () { renderTab(panel, ctx); });
    }
    var focusHeadline = function (id) { return function () { if (pvs.headline !== id) { pvs.headline = id; syncPickers(); redraw(false); } }; };
    var form = h('div', { class: 'ed-form' }, [
      h('fieldset', { class: 'panel' }, [h('legend', { text: 'On every ad' })].concat(GLOBAL.map(function (f) { return fieldEl(f[0], f[1], f[2], f[3]); }))),
      h('fieldset', { class: 'panel' }, [h('legend', { text: 'Headlines and descriptions' }),
        h('p', { class: 'hint', text: 'Each headline has its own ads in every size. Descriptions show on the Half Page and Wide Skyscraper. Counts are Google Ads limits.' })]
        .concat(draft.headlines.map(function (x, i) {
          return h('div', { class: 'ed-head' }, [h('span', { class: 'pill', text: 'Headline ' + (i + 1) }),
            fieldEl(x.id + '.text', 'Headline', 30, '', false, focusHeadline(x.id)), fieldEl(x.id + '.desc', 'Description', 90, '', true, focusHeadline(x.id))]);
        }))),
      h('fieldset', { class: 'panel' }, [h('legend', { text: 'Stat and source' })].concat(STAT.concat(SOURCE).map(function (f) { return fieldEl(f[0], f[1], f[2], f[3]); }))),
    ]);
    var pick = function (key, opts) {
      return h('select', { class: 'input', 'data-pv': key, 'aria-label': 'Preview ' + key, onchange: function (e) { pvs[key] = e.target.value; redraw(pvs.view === 'motion'); } },
        opts.map(function (o) { return h('option', { value: o[0], selected: pvs[key] === o[0], text: o[1] }); }));
    };
    var side = h('div', { class: 'ed-preview' }, [h('div', { class: 'panel' }, [
      h('h3', { text: 'Preview' }),
      h('div', { class: 'addrow' }, [
        pick('headline', draft.headlines.map(function (x, i) { return [x.id, 'Headline ' + (i + 1)]; })),
        pick('size', (draft.sizes || []).map(function (s) { return [s.id, s.w + '×' + s.h]; })),
        pick('view', Object.keys(VIEWS).map(function (k) { return [k, VIEWS[k]]; })),
      ]),
      stage,
      h('div', { class: 'addrow' }, [h('button', { type: 'button', class: 'btn line sm', text: '▶ Play motion', onclick: function () { pvs.view = 'motion'; syncPickers(); redraw(true); } }),
        h('span', { class: 'hint', text: 'Updates as you type. Text that doesn’t fit shrinks.' })]),
    ])]);
    panel.appendChild(h('div', { class: 'ed-grid' }, [form, side]));
    panel.appendChild(bar);
    paintBar();
    redraw(false);
  }
  function tabChanges() {
    var s = tab.saved, d = tab.draft, out = [];
    if (!s || !d) return out;
    GLOBAL.concat(STAT, SOURCE).forEach(function (f) { if (getPath(d, f[0]) !== getPath(s, f[0])) out.push(f[0]); });
    (d.headlines || []).forEach(function (x, i) { if (x.text !== s.headlines[i].text) out.push(x.id + '.text'); if (x.desc !== s.headlines[i].desc) out.push(x.id + '.desc'); });
    return out;
  }

  window.YondrEditor = {
    render: renderTab,
    editAd: editAd,
    replaceFile: replaceFile,
    canEditText: function (a) { return !!(a.meta && a.meta.generated && a.meta.headlineId && a.meta.headlineId !== 'other'); },
    busy: function () { return busy; },
  };
})();
