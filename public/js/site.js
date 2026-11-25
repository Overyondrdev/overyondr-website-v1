/*
 * V1 site behaviour. Replaces Squarespace's ~1 MB of platform scripts and the
 * site's jQuery footer code with small, dependency-free equivalents.
 * Each feature is independent and does nothing if its markup isn't on the page.
 */
(function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var body = document.body;

  /* ---- Footer placement. A few pages (/blog/digital-overload-in-schools, /hackersjack,
     /newyork-education, /ny-education) have an unclosed block in their content, so the parser
     nests the site footer inside the last page section: squeezed into a side column, pushed off
     to the right (horizontal scroll), or collapsed to zero width. Put it back after <main>. ---- */
  function footerPlacement() {
    var footer = document.getElementById('footer-sections');
    var wrapper = document.getElementById('siteWrapper');
    var main = document.getElementById('page');
    if (!footer || !wrapper || !main || footer.parentNode === wrapper || main.parentNode !== wrapper) return;
    wrapper.insertBefore(footer, main.nextSibling);
  }

  /* ---- Header height (layout reserves space for the fixed header) ---- */
  function headerHeight() {
    var header = document.getElementById('header');
    if (!header) return;
    var set = function () {
      document.documentElement.style.setProperty('--header-height', header.getBoundingClientRect().height + 'px');
    };
    set();
    $$('img', header).forEach(function (img) { if (!img.complete) img.addEventListener('load', set); });
    if (window.ResizeObserver) new ResizeObserver(set).observe(header);
    else window.addEventListener('resize', set);
  }

  /* ---- Centred-logo header: clone nav into the title wrapper (was footer code injection) ---- */
  function centredHeaderNav() {
    var wrapper = $('.header-layout-branding-center-nav-center .header-title-nav-wrapper');
    var nav = $('.header-layout-branding-center-nav-center .header-nav');
    if (!wrapper || !nav) return;
    wrapper.insertBefore(nav.cloneNode(true), wrapper.firstChild);
    setTimeout(function () { wrapper.classList.add('has-nav'); }, 200);
  }

  /* ---- Desktop folder menus ---- */
  function desktopFolders() {
    $$('.header-nav-item--folder').forEach(function (item) {
      var btn = $('.header-nav-folder-title', item);
      if (!btn) return;
      var open = function (v) { btn.setAttribute('aria-expanded', v ? 'true' : 'false'); };
      item.addEventListener('mouseenter', function () { open(true); });
      item.addEventListener('mouseleave', function () { open(false); });
      item.addEventListener('focusout', function (e) { if (!item.contains(e.relatedTarget)) open(false); });
      // Site behaviour: clicking the folder title goes to its first page.
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var first = $('.header-nav-folder-item:first-child > a', item);
        if (first) window.location.href = first.getAttribute('href');
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); open(true); var a = $('a', item); if (a) a.focus(); }
      });
      // Escape closes the dropdown from the title or from any link inside it, and returns focus to the title.
      item.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || btn.getAttribute('aria-expanded') !== 'true') return;
        open(false);
        if (document.activeElement !== btn) btn.focus();
      });
    });
  }

  /* ---- Focus helpers for overlays (menu, lightbox, cookie dialog) ---- */
  function tabbables(root) {
    var vw = window.innerWidth;
    return $$('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])', root).filter(function (el) {
      if (el.getAttribute('tabindex') === '-1') return false;
      var r = el.getBoundingClientRect();
      // visible and on screen (menu folders slide off-screen rather than being hidden)
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && getComputedStyle(el).visibility !== 'hidden';
    });
  }
  // Keep Tab / Shift+Tab inside the given elements while an overlay is open.
  function trapTab(e, roots) {
    if (e.key !== 'Tab') return;
    var list = [];
    roots.forEach(function (r) { if (r) list = list.concat(tabbables(r)); });
    if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    if (i === -1) { e.preventDefault(); list[0].focus(); return; }
    if (e.shiftKey && i === 0) { e.preventDefault(); list[list.length - 1].focus(); }
    else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
  }

  /* ---- Mobile / overlay menu ---- */
  function mobileMenu() {
    var burgers = $$('.header-burger-btn');
    if (!burgers.length) return;
    var menu = $('.header-menu');
    var lastBurger = null;
    var isOpen = function () { return body.classList.contains('header--menu-open'); };
    var setOpen = function (open) {
      body.classList.toggle('header--menu-open', open);
      burgers.forEach(function (b) {
        b.classList.toggle('burger--active', open);
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      if (!open) resetFolders();
    };
    burgers.forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', function () { lastBurger = b; setOpen(!isOpen()); });
    });
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') {
        setOpen(false);
        if (lastBurger) lastBurger.focus();
        return;
      }
      // While the overlay is open, Tab cycles between the close (burger) button and the menu links
      // instead of wandering into the page hidden behind it.
      trapTab(e, [lastBurger && lastBurger.parentNode, menu]);
    });
    var root = $('.header-menu-nav-folder[data-folder="root"]');
    // Sub-folders arrive nested inside the root folder, where Squarespace's CSS hides them
    // (.header-menu-nav-folder .header-menu-nav-folder { display: none }), so opening one showed an
    // empty panel. Move them next to the root folder, where its script used to put them.
    if (root) {
      $$('.header-menu-nav-folder', root).forEach(function (f) { root.parentNode.appendChild(f); });
    }
    var openerOf = null;
    function resetFolders() {
      $$('.header-menu-nav-folder--active').forEach(function (f) { f.classList.remove('header-menu-nav-folder--active'); });
      if (root) root.classList.remove('header-menu-nav-folder--open');
    }
    $$('.header-menu [data-folder-id]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var folder = $('.header-menu-nav-folder[data-folder="' + a.getAttribute('data-folder-id') + '"]');
        if (!folder) return;
        e.preventDefault();
        openerOf = a;
        folder.classList.add('header-menu-nav-folder--active');
        if (root) root.classList.add('header-menu-nav-folder--open');
        var first = $('a', folder);
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
      });
    });
    $$('.header-menu [data-action="back"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        resetFolders();
        if (openerOf) setTimeout(function () { openerOf.focus({ preventScroll: true }); }, 50);
      });
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024 && body.classList.contains('header--menu-open')) setOpen(false);
    });
  }

  /* ---- Accordions ---- */
  function accordions() {
    $$('.accordion-items-container').forEach(function (list) {
      var multiple = list.getAttribute('data-should-allow-multiple-open-items') === 'true';
      var items = $$('.accordion-item', list);
      var setItem = function (item, open) {
        var btn = $('.accordion-item__click-target', item);
        var drop = $('.accordion-item__dropdown', item);
        if (!btn || !drop) return;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        drop.classList.toggle('accordion-item__dropdown--open', open);
        var icon = $('.accordion-icon-container', item);
        if (icon) icon.setAttribute('data-is-open', open ? 'true' : 'false');
      };
      items.forEach(function (item, i) {
        var btn = $('.accordion-item__click-target', item);
        if (!btn) return;
        if (i === 0 && list.getAttribute('data-is-expanded-first-item') === 'true') setItem(item, true);
        btn.addEventListener('click', function () {
          var open = btn.getAttribute('aria-expanded') !== 'true';
          if (open && !multiple) items.forEach(function (o) { if (o !== item) setItem(o, false); });
          setItem(item, open);
        });
      });
    });
  }

  /* ---- Marquee (scrolling text) blocks ---- */
  function marquees() {
    $$('.Marquee').forEach(function (m) {
      var items;
      try { items = JSON.parse(m.getAttribute('data-marquee-items') || '[]'); } catch (e) { items = []; }
      if (!items.length) return;
      var tag = (m.getAttribute('data-text-style') || 'heading-1').replace('heading-', 'h').replace('paragraph-1', 'p').replace('paragraph-2', 'p').replace('paragraph-3', 'p');
      if (!/^(h[1-4]|p)$/.test(tag)) tag = 'h1';
      var speed = parseFloat(m.getAttribute('data-animation-speed') || '0.5') || 0.5;
      var dir = m.getAttribute('data-animation-direction') === 'right' ? 'reverse' : 'normal';
      var link = m.getAttribute('data-link-to');
      var display = $('.Marquee-display', m) || m;
      var group = document.createElement('div');
      group.className = 'v1-marquee-group';
      items.forEach(function (it) {
        var el = document.createElement(tag);
        el.className = 'Marquee-item Marquee-item--text v1-marquee-item';
        el.textContent = it.text || '';
        group.appendChild(el);
      });
      var track = document.createElement(link ? 'a' : 'div');
      track.className = 'v1-marquee-track';
      if (link) {
        track.href = link;
        if (m.getAttribute('data-new-window') === 'true') track.target = '_blank';
      }
      track.setAttribute('aria-label', items.map(function (i) { return i.text; }).join(' '));
      display.innerHTML = '';
      display.appendChild(track);
      track.appendChild(group);
      // Repeat the group until it covers twice the width, so the loop is seamless.
      requestAnimationFrame(function () {
        var w = group.getBoundingClientRect().width || 1;
        var copies = Math.max(2, Math.ceil((display.getBoundingClientRect().width * 2) / w) + 1);
        for (var i = 1; i < copies; i++) {
          var c = group.cloneNode(true);
          c.setAttribute('aria-hidden', 'true');
          track.appendChild(c);
        }
        var pxPerSec = 40 + speed * 120;
        track.style.setProperty('--v1-marquee-shift', -w + 'px');
        track.style.animation = 'v1-marquee ' + (w / pxPerSec) + 's linear infinite ' + dir;
        if (m.getAttribute('data-paused-on-hover') === 'true') track.classList.add('v1-marquee--pause');
      });
    });
  }

  /* ---- Logo strips: duplicate list for an endless scroll (was footer code injection) ---- */
  function logoStrips() {
    $$('.user-items-list[data-space-below-section-title-value="92"] .user-items-list-simple').forEach(function (list) {
      list.parentNode.appendChild(list.cloneNode(true));
      var content = list.closest('.content');
      if (content) {
        content.classList.add('logos-loaded');
        if ($('.list-item[data-is-card-enabled="true"]', list)) content.classList.add('logo-gradient');
      }
    });
  }

  /* ---- List items become whole-card links (was footer code injection) ---- */
  function listItemLinks() {
    $$('.user-items-list-simple .list-item').forEach(function (item) {
      var btn = $('.list-item-content__button', item);
      if (!btn || item.parentNode.classList.contains('list-item-link')) return;
      var a = document.createElement('a');
      a.className = 'list-item-link';
      a.href = btn.getAttribute('href');
      item.parentNode.insertBefore(a, item);
      a.appendChild(item);
    });
  }

  /* ---- Swipe helper: calls back(-1 | 1) on a horizontal drag/swipe of 40px or more ---- */
  function onSwipe(el, cb) {
    var x0 = null, y0 = null;
    el.addEventListener('pointerdown', function (e) { if (e.button === 0) { x0 = e.clientX; y0 = e.clientY; } });
    el.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) cb(dx < 0 ? 1 : -1);
    });
    el.addEventListener('pointercancel', function () { x0 = null; });
  }
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  // Keep links/buttons in hidden slides out of the tab order.
  function setInert(el, hidden) {
    el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    $$('a, button', el).forEach(function (a) { if (hidden) a.setAttribute('tabindex', '-1'); else a.removeAttribute('tabindex'); });
  }

  /* ---- Banner slideshows / carousels (user items lists). Squarespace's CSS stacks every slide in one
     grid cell, parked off-screen (translateX(-9999px)), with the list at opacity 0 until its script
     placed them, so without this both rendered as an empty block with arrows. ---- */
  function slideshows() {
    $$('.user-items-list-banner-slideshow').forEach(function (show) {
      var list = $('.slides', show);
      var slides = list ? $$('.slide', list).filter(function (s) { return s.parentNode === list; }) : [];
      if (!slides.length) return;
      var i = 0, n = slides.length;
      var go = function (k, animate) {
        var prev = i, dir = k > i ? 1 : -1;
        i = (k + n) % n;
        if (reducedMotion()) animate = false;
        slides.forEach(function (s, j) {
          var active = j === i, leaving = animate && j === prev && prev !== i;
          s.style.transition = 'none';
          if (active && animate && prev !== i) {
            // start just off-screen on the side we're moving towards, then slide in
            s.style.transform = 'translateX(' + (dir * 100) + '%)';
            s.getBoundingClientRect();
          }
          if (active || leaving) s.style.transition = animate ? 'transform .6s cubic-bezier(.4,0,.2,1)' : 'none';
          s.style.transform = active ? 'translateX(0)' : leaving ? 'translateX(' + (-dir * 100) + '%)' : 'translateX(-9999px)';
          s.style.pointerEvents = active ? 'auto' : 'none';
          setInert(s, !active);
        });
      };
      go(0, false);
      list.classList.add('slides--initialized');
      if (n < 2) return;
      $$('.user-items-list-banner-slideshow__arrow-button--left, .mobile-arrow-button--left', show).forEach(function (b) { b.addEventListener('click', function () { go(i - 1, true); }); });
      $$('.user-items-list-banner-slideshow__arrow-button--right, .mobile-arrow-button--right', show).forEach(function (b) { b.addEventListener('click', function () { go(i + 1, true); }); });
      onSwipe($('.slideshow-gutter', show) || show, function (d) { go(i + d, true); });
    });

    $$('.user-items-list-carousel').forEach(function (show) {
      var list = $('.user-items-list-carousel__slides', show);
      var slides = list ? $$('.user-items-list-carousel__slide', list).filter(function (s) { return s.parentNode === list; }) : [];
      if (!slides.length) return;
      var n = slides.length, i = 0;
      var adjacent = show.getAttribute('data-show-adjacent-slides') === 'true';
      var cols = function () { return Math.min(n, Math.max(1, getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length)); };
      var place = function (animate, prevI) {
        var c = cols(), gap = parseFloat(getComputedStyle(list).columnGap) || 0;
        var shown = adjacent && n > c ? c + 1 : c;
        if (reducedMotion()) animate = false;
        slides.forEach(function (s, j) {
          var off = ((j - i) % n + n) % n;
          var was = prevI == null ? off : ((j - prevI) % n + n) % n;
          // slides that wrap round the end jump instead of sliding across the whole row
          s.style.transition = animate && Math.abs(off - was) === 1 ? 'transform .5s cubic-bezier(.4,0,.2,1)' : 'none';
          s.style.transform = 'translateX(calc(' + off + ' * (100% + ' + gap + 'px)))';
          s.style.visibility = off < shown ? 'visible' : 'hidden';
          s.style.pointerEvents = off < c ? 'auto' : 'none';
          setInert(s, off >= c);
        });
      };
      var go = function (k) { var p = i; i = (k + n) % n; place(true, p); };
      place(false);
      list.classList.add('user-items-list-carousel__slides--initialized');
      window.addEventListener('resize', function () { place(false); });
      $$('button[class*="arrow-button--left"]', show).forEach(function (b) { b.addEventListener('click', function () { go(i - 1); }); });
      $$('button[class*="arrow-button--right"]', show).forEach(function (b) { b.addEventListener('click', function () { go(i + 1); }); });
      onSwipe(list, function (d) { go(i + d); });
    });
  }

  /* ---- Gallery sections, "reel" layout: one row of images at the reel's height, moved by the
     arrows. Squarespace positioned every item in JS, so without this the reel was empty. ---- */
  function galleryReels() {
    $$('.gallery-reel').forEach(function (reel) {
      var list = $('.gallery-reel-list', reel);
      var items = $$('.gallery-reel-item', reel);
      if (!list || !items.length) return;
      var props = {};
      try { props = JSON.parse(reel.getAttribute('data-props') || '{}'); } catch (e) { /* defaults */ }
      var lefts = [], widths = [], total = 0, offset = 0, anim = null;
      items.forEach(function (fig) {
        var img = $('img', fig), src = $('.gallery-reel-item-src', fig);
        if (src) src.setAttribute('data-visible', 'true');
        if (img) loadImg(img, !!props.isCropping);
      });
      var looping = function () { return total >= list.clientWidth + Math.max.apply(null, widths); };
      var draw = function () {
        var w = list.clientWidth, loop = looping();
        if (!loop) offset = Math.max(0, Math.min(offset, total - w));
        items.forEach(function (fig, k) {
          var x = lefts[k] - offset;
          if (loop) { x = ((x % total) + total) % total; if (x >= w) x -= total; }
          fig.style.transform = 'translateX(' + Math.round(x) + 'px)';
          setInert(fig, !(x + widths[k] > 1 && x < w - 1));
        });
      };
      var layout = function () {
        var h = list.clientHeight;
        total = 0;
        items.forEach(function (fig, k) {
          var img = $('img', fig);
          var d = ((img && img.getAttribute('data-image-dimensions')) || '1x1').split('x');
          var ar = (parseFloat(d[0]) / parseFloat(d[1])) || 1;
          widths[k] = Math.round(h * ar);
          lefts[k] = total;
          total += widths[k];
          fig.style.width = widths[k] + 'px';
          fig.style.height = h + 'px';
        });
        draw();
      };
      var current = function () {
        var o = looping() ? ((offset % total) + total) % total : offset, best = 0;
        lefts.forEach(function (l, k) { if (l <= o + 1) best = k; });
        return best;
      };
      var move = function (d) {
        var n = items.length, cur = current(), loop = looping();
        var o = loop ? ((offset % total) + total) % total : offset;
        var next = cur + d;
        if (!loop) next = Math.max(0, Math.min(n - 1, next));
        var delta = lefts[((next % n) + n) % n] - o;
        if (loop && d > 0 && delta <= 0) delta += total;
        if (loop && d < 0 && delta >= 0) delta -= total;
        var from = offset, to = offset + delta, t0 = null;
        if (anim) cancelAnimationFrame(anim);
        if (reducedMotion()) { offset = to; draw(); return; }
        var step = function (t) {
          if (t0 === null) t0 = t;
          var p = Math.min(1, (t - t0) / 500);
          offset = from + (to - from) * (1 - Math.pow(1 - p, 3));
          draw();
          if (p < 1) anim = requestAnimationFrame(step);
        };
        anim = requestAnimationFrame(step);
      };
      var btns = $$('.gallery-reel-control-btn', reel);
      if (btns[0]) btns[0].addEventListener('click', function () { move(-1); });
      if (btns[1]) btns[1].addEventListener('click', function () { move(1); });
      onSwipe(list, move);
      layout();
      if (window.ResizeObserver) new ResizeObserver(layout).observe(list);
      else window.addEventListener('resize', layout);
    });
  }

  /* ---- Gallery fullscreen slideshows ---- */
  function fullscreenSlideshows() {
    $$('.gallery-fullscreen-slideshow').forEach(function (g) {
      var items = $$('.gallery-fullscreen-slideshow-item', g);
      if (!items.length) return;
      var bullets = $$('.gallery-fullscreen-slideshow-bullet', g);
      var i = 0;
      var go = function (n) {
        i = (n + items.length) % items.length;
        items.forEach(function (it, k) {
          it.style.opacity = k === i ? '1' : '0';
          it.style.zIndex = k === i ? '1' : '0';
          it.style.visibility = 'visible';
        });
        bullets.forEach(function (b, k) { b.classList.toggle('active', k === i); b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      };
      $$('.gallery-fullscreen-slideshow-control-btn', g).forEach(function (b, k) {
        b.addEventListener('click', function () { go(k === 0 ? i - 1 : i + 1); });
      });
      bullets.forEach(function (b, k) { b.addEventListener('click', function () { go(k); }); });
      go(0);
      // Autoplay settings live in data-props ({autoplayEnabled, slideDurationMs}).
      var props = {};
      try { props = JSON.parse(g.getAttribute('data-props') || '{}'); } catch (e) { /* defaults */ }
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (props.autoplayEnabled && items.length > 1 && !reduce) setInterval(function () { go(i + 1); }, props.slideDurationMs || 3000);
    });
  }

  /* ---- Legacy gallery blocks (grid + slideshow). Squarespace's script loaded their images
     from data-src and laid them out; settings come from each block's data-block-json. ---- */
  var ASPECT = { square: 1, standard: 3 / 2, 'standard-vertical': 2 / 3, 'four-three': 4 / 3,
    'three-four-vertical': 3 / 4, widescreen: 16 / 9, 'anamorphic-widescreen': 2.4 };
  function focal(img) {
    var f = (img.getAttribute('data-image-focal-point') || '0.5,0.5').split(',');
    return (parseFloat(f[0]) * 100) + '% ' + (parseFloat(f[1]) * 100) + '%';
  }
  function loadImg(img, crop) {
    if (!img.getAttribute('src') && img.getAttribute('data-src')) img.src = img.getAttribute('data-src');
    img.classList.add('loaded');
    img.style.objectFit = crop ? 'cover' : 'contain';
    img.style.objectPosition = focal(img);
  }
  function legacyGalleries() {
    $$('.sqs-block-gallery[data-block-json]').forEach(function (block) {
      var cfg;
      try { cfg = JSON.parse(block.getAttribute('data-block-json')); } catch (e) { return; }
      var crop = cfg['auto-crop'] !== false;
      var ratio = ASPECT[cfg['aspect-ratio']];
      if (cfg.design === 'grid') {
        block.classList.add('v1-gallery-grid');
        block.style.setProperty('--v1-cols', cfg['thumbnails-per-row'] || 4);
        block.style.setProperty('--v1-gap', (cfg.padding != null ? cfg.padding : 20) + 'px');
        block.style.setProperty('--v1-ratio', ratio || 1);
        $$('.sqs-gallery img.thumb-image', block).forEach(function (img) { loadImg(img, crop); });
        return;
      }
      if (cfg.design !== 'slideshow') return;
      block.classList.add('v1-gallery-slideshow');
      var slides = $$('.sqs-gallery > .slide', block);
      if (!slides.length) return;
      var first = $('img.thumb-image', slides[0]);
      if (!ratio && first) {
        var d = (first.getAttribute('data-image-dimensions') || '').split('x');
        ratio = d.length === 2 ? d[0] / d[1] : 3 / 2;
      }
      block.style.setProperty('--v1-ratio', ratio || 3 / 2);
      slides.forEach(function (s) { var im = $('img.thumb-image', s); if (im) loadImg(im, crop); s.classList.add('loaded'); });
      var thumbs = $$('.sqs-gallery-thumbnails img', block);
      var i = 0, timer;
      var go = function (n) {
        i = (n + slides.length) % slides.length;
        slides.forEach(function (s, k) { s.classList.toggle('v1-active', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
        thumbs.forEach(function (t, k) { t.classList.toggle('sqs-active-slide', k === i); });
      };
      var restart = function () {
        clearInterval(timer);
        if (cfg.autoplay) timer = setInterval(function () { go(i + 1); }, (cfg['autoplay-duration'] || 5) * 1000);
      };
      thumbs.forEach(function (t, k) {
        loadImg(t, true);
        var pick = function () { go(k); restart(); };
        t.addEventListener('click', pick);
        t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      });
      go(0);
      restart();
    });
  }

  /* ---- Gallery sections, "strips" layout (justified rows; Squarespace computed sizes in JS) ---- */
  function galleryStrips() {
    $$('.gallery-strips').forEach(function (g) {
      var props = {};
      try { props = JSON.parse(g.getAttribute('data-props') || '{}'); } catch (e) { /* defaults */ }
      var h = 100 + (props.rowHeight || 50) * 5;
      var wrap = $('.gallery-strips-wrapper', g) || g;
      wrap.classList.add('v1-strips');
      wrap.style.setProperty('--v1-gap', Math.round((props.gutter || 20) / 2) + 'px');
      $$('.gallery-strips-item', g).forEach(function (fig) {
        var img = $('img', fig);
        if (!img) return;
        var d = (img.getAttribute('data-image-dimensions') || '1x1').split('x');
        var ar = (parseFloat(d[0]) / parseFloat(d[1])) || 1;
        fig.style.width = 'min(100%, ' + Math.round(ar * h) + 'px)';
        fig.style.aspectRatio = String(ar);
        loadImg(img, true);
      });
    });
  }

  /* ---- Text highlights (marker / underline), styled from each text block's TextAttributes JSON ---- */
  function textHighlights() {
    var attrs = {};
    $$('script.TextAttributes-props').forEach(function (s) {
      try { JSON.parse(s.textContent).forEach(function (a) { attrs[a.id] = a; }); } catch (e) { /* ignore */ }
    });
    var color = function (c) {
      if (!c) return 'hsla(var(--accent-hsl), 1)';
      if (c.type === 'SITE_PALETTE_COLOR' && c.sitePaletteColor) {
        return 'hsla(var(--' + c.sitePaletteColor.colorName + '-hsl), ' + (c.sitePaletteColor.alphaModifier != null ? c.sitePaletteColor.alphaModifier : 1) + ')';
      }
      if (c.customColor && c.customColor.hslaValue) {
        var v = c.customColor.hslaValue;
        return 'hsla(' + v.hue + ',' + (v.saturation * 100) + '%,' + (v.lightness * 100) + '%,' + v.alpha + ')';
      }
      return 'currentColor';
    };
    $$('[data-text-attribute-id]').forEach(function (span) {
      var a = attrs[span.getAttribute('data-text-attribute-id')];
      if (!a || a.type !== 'highlight') return;
      var col = color(a.color);
      var t = a.thickness ? a.thickness.value + (a.thickness.unit || 'em') : '0.1em';
      var size = a.shape === 'marker' ? t : (a.thickness && a.thickness.unit === 'em' ? Math.min(a.thickness.value, 0.25) + 'em' : t);
      var pos = a.shape === 'marker' ? '50%' : '100%';
      span.style.backgroundImage = 'linear-gradient(' + col + ',' + col + ')';
      span.style.backgroundRepeat = 'no-repeat';
      span.style.backgroundSize = '100% ' + size;
      span.style.backgroundPosition = '0 ' + pos;
      span.style.boxDecorationBreak = span.style.webkitBoxDecorationBreak = 'clone';
      if (a.shape === 'underlineCurve') span.style.backgroundPosition = '0 96%';
    });
  }

  /* ---- Any remaining image Squarespace would have lazy-loaded from data-src ---- */
  function lazyImages() {
    $$('img[data-src]:not([src])').forEach(function (img) {
      var fill = img.closest('.content-fill, [class*="__media"]');
      loadImg(img, true);
      if (fill) { img.style.width = '100%'; img.style.height = '100%'; }
      else { img.style.objectFit = ''; }
    });
  }

  /* ---- Lightbox for galleries that enable it ---- */
  function lightbox() {
    var links = $$('[data-lightbox] .gallery-grid-lightbox-link, .gallery-grid--layout-grid[data-lightbox="true"] img, a[data-lightbox-theme]');
    if (!links.length) return;
    var overlay, imgEl, list = [], idx = 0, opener = null;
    var show = function (n) {
      idx = (n + list.length) % list.length;
      imgEl.src = list[idx].src;
      imgEl.alt = list[idx].alt || '';
      $('.v1-lightbox-prev', overlay).hidden = $('.v1-lightbox-next', overlay).hidden = list.length < 2;
    };
    var close = function () {
      overlay.hidden = true;
      body.style.overflow = '';
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };
    var icon = function (d) {
      return '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
    };
    var build = function () {
      overlay = document.createElement('div');
      overlay.className = 'v1-lightbox';
      overlay.hidden = true;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Image viewer');
      overlay.innerHTML = '<button type="button" class="v1-lightbox-close" aria-label="Close">' + icon('M5 5l14 14M19 5 5 19') + '</button>' +
        '<button type="button" class="v1-lightbox-prev" aria-label="Previous image">' + icon('M15 5l-7 7 7 7') + '</button><img alt="">' +
        '<button type="button" class="v1-lightbox-next" aria-label="Next image">' + icon('M9 5l7 7-7 7') + '</button>';
      body.appendChild(overlay);
      imgEl = $('img', overlay);
      $('.v1-lightbox-close', overlay).onclick = close;
      $('.v1-lightbox-prev', overlay).onclick = function () { show(idx - 1); };
      $('.v1-lightbox-next', overlay).onclick = function () { show(idx + 1); };
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      document.addEventListener('keydown', function (e) {
        if (overlay.hidden) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') show(idx - 1);
        if (e.key === 'ArrowRight') show(idx + 1);
        trapTab(e, [overlay]);
      });
    };
    links.forEach(function (el) {
      el.addEventListener('click', function (e) {
        var gallery = el.closest('.gallery-grid, .gallery-masonry, .gallery-reel, section');
        list = $$('img', gallery).map(function (im) { return { src: im.getAttribute('data-image') || im.currentSrc || im.src, alt: im.alt }; });
        var img = el.tagName === 'IMG' ? el : $('img', el);
        if (!list.length || !img) return;
        e.preventDefault();
        if (!overlay) build();
        opener = el.tagName === 'IMG' ? null : el;
        overlay.hidden = false;
        body.style.overflow = 'hidden';
        show(Math.max(0, $$('img', gallery).indexOf(img)));
        $('.v1-lightbox-close', overlay).focus();
      });
    });
  }

  /* ---- Scroll-in animations: same classes Squarespace used (preScale -> scaleIn etc.),
     so the site's own CSS (including its custom.css exceptions) drives the effect. ---- */
  function scrollAnimations() {
    if (!body.classList.contains('tweak-global-animations-enabled')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    var m = body.className.match(/tweak-global-animations-animation-type-([a-z]+)/);
    var pre = { fade: 'preFade', scale: 'preScale', slide: 'preSlide', flex: 'preFlex', clip: 'preClip' }[m ? m[1] : 'fade'] || 'preFade';
    var post = { preFade: 'fadeIn', preScale: 'scaleIn', preSlide: 'slideIn', preFlex: 'flexIn', preClip: 'clipIn' }[pre];
    var reveal = function (el, delay) {
      el.style.transitionTimingFunction = 'ease';
      el.style.transitionDuration = '1s';
      el.style.transitionDelay = (delay || 0) + 's';
      el.classList.add(post);
    };
    // Header animates in on load.
    $$('#header [data-animation-role="header-element"]').forEach(function (el, i) {
      el.classList.add(pre);
      requestAnimationFrame(function () { requestAnimationFrame(function () { reveal(el, Math.min(i * 0.05, 0.4)); }); });
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { reveal(en.target, 0); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -5% 0px' });
    $$('#page [data-animation-role], #footer-sections [data-animation-role], #page .sqs-html-content > *, #footer-sections .sqs-html-content > *').forEach(function (el) {
      el.classList.add(pre);
      io.observe(el);
    });
  }

  /* ---- Links: external links and files open in a new tab (was footer code injection) ---- */
  function linkTargets() {
    $$('a[href^="https://"], a[href^="http://"], a[href^="/s/"]').forEach(function (a) {
      if (a.closest('.header-menu, .header')) {
        if (!/^https?:/.test(a.getAttribute('href'))) return;
      }
      a.target = /^https:\/\/yondr-say-hey\.myshopify\.com/.test(a.href) ? '_self' : '_blank';
      if (a.target === '_blank') a.rel = 'noopener';
    });
  }

  /* ---- Industry pages: main button opens the matching contact form (was footer code injection) ---- */
  var CONTACT_TOPICS = {
    'collection-64e4cfd515a272479124fe43': 'schools',
    'collection-64e4cfd87c68bf77052656c7': 'music',
    'collection-64e4cfdcc1e8324cce0c900f': 'comedy',
    'collection-64e4cfe3afaed132cdc19755': 'events',
    'collection-64f89f59f70d4621a3046c21': 'workplace',
    'collection-64f89ca27df0e72a3af7cf46': 'productions',
    'collection-64fa1f74a481816b2e0e0377': 'venue',
    'collection-64e4cff07fb42251f15d1bf4': 'other',
  };
  var CONTACT_TABS = {
    schools: '#block-650c710c0a47d440eda1f2c5', music: '#block-1be19bc614757eb9453c',
    comedy: '#block-87e52231a4dd72f35694', events: '#block-3d1fa598437cac9c023e',
    workplace: '#block-10a15d2c6079aa302f81', productions: '#block-993d413be75012110534',
    venue: '#block-4cba9d86fc49709c7684', other: '#block-3c2956d6fbe7d1c9e272',
  };
  function contactRouting() {
    var topic = CONTACT_TOPICS[body.id];
    if (topic) {
      $$('#sections .sqs-button-element--primary').forEach(function (b) {
        b.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/contact?' + topic; });
      });
    }
    if (/^\/contact\/?$/.test(location.pathname) && location.search) {
      var sel = CONTACT_TABS[location.search.slice(1).split('&')[0]];
      if (sel) window.addEventListener('load', function () { var b = $(sel + ' button'); if (b) b.click(); });
    }
  }

  /* ---- Cookie banner (replaces Squarespace's). Choice saved as v1-cookie-consent in
     localStorage: {analytics: bool, advertising: bool}. Analytics tags added at cutover read it. ---- */
  var CONSENT_KEY = 'v1-cookie-consent';
  function readConsent() { try { return JSON.parse(localStorage.getItem(CONSENT_KEY)); } catch (e) { return null; } }
  function saveConsent(c) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch (e) { /* private mode */ }
    document.dispatchEvent(new CustomEvent('v1:consent', { detail: c }));
  }
  function cookieBanner() {
    if (readConsent()) return;
    var bar = document.createElement('section');
    bar.className = 'v1-cookie-banner';
    bar.setAttribute('aria-label', 'Cookie banner');
    bar.innerHTML = '<div class="v1-cookie-text"><p><em>We use cookies to improve your experience on our site. By continuing, you agree to our use of cookies. Learn more in our&nbsp;</em><a href="/privacypolicy"><em>Privacy Policy</em></a><em>.</em></p></div>' +
      '<div class="v1-cookie-buttons"><button type="button" class="v1-cookie-manage">Manage cookies</button><button type="button" class="v1-cookie-accept">Accept all</button></div>';
    body.appendChild(bar);
    var close = function () { bar.remove(); };
    $('.v1-cookie-accept', bar).addEventListener('click', function () { saveConsent({ analytics: true, advertising: true }); close(); });
    $('.v1-cookie-manage', bar).addEventListener('click', function () { manageCookies(close); });
  }
  function manageCookies(done) {
    var c = readConsent() || { analytics: false, advertising: false };
    var cat = function (key, title, desc) {
      return '<hr><div class="v1-cookie-cat"><h4 id="v1c-' + key + '">' + title + '</h4><label class="v1-toggle"><span aria-hidden="true">' + (c[key] ? 'On' : 'Off') + '</span>' +
        '<input type="checkbox" data-key="' + key + '" aria-labelledby="v1c-' + key + '"' + (c[key] ? ' checked' : '') + '></label></div><p>' + desc + '</p>';
    };
    var dlg = document.createElement('div');
    dlg.className = 'v1-cookie-dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'v1c-heading');
    dlg.innerHTML = '<div class="v1-cookie-panel"><button type="button" class="v1-cookie-close" aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5 5 19"/></svg></button><h3 id="v1c-heading">Manage Cookies</h3>' +
      '<div class="v1-cookie-cat"><h4>Necessary</h4><p>Always on</p></div><p>Required to enable core site functionality and to remember user preferences and choices, such as language preferences or customized settings.</p>' +
      cat('analytics', 'Performance and Analytics', 'These cookies provide quantitative measures of website visitors. With the usage of these cookies we are able to count visits and traffic sources to improve the performance of our site.') +
      cat('advertising', 'Advertising', 'These cookies are used by advertising companies to serve ads that are relevant to your interests.') +
      '<div class="v1-cookie-buttons"><button type="button" class="v1-cookie-accept">Save Preferences</button></div></div>';
    body.appendChild(dlg);
    $$('input[data-key]', dlg).forEach(function (i) {
      i.addEventListener('change', function () { i.previousElementSibling.textContent = i.checked ? 'On' : 'Off'; });
    });
    var opener = document.activeElement;
    var onKey = function (e) {
      if (e.key === 'Escape') shut();
      else trapTab(e, [dlg]); // keep focus inside the dialog while it's open
    };
    var shut = function () {
      dlg.remove();
      document.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected && opener.focus) opener.focus();
    };
    $('.v1-cookie-close', dlg).addEventListener('click', shut);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) shut(); });
    document.addEventListener('keydown', onKey);
    $('.v1-cookie-accept', dlg).addEventListener('click', function () {
      var out = {};
      $$('input[data-key]', dlg).forEach(function (i) { out[i.getAttribute('data-key')] = i.checked; });
      saveConsent(out);
      shut();
      if (done) done();
    });
    $('input', dlg).focus();
  }

  /* ---- Site search (/search). Replaces Squarespace's search API with /search-index.json. ---- */
  function siteSearch() {
    var root = document.getElementById('v1-search');
    if (!root) return;
    var input = $('#v1-search-input', root), out = $('.v1-search-results', root), notice = $('.v1-search-notice', root);
    var index = null, timer;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var mark = function (text, terms) {
      var html = esc(text);
      terms.forEach(function (t) { html = html.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<em>$1</em>'); });
      return html;
    };
    var snippet = function (item, terms) {
      var parts = [], text = item.text, lower = text.toLowerCase();
      terms.forEach(function (t) {
        var i = lower.indexOf(t);
        if (i >= 0 && parts.length < 3) parts.push(text.slice(Math.max(0, i - 60), i + 90).trim());
      });
      return parts.length ? parts.join(' … ') + ' …' : (item.description || text.slice(0, 180));
    };
    var render = function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { out.innerHTML = ''; notice.textContent = ''; return; }
      var terms = q.split(/\s+/).filter(Boolean);
      var hits = index.map(function (it) {
        var title = it.title.toLowerCase(), hay = (it.description + ' ' + it.text).toLowerCase(), score = 0;
        for (var k = 0; k < terms.length; k++) {
          var inT = title.indexOf(terms[k]) >= 0, inB = hay.indexOf(terms[k]) >= 0;
          if (!inT && !inB) return null;
          score += (inT ? 10 : 0) + (inB ? 1 : 0);
        }
        return { it: it, score: score };
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
      notice.textContent = hits.length ? '' : 'Your search did not match any documents.';
      out.innerHTML = hits.slice(0, 50).map(function (h) {
        var it = h.it;
        return '<a class="v1-search-result" href="' + esc(it.url) + '">' +
          (it.image ? '<span class="v1-search-img"><img src="' + esc(it.image) + '" alt="" loading="lazy"></span>' : '<span class="v1-search-img v1-search-img--none"></span>') +
          '<span class="v1-search-body"><span class="v1-search-title">' + mark(it.title, terms) + '</span>' +
          '<span class="v1-search-snippet">' + mark(snippet(it, terms), terms) + '</span></span></a>';
      }).join('');
    };
    var q = new URLSearchParams(location.search).get('q') || '';
    input.value = q;
    fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (d) { index = d; render(); });
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!index) return;
        render();
        history.replaceState(null, '', input.value ? '/search?q=' + encodeURIComponent(input.value) : '/search');
      }, 150);
    });
    $('form', root).addEventListener('submit', function (e) { e.preventDefault(); if (index) render(); });
    input.focus();
  }

  /* ---- Blog listings: Squarespace's script added .is-loaded to each post card, which fades it in
     (the cards start at opacity 0). Without it every blog list page (/blog, tags, authors) looked empty. */
  function blogLists() {
    var cards = document.querySelectorAll('.blog-list .blog-item, .blog-list .blog-basic-grid--container, .blog-list .blog-single-column--container');
    if (!cards.length) return;
    requestAnimationFrame(function () {
      cards.forEach(function (c) { c.classList.add('is-loaded'); });
    });
  }

  function run(fn) { try { fn(); } catch (e) { if (window.console) console.warn('site.js', fn.name, e); } }
  [footerPlacement, headerHeight, centredHeaderNav, desktopFolders, mobileMenu, accordions, marquees, logoStrips,
    listItemLinks, slideshows, galleryReels, fullscreenSlideshows, legacyGalleries, galleryStrips, lazyImages, textHighlights, blogLists, lightbox, scrollAnimations, linkTargets, contactRouting, siteSearch, cookieBanner].forEach(run);
})();
