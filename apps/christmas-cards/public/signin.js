// Sign-in page: shows the deadline and sends people to /auth, which signs them in with their Yondr Google account
// (auth.overyondrdev.com) and then starts our session.
import { deadlineBadge } from './shared.js';

const $ = (s) => document.querySelector(s);
fetch('/api/public/info').then((r) => r.json()).then((d) => {
  const el = $('[data-deadline]');
  el.innerHTML = deadlineBadge(d.deadline);
  el.hidden = !el.innerHTML;
}).catch(() => {});

const params = new URLSearchParams(location.search);
const next = /^\/[a-z]*$/.test(params.get('next') || '') ? params.get('next') : '';
if (next) $('[data-go]').href = '/auth?next=' + encodeURIComponent(next);
if (params.get('error')) $('[data-error]').hidden = false;
