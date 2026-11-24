// Email sign-in: a person enters their @overyondr.com email, we email a 6-digit code, they type it in,
// and get a session cookie. Codes and sessions are stored hashed in D1. Email goes out through the
// Cloudflare Email Sending binding (env.EMAIL).
//
// Cloudflare Access may still sit in front of this host. When it does, its verified email is used
// (auth.js) and this page is never needed. When Access is bypassed for cards.overyondrdev.com, this is the gate.

import { ensureSchema } from './schema.js';

const DOMAIN = 'overyondr.com';
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const CODES_PER_HOUR = 5;
const SESSION_DAYS = 30;
export const COOKIE = 'ycards_session';

const now = () => new Date().toISOString();
const later = (ms) => new Date(Date.now() + ms).toISOString();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

async function sha256(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomCode() {
  // Uniform 6 digits (rejection sampling avoids modulo bias).
  const max = 4294967296 - (4294967296 % 1000000);
  let n;
  do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= max);
  return String(n % 1000000).padStart(6, '0');
}
export function validEmail(email) {
  return new RegExp(`^[a-z0-9._%+'-]+@${DOMAIN.replace('.', '\\.')}$`).test(email);
}
const cleanEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 254);

function cookieValue(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// The signed-in email from the session cookie, or null.
export async function sessionUser(request, env) {
  const token = cookieValue(request, COOKIE);
  if (!token || !env.DB) return null;
  await ensureSchema(env.DB);
  const row = await env.DB.prepare('SELECT email, expires_at, last_seen FROM sessions WHERE token_hash = ?').bind(await sha256(token)).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  // Touch at most hourly.
  if (Date.now() - Date.parse(row.last_seen) > 3600_000) {
    await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(now(), await sha256(token)).run();
  }
  return { email: row.email, via: 'session' };
}

function codeEmail(code) {
  const text = `Your Yondr Christmas Cards sign-in code is ${code}\n\nIt expires in ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f7f8f1;font-family:'Inter Tight',Arial,sans-serif;color:#1e1e1e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f1;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dfe3d3">
<tr><td style="background:#1c300b;padding:28px 32px;color:#f4f9d1">
<div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#daff6b">Yondr Christmas Cards</div>
<div style="font-family:Georgia,serif;font-size:28px;line-height:1.15;margin-top:10px">Here’s your sign-in code</div></td></tr>
<tr><td style="padding:28px 32px">
<div style="font-size:15px;line-height:1.5;color:#4f6b35;margin-bottom:18px">Type this code on the sign-in page to continue.</div>
<div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:.28em;text-align:center;background:#daff6b;color:#1c300b;border-radius:14px;padding:18px 8px">${code}</div>
<div style="font-size:13px;line-height:1.5;color:#4f6b35;margin-top:18px">It expires in ${CODE_MINUTES} minutes. If you didn’t ask for this code, you can ignore this email.</div>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

async function start(request, env) {
  const b = await request.json().catch(() => ({}));
  const email = cleanEmail(b.email);
  if (!validEmail(email)) return json({ error: `Use your @${DOMAIN} email address.` }, 422);
  if (!env.EMAIL) return json({ error: 'Sign-in emails aren’t set up yet. Please contact the card team.' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const fromIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_codes WHERE ip = ? AND created_at > ?').bind(ip, hourAgo).first();
  if ((fromIp.n || 0) >= 30) return json({ error: 'Too many codes requested. Please wait a while and try again.' }, 429);
  const perEmail = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(created_at) AS last FROM login_codes WHERE email = ? AND created_at > ?').bind(email, hourAgo).first();
  if ((perEmail.n || 0) >= CODES_PER_HOUR) return json({ error: 'Too many codes requested for this email. Please wait an hour and try again.' }, 429);
  if (perEmail.last && Date.now() - Date.parse(perEmail.last) < 30_000) return json({ error: 'A code was just sent. Please wait 30 seconds before asking for another.' }, 429);

  const code = randomCode();
  await env.DB.prepare('INSERT INTO login_codes (email, code_hash, created_at, expires_at, attempts, ip) VALUES (?, ?, ?, ?, 0, ?)')
    .bind(email, await sha256(email + ':' + code), now(), later(CODE_MINUTES * 60_000), ip).run();
  const { text, html } = codeEmail(code);
  try {
    await env.EMAIL.send({
      from: { email: env.EMAIL_FROM || 'cards@overyondrdev.com', name: 'Yondr Christmas Cards' },
      to: email,
      subject: `${code} is your Yondr Christmas Cards code`,
      text, html,
    });
  } catch (e) {
    console.error('email send failed', e);
    return json({ error: 'We couldn’t send the email. Please try again in a minute.' }, 502);
  }
  return json({ ok: true, minutes: CODE_MINUTES });
}

async function verify(request, env) {
  const b = await request.json().catch(() => ({}));
  const email = cleanEmail(b.email);
  const code = String(b.code || '').replace(/\D/g, '');
  if (!validEmail(email) || code.length !== 6) return json({ error: 'Enter the 6-digit code from the email.' }, 422);
  // Any unexpired code works, so a slow email that arrives after "Send a new code" still signs people in.
  const { results: codes } = await env.DB.prepare('SELECT * FROM login_codes WHERE email = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 10').bind(email, now()).all();
  const row = codes[0];
  if (!row) return json({ error: 'That code has expired. Ask for a new one.', expired: true }, 422);
  if (row.attempts >= MAX_ATTEMPTS) return json({ error: 'Too many tries. Ask for a new code.', expired: true }, 422);
  const hash = await sha256(email + ':' + code);
  if (!codes.some((c) => c.code_hash === hash)) {
    await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return json({ error: left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many tries. Ask for a new code.', expired: left <= 0 }, 422);
  }
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_codes WHERE email = ? OR expires_at < ?').bind(email, now()),
    env.DB.prepare('INSERT INTO sessions (token_hash, email, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), email, now(), later(SESSION_DAYS * 864e5), now()),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
  ]);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return json({ ok: true, email }, 200, {
    'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`,
  });
}

async function logout(request, env) {
  const token = cookieValue(request, COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
}

export async function handleSignin(request, env, action) {
  if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
  await ensureSchema(env.DB);
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Cross-origin request blocked' }, 403);
  if (action === 'start') return start(request, env);
  if (action === 'verify') return verify(request, env);
  if (action === 'logout') return logout(request, env);
  return json({ error: 'Not found' }, 404);
}
