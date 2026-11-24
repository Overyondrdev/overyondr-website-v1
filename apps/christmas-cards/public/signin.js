// Sign-in: email -> 6-digit code -> session cookie, then back to the page they came from.
import { deadlineBadge } from './shared.js';

const $ = (s) => document.querySelector(s);
fetch('/api/public/info').then((r) => r.json()).then((d) => {
  const el = $('[data-deadline]');
  el.innerHTML = deadlineBadge(d.deadline);
  el.hidden = !el.innerHTML;
}).catch(() => {});
const emailForm = $('[data-step="email"]');
const codeForm = $('[data-step="code"]');
const params = new URLSearchParams(location.search);
const next = /^\/[a-z]*$/.test(params.get('next') || '') ? params.get('next') : '/';
let email = '';
let timer = null;

try { const last = localStorage.getItem('ycards-email'); if (last) emailForm.elements.email.value = last; } catch { /* private mode */ }

async function post(path, body) {
  try {
    const res = await fetch('/api/signin/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: 'You seem to be offline. Check your connection and try again.' } };
  }
}
function setError(form, name, msg) {
  const f = form.querySelector(`[data-f="${name}"]`);
  f.classList.toggle('bad', !!msg);
  f.querySelector('.msg')?.remove();
  if (msg) {
    const m = document.createElement('span');
    m.className = 'msg'; m.setAttribute('role', 'alert'); m.textContent = msg;
    f.append(m);
  }
}
function busy(form, on, label) {
  const b = form.querySelector('button[type="submit"]');
  if (on) { b.dataset.label = b.textContent; b.disabled = true; b.innerHTML = `<i class="spin" aria-hidden="true"></i>${label}`; }
  else { b.disabled = false; b.textContent = b.dataset.label; }
}
function countdown(sec) {
  const btn = $('[data-resend]');
  clearInterval(timer);
  btn.disabled = true;
  const tick = () => {
    btn.textContent = sec > 0 ? `Send a new code (${sec}s)` : 'Send a new code';
    if (sec-- <= 0) { clearInterval(timer); btn.disabled = false; }
  };
  tick();
  timer = setInterval(tick, 1000);
}

async function sendCode() {
  const r = await post('start', { email });
  if (!r.ok) return r.data.error || 'Something went wrong. Please try again.';
  try { localStorage.setItem('ycards-email', email); } catch { /* ignore */ }
  return null;
}

emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  email = emailForm.elements.email.value.trim().toLowerCase();
  if (!/^[^@\s]+@overyondr\.com$/.test(email)) return setError(emailForm, 'email', 'Use your @overyondr.com email address.');
  setError(emailForm, 'email', '');
  busy(emailForm, true, 'Sending…');
  const error = await sendCode();
  busy(emailForm, false);
  if (error) return setError(emailForm, 'email', error);
  $('[data-sent-to]').textContent = email;
  emailForm.hidden = true; codeForm.hidden = false;
  codeForm.elements.code.value = '';
  codeForm.elements.code.focus();
  countdown(30);
});

codeForm.elements.code.addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
  e.target.value = v;
  setError(codeForm, 'code', '');
  if (v.length === 6) codeForm.requestSubmit();
});

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeForm.elements.code.value.replace(/\D/g, '');
  if (code.length !== 6) return setError(codeForm, 'code', 'Enter all 6 digits.');
  busy(codeForm, true, 'Signing in…');
  const r = await post('verify', { email, code });
  if (!r.ok) {
    busy(codeForm, false);
    setError(codeForm, 'code', r.data.error || 'That didn’t work. Please try again.');
    codeForm.elements.code.select();
    if (r.data.expired) { clearInterval(timer); const b = $('[data-resend]'); b.disabled = false; b.textContent = 'Send a new code'; }
    return;
  }
  codeForm.querySelector('button[type="submit"]').innerHTML = '✓ Signed in';
  location.replace(next);
});

$('[data-resend]').addEventListener('click', async () => {
  countdown(30);
  const error = await sendCode();
  setError(codeForm, 'code', error || '');
  if (!error) { codeForm.elements.code.value = ''; codeForm.elements.code.focus(); }
});
$('[data-change]').addEventListener('click', () => {
  clearInterval(timer);
  codeForm.hidden = true; emailForm.hidden = false;
  emailForm.elements.email.focus();
});
