// The Yondr sign-in pages at auth.overyondrdev.com: the page people see before Google, and every result page (signed
// out, wrong account, cancelled, expired). The design is the Yondr-branded page Cloudflare Access used to show
// (access/login.html): forest background, a headline, the three steps, and a card with the sign-in button.
// Self-contained: inline logo and styles; fonts from Google's font files (the page loads before anyone is signed in).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Where people are going: shown on the page so they know which Yondr site asked them to sign in.
const SITES = [
  { host: /^(www\.)?overyondrdev\.com$/, name: 'Yondr Dev Portal', about: 'one place for Website Review, Marketing Requests, Ad Campaigns and Christmas Card Requests' },
  { host: /^v1\./, name: 'Website V1 preview', about: 'overyondr.com as it is today, moved to its new home' },
  { host: /^v2\./, name: 'Website V2 preview', about: 'the redesign of overyondr.com, in progress' },
  { host: /^ads\./, name: 'Ad library', about: 'where Yondr ads are found, reviewed and downloaded' },
  { host: /^requests\./, name: 'Marketing requests', about: 'where you ask marketing for work and follow it to delivery' },
  { host: /^cards\./, name: 'Christmas cards', about: 'where you add the clients who should receive a Yondr card' },
  { host: /^ops\./, name: 'Yondr Ops', about: 'where admins watch the sites, manage alerts, backups and auto-fixes' },
  { host: /^feedback\./, name: 'Feedback', about: 'where the team reviews feedback left on Yondr’s sites and work' },
];
export function siteFor(returnUrl) {
  try {
    const host = new URL(returnUrl).hostname;
    const s = SITES.find((x) => x.host.test(host));
    return s ? { ...s, host } : { name: host, about: 'a Yondr site', host };
  } catch {
    return { name: 'overyondrdev.com', about: 'Yondr’s preview sites', host: 'overyondrdev.com' };
  }
}

const LOGO = `<svg class="logo" viewBox="0 0 864 203.54" role="img" aria-label="Yondr"><path fill="currentColor" d="M475.64,99.62L413.55,3.91h-56.29v77.5C348.27,33.19,307.36,0,253.76,0,217.01,0,186.22,15.61,167.59,40.97L187.04,3.91h-63.38l-30.14,68.15L63.38,3.91H0l65.35,124.55v71.15h56.33v-71.15l32.55-62.02c-3.78,10.86-5.82,22.72-5.82,35.32,0,59,44.51,101.78,105.36,101.78,53.59,0,94.51-33.19,103.5-81.42v77.51h56.33v-95.66l62.05,95.66h56.33V3.91h-56.33v95.69h0ZM253.76,150.42c-27.05,0-46.76-20.42-46.76-48.65s19.72-48.65,46.76-48.65,46.76,20.42,46.76,48.65-19.72,48.65-46.76,48.65ZM825.09,116.59c20.56-8.11,32.12-25.72,32.12-50.05,0-38.29-28.17-62.62-72.39-62.62h-71.55v79.42c-7.77-48.14-46.33-79.42-100.53-79.42h-67.27v195.71h67.27c54.21,0,92.76-31.29,100.53-79.44v79.44h56.34v-62.62c24.23,5.02,39.16,28.23,38.03,62.62h56.33c.85-39.14-12.38-68.21-38.86-83.03h0ZM609.34,150.42h-7.56V53.12h7.56c27.89,0,46.76,19.58,46.76,48.65s-18.88,48.65-46.76,48.65ZM780.95,83.44h-11.36v-33.82h11.36c9.41,0,17.04,7.57,17.04,16.91s-7.63,16.91-17.04,16.91h0Z"/></svg>`;

// Google's "G" mark, as Google's sign-in branding guidelines ask for on a "Continue with Google" button.
const G = `<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const STYLE = `
@font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 500; font-display: swap;
  src: url(https://fonts.gstatic.com/s/fraunces/v38/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7iQcIfJD58ngB1Yc7qv8.woff2) format('woff2'); }
@font-face { font-family: 'Inter Tight'; font-style: normal; font-weight: 400 700; font-display: swap;
  src: url(https://fonts.gstatic.com/s/intertight/v9/NGSwv5HMAFg6IuGlBNMjxLsH8ag.woff2) format('woff2'); }
:root { --forest:#1c300b; --forest-deep:#2a4216; --lichen:#daff6b; --offwhite:#f4f9d1; --paper:#fafbf7; --sage:#9dae7e;
  --moss:#4f6b35; --ink:#1e1e1e; --line:#e2e6d9; --display:'Fraunces',Georgia,serif; --text:'Inter Tight',Arial,sans-serif; }
*{box-sizing:border-box} html,body{margin:0;min-height:100%}
body{min-height:100vh;display:flex;flex-direction:column;background:var(--forest);color:var(--offwhite);font:400 16px/1.5 var(--text);
  -webkit-font-smoothing:antialiased;background-image:radial-gradient(60rem 40rem at 85% -10%,rgba(218,255,107,.12),transparent 60%),
  radial-gradient(40rem 30rem at -10% 110%,rgba(157,174,126,.14),transparent 60%)}
a{color:inherit}
:focus-visible{outline:3px solid var(--lichen);outline-offset:3px;border-radius:8px}
header{padding:28px clamp(20px,5vw,56px)}
.logo{display:block;width:112px;height:auto;color:var(--offwhite)}
main{flex:1;width:100%;max-width:1080px;margin:0 auto;padding:24px clamp(20px,5vw,56px) 48px;display:grid;
  grid-template-columns:minmax(0,1.1fr) minmax(0,420px);gap:clamp(32px,6vw,88px);align-items:center}
.eyebrow{display:inline-block;margin:0 0 20px;padding:7px 12px;border-radius:999px;background:var(--lichen);color:var(--forest);
  font:700 12px/1 var(--text);letter-spacing:.12em;text-transform:uppercase}
h1{margin:0 0 18px;font:500 clamp(2.5rem,5.5vw,4.25rem)/1.02 var(--display);letter-spacing:-.02em;color:var(--offwhite)}
h1 em{font-style:normal;color:var(--lichen)}
.lede{margin:0;max-width:38ch;font-size:18px;color:var(--sage)}
.lede b{color:var(--offwhite);font-weight:600}
.steps{list-style:none;margin:28px 0 0;padding:0;display:grid;gap:10px;font-size:15px;color:var(--offwhite)}
.steps li{display:flex;gap:12px;align-items:baseline}
.steps .n{flex:none;width:24px;height:24px;border-radius:999px;display:inline-grid;place-items:center;background:var(--forest-deep);
  color:var(--lichen);font:700 12px/1 var(--text);transform:translateY(-1px)}
.card{background:var(--paper);color:var(--ink);border-radius:20px;padding:28px;box-shadow:0 40px 80px -30px rgba(0,0,0,.55)}
.card h2{margin:0 0 6px;font:500 26px/1.15 var(--display);color:var(--forest)}
.card p{margin:0 0 20px;font-size:14px;color:var(--moss)}
.card .dest{display:flex;gap:10px;align-items:center;margin:0 0 20px;padding:12px 14px;border-radius:12px;background:#eef3e3;color:var(--forest);font-size:14px}
.card .dest b{display:block;font-size:15px}
.card .dest small{color:var(--moss)}
.message{margin:0 0 16px;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.45}
.message.bad{background:#fff4ef;color:#8a2a12}
.message.ok{background:#eef8d8;color:var(--forest)}
.google{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:52px;padding:0 20px;border-radius:999px;
  background:#fff;color:#1f1f1f;border:1px solid #c9cebc;font:600 16px/1 var(--text);text-decoration:none;transition:background .15s,border-color .15s,box-shadow .15s}
.google:hover{background:#f7f8f3;border-color:var(--forest);box-shadow:0 2px 10px -4px rgba(28,48,11,.35)}
.g{width:20px;height:20px;flex:none}
.alt{display:block;margin-top:14px;text-align:center;font-size:14px;font-weight:600;color:var(--forest)}
.fine{margin:18px 0 0 !important;font-size:13px !important;color:var(--moss)}
footer{padding:20px clamp(20px,5vw,56px) 28px;font-size:13px;color:var(--sage);display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}
@media (max-width:820px){main{grid-template-columns:1fr;padding-top:8px}.steps{display:none}.lede{font-size:16px}.card{padding:22px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;

function layout(title, intro, card) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Yondr</title><style>${STYLE}</style></head>
<body><header>${LOGO}</header><main><section>${intro}</section><section class="card" aria-labelledby="card-h">${card}</section></main>
<footer><span>© Yondr, Inc. 2027</span><span>Need access? Ask the web team.</span></footer></body></html>`;
}

const googleButton = (href, label = 'Continue with Google') => `<a class="google" href="${esc(href)}">${G}<span>${esc(label)}</span></a>`;

/**
 * The page before Google, and the page for every sign-in result.
 *   ret       where the person goes after signing in
 *   notice    optional { tone: 'bad'|'ok', html } shown in the card (already escaped)
 *   switchAccount  offer "Use another Google account"
 */
export function signInPage({ ret, domain, hours, notice, switchAccount = false, heading = 'Sign in' }) {
  const site = siteFor(ret);
  const start = `/login/google?return=${encodeURIComponent(ret)}`;
  const intro = `<p class="eyebrow">Yondr team only</p>
<h1>Be here <em>now.</em><br>Sign in to continue.</h1>
<p class="lede">You’re on your way to the <b>${esc(site.name)}</b>, ${esc(site.about)}. Yondr’s preview sites at
<b>overyondrdev.com</b> are for the Yondr team, so we check it’s you first.</p>
<ol class="steps">
<li><span class="n">1</span><span>Select <b>Continue with Google</b>.</span></li>
<li><span class="n">2</span><span>Choose your @${esc(domain)} Google account. Google may ask for your password or a 2-step code.</span></li>
<li><span class="n">3</span><span>You come straight back here, signed in to every Yondr preview site for ${hours} hours.</span></li>
</ol>`;
  const card = `<h2 id="card-h">${esc(heading)}</h2>
<p>Use your <b>@${esc(domain)}</b> Google account. Personal Gmail accounts won’t work.</p>
<div class="dest"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
<span><small>Going to</small><b>${esc(site.name)}</b><small>${esc(site.host)}</small></span></div>
${notice ? `<p class="message ${notice.tone === 'ok' ? 'ok' : 'bad'}" role="${notice.tone === 'ok' ? 'status' : 'alert'}">${notice.html}</p>` : ''}
${googleButton(switchAccount ? start + '&switch=1' : start, switchAccount ? 'Use another Google account' : 'Continue with Google')}
<p class="fine">Signing in takes you to Google’s sign-in page and back. Yondr only receives your name and email address.</p>`;
  return layout(`${heading} – ${site.name}`, intro, card);
}

/** A simple message in the same layout (signed in, not found, not set up, errors). */
export function messagePage({ title, heading, html, button }) {
  const intro = `<p class="eyebrow">Yondr team only</p><h1>Be here <em>now.</em></h1>
<p class="lede">Yondr’s preview sites at <b>overyondrdev.com</b> are for the Yondr team.</p>`;
  const card = `<h2 id="card-h">${esc(heading)}</h2><p>${html}</p>${button ? `<a class="google" href="${esc(button.href)}"><span>${esc(button.label)}</span></a>` : ''}`;
  return layout(title, intro, card);
}
