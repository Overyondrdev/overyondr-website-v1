/* First-visit tour of the ad library, by role. Spotlights the real parts of the page, one short card per step.
 *   First visit: the tour for your role (viewer, editor or admin).
 *   Role went up since your last tour (e.g. viewer -> editor): a short "new for you" tour of just the added features.
 * What you've seen is stored per person on the server (users.tour_role), so it follows you across browsers.
 * Replay any time from Help > Take the tour. */
(function () {
  'use strict';
  var RANK = { viewer: 0, editor: 1, admin: 2 };
  // Kept short on purpose: one step per main idea. Everything else is in the help center.
  var STEPS = {
    viewer: [
      { title: 'Welcome to the Yondr ad library', text: 'Every Yondr display ad, in every size, ready to download and use. Four quick tips.', wide: true },
      { sel: '[data-toolbar]', title: 'Find ads fast', text: 'Search, or filter by version, size, headline and status. Matrix shows the whole set on one screen.' },
      { sel: '.card', title: 'Open, download, select', text: 'Click an ad for details and comments, ↓ to download it, or tick several (or use Download kit) to get a zip.' },
      { sel: '[data-help-btn]', title: 'Need anything else?', text: 'Ad copy and specs are on the Copy & specs tab. Help has answers to everything, and this tour.' },
    ],
    editor: [
      { sel: '.card .btn.forest', title: 'Edit any ad', text: 'Click Edit to change an ad’s text with a live preview; it updates in the background. Review steps through ads waiting for approval.', pad: 6 },
    ],
    admin: [
      { sel: '[data-tab="people"]', title: 'Give people access', text: 'On People, make someone a viewer, editor or admin. The bell keeps everyone posted on suggestions and reviews.' },
    ],
  };
  var NEW_TITLE = { editor: 'You’re now an editor', admin: 'You’re now an admin' };

  var root, hole, card, steps = [], at = 0, onEnd = null, lastFocus = null;

  function stepsFor(role) {
    var list = STEPS.viewer.slice(0, -1);
    if (RANK[role] >= 1) list = list.concat(STEPS.editor);
    if (RANK[role] >= 2) list = list.concat(STEPS.admin);
    return list.concat(STEPS.viewer.slice(-1));
  }
  // Promoted since the last tour: just the new feature(s), titled "You're now an editor/admin".
  function newSteps(from, to) {
    var list = [];
    if (RANK[from] < 1 && RANK[to] >= 1) list = list.concat(STEPS.editor);
    if (RANK[to] >= 2) list = list.concat(STEPS.admin);
    return list.map(function (s, i) { return i === 0 ? Object.assign({}, s, { title: NEW_TITLE[to] }) : s; });
  }

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]');
  }
  function build() {
    root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = '<div class="tour-hole" aria-hidden="true"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1"></div>';
    document.body.appendChild(root);
    document.body.classList.add('tour-active');
    hole = root.firstChild; card = root.lastChild;
    root.addEventListener('click', function (e) { if (e.target === root) next(); });
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
  }
  function key(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    else if (e.key === 'Tab') { // keep focus in the card
      var f = card.querySelectorAll('button'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function target() { var s = steps[at]; return s.sel ? document.querySelector(s.sel) : null; }
  function place() {
    if (!root) return;
    var s = steps[at], el = target(), vw = window.innerWidth, vh = window.innerHeight;
    if (!el || s.wide) {
      hole.style.cssText = 'left:50%;top:50%;width:0;height:0';
      card.classList.add('center');
      card.style.left = ''; card.style.top = '';
      return;
    }
    card.classList.remove('center');
    var r = el.getBoundingClientRect(), pad = s.pad != null ? s.pad : 8;
    hole.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
    var cw = Math.min(360, vw - 24), ch = card.offsetHeight;
    var below = r.bottom + pad + 14, above = r.top - pad - 14 - ch;
    var top = below + ch < vh ? below : above > 8 ? above : Math.max(8, vh - ch - 12);
    var left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
    card.style.left = left + 'px'; card.style.top = top + 'px'; card.style.width = cw + 'px';
  }
  function go(i) {
    if (i < 0) return;
    // Skip steps whose target isn't on screen for this person (e.g. no cards yet).
    while (i < steps.length && steps[i].sel && !steps[i].wide && !visible(document.querySelector(steps[i].sel))) i++;
    if (i >= steps.length) return end(true);
    at = i;
    var s = steps[i], el = target(), n = steps.length;
    if (el && !s.wide) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    card.innerHTML = '';
    var dots = n < 2 ? '' : '<div class="tour-dots" aria-hidden="true">' + steps.map(function (_, k) { return '<i' + (k === i ? ' class="on"' : '') + '></i>'; }).join('') + '</div>';
    card.insertAdjacentHTML('beforeend', (n > 1 ? '<p class="tour-step">' + (i + 1) + ' of ' + n + '</p>' : '') + '<h2 id="tour-title"></h2><p class="tour-text"></p>' + dots +
      '<div class="tour-actions"><button type="button" class="tour-skip"></button><span></span>' + (i > 0 ? '<button type="button" class="tour-back">Back</button>' : '') +
      '<button type="button" class="tour-next"></button></div>');
    card.querySelector('#tour-title').textContent = s.title;
    card.querySelector('.tour-text').textContent = s.text;
    card.querySelector('.tour-skip').textContent = i === n - 1 ? '' : 'Skip tour';
    card.querySelector('.tour-next').textContent = i === n - 1 ? (n === 1 ? 'Got it' : 'Done') : i === 0 && s.wide ? 'Show me' : 'Next';
    card.querySelector('.tour-skip').onclick = function () { end(false); };
    card.querySelector('.tour-next').onclick = next;
    var back = card.querySelector('.tour-back'); if (back) back.onclick = function () { go(at - 1); };
    setTimeout(place, 30); setTimeout(place, 400);
    place();
    card.querySelector('.tour-next').focus({ preventScroll: true });
  }
  function next() { go(at + 1); }
  function end(done) {
    if (!root) return;
    document.removeEventListener('keydown', key, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place);
    root.remove(); root = null;
    document.body.classList.remove('tour-active');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (onEnd) onEnd(done);
  }
  function start(list, cb) {
    if (root || !list.length) return;
    lastFocus = document.activeElement;
    steps = list; onEnd = cb || null;
    build();
    go(0);
  }

  window.YondrTour = {
    // Full tour for a role.
    start: function (role, cb) { start(stepsFor(role), cb); },
    // Decide on page load: nothing, the full tour, or what's new since the last tour.
    maybe: function (me, save) {
      if (!me || !me.role) return;
      var seen = me.tourRole, role = me.role;
      if (seen && RANK[seen] >= RANK[role]) return;
      var list = seen ? newSteps(seen, role) : stepsFor(role);
      setTimeout(function () { start(list, function () { save(role); }); }, 600);
    },
  };
})();
