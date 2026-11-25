/* First-visit tour of the ad library, by role. Spotlights the real parts of the page, one short card per step.
 *   First visit: the tour for your role (viewer, editor or admin).
 *   Role went up since your last tour (e.g. viewer -> editor): a short "new for you" tour of just the added features.
 * What you've seen is stored per person on the server (users.tour_role), so it follows you across browsers.
 * Replay any time from Help > Take the tour. */
(function () {
  'use strict';
  var RANK = { viewer: 0, editor: 1, admin: 2 };
  var STEPS = {
    viewer: [
      { title: 'Welcome to the Yondr ad library', text: 'Every approved Yondr display ad lives here, in every size, ready to download and use. This 1-minute tour shows you around.', wide: true },
      { sel: '[data-toolbar]', title: 'Find the right ad fast', text: 'Filter by version (pouch, in use, motion), size, headline and status. Your filters are remembered next time.' },
      { sel: '.card', title: 'Every ad, at real size', text: 'Click an ad for its details: full size, replay for motion, file info, comments. The ↓ button downloads it straight away.' },
      { sel: '.card .pick', title: 'Grab several at once', text: 'Tick ads to select them, then download them together as a zip. “Download all” at the top gets the whole set.', pad: 6 },
      { sel: '[data-tab="copy"]', title: 'Copy for every platform', text: 'Headlines, descriptions and the CTA ready to paste, with Google Ads character counts, plus specs and the source images.' },
      { sel: '[data-tab="campaigns"]', title: 'See where ads run', text: 'Campaigns show which ads are live where, and when.' },
      { sel: '[data-help-btn]', title: 'Questions? Ask Help', text: 'The help center answers everything, and you can replay this tour from here. To change an ad, open it and choose “Suggest a change”.' },
    ],
    editor: [
      { sel: '.card .btn.forest', title: 'Edit any ad in place', text: 'Click Edit on an ad to change its headline, tagline, button and more, with a live preview. Change it on every ad that shares the text, or only on this one.', pad: 6 },
      { sel: '[data-tab="edit"]', title: 'Set-wide copy changes', text: 'Edit copy shows every shared text at once. Saving re-renders the affected ads in your browser; keep the tab open until it’s done.' },
      { sel: '[data-upload]', title: 'Upload finished ads', text: 'Add JPEG, GIF, PNG or WebP ads. Size and animation are read from each file, and anything over 150 KB is flagged.' },
      { sel: '[data-tab="campaigns"]', title: 'Run campaigns', text: 'Create campaigns, add ads to them and set their status. In an ad’s details you can also approve it, set its status and its run dates.' },
    ],
    admin: [
      { sel: '[data-tab="people"]', title: 'People & permissions', text: 'Give people viewer, editor or admin access, see who has visited, and follow recent changes and help-center feedback.' },
      { sel: '[data-help-btn]', title: 'You’re the go-to', text: 'Admins are listed in the help center as the people to ask. Admins can also delete any ad or campaign.' },
    ],
  };
  var NEW_INTRO = {
    editor: { title: 'You’re now an editor', text: 'You can now edit ad copy, upload ads, set statuses and run campaigns. Here’s what’s new.', wide: true },
    admin: { title: 'You’re now an admin', text: 'You can now manage who can do what in the ad library. Here’s what’s new.', wide: true },
  };

  var root, hole, card, steps = [], at = 0, onEnd = null, lastFocus = null;

  function stepsFor(role) {
    var list = STEPS.viewer.slice();
    if (RANK[role] >= 1) list = list.slice(0, -1).concat(STEPS.editor, list.slice(-1));
    if (RANK[role] >= 2) list = list.concat(STEPS.admin);
    return list;
  }
  // New features between the role the tour was last shown for and the current role.
  function newSteps(from, to) {
    var list = [NEW_INTRO[to]];
    if (RANK[from] < 1 && RANK[to] >= 1) list = list.concat(STEPS.editor);
    if (RANK[to] >= 2) list = list.concat(STEPS.admin);
    return list;
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
    var dots = '<div class="tour-dots" aria-hidden="true">' + steps.map(function (_, k) { return '<i' + (k === i ? ' class="on"' : '') + '></i>'; }).join('') + '</div>';
    card.insertAdjacentHTML('beforeend', '<p class="tour-step">' + (i + 1) + ' of ' + n + '</p><h2 id="tour-title"></h2><p class="tour-text"></p>' + dots +
      '<div class="tour-actions"><button type="button" class="tour-skip"></button><span></span>' + (i > 0 ? '<button type="button" class="tour-back">Back</button>' : '') +
      '<button type="button" class="tour-next"></button></div>');
    card.querySelector('#tour-title').textContent = s.title;
    card.querySelector('.tour-text').textContent = s.text;
    card.querySelector('.tour-skip').textContent = i === n - 1 ? '' : 'Skip tour';
    card.querySelector('.tour-next').textContent = i === n - 1 ? 'Done' : i === 0 ? 'Show me around' : 'Next';
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
