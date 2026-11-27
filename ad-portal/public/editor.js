/* Copy editing for editors and admins. Two ways in, one pipeline:
 *   - On an ad (Edit on the card or in its details): only the text that ad shows, a live preview of that exact ad,
 *     and a choice: change it on every ad that shares the text, or on this ad only (a per-ad override).
 *   - The Edit copy tab: every shared field at once, with a preview picker.
 * Saving re-renders the affected ads in this browser (render.js), saves the copy, uploads the new files over the old
 * ones and puts those ads back "In review". Ads uploaded by hand can't be re-rendered; on them, Edit offers "Replace file". */
(function () {
  'use strict';
  var VIEWS = { pouch: 'Pouch still', 'in-use': 'In-use still', motion: 'Motion' };
  // Every piece of text each size and version shows, in on-ad order. Generated from generator/ad.html with
  // `node generator/fields.mjs` (build() reports the data-field elements an ad keeps); re-run it after template changes.
  var FIELDS = {"300x250": {"pouch": ["eyebrow", "headline", "stat.line", "cta"], "in-use": ["eyebrow", "headline", "cta", "sourceShort"], "motion": ["eyebrow", "headline", "cta", "sourceShort", "stat.pre", "stat.big", "stat.unit", "stat.note", "stat.line"]}, "336x280": {"pouch": ["eyebrow", "headline", "stat.line", "cta"], "in-use": ["eyebrow", "headline", "cta", "sourceShort"], "motion": ["eyebrow", "headline", "cta", "sourceShort", "stat.pre", "stat.big", "stat.unit", "stat.note", "stat.line"]}, "728x90": {"pouch": ["eyebrow", "headline", "stat.line", "cta"], "in-use": ["eyebrow", "headline", "stat.line", "cta"], "motion": ["eyebrow", "headline", "stat.line", "cta", "stat.pre", "stat.big", "stat.unit"]}, "320x50": {"pouch": ["headline", "ctaShort"], "in-use": ["headline", "ctaShort"], "motion": ["headline", "ctaShort", "stat.pre", "stat.big", "stat.unit"]}, "300x600": {"pouch": ["eyebrow", "headline", "stat.line", "desc", "cta", "source"], "in-use": ["eyebrow", "headline", "desc", "cta", "source"], "motion": ["eyebrow", "headline", "desc", "cta", "source", "stat.pre", "stat.big", "stat.unit", "stat.note", "stat.line"]}, "160x600": {"pouch": ["eyebrow", "headline", "stat.line", "cta", "sourceShort"], "in-use": ["eyebrow", "headline", "desc", "cta", "sourceShort"], "motion": ["eyebrow", "headline", "desc", "cta", "sourceShort", "stat.pre", "stat.big", "stat.unit", "stat.note", "stat.line"]}};
  // How each field is labelled and checked in the editor. key = the per-ad override name.
  var FIELD_META = {
    eyebrow: { key: 'eyebrow', label: 'Tagline', max: 40 },
    headline: { key: 'headline', label: 'Headline', max: 30 },
    desc: { key: 'desc', label: 'Description', max: 90, multiline: true },
    'stat.line': { key: 'statLine', label: 'Stat line', max: 50, hint: 'The stat number and the word after it are highlighted, e.g. “Can add 1–2 weeks of learning per year”.' },
    'stat.pre': { key: 'statPre', label: 'Stat lead-in', max: 16, hint: 'Small words above the big number in the motion ads.' },
    'stat.big': { key: 'statBig', label: 'Stat number', max: 8, hint: 'The big number in the motion ads.' },
    'stat.unit': { key: 'statUnit', label: 'Stat words', max: 60, hint: 'Under the big number in the motion ads.' },
    'stat.note': { key: 'statNote', label: 'Stat note', max: 60, hint: 'Small line under the stat in the motion ads.' },
    cta: { key: 'cta', label: 'Button', max: 24 },
    ctaShort: { key: 'cta', label: 'Button', max: 14 },
    source: { key: 'source', label: 'Source line', max: 140 },
    sourceShort: { key: 'source', label: 'Source line', max: 60 },
  };
  var STAT_KEYS = ['statPre', 'statBig', 'statUnit', 'statNote'];   // fields only the motion ads' middle scene shows
  function shown(a) { return ((FIELDS[a.size] || {})[a.variant]) || []; }

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
    if (FIELD_META[path]) return FIELD_META[path].key;
    var m = /^h\d+\.(text|desc)$/.exec(path);
    if (m) return m[1] === 'text' ? 'headline' : 'desc';
    return path;
  }

  // The text fields one ad shows, mirroring generator/ad.html.
  function fieldsFor(a) {
    var hid = a.meta.headlineId;
    return shown(a).map(function (f) {
      var m = FIELD_META[f];
      var path = f === 'headline' ? hid + '.text' : f === 'desc' ? hid + '.desc' : f;
      return { key: m.key, label: m.label, max: m.max, path: path, multiline: m.multiline, hint: m.hint };
    });
  }
  // Ads that show a changed shared path, unless the ad has its own override for it.
  function affected(changed, ads) {
    return ads.filter(function (a) {
      var m = a.meta || {}, o = m.overrides || {};
      if (!m.generated || a.status === 'archived') return false;
      var on = shown(a);
      return changed.some(function (k) {
        if (o[overrideFor(k)] != null) return false;
        var hm = /^(h\d+)\.(text|desc)$/.exec(k);
        if (hm) return m.headlineId === hm[1] && on.indexOf(hm[2] === 'text' ? 'headline' : 'desc') >= 0;
        return on.indexOf(k) >= 0;
      });
    });
  }
  function estimate(list) {
    var s = list.reduce(function (n, a) { return n + (a.variant === 'motion' ? (a.w * a.h > 100000 ? 6 : 3.5) : 0.6); }, 0) + 3;   // measured on a 4-core machine; faster with more cores
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
    if (o.statLine != null) c.stat.line = o.statLine;
    if (o.statPre != null) c.stat.pre = o.statPre;
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
          // Fit the space the stage's parent gives it (not the stage itself, which is sized to the ad below).
          var box = stage.parentNode, cs = getComputedStyle(box);
          var room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;
          var scale = Math.min(2, Math.max(0.3, room / size.w), (maxH || 560) / size.h);
          frame.style.width = size.w + 'px'; frame.style.height = size.h + 'px';
          frame.style.transform = 'scale(' + scale + ')';
          stage.style.height = Math.round(size.h * scale + 24) + 'px';
          stage.style.width = Math.round(size.w * scale + 24) + 'px';
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
  // Renders on this page (snapshots) while Web Workers encode the GIFs, so several ads are in flight at once.
  var busy = false, pending = {};
  // jobs: [{ ad, spec, headline, desc, overrides (undefined = keep) }]. ui: { status(text), progress(value, max), stopped() }.
  function run(ctx, jobs, opts, ui) {
    busy = true;
    jobs.forEach(function (j) { pending[j.ad.id] = true; });
    var leave = function (e) { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    var host = document.createElement('div');
    document.body.appendChild(host);
    var results = [], encodes = [], failed = [], R = null, finished = 0;
    var setId = ctx.model().set.id;
    var tick = function () { finished++; ui.progress(finished, jobs.length); };
    ui.progress(0, jobs.length);
    return window.YondrRender.open(host).then(function (r) {
      R = r;
      var i = 0;
      function next() {
        if (ui.stopped()) throw new Error('stopped');
        if (i >= jobs.length) return;
        var k = i, j = jobs[k], a = j.ad;
        ui.status('Rendering ' + (jobs.length > 1 ? (k + 1) + ' of ' + jobs.length + ': ' : '') + a.w + '×' + a.h + ' ' + VIEWS[a.variant] + '…');
        var job = a.variant === 'motion'
          ? R.motion(j.spec).then(function (cap) { encodes.push(cap.done.then(function (out) { results[k] = { job: j, out: out }; tick(); })); })
          : R.still(j.spec).then(function (out) { results[k] = { job: j, out: out }; tick(); });
        return job.then(function () { i++; return next(); });
      }
      return next();
    }).then(function () {
      ui.status('Finishing ' + encodes.length + ' animation' + (encodes.length === 1 ? '' : 's') + '…');
      return Promise.all(encodes);
    }).then(function () {
      if (ui.stopped()) throw new Error('stopped');
      if (!opts.copyBody) return;
      ui.status('Saving copy…');
      return ctx.api('sets/' + setId + '/copy', { method: 'PUT', body: opts.copyBody });
    }).then(function () {
      var done = results.filter(Boolean), k = 0;
      ui.progress(0, done.length);
      // Upload a few at a time.
      function worker() {
        if (k >= done.length) return Promise.resolve();
        var r = done[k++], j = r.job, a = j.ad;
        ui.status('Uploading ' + Math.min(k, done.length) + ' of ' + done.length + '…');
        var fd = new FormData();
        fd.append('file', new File([r.out.blob], a.key.split('/').pop(), { type: a.variant === 'motion' ? 'image/gif' : 'image/jpeg' }));
        if (r.out.poster) fd.append('poster', new File([r.out.poster], 'poster.jpg', { type: 'image/jpeg' }));
        fd.append('headline', j.headline);
        var t = newTitle(a, j.headline);
        if (t) fd.append('title', t);
        var meta = { desc: j.desc, duration: r.out.duration, frames: r.out.frames, colors: r.out.colors, quality: r.out.quality };
        if (j.overrides !== undefined) meta.overrides = j.overrides;
        fd.append('meta', JSON.stringify(meta));
        return ctx.api('ads/' + a.id + '/file', { method: 'PUT', body: fd })
          .catch(function (e) { failed.push({ ad: a, error: e.message }); })
          .then(function () { ui.progress(k, done.length); return worker(); });
      }
      return Promise.all([worker(), worker(), worker()]).then(function () { return done.length; });
    }).then(function (n) {
      return ctx.api('sets/' + setId + '/rerendered', { method: 'POST', body: { count: n - failed.length, failed: failed.length, changed: opts.changed || [], adId: jobs.length === 1 ? jobs[0].ad.id : undefined } })
        .catch(function () {}).then(function () { return { done: n - failed.length, failed: failed }; });
    }).finally(function () {
      if (R) R.close(); host.remove(); window.removeEventListener('beforeunload', leave); busy = false;
      jobs.forEach(function (j) { delete pending[j.ad.id]; });
    });
  }

  // Runs an update in the background: a small progress card bottom-left, so people can keep using the library.
  function startUpdate(ctx, jobs, opts, onDone) {
    var h = ctx.h;
    if (busy) { ctx.toast('Another update is still running. Try again when it finishes.'); return false; }
    var pill = h('div', { class: 'job-pill', role: 'status', 'aria-live': 'polite' });
    var ui = progressBar(h, pill);
    document.body.appendChild(pill);
    ctx.toast(jobs.length > 1 ? 'Updating ' + jobs.length + ' ads. You can keep working; keep this tab open.' : 'Updating the ad…');
    var job = run(ctx, jobs, opts, ui);   // marks the ads as updating straight away…
    if (ctx.rerender) ctx.rerender();       // …so the grid shows their “Updating…” badges
    job.then(function (r) {
      if (r.failed.length) ctx.toast(r.done + ' updated, ' + r.failed.length + ' didn’t upload: ' + r.failed[0].error);
      else ctx.toast(r.done > 1 ? 'Done. ' + r.done + ' ads updated and back in review.' : 'Done. The ad is updated and back in review.');
      if (onDone) onDone(true, r);
    }).catch(function (e) {
      ctx.toast(e.message === 'stopped' ? 'Stopped. Nothing was changed.' : 'Not saved: ' + e.message);
      if (onDone) onDone(false);
    }).then(function () { pill.remove(); return ctx.refresh(); });
    return true;
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
      var want = a.variant === 'motion' && STAT_KEYS.indexOf(f.key) >= 0 ? STAT_SCENE : null;
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
    // Saving runs in the background: the window goes back to the ad and a progress card shows bottom-left.
    function save(p) {
      var started = startUpdate(ctx, p.jobs, { copyBody: p.copy ? copyBody(p.copy, p.paths) : null,
        changed: p.paths || fields.filter(function (f) { return vals[f.key] !== orig[f.key]; }).map(function (f) { return 'ad:' + f.key; }) });
      if (started) cb.saved();
    }

    body.innerHTML = '';
    body.appendChild(h('div', { class: 'detail' }, [
      h('div', { class: 'stagebox' }, [stage, h('div', { class: 'tools' }, [
        a.variant === 'motion' ? h('button', { type: 'button', class: 'btn line sm', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg> Play', onclick: function () { redraw(true); } }) : null,
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
      (a.kind === 'motion' ? window.YondrRender.posterFromFile(file) : Promise.resolve(null)).then(function (poster) {
        if (poster) fd.append('poster', new File([poster], 'poster.jpg', { type: 'image/jpeg' }));
        return ctx.api('ads/' + a.id + '/file', { method: 'PUT', body: fd });
      }).then(function () { cb.busy(false); ctx.toast('File replaced. The ad is back in review.'); cb.saved(); })
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
  var STAT = [['stat.line', 'Stat line', 50, 'On the still and banner ads. The stat number and the word after it are highlighted.'],
    ['stat.pre', 'Stat lead-in', 16, 'Small words above the big number in the motion ads, e.g. “Can add”.'],
    ['stat.big', 'Stat number', 8, 'The big number in the motion ads.'], ['stat.unit', 'Stat words', 60, 'Under the big number in the motion ads.'],
    ['stat.note', 'Stat note', 60, 'Small line under the stat in the motion ads.']];
  var SOURCE = [['source', 'Source line (Half Page)', 140, ''], ['sourceShort', 'Source line (other sizes)', 60, '']];
  var tab = { saved: null, draft: null, preview: { headline: 'h1', size: '300x250', view: 'in-use' } };

  function renderTab(panel, ctx) {
    var h = ctx.h, M = ctx.model();
    if (busy) {
      panel.innerHTML = '';
      panel.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'Updating ads…' }),
        h('p', { text: 'Your changes are being applied (progress is in the corner). You can keep browsing; editing opens again when it’s done.' })]));
      return;
    }
    var cur = M.set.copy || {};
    var dirty = tab.saved && tabChanges().length;
    if ((!dirty && !tab.restored) || JSON.stringify(tab.saved) !== JSON.stringify(cur)) { tab.saved = clone(cur); tab.draft = clone(cur); tab.restored = null; }
    var saved = tab.saved, draft = tab.draft, pvs = tab.preview;
    panel.innerHTML = '';
    if (!saved.headlines || !saved.cta) {
      panel.appendChild(h('div', { class: 'empty' }, [h('h3', { text: 'This ad set has no editable copy' }), h('p', { text: 'Only ads made with the ad template can be edited. To change an uploaded ad, open it and choose Edit to replace its file.' })]));
      return;
    }
    if (!saved.headlines.some(function (x) { return x.id === pvs.headline; })) pvs.headline = saved.headlines[0].id;
    var gen = M.ads.filter(function (a) { return a.meta && a.meta.generated; }).length;
    panel.appendChild(h('div', { class: 'camp-head' }, [h('h2', { text: 'Edit ad copy' }), ctx.helpLink('edit-copy-tab', 'The Edit copy tab'),
      h('button', { type: 'button', class: 'btn line sm', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" stroke-width="2.2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg> History', 'aria-expanded': 'false', onclick: function (e) { toggleHistory(e.currentTarget); } }),
      h('p', { text: 'Every shared text in one place (' + gen + ' template ads). To change one ad, or the text on one ad only, open the ad and choose Edit. Saving re-renders the ads that show what you changed and puts them back “In review”.' })]));
    var hist = h('div', { class: 'panel history', hidden: true });
    panel.appendChild(hist);
    if (tab.restored) panel.appendChild(h('div', { class: 'notice' }, ['Loaded the version from ' + tab.restored + '. Check the preview, then save to restore it. ',
      h('button', { type: 'button', class: 'linkbtn', text: 'Cancel', onclick: function () { tab.draft = clone(tab.saved); tab.restored = null; renderTab(panel, ctx); } })]));
    // Version history: every save is kept; loading one puts it in the form so you can preview, then save to restore.
    function toggleHistory(btn) {
      var open = hist.hidden;
      hist.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (!open) return;
      hist.innerHTML = '<p class="hint">Loading…</p>';
      ctx.api('sets/' + M.set.id + '/copy/versions').then(function (r) {
        hist.innerHTML = '';
        hist.appendChild(h('h3', { text: 'Copy history' }));
        if (!r.versions.length) { hist.appendChild(h('p', { class: 'hint', text: 'No saved versions yet. Each save from now on is kept here.' })); return; }
        hist.appendChild(h('ul', { class: 'uses' }, r.versions.map(function (v, i) {
          var when = new Date(v.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          var who = v.created_by === 'original' ? 'Original copy' : v.created_by.split('@')[0];
          var what = v.changed.length ? v.changed.length + ' change' + (v.changed.length > 1 ? 's' : '') + ': ' + v.changed.slice(0, 4).join(', ') + (v.changed.length > 4 ? '…' : '') : '';
          return h('li', {}, [h('span', { class: 'name' }, [h('b', { text: i === 0 ? 'Current · ' : '' }), who + ' · ' + when, what ? h('br') : null, what ? h('span', { class: 'hint', text: what }) : null]),
            i === 0 ? null : h('button', { type: 'button', class: 'btn line sm', text: 'Load', onclick: function () {
              ctx.api('sets/' + M.set.id + '/copy/versions/' + v.id).then(function (full) {
                tab.draft = clone(Object.assign({}, tab.saved, full.copy)); tab.restored = who + ', ' + when; renderTab(panel, ctx);
                ctx.toast('Version loaded. Review it, then save to restore.');
              }).catch(function (er) { ctx.toast(er.message); });
            } })]);
        })));
      }).catch(function (er) { hist.innerHTML = ''; hist.appendChild(h('p', { class: 'err', text: er.message })); });
    }

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
      var jobs = list.map(function (a) { var s = specFor(a, draft, a.meta.overrides); return { ad: a, spec: s, headline: s.h.text, desc: s.h.desc }; });
      var started = startUpdate(ctx, jobs, { copyBody: copyBody(draft, ch), changed: ch }, function (ok) {
        if (ok) { tab.saved = clone(draft); tab.restored = null; }
        renderTab(panel, ctx);
      });
      if (started) renderTab(panel, ctx);
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
      h('div', { class: 'addrow' }, [h('button', { type: 'button', class: 'btn line sm', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg> Play motion', onclick: function () { pvs.view = 'motion'; syncPickers(); redraw(true); } }),
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
    updating: function (id) { return !!pending[id]; },
  };
})();
