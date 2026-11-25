/* Renders ads in the browser from the ad template (/render/ad.html, the same file generator/render.mjs uses),
 * so editors can change copy in the portal without the offline generator.
 *
 *   YondrRender.open(container)                  -> Promise<renderer>
 *   renderer.still(spec)                         -> Promise<{ blob, bytes, quality }>                JPEG < 150 KB
 *   renderer.motion(spec, onFrame)               -> Promise<{ done: Promise<{ blob, bytes, colors, frames, duration, poster }> }>
 *        resolves once the frames are captured; `done` resolves when the GIF is encoded (in a Web Worker),
 *        so the caller can start capturing the next ad while this one encodes.
 *   renderer.close()
 *
 * spec = { c: copy (campaign.json shape), size: { id, w, h }, h: headline, view: 'pouch' | 'in-use' | 'motion', base }
 * Pipeline, like the offline generator: draw at 2x through an SVG <foreignObject> snapshot (fonts and images inlined),
 * 2:1 downsample, light unsharp mask, then JPEG (canvas) or GIF (built-in encoder). The heavy pixel work and GIF
 * encoding run in a pool of Web Workers; the page only takes the snapshots. No dependencies. */
(function () {
  'use strict';
  var LIMIT = 145000;          // bytes; leaves a margin under the 150 KB ad-network cap
  var SCALE = 2;
  var FPS = 10;

  // ------------------------------------------------------------------ pixel + GIF library (runs in workers and on the page)
  function encoderLib() {
    var LOOPS = 1;             // GIF plays twice, then stops on the end card
    var GIF_DITHER = 0.5;      // Floyd–Steinberg strength: full strength adds noise that GIF compresses badly
    // Exact 2:1 box downsample, then an unsharp mask (3x3 Gaussian), like the offline Lanczos + UnsharpMask.
    function downsample(s, w, h) {
      var W = w * 2, out = new Uint8ClampedArray(w * h * 4);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var a = ((y * 2) * W + x * 2) * 4, b = a + 4, c = a + W * 4, d = c + 4, o = (y * w + x) * 4;
        out[o] = (s[a] + s[b] + s[c] + s[d] + 2) >> 2;
        out[o + 1] = (s[a + 1] + s[b + 1] + s[c + 1] + s[d + 1] + 2) >> 2;
        out[o + 2] = (s[a + 2] + s[b + 2] + s[c + 2] + s[d + 2] + 2) >> 2;
        out[o + 3] = 255;
      }
      return out;
    }
    function sharpen(px, w, h, amount) {
      var out = new Uint8ClampedArray(px.length);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        for (var k = 0; k < 3; k++) {
          var sum = 0;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            var yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx));
            sum += px[(yy * w + xx) * 4 + k] * (dx && dy ? 1 : dx || dy ? 2 : 4);
          }
          var v = px[o + k], diff = v - sum / 16;
          out[o + k] = Math.abs(diff) < 2 ? v : v + diff * amount;
        }
        out[o + 3] = 255;
      }
      return out;
    }
    function same(a, b) { for (var i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) return false; return true; }
    function palette(frames, colors) {   // median cut over a sample of every frame's pixels
      var pts = [], step = Math.max(1, Math.floor(frames.length * frames[0].px.length / 4 / 60000));
      frames.forEach(function (f) { for (var i = 0; i < f.px.length; i += 4 * step) pts.push([f.px[i], f.px[i + 1], f.px[i + 2]]); });
      var boxes = [pts];
      while (boxes.length < colors) {
        var bi = -1, best = -1, axis = 0;
        boxes.forEach(function (b, i) {
          if (b.length < 2) return;
          for (var k = 0; k < 3; k++) {
            var lo = 255, hi = 0;
            for (var j = 0; j < b.length; j++) { var v = b[j][k]; if (v < lo) lo = v; if (v > hi) hi = v; }
            var score = (hi - lo) * Math.sqrt(b.length);
            if (score > best) { best = score; bi = i; axis = k; }
          }
        });
        if (bi < 0 || best <= 0) break;
        var box = boxes[bi].sort(function (p, q) { return p[axis] - q[axis]; });
        var mid = box.length >> 1;
        boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
      }
      return boxes.map(function (b) {
        var r = 0, g = 0, bl = 0;
        b.forEach(function (p) { r += p[0]; g += p[1]; bl += p[2]; });
        return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)];
      });
    }
    function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
    function spread(err, i, r, g, b, k) { err[i] += r * k; err[i + 1] += g * k; err[i + 2] += b * k; }
    function ByteOut() {
      var buf = new Uint8Array(1 << 16), n = 0;
      function grow(k) { if (n + k > buf.length) { var nb = new Uint8Array(Math.max(buf.length * 2, n + k)); nb.set(buf.subarray(0, n)); buf = nb; } }
      this.byte = function (b) { grow(1); buf[n++] = b; };
      this.bytes = function (a) { grow(a.length); for (var i = 0; i < a.length; i++) buf[n++] = a[i]; };
      this.u16 = function (v) { grow(2); buf[n++] = v & 255; buf[n++] = (v >> 8) & 255; };
      this.str = function (s) { grow(s.length); for (var i = 0; i < s.length; i++) buf[n++] = s.charCodeAt(i); };
      this.result = function () { return buf.slice(0, n); };
    }
    function lzw(minSize, idx, out) {   // GIF LZW (variable code size up to 12 bits), in 255-byte sub-blocks
      var clear = 1 << minSize, eoi = clear + 1, size = minSize + 1, next = eoi + 1, maxcode = (1 << size) - 1;
      var dict = new Map(), acc = 0, bits = 0, block = [];
      function flushBlock() { if (block.length) { out.byte(block.length); out.bytes(block); block = []; } }
      function put(code) { acc |= code << bits; bits += size; while (bits >= 8) { block.push(acc & 255); acc >>>= 8; bits -= 8; if (block.length === 255) flushBlock(); } }
      put(clear);
      var prefix = idx[0];
      for (var i = 1; i < idx.length; i++) {
        var k = idx[i], key = (prefix << 8) | k, hit = dict.get(key);
        if (hit !== undefined) { prefix = hit; continue; }
        put(prefix);
        if (next < 4096) { dict.set(key, next++); if (next > maxcode + 1 && size < 12) { size++; maxcode = (1 << size) - 1; } }
        else { put(clear); dict.clear(); size = minSize + 1; maxcode = (1 << size) - 1; next = eoi + 1; }
        prefix = k;
      }
      put(prefix); put(eoi);
      if (bits > 0) { block.push(acc & 255); if (block.length === 255) flushBlock(); }
      flushBlock();
      out.byte(0);
    }
    // Global palette, only the changed rectangle per frame, Floyd–Steinberg dithering.
    function gif(frames, w, h, colors, dither) {
      dither = dither == null ? GIF_DITHER : dither;
      var pal = palette(frames, colors);
      while (pal.length < 256) pal.push([0, 0, 0]);
      var lookup = new Int16Array(32768).fill(-1);
      function nearest(r, g, b) {
        var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3), hit = lookup[key];
        if (hit >= 0) return hit;
        var bestI = 0, bestD = 1e9, rr = (r & 0xf8) | 4, gg = (g & 0xf8) | 4, bb = (b & 0xf8) | 4;
        for (var i = 0; i < colors && i < pal.length; i++) {
          var p = pal[i], d = (p[0] - rr) * (p[0] - rr) * 2 + (p[1] - gg) * (p[1] - gg) * 4 + (p[2] - bb) * (p[2] - bb) * 3;
          if (d < bestD) { bestD = d; bestI = i; }
        }
        lookup[key] = bestI;
        return bestI;
      }
      var out = new ByteOut();
      out.str('GIF89a'); out.u16(w); out.u16(h); out.byte(0xf7); out.byte(0); out.byte(0);
      pal.forEach(function (p) { out.byte(p[0]); out.byte(p[1]); out.byte(p[2]); });
      out.bytes([0x21, 0xff, 0x0b]); out.str('NETSCAPE2.0'); out.bytes([3, 1]); out.u16(LOOPS); out.byte(0);
      var prev = null;
      frames.forEach(function (f) {
        var x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
        if (prev) {
          x0 = w; y0 = h; x1 = -1; y1 = -1;
          for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            var o = (y * w + x) * 4;
            if (f.px[o] !== prev[o] || f.px[o + 1] !== prev[o + 1] || f.px[o + 2] !== prev[o + 2]) {
              if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
          if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
        }
        var rw = x1 - x0 + 1, rh = y1 - y0 + 1, idx = new Uint8Array(rw * rh);
        var err = new Float32Array((rw + 2) * 2 * 3);
        for (var yy = 0; yy < rh; yy++) {
          var cur = (yy & 1) * (rw + 2) * 3, nxt = ((yy + 1) & 1) * (rw + 2) * 3;
          for (var c = 0; c < (rw + 2) * 3; c++) err[nxt + c] = 0;
          for (var xx = 0; xx < rw; xx++) {
            var o2 = ((y0 + yy) * w + x0 + xx) * 4, e = cur + (xx + 1) * 3;
            var r = clamp(f.px[o2] + err[e] * dither), g = clamp(f.px[o2 + 1] + err[e + 1] * dither), b = clamp(f.px[o2 + 2] + err[e + 2] * dither);
            var pi = nearest(r, g, b), p = pal[pi];
            idx[yy * rw + xx] = pi;
            var er = r - p[0], eg = g - p[1], eb = b - p[2];
            spread(err, e + 3, er, eg, eb, 7 / 16);
            spread(err, nxt + xx * 3, er, eg, eb, 3 / 16);
            spread(err, nxt + (xx + 1) * 3, er, eg, eb, 5 / 16);
            spread(err, nxt + (xx + 2) * 3, er, eg, eb, 1 / 16);
          }
        }
        out.bytes([0x21, 0xf9, 0x04, 0x04]); out.u16(Math.max(2, Math.round(f.cs))); out.byte(0); out.byte(0);
        out.byte(0x2c); out.u16(x0); out.u16(y0); out.u16(rw); out.u16(rh); out.byte(0);
        out.byte(8); lzw(8, idx, out);
        prev = f.px;
      });
      out.byte(0x3b);
      return out.result();
    }
    // Try fewer colours until the GIF fits the limit.
    function gifUnder(frames, w, h, limit, dither) {
      var bytes = null, used = 0;
      [256, 224, 192, 160, 128, 96].some(function (colors) { used = colors; bytes = gif(frames, w, h, colors, dither); return bytes.length <= limit; });
      return { bytes: bytes, colors: used };
    }
    return { downsample: downsample, sharpen: sharpen, same: same, gif: gif, gifUnder: gifUnder };
  }

  // The worker: receives a motion ad's 2x frames one by one, shrinks, sharpens and de-duplicates them as they
  // arrive (so memory stays small), then encodes the GIF.
  function workerMain() {
    var L = encoderLib(), jobs = {};
    self.onmessage = function (e) {
      var m = e.data, j = jobs[m.id];
      if (m.type === 'start') { jobs[m.id] = { w: m.w, h: m.h, frames: [], cs: m.cs, limit: m.limit, dither: m.dither }; return; }
      if (m.type === 'frame') {
        var px = L.sharpen(L.downsample(new Uint8ClampedArray(m.data), j.w, j.h), j.w, j.h, 0.45);
        var last = j.frames[j.frames.length - 1];
        if (last && L.same(last.px, px)) last.cs += j.cs; else j.frames.push({ px: px, cs: j.cs });
        return;
      }
      if (m.type === 'repeat') { var lf = j.frames[j.frames.length - 1]; if (lf) lf.cs += j.cs; return; }
      if (m.type === 'end') {
        var out = L.gifUnder(j.frames, j.w, j.h, j.limit, j.dither);
        var lastPx = j.frames[j.frames.length - 1].px;
        self.postMessage({ id: m.id, gif: out.bytes.buffer, colors: out.colors, frames: j.frames.length, last: lastPx.buffer }, [out.bytes.buffer, lastPx.buffer]);
        delete jobs[m.id];
      }
    };
  }
  var pool = null;
  function workers() {
    if (pool) return pool;
    var src = 'var encoderLib = ' + encoderLib.toString() + ';\n(' + workerMain.toString() + ')();';
    var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    var n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    pool = [];
    for (var i = 0; i < n; i++) {
      var wk = new Worker(url);
      var slot = { worker: wk, busy: 0, waiting: {} };
      wk.onmessage = (function (s) { return function (e) { s.busy--; var cb = s.waiting[e.data.id]; delete s.waiting[e.data.id]; if (cb) cb(e.data); }; })(slot);
      pool.push(slot);
    }
    return pool;
  }
  function freest() { return workers().slice().sort(function (a, b) { return a.busy - b.busy; })[0]; }
  // Wait until some worker has room, so frames don't pile up in memory.
  function room() {
    return new Promise(function (ok) {
      (function check() { if (workers().some(function (s) { return s.busy < 1; })) ok(); else setTimeout(check, 120); })();
    });
  }

  // ------------------------------------------------------------------ helpers
  var L = encoderLib();
  function dataUrl(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsDataURL(blob); }); }
  var cache = {};
  function inline(url) {
    if (!cache[url]) cache[url] = fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('Could not load ' + url); return r.blob(); }).then(dataUrl);
    return cache[url];
  }
  // Each snapshot embeds its images, so shrink them once to what the ad shows at 2x (the 2000 px photos and the
  // 1.4 MB pouch PNG become a fraction of that). Cover-fit math matches the template's object-fit.
  var fitCache = {};
  function fitted(img) {
    var r = img.getBoundingClientRect(), src = img.currentSrc || img.src;
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !r.width) return inline(src);
    var s = Math.max(r.width / nw, r.height / nh) * SCALE * 1.15;   // small margin for transforms
    if (s >= 1) return inline(src);
    var w = Math.ceil(nw * s), h = Math.ceil(nh * s), key = src + '@' + w + 'x' + h;
    if (!fitCache[key]) fitCache[key] = inline(src).then(loadImage).then(function (im) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h);
      return /png/i.test(src) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.93);
    });
    return fitCache[key];
  }
  function loadImage(src) { return new Promise(function (ok, no) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { no(new Error('This browser could not draw the ad. Use Chrome, Edge or Firefox.')); }; i.src = src; }); }
  function jpeg(canvas, q) {
    q = q || 0.95;
    return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', q); }).then(function (blob) {
      if (blob.size <= LIMIT || q < 0.5) return { blob: blob, bytes: blob.size, quality: Math.round(q * 100) };
      return jpeg(canvas, q - 0.03);
    });
  }
  function toCanvas(px, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
    return c;
  }

  // ------------------------------------------------------------------ the template in an iframe
  function open(container) {
    var frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:1200px;height:1200px;border:0;visibility:hidden';
    (container || document.body).appendChild(frame);
    return new Promise(function (ok) { frame.onload = function () { ok(frame); }; frame.src = '/render/ad.html'; }).then(function (fr) {
      var win = fr.contentWindow, doc = fr.contentDocument;
      var css = Array.prototype.map.call(doc.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
      var urls = [], re = /url\(([^)]+)\)/g, m;
      while ((m = re.exec(css))) urls.push(m[1].replace(/['"]/g, ''));
      return Promise.all(urls.map(function (u) { return inline(new URL(u, doc.baseURI).href).then(function (d) { css = css.split(u).join(d); }); })).then(function () {
        workers();
        return renderer(fr, win, doc, css);
      });
    });
  }

  var jobSeq = 0;
  function renderer(frame, win, doc, css) {
    var w = 0, h = 0, svgHead = '', svgTail = '';
    function build(spec) {
      w = spec.size.w; h = spec.size.h;
      return win.build(spec).then(function (info) {
        var imgs = doc.querySelectorAll('.ad img');
        return Promise.all(Array.prototype.map.call(imgs, function (img) {
          return fitted(img).then(function (d) { img.src = d; return img.decode ? img.decode().catch(function () {}) : null; });
        })).then(function () {
          svgHead = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * SCALE + '" height="' + h * SCALE + '"><foreignObject x="0" y="0" width="' + w * SCALE + '" height="' + h * SCALE + '">' +
            '<div xmlns="http://www.w3.org/1999/xhtml" style="transform:scale(' + SCALE + ');transform-origin:0 0;width:' + w + 'px;height:' + h + 'px"><style>' + css.replace(/</g, '\\3c ') + '</style>';
          svgTail = '</div></foreignObject></svg>';
          return info;
        });
      });
    }
    var big = document.createElement('canvas');
    function snap() {
      var svg = svgHead + new XMLSerializer().serializeToString(doc.querySelector('.ad')) + svgTail;
      // A data: URL (not a blob: URL) keeps the canvas readable in Chrome.
      return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)).then(function (img) {
        big.width = w * SCALE; big.height = h * SCALE;
        var g = big.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#1c2b0e'; g.fillRect(0, 0, big.width, big.height);
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, big.width, big.height);
      });
    }
    function at(t) { win.seek(t); return snap(); }
    // What the animation changes between frames (masks, wipe, visibility): if nothing changed, the frame is a hold
    // and the previous snapshot is reused, which skips most snapshots.
    function signature() {
      return Array.prototype.map.call(doc.querySelectorAll('.ad [style]'), function (el) { return el.tagName === 'IMG' ? '' : el.getAttribute('style'); }).join('|');
    }
    function still(spec) {
      return build(spec).then(function () { return at(1e6); }).then(function (data) {
        return jpeg(toCanvas(L.sharpen(L.downsample(data.data, w, h), w, h, 0.7), w, h));
      });
    }
    function motion(spec, onFrame) {
      var id = ++jobSeq;
      return room().then(function () { return build(spec); }).then(function (info) {
        var slot = freest(), ww = w, hh = h, n = Math.round(info.duration * FPS), i = 0;
        slot.busy++;
        slot.worker.postMessage({ type: 'start', id: id, w: ww, h: hh, cs: 100 / FPS, limit: LIMIT, dither: spec.dither });
        var done = new Promise(function (ok) { slot.waiting[id] = ok; }).then(function (r) {
          var gifBlob = new Blob([r.gif], { type: 'image/gif' });
          return jpeg(toCanvas(new Uint8ClampedArray(r.last), ww, hh), 0.88).then(function (p) {
            return { blob: gifBlob, bytes: gifBlob.size, colors: r.colors, frames: r.frames, duration: Math.round(info.duration * 10) / 10 + 0.1, poster: p.blob };
          });
        });
        var lastSig = null;
        function next() {
          if (i > n) { slot.worker.postMessage({ type: 'end', id: id }); return { done: done }; }
          win.seek(i / FPS);
          var sig = signature();
          if (sig === lastSig) { slot.worker.postMessage({ type: 'repeat', id: id }); i++; return next(); }
          lastSig = sig;
          return snap().then(function (data) {
            slot.worker.postMessage({ type: 'frame', id: id, data: data.data.buffer }, [data.data.buffer]);
            if (onFrame) onFrame(i, n);
            i++;
            return next();
          });
        }
        return next();
      });
    }
    return { still: still, motion: motion, close: function () { frame.remove(); } };
  }

  // Poster for a GIF uploaded by hand: its first frame, drawn by the browser.
  function posterFromFile(file) {
    return new Promise(function (ok) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(function (b) { URL.revokeObjectURL(url); ok(b); }, 'image/jpeg', 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }

  window.YondrRender = { open: open, posterFromFile: posterFromFile, _lib: L };
})();
