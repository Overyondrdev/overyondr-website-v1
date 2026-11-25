/*
 * Yondr feedback widget — injected by the Worker on overyondrdev.com hosts only.
 * Self-contained (no dependencies), rendered in a Shadow DOM so it never inherits or leaks site styles.
 * API: /__feedback/api (same origin; identity from Cloudflare Access).
 */
(function () {
  'use strict';
  if (window.__yondrFeedback) return;
  window.__yondrFeedback = true;

  var API = '/__feedback/api/';
  var host = location.hostname;
  var SITE = /^v2\./.test(host) ? 'v2' : /^(www\.)?overyondrdev\.com$/.test(host) ? 'portal' : 'v1';
  // The ad library (ads.overyondrdev.com) is its own feedback area: no preview toolbar, no website tour.
  if (/^ads\./.test(host)) SITE = 'ads';
  var TYPES = [
    ['bug', 'Bug', 'Something is broken or not working'],
    ['design', 'Design', 'Layout, visuals, spacing, imagery'],
    ['content', 'Copy', 'Wording, spelling, tone, facts'],
    ['idea', 'Idea', 'A suggestion or improvement'],
    ['question', 'Question', 'Something unclear'],
    ['praise', 'Love it', 'Something that works well'],
    ['other', 'Other', 'Anything else'],
  ];
  var PLACEHOLDER = {
    bug: 'What happened, and what did you expect instead?',
    design: 'What would you change about how this looks?',
    content: 'Which words should change, and to what?',
    idea: 'What’s your idea? What would it improve?',
    question: 'What’s unclear?',
    praise: 'What do you like about this?',
    other: 'What’s on your mind?',
  };
  var STATUS = { new: 'New', reviewing: 'In review', agreed: 'Agreed', planned: 'Planned', done: 'Done', wont_do: 'Won’t do' };
  var ABOUT = [['portal', 'Both or general'], ['v1', 'V1'], ['v2', 'V2']];
  var PRIORITY = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['critical', 'Critical']];

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('yfb:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('yfb:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  function api(path, opts) {
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
        return d;
      });
    });
  }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (kids || []).forEach(function (k) { if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }

  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  var ICON = {
    chat: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.6"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    min: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    target: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    pen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',
    box: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L19 5M10 5h9v9"/></svg>',
    mark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 15h16v4H4z" fill="currentColor" opacity=".35"/><path d="M7 11l4-6 6 6"/></svg>',
    text: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 6h14M12 6v13"/></svg>',
    blur: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="4" y="4" width="4" height="4" opacity=".9"/><rect x="10" y="4" width="4" height="4" opacity=".4"/><rect x="16" y="4" width="4" height="4" opacity=".8"/><rect x="4" y="10" width="4" height="4" opacity=".4"/><rect x="10" y="10" width="4" height="4" opacity=".9"/><rect x="16" y="10" width="4" height="4" opacity=".3"/><rect x="4" y="16" width="4" height="4" opacity=".7"/><rect x="10" y="16" width="4" height="4" opacity=".3"/><rect x="16" y="16" width="4" height="4" opacity=".9"/></svg>',
    crop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 2v16h16M2 6h16v16"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',
    help: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01" stroke-width="2.2"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  };

  // Brand fonts must be declared in the document (not the shadow root) to load everywhere.
  var fontCss = document.createElement('style');
  // Yondr Brand Guidelines v1.0: Fraunces (headlines) + Inter Tight (everything else), self-hosted.
  fontCss.textContent = [['YFB Fraunces', 'fraunces-latin', [400, 500]], ['YFB Inter Tight', 'inter-tight-latin', [400, 600, 700]]]
    .map(function (f) {
      return f[2].map(function (w) {
        return "@font-face{font-family:'" + f[0] + "';src:url(/brand/fonts/" + f[1] + '-' + w + "-normal.woff2) format('woff2');font-weight:" + w + ';font-display:swap}';
      }).join('');
    }).join('');
  document.head.appendChild(fontCss);

  var STYLES = '\
:host{all:initial}\
*{box-sizing:border-box}\
.root{--g:#1c300b;--deep:#2a4216;--l:#daff6b;--ow:#f4f9d1;--ob:#1e1e1e;--paper:#fafbf7;--mist:#e7ecdf;--stone:#d3d6c8;--sage:#9dae7e;--moss:#4f6b35;\
 --line:var(--stone);--muted:var(--moss);--r:16px;\
 --sans:"YFB Inter Tight","Inter Tight",Arial,sans-serif;--serif:"YFB Fraunces",Fraunces,Georgia,serif;\
 font:400 14px/1.5 var(--sans);color:var(--ob);-webkit-font-smoothing:antialiased}\
button{font:inherit;color:inherit;cursor:pointer}\
:focus-visible{outline:2.5px solid var(--g);outline-offset:2px;border-radius:8px}\
.launcher:focus-visible,.head :focus-visible,.annot :focus-visible,.shot .acts button:focus-visible{outline-color:var(--l)}\
.launcher{position:fixed;right:0;top:50%;z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:10px;\
 padding:16px 11px 18px;border:0;border-radius:14px 0 0 14px;background:var(--g);color:var(--l);\
 box-shadow:0 0 0 2px var(--ow),0 0 0 3.5px rgba(18,33,10,.35),-10px 14px 34px -8px rgba(0,0,0,.5);transform:translate(4px,-50%);\
 transition:transform .25s cubic-bezier(.2,.7,.2,1),padding .25s}\
.launcher:hover,.launcher:focus-visible{transform:translate(0,-50%);padding-right:13px}\
.launcher svg{width:18px;height:18px}\
.launcher .lbl{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}\
.launcher .dot{position:absolute;top:7px;left:7px;width:9px;height:9px;border-radius:50%;background:var(--l);box-shadow:0 0 0 2px var(--g)}\
.panel{position:fixed;top:0;right:0;bottom:0;z-index:2147483001;width:420px;max-width:100vw;\
 display:flex;flex-direction:column;background:var(--paper);border-radius:var(--r) 0 0 var(--r);overflow:hidden;\
 box-shadow:0 0 0 1.5px var(--ow),0 0 0 3px var(--g),-40px 0 90px -20px rgba(0,0,0,.6);animation:slide .32s cubic-bezier(.2,.7,.2,1)}\
.scrim{position:fixed;inset:0;z-index:2147483000;pointer-events:none;animation:fade .32s;\
 background:linear-gradient(90deg,rgba(18,33,10,.10),rgba(18,33,10,.28) 55%,rgba(18,33,10,.5))}\
.panel.hidden+.scrim{display:none}\
@keyframes slide{from{transform:translateX(40px);opacity:0}}\
@keyframes fade{from{opacity:0}}\
@keyframes pop{from{opacity:0;transform:translateY(12px) scale(.97)}}\
.head{background:var(--g);color:var(--ow);padding:16px 16px 0}\
.head .top{display:flex;align-items:center;justify-content:space-between;gap:8px}\
.brand{display:flex;align-items:center;gap:10px}\
.brand img{width:80px;height:auto;display:block}\
.brand span{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--sage);padding-left:10px;border-left:1px solid rgba(157,174,126,.45)}\
.icon-btn{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:10px;background:transparent;color:var(--ow)}\
.icon-btn:hover{background:rgba(244,249,209,.1)}\
.tabs{display:flex;gap:4px;margin-top:14px}\
.tab{position:relative;border:0;background:transparent;color:var(--sage);padding:10px 12px 12px;font-weight:600;font-size:13.5px}\
.tab[aria-selected=true]{color:var(--l)}\
.tab[aria-selected=true]::after{content:"";position:absolute;left:12px;right:12px;bottom:0;height:3px;border-radius:3px 3px 0 0;background:var(--l)}\
.tab .count{margin-left:6px;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--deep);color:var(--ow)}\
.tab .new{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--l);margin-left:6px;vertical-align:2px}\
.body{flex:1;overflow:auto;padding:18px;overscroll-behavior:contain}\
.foot{padding:12px 18px 16px;border-top:1px solid var(--line);background:var(--paper)}\
h3{font:500 22px/1.15 var(--serif);color:var(--g);margin:0 0 4px}\
.sub{margin:0 0 16px;color:var(--muted);font-size:13px}\
.label{display:block;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--moss);margin:16px 0 8px}\
.chips{display:flex;flex-wrap:wrap;gap:6px}\
.chip{border:1px solid var(--line);background:var(--ow);border-radius:999px;padding:6px 12px;font-size:13px;color:var(--g);transition:all .15s}\
.chip:hover{border-color:var(--moss)}\
.chip[aria-pressed=true]{background:var(--g);border-color:var(--g);color:var(--ow);font-weight:700}\
textarea{display:block;width:100%;min-height:110px;max-height:260px;resize:vertical;border:1px solid var(--line);border-radius:var(--r);background:#fff;\
 padding:12px 14px;font:inherit;font-size:14.5px;color:var(--ob);line-height:1.5;transition:border-color .15s,box-shadow .15s}\
textarea:focus{outline:0;border-color:var(--g);box-shadow:0 0 0 3px rgba(28,48,11,.16)}\
.tools{display:flex;gap:6px;margin-top:10px}\
.tool{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:var(--ow);border-radius:12px;\
 padding:9px 6px;font-size:12.5px;font-weight:600;color:var(--g);transition:all .15s}\
.tool:hover{border-color:var(--moss);background:var(--mist)}\
.shots{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}\
.shot{position:relative;width:88px;height:62px;border-radius:10px;overflow:hidden;border:1px solid var(--line);background:#eee}\
.shot img{width:100%;height:100%;object-fit:cover;display:block}\
.shot .acts{position:absolute;inset:auto 4px 4px auto;display:flex;gap:3px}\
.shot .acts button{width:24px;height:24px;border:0;border-radius:7px;background:rgba(28,48,11,.85);color:var(--l);display:grid;place-items:center}\
.pin{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 10px;border-radius:12px;background:var(--mist);color:var(--g);font-size:12.5px}\
.pin code{font:inherit;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}\
.pin button{border:0;background:transparent;color:var(--g);padding:2px}\
.seg{display:flex;padding:3px;border-radius:12px;background:var(--mist);gap:2px}\
.seg button{flex:1;border:0;background:transparent;border-radius:9px;padding:7px 4px;font-size:12.5px;font-weight:600;color:var(--moss)}\
.seg button[aria-pressed=true]{background:var(--paper);color:var(--g);box-shadow:0 1px 3px rgba(28,48,11,.18)}\
.seg button[data-v=critical][aria-pressed=true]{background:#c83a2a;color:#fff}\
.ctx{margin-top:14px;font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap}\
.ctx b{font-weight:600;color:var(--g)}\
.primary{display:flex;width:100%;align-items:center;justify-content:center;gap:8px;border:0;border-radius:var(--r);padding:13px 16px;\
 background:var(--g);color:var(--ow);font-weight:700;font-size:15px;transition:transform .15s,opacity .15s}\
.primary:hover{transform:translateY(-1px)}\
.primary[disabled]{opacity:.4;cursor:not-allowed;transform:none}\
.hint{display:flex;justify-content:space-between;margin-top:8px;font-size:11.5px;color:var(--muted)}\
kbd{font:600 11px/1 var(--sans);padding:2px 5px;border-radius:5px;border:1px solid var(--line);background:var(--ow);color:var(--g)}\
.error{margin-top:10px;padding:9px 12px;border-radius:10px;background:#fde8e4;color:#8a2416;font-size:13px}\
.done{padding:40px 8px}\
.done .badge{width:64px;height:64px;margin:0 0 18px;border-radius:50%;display:grid;place-items:center;background:var(--g);color:var(--l);animation:pop .35s cubic-bezier(.2,.7,.2,1)}\
.row-btns{display:flex;gap:8px;margin-top:18px}\
.ghost{border:1px solid var(--line);background:var(--ow);border-radius:12px;padding:9px 14px;font-weight:600;color:var(--g)}\
.ghost:hover{border-color:var(--moss)}\
.filter{display:flex;gap:6px;margin:0 0 12px}\
.item{display:block;width:100%;text-align:left;border:1px solid var(--line);background:var(--ow);border-radius:var(--r);padding:14px 16px;margin-bottom:10px;transition:border-color .15s,transform .15s}\
.item:hover{border-color:var(--moss);transform:translateY(-1px)}\
.item .meta{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);margin-bottom:6px;flex-wrap:wrap}\
.item p{margin:0;color:var(--ob);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\
.item .unread{width:8px;height:8px;border-radius:50%;background:var(--g);margin-left:auto}\
.pill{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em}\
.pill.t{background:var(--mist);color:var(--g)}\
.s-new{background:var(--mist);color:var(--g)}.s-reviewing{background:#fff2c2;color:#6b5100}.s-agreed{background:#dff5c9;color:#245a10}\
.s-planned{background:#dce8ff;color:#1d3f8a}.s-done{background:var(--g);color:var(--ow)}.s-wont_do{background:#eee;color:#666}\
.empty{color:var(--muted);padding:28px 4px}\
.empty h3{margin-bottom:8px}\
.back{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--g);font-weight:600;padding:0;margin-bottom:12px}\
.detail .msg{white-space:pre-wrap;margin:10px 0 12px;font-size:14.5px}\
.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}\
.gallery a{display:block;border-radius:10px;overflow:hidden;border:1px solid var(--line)}\
.gallery img{width:100%;display:block}\
.thread{margin-top:14px;border-top:2px solid var(--line);padding-top:12px}\
.cmt{margin-bottom:12px}\
.cmt .who{font-size:12px;font-weight:700;color:var(--g)}\
.cmt .who span{font-weight:400;color:var(--muted);margin-left:6px}\
.cmt .team{display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;background:var(--g);color:var(--ow);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}\
.cmt p{margin:3px 0 0;white-space:pre-wrap}\
.reply{display:flex;gap:8px;margin-top:10px}\
.reply textarea{min-height:44px;height:44px;border-radius:12px;padding:10px 12px;font-size:14px}\
.reply button{flex:none;width:44px;border:0;border-radius:12px;background:var(--g);color:var(--ow);display:grid;place-items:center}\
.linkish{display:inline-flex;align-items:center;gap:4px;color:var(--g);font-weight:600;font-size:12.5px;text-decoration:none}\
.danger{color:#a3311f}\
.spinner{width:22px;height:22px;border-radius:50%;border:2.5px solid rgba(28,48,11,.15);border-top-color:var(--g);animation:spin .8s linear infinite;margin:40px auto}\
@keyframes spin{to{transform:rotate(360deg)}}\
.pick-hl{position:fixed;z-index:2147482999;pointer-events:none;border:2px solid var(--g);background:rgba(28,48,11,.10);border-radius:4px;box-shadow:0 0 0 2px var(--ow),0 0 0 9999px rgba(28,48,11,.28);transition:all .06s}\
.pick-tip{position:fixed;z-index:2147483002;left:50%;top:16px;transform:translateX(-50%);background:var(--g);color:var(--ow);border-radius:999px;padding:10px 16px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.35)}\
.pick-tip b{color:var(--l)}\
.annot{position:fixed;inset:0;z-index:2147483003;background:rgba(28,48,11,.96);display:flex;flex-direction:column;animation:fade .2s}\
@keyframes fade{from{opacity:0}}\
.annot-bar{display:flex;align-items:center;gap:6px;padding:12px 16px;color:var(--ow);flex-wrap:wrap}\
.annot-bar .title{font:500 20px/1 var(--serif);color:var(--ow);margin-right:auto}\
.annot-bar .tb{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;border:0;background:rgba(244,249,209,.08);color:var(--ow)}\
.annot-bar .tb:hover{background:rgba(244,249,209,.16)}\
.annot-bar .tb[aria-pressed=true]{background:var(--deep);color:var(--l);box-shadow:inset 0 0 0 1.5px var(--l)}\
.annot-bar .sep{width:1px;height:26px;background:rgba(244,249,209,.18);margin:0 6px}\
.annot-bar .sw{width:22px;height:22px;border-radius:50%;border:2px solid transparent;padding:0}\
.annot-bar .sw[aria-pressed=true]{border-color:var(--ow);box-shadow:0 0 0 2px var(--g) inset}\
.annot-bar .act{border:0;border-radius:12px;padding:10px 16px;font-weight:700}\
.annot-bar .act.cancel{background:transparent;color:var(--ow)}\
.annot-bar .act.ok{background:var(--ow);color:var(--g)}\
.annot-stage{flex:1;display:grid;place-items:center;overflow:hidden;padding:0 16px 16px}\
.annot-stage canvas{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:crosshair;touch-action:none;background:#fff}\
.annot-text{position:fixed;z-index:2147483004;font:600 18px var(--sans);color:#c83a2a;background:rgba(255,255,255,.9);border:2px solid var(--g);border-radius:6px;padding:4px 6px;min-width:120px}\
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483005;background:var(--g);color:var(--ow);padding:10px 16px;border-radius:12px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.35);animation:pop .25s}\
.bar{position:fixed;top:0;left:0;right:0;height:44px;z-index:2147483002;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;\
 padding:0 10px 0 16px;background:var(--g);color:var(--ow);font:500 13.5px/1 var(--sans);box-shadow:0 1px 0 rgba(0,0,0,.28)}\
.bar a,.bar button{font:inherit;color:inherit;text-decoration:none;border:0;background:transparent;cursor:pointer}\
.bar :focus-visible{outline-color:var(--l)}\
.bar .left{display:flex;align-items:center;gap:12px;min-width:0}\
.bar .wm{display:flex;align-items:center;gap:10px;color:var(--sage);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}\
.bar .wm img{width:80px;height:auto;display:block}\
.bar .wm span{padding-left:10px;border-left:1px solid rgba(157,174,126,.45)}\
.b-back{display:inline-flex;align-items:center;gap:6px;padding:7px 12px 7px 8px;border-radius:999px;font-weight:600;white-space:nowrap}\
.b-back:hover{background:var(--deep)}\
.b-switch{display:flex;padding:3px;border-radius:999px;background:var(--deep)}\
.b-switch a{padding:6px 16px;border-radius:999px;font-weight:700;color:var(--sage)}\
.b-switch a:hover{color:var(--ow)}\
.b-switch a[aria-current=page]{background:var(--ow);color:var(--g)}\
.bar .right{display:flex;justify-content:flex-end;align-items:center;gap:4px}\
.b-tour{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;font-weight:600;color:var(--sage)!important}\
.b-tour:hover{color:var(--ow)!important;background:var(--deep)!important}\
.b-fb{position:relative;display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:7px 16px 7px 12px;background:var(--ow)!important;color:var(--g)!important;font-weight:700!important;white-space:nowrap}\
.b-fb:hover{background:#fff!important}\
.b-fb svg{width:18px;height:18px}\
.b-fb .dot{position:absolute;top:1px;right:3px;width:10px;height:10px;border-radius:50%;background:var(--g);box-shadow:0 0 0 2px var(--ow)}\
.b-fb .s,.b-back .s{display:none}\
.with-bar .panel{top:44px;border-radius:var(--r) 0 0 0}\
.with-bar .pick-tip{top:60px}\
.tour{position:fixed;inset:0;z-index:2147483006}\
.tour .veil{position:fixed;inset:0;background:rgba(28,48,11,.66);animation:fade .3s}\
.tour .spot{position:fixed;border-radius:14px;pointer-events:none;box-shadow:0 0 0 2px var(--l),0 0 0 9999px rgba(28,48,11,.66);transition:all .45s cubic-bezier(.2,.7,.2,1)}\
.tcard{position:fixed;width:min(360px,calc(100vw - 24px));background:var(--paper);color:var(--ob);border-radius:var(--r);padding:24px;\
 box-shadow:0 24px 60px -12px rgba(0,0,0,.55);animation:fade .45s;transition:left .45s cubic-bezier(.2,.7,.2,1),top .45s cubic-bezier(.2,.7,.2,1)}\
.tcard.wide{width:min(460px,calc(100vw - 24px))}\
.tcard .wmk{width:80px;display:block;margin-bottom:18px}\
.tcard .eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--moss);margin:0 0 8px}\
.tcard h2{font:500 24px/1.15 var(--serif);color:var(--g);margin:0 0 8px;letter-spacing:-.01em}\
.tcard p{margin:0;font-size:14.5px;line-height:1.5}\
.tcard ol{list-style:none;margin:14px 0 0;padding:0}\
.tcard li{display:grid;grid-template-columns:30px 1fr;gap:4px 10px;padding:12px 0;border-top:2px solid var(--mist)}\
.tcard li b{grid-row:span 2;font:500 26px/1 var(--serif);color:var(--g)}\
.tcard li strong{font-weight:700;color:var(--g)}\
.tcard li span{font-size:14px;color:var(--ob)}\
.tnav{display:flex;align-items:center;gap:8px;margin-top:20px}\
.tdots{display:flex;gap:5px;margin-right:auto}\
.tdots i{width:6px;height:6px;border-radius:3px;background:var(--stone);transition:width .3s}\
.tdots i.on{width:18px;background:var(--g)}\
.tskip{border:0;background:transparent;color:var(--moss);font-weight:600;padding:8px 6px;font-size:13px}\
.tskip:hover{color:var(--g)}\
.tnav .primary{width:auto;padding:10px 18px;font-size:14px}\
.tnav .ghost{padding:10px 14px}\
@media (max-width:720px){.bar{grid-template-columns:auto 1fr auto;gap:6px;padding:0 6px}.bar .wm,.b-tour .l,.b-fb .l,.b-back .l{display:none}.b-fb .s,.b-back .s{display:inline}\
.b-switch{justify-self:center}.b-switch a{padding:6px 12px}.b-fb{padding:7px 12px 7px 10px}}\
.hidden{display:none!important}\
@media (max-width:480px){.panel{width:100vw;border-radius:0;box-shadow:none}.launcher{padding:12px 7px 13px}}\
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}';

  // ------------------------------------------------------------------ mount
  var hostEl = document.createElement('div');
  hostEl.id = 'yondr-feedback';
  hostEl.setAttribute('data-html2canvas-ignore', '');
  document.body.appendChild(hostEl);
  var shadow = hostEl.attachShadow({ mode: 'open' });
  shadow.appendChild(el('style', { text: STYLES }));
  var root = el('div', { class: 'root' });
  shadow.appendChild(root);

  var state = {
    open: false, tab: 'new', type: store.get('draft:type', 'idea'), priority: 'normal',
    message: store.get('draft:' + location.pathname, ''), shots: [], pin: null, sending: false,
    me: null, items: null, detail: null, filter: 'page', hidden: store.get('hidden', false), error: '',
    seen: store.get('seen', {}), lastId: null, about: store.get('draft:about', 'portal'),
  };

  var launcher = el('button', { class: 'launcher', 'aria-label': 'Give feedback on this page', 'aria-expanded': 'false', html: ICON.chat },
    [el('span', { class: 'lbl', text: 'Give feedback' })]);
  launcher.addEventListener('click', function () { toggle(true); });
  root.appendChild(launcher);
  var panel = el('section', { class: 'panel hidden', role: 'dialog', 'aria-label': 'Yondr feedback' });
  root.appendChild(panel);
  // Dims the page behind the open panel; display follows the panel via `.panel.hidden + .scrim`.
  root.appendChild(el('div', { class: 'scrim', 'aria-hidden': 'true' }));

  function toast(msg) {
    var t = el('div', { class: 'toast', role: 'status', text: msg });
    root.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function toggle(open) {
    state.open = open;
    panel.classList.toggle('hidden', !open);
    launcher.classList.toggle('hidden', open || state.hidden);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { render(); refreshMine(); } else launcher.focus();
  }
  if (state.hidden) launcher.classList.add('hidden');

  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f' || e.code === 'KeyF')) {
      e.preventDefault();
      state.hidden = !state.hidden && !state.open;
      store.set('hidden', state.hidden);
      if (state.open) toggle(false);
      launcher.classList.toggle('hidden', state.hidden);
      if (!state.hidden) toggle(true);
    }
  });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });

  // ------------------------------------------------------------------ data
  function unreadCount() {
    if (!state.items) return 0;
    return state.items.filter(function (i) { return isUnread(i); }).length;
  }
  function isUnread(i) {
    var s = state.seen[i.id];
    return s != null && (i.comment_count > s.c || i.status !== s.s);
  }
  function markSeen(i) {
    state.seen[i.id] = { c: i.comment_count, s: i.status };
    store.set('seen', state.seen);
  }
  function refreshMine() {
    return api('feedback?scope=mine&sort=updated').then(function (d) {
      state.items = d.items;
      d.items.forEach(function (i) { if (!state.seen[i.id]) markSeen(i); });
      updateDot();
      if (state.open && state.tab === 'mine' && !state.detail) render();
      else if (state.open) renderHead();
    }).catch(function () { /* offline or signed out */ });
  }
  function updateDot() {
    var d = launcher.querySelector('.dot');
    var n = unreadCount();
    if (n && !d) launcher.appendChild(el('span', { class: 'dot', 'aria-label': n + ' updates' }));
    if (!n && d) d.remove();
    if (barFb) {
      var bd = barFb.querySelector('.dot');
      if (n && !bd) barFb.appendChild(el('span', { class: 'dot', 'aria-label': n + ' updates' }));
      if (!n && bd) bd.remove();
    }
  }
  api('me').then(function (m) { state.me = m; }).catch(function () {});
  refreshMine();
  setInterval(function () { if (!document.hidden) refreshMine(); }, 60000);

  // ------------------------------------------------------------------ toolbar (V1 and V2 only)
  // A slim bar across the top: back to the version page, a V1/V2 switch and a Give feedback button.
  // The page is pushed down by BAR_H; fixed/sticky elements pinned to the top are moved below the bar.
  var BAR_H = 44;
  var bar = null, barFb = null, offsetStyle = null, shifted = [], offsetOn = false;
  function siteUrl(sub) { return location.protocol + '//' + (sub ? sub + '.' : '') + location.host.replace(/^(v[12]|www)\./, '') + '/'; }
  function setOffset(on) {
    if (!bar) return;
    offsetOn = on;
    if (!offsetStyle) { offsetStyle = document.createElement('style'); offsetStyle.id = 'yfb-offset'; document.head.appendChild(offsetStyle); }
    offsetStyle.textContent = on ? 'html{margin-top:' + BAR_H + 'px!important;scroll-padding-top:' + BAR_H + 'px}' : '';
    shiftFixed();
  }
  function shiftFixed() {
    if (observer) observer.disconnect();
    shifted.forEach(function (n) { n.style.setProperty('top', n.__yfb[0], n.__yfb[1]); delete n.__yfb; });
    shifted = [];
    if (offsetOn) {
      var all = document.body.getElementsByTagName('*');
      var bodyStatic = getComputedStyle(document.body).position === 'static';
      for (var i = 0; i < all.length; i++) {
        var n = all[i];
        if (n === hostEl) continue;
        var cs = getComputedStyle(n);
        // Fixed/sticky elements pinned near the top, and absolute ones placed against the page itself
        // (e.g. the V1 Squarespace header), would otherwise sit under the bar.
        var pageAbs = cs.position === 'absolute' && n.offsetParent === document.body && bodyStatic;
        if ((cs.position !== 'fixed' && cs.position !== 'sticky' && !pageAbs) || cs.top === 'auto') continue;
        var t = parseFloat(cs.top);
        if (!(t < BAR_H)) continue;
        n.__yfb = [n.style.getPropertyValue('top'), n.style.getPropertyPriority('top')];
        n.style.setProperty('top', (t + BAR_H) + 'px', 'important');
        shifted.push(n);
      }
    }
    if (observer) observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
  var observer = null, shiftTimer = null;
  function queueShift() { clearTimeout(shiftTimer); shiftTimer = setTimeout(shiftFixed, 300); }
  if (SITE === 'v1' || SITE === 'v2') {
    var other = SITE === 'v1' ? 'v2' : 'v1';
    barFb = el('button', { class: 'b-fb', type: 'button', 'aria-label': 'Give feedback on this page', html: ICON.chat, onclick: function () { toggle(true); } },
      [el('span', { class: 'l', text: 'Give feedback' }), el('span', { class: 's', text: 'Feedback' })]);
    bar = el('nav', { class: 'bar', 'aria-label': 'Yondr website preview' }, [
      el('div', { class: 'left' }, [
        el('div', { class: 'wm' }, [el('img', { src: '/brand/yondr-lichen.svg', alt: 'Yondr' }), el('span', { text: 'Website preview' })]),
        el('a', { class: 'b-back', href: siteUrl(''), html: ICON.chevron }, [el('span', { class: 'l', text: 'All versions' }), el('span', { class: 's', text: 'Versions' })]),
      ]),
      el('div', { class: 'b-switch', role: 'group', 'aria-label': 'Switch version' }, ['v1', 'v2'].map(function (v) {
        return el('a', { href: v === SITE ? location.pathname : siteUrl(v), 'aria-current': v === SITE ? 'page' : false,
          title: v === SITE ? 'You’re on ' + v.toUpperCase() : 'Open ' + v.toUpperCase() + ' (home page)', text: v.toUpperCase() });
      })),
      el('div', { class: 'right' }, [
        el('button', { class: 'b-tour', type: 'button', 'aria-label': 'Take the tour', html: ICON.help, onclick: function () { if (!tourEl) startTour(0, false); } },
          [el('span', { class: 'l', text: 'Tour' })]),
        barFb,
      ]),
    ]);
    root.classList.add('with-bar');
    root.insertBefore(bar, root.firstChild);
    observer = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) if (!hostEl.contains(list[i].target) && list[i].target !== hostEl) return queueShift();
    });
    setOffset(true);
    window.addEventListener('resize', queueShift);
    window.addEventListener('load', queueShift);
  }

  // ------------------------------------------------------------------ tour (first visits)
  // Offered on a person's first three visits (a visit = back after 30+ minutes away), at most once per visit.
  //  - Finishing it ends it for good.
  //  - "Skip for now" the first time: we point at the Tour button and offer to resume next visit.
  //  - Skipping a second time: one last pointer to the Tour button, then never shown automatically again.
  //  - Someone who stopped part-way (and hasn't skipped twice) is still offered the rest after visit three.
  // State lives in one cookie on .overyondrdev.com, so it's shared by the version page, V1 and V2.
  var SHARED = /(^|\.)overyondrdev\.com$/.test(location.hostname);
  var TOUR_KEYS = ['v', 's', 'st', 'd', 't', 'sh'];   // visits, skips, step reached, done, last seen (s), shown this visit
  var TOUR_MAX_VISITS = 3, TOUR_SKIPS = 2, VISIT_GAP = 30 * 60;
  function readTour() {
    var raw = SHARED ? (document.cookie.match(/(?:^|;\s*)yfb_tour=([^;]*)/) || [])[1] : store.get('tourState', null);
    var t = { v: 0, s: 0, st: 0, d: 0, t: 0, sh: 0 };
    if (raw === 'done') { t.d = 1; return t; }   // finished before this version
    if (raw) decodeURIComponent(raw).split('.').forEach(function (p) {
      var m = p.match(/^([a-z]+)(\d+)$/);
      if (m && TOUR_KEYS.indexOf(m[1]) > -1) t[m[1]] = +m[2];
    });
    return t;
  }
  function saveTour() {
    var val = TOUR_KEYS.map(function (k) { return k + tour[k]; }).join('.');
    if (SHARED) document.cookie = 'yfb_tour=' + val + '; domain=.overyondrdev.com; path=/; max-age=31536000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    else store.set('tourState', val);
  }
  var tour = readTour();
  (function countVisit() {
    var now = Math.floor(Date.now() / 1000);
    if (!tour.t || now - tour.t > VISIT_GAP) { tour.v++; tour.sh = 0; }
    tour.t = now;
    saveTour();
  })();
  function tourButton() { return bar ? bar.querySelector('.b-tour') : document.querySelector('[data-yfb-tour]'); }

  function tourSteps() {
    var how = { wide: true, eyebrow: 'Giving feedback', title: 'Three steps, about a minute', how: [
      ['Pick a type and say what you noticed', 'Bug, Design, Copy, Idea, Question or Love it. Plain words are perfect.'],
      ['Show us where', 'Add a screenshot and mark it up, or use Point at it to select the exact spot on the page.'],
      ['Send it, then watch for replies', 'We record the page and your screen size for you. Replies from the web team appear under My feedback.'],
    ], last: true };
    if (SITE === 'portal') return [
      { wide: true, logo: true, eyebrow: 'Welcome', title: 'Welcome to the Yondr website preview',
        text: 'Two versions of the Yondr website live here, private to the Yondr team. This short tour shows you how to get around and how to tell us what you think.' },
      { target: function () { return document.querySelector('.cards') || document.querySelector('main'); }, eyebrow: 'Choose', title: 'Pick a version',
        text: 'V1 is today’s overyondr.com, rebuilt. V2 is the Loba redesign: a work in progress on the way to our new website, not the final version, so your feedback shapes where it goes next. Open either one: a toolbar at the top of every page brings you back here or switches versions.' },
      { target: function () { return document.querySelector('[data-yfb-open]') || launcher; }, eyebrow: 'Feedback', title: 'Give feedback from the top bar',
        text: 'Thought of something already? Use Give feedback right here. It’s also in the top bar of every V1 and V2 page, so you can send feedback wherever you are.' },
      how,
    ];
    return [
      { wide: true, logo: true, eyebrow: 'Welcome', title: 'Welcome to the Yondr website preview',
        text: 'You’re looking at ' + (SITE === 'v1' ? 'V1, today’s overyondr.com rebuilt' : 'V2, the Loba redesign. It’s a work in progress on the way to our new website, not the final version, so your feedback shapes where it goes next') + '. This short tour shows you how to get around and how to tell us what you think.' },
      { target: function () { return bar.querySelector('.b-back'); }, eyebrow: 'Navigate', title: 'Back to all versions', text: 'Return to the version page at any time.' },
      { target: function () { return bar.querySelector('.b-switch'); }, eyebrow: 'Compare', title: 'Switch between V1 and V2', text: 'Jump to the other version to compare. You’ll land on its home page.' },
      { target: function () { return barFb; }, eyebrow: 'Feedback', title: 'Give feedback from the top bar',
        text: 'Give feedback is in the top bar of every page. Click it whenever something catches your eye. We note the page you’re on for you.' },
      how,
    ];
  }
  var tourEl = null;
  // Shows a sequence of cards. Each card can spotlight a target (`target()`), and either uses the standard
  // Back / Next / Skip for now buttons or its own `actions`.
  function runCards(steps, startAt, hooks) {
    if (tourEl) return;
    if (state.open) toggle(false);
    hooks = hooks || {};
    var idx = 0;
    var veil = el('div', { class: 'veil' });
    var spot = el('div', { class: 'spot hidden' });
    var card = el('div', { class: 'tcard', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'yfb-tour-title' });
    tourEl = el('div', { class: 'tour' }, [veil, spot, card]);
    root.appendChild(tourEl);
    function close() {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      if (tourEl) tourEl.remove();
      tourEl = null;
    }
    function finish(openPanel) {
      close();
      if (hooks.onFinish) hooks.onFinish();
      if (openPanel) toggle(true); else if (barFb) barFb.focus(); else launcher.focus();
    }
    function skip() { close(); if (hooks.onSkip) hooks.onSkip(idx); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); skip(); }
      else if (steps.length > 1 && e.key === 'ArrowRight' && idx < steps.length - 1) { e.preventDefault(); go(idx + 1); }
      else if (steps.length > 1 && e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); go(idx - 1); }
    }
    // A target that is hidden or not laid out has no size; show the step as a centred card instead
    // of spotlighting the top-left corner.
    function visibleTarget(st) {
      var t = st.target && st.target();
      if (!t) return null;
      var r = t.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? t : null;
    }
    function place() {
      if (!tourEl) return;
      var st = steps[idx], t = visibleTarget(st);
      var vw = window.innerWidth, vh = window.innerHeight, cw = card.offsetWidth, ch = card.offsetHeight, gap = 14, m = 12;
      if (!t) {
        spot.classList.add('hidden'); veil.classList.remove('hidden');
        card.style.left = Math.max(m, (vw - cw) / 2) + 'px'; card.style.top = Math.max(m, (vh - ch) / 2) + 'px';
        return;
      }
      var r = t.getBoundingClientRect(), pad = 6;
      var sr = { l: r.left - pad, t: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
      // Keep a tall target (e.g. the version cards) from filling the screen.
      if (sr.t < m) { sr.h -= m - sr.t; sr.t = m; }
      if (sr.t + sr.h > vh - m) sr.h = vh - m - sr.t;
      spot.classList.remove('hidden'); veil.classList.add('hidden');
      spot.style.left = sr.l + 'px'; spot.style.top = sr.t + 'px'; spot.style.width = sr.w + 'px'; spot.style.height = sr.h + 'px';
      var opts = [
        [sr.l + sr.w / 2 - cw / 2, sr.t + sr.h + gap],
        [sr.l + sr.w / 2 - cw / 2, sr.t - gap - ch],
        [sr.l - gap - cw, sr.t + sr.h / 2 - ch / 2],
        [sr.l + sr.w + gap, sr.t + sr.h / 2 - ch / 2],
      ];
      var pick = null;
      for (var i = 0; i < opts.length && !pick; i++) {
        var x = Math.min(Math.max(m, opts[i][0]), vw - cw - m), y = opts[i][1];
        if (y >= m && y + ch <= vh - m) {
          var ov = !(x + cw < sr.l || x > sr.l + sr.w || y + ch < sr.t || y > sr.t + sr.h);
          if (!ov) pick = [x, y];
        }
      }
      if (!pick) pick = [Math.max(m, (vw - cw) / 2), vh - ch - m];
      card.style.left = pick[0] + 'px'; card.style.top = pick[1] + 'px';
    }
    function go(i) {
      idx = i;
      if (hooks.onStep) hooks.onStep(i);
      var st = steps[i];
      card.className = 'tcard' + (st.wide ? ' wide' : '');
      card.innerHTML = '';
      if (st.logo) card.appendChild(el('img', { class: 'wmk', src: '/brand/yondr-dark-green.svg', alt: 'Yondr' }));
      card.appendChild(el('p', { class: 'eyebrow', text: st.eyebrow + (steps.length > 1 ? ' · ' + (i + 1) + ' of ' + steps.length : '') }));
      card.appendChild(el('h2', { id: 'yfb-tour-title', text: st.title }));
      if (st.text) card.appendChild(el('p', { text: st.text }));
      if (st.how) card.appendChild(el('ol', {}, st.how.map(function (h, n) {
        return el('li', {}, [el('b', { text: String(n + 1) }), el('strong', { text: h[0] }), el('span', { text: h[1] })]);
      })));
      var primary;
      var buttons;
      if (st.actions) {
        buttons = st.actions.map(function (a) {
          var b = el('button', { class: a.kind || 'primary', type: 'button', text: a.label, onclick: function () { a.run({ finish: finish, skip: skip, close: close, go: go }); } });
          if ((a.kind || 'primary') === 'primary') primary = b;
          return b;
        });
      } else if (st.last) {
        buttons = [el('button', { class: 'ghost', type: 'button', text: 'Start exploring', onclick: function () { finish(false); } })];
        primary = el('button', { class: 'primary', type: 'button', text: 'Give feedback now', onclick: function () { finish(true); } });
        buttons.push(primary);
      } else {
        buttons = [el('button', { class: 'tskip', type: 'button', text: 'Skip for now', onclick: skip })];
        if (i > 0) buttons.push(el('button', { class: 'tskip', type: 'button', text: 'Back', onclick: function () { go(i - 1); } }));
        primary = el('button', { class: 'primary', type: 'button', text: i === 0 ? 'Start the tour' : 'Next', onclick: function () { go(i + 1); } });
        buttons.push(primary);
      }
      var dots = steps.length > 1 ? el('div', { class: 'tdots', 'aria-hidden': 'true' }, steps.map(function (_, n) { return el('i', { class: n === i ? 'on' : '' }); }))
        : el('div', { class: 'tdots' });
      card.appendChild(el('div', { class: 'tnav' }, [dots].concat(buttons)));
      var t = visibleTarget(st);
      if (t && t.getRootNode() === document) {
        var r = t.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight * 0.6) { t.scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(place, 450); }
      }
      place();
      if (primary) primary.focus();
    }
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    go(Math.min(Math.max(0, startAt || 0), steps.length - 1));
  }

  // The tour itself. `auto` = we opened it (counts skips, remembers progress); otherwise the person asked for it.
  function startTour(startAt, auto) {
    runCards(tourSteps(), startAt || 0, {
      onStep: function (i) { if (auto) { tour.st = i; saveTour(); } },
      onFinish: function () { tour.d = 1; tour.st = 0; saveTour(); },
      onSkip: function () { if (auto) skippedTour(); },
    });
  }
  // After a skip: point at the Tour button. The second skip is the last time we bring it up.
  function skippedTour() {
    tour.s++;
    saveTour();
    var final = tour.s >= TOUR_SKIPS;
    var where = bar ? 'the ? Tour button in the top bar' : 'Take the tour at the top of this page';
    runCards([{
      target: tourButton, eyebrow: 'Tour',
      title: final ? 'The tour is here whenever you need it' : 'No problem, pick it up anytime',
      text: final ? 'We won’t bring it up again. Click ' + where + ' to take it whenever you like.'
        : 'Next time you visit, we’ll offer to pick up where you left off. Or click ' + where + ' to take it now.',
      actions: [{ label: 'Got it', run: function (c) { c.close(); if (barFb) barFb.focus(); else launcher.focus(); } }],
    }], 0, {});
  }
  // A returning visitor who skipped or stopped part-way: ask before showing it again.
  function offerResume() {
    var steps = tourSteps(), at = Math.min(tour.st, steps.length - 1), started = at > 0;
    runCards([{
      wide: true, logo: true, eyebrow: 'Quick tour',
      title: started ? 'Pick up where you left off?' : 'Want the quick tour now?',
      text: started ? 'You stopped at step ' + (at + 1) + ' of ' + steps.length + '. It takes less than a minute to finish.'
        : 'It takes about a minute and shows you how to get around the preview and how to give feedback.',
      actions: [
        { label: 'Not now', kind: 'tskip', run: function (c) { c.skip(); } },
        { label: started ? 'Continue the tour' : 'Start the tour', run: function (c) { c.close(); startTour(at, true); } },
      ],
    }], 0, { onSkip: skippedTour });
  }
  function autoTour() {
    if (tour.d || tour.s >= TOUR_SKIPS || tour.sh) return;
    var partWay = tour.st > 0;
    if (tour.v > TOUR_MAX_VISITS && !partWay) return;
    tour.sh = 1;
    saveTour();
    if (tour.s === 0 && !partWay) startTour(0, true); else offerResume();
  }
  // Pages can offer the tour too (e.g. the version page): any element with data-yfb-tour starts it.
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-yfb-tour]');
    if (t) { e.preventDefault(); if (!tourEl) startTour(0, false); }
    var o = e.target.closest && e.target.closest('[data-yfb-open]');
    if (o) { e.preventDefault(); if (tourEl) return; toggle(true); }
  });
  if (window.top === window && SITE !== 'ads') setTimeout(autoTour, 700);

  // ------------------------------------------------------------------ render
  var headEl, bodyEl, footEl;
  function render() {
    panel.innerHTML = '';
    headEl = el('div', { class: 'head' });
    bodyEl = el('div', { class: 'body' });
    footEl = el('div', { class: 'foot' });
    panel.appendChild(headEl);
    panel.appendChild(bodyEl);
    panel.appendChild(footEl);
    renderHead();
    if (state.tab === 'new') renderNew(); else if (state.detail) renderDetail(); else renderMine();
  }
  function renderHead() {
    if (!headEl) return;
    headEl.innerHTML = '';
    var n = state.items ? state.items.length : 0;
    var minBtn = el('button', { class: 'icon-btn', 'aria-label': 'Minimise', title: 'Minimise (Esc)', html: ICON.min, onclick: function () { toggle(false); } });
    var hideBtn = el('button', { class: 'icon-btn', 'aria-label': 'Hide widget', title: 'Hide the widget (Alt+Shift+F to bring it back)', html: ICON.close,
      onclick: function () { state.hidden = true; store.set('hidden', true); toggle(false); launcher.classList.add('hidden'); toast('Feedback hidden · press Alt+Shift+F to bring it back'); } });
    headEl.appendChild(el('div', { class: 'top' }, [
      el('div', { class: 'brand' }, [el('img', { src: '/brand/yondr-lichen.svg', alt: 'Yondr' }), el('span', { text: 'Feedback' })]),
      el('div', { style: 'display:flex;gap:2px' }, [
        el('button', { class: 'icon-btn', 'aria-label': 'Take the tour', title: 'Take the tour', html: ICON.help, onclick: function () { toggle(false); startTour(0, false); } }),
        minBtn, hideBtn]),
    ]));
    var tabs = el('div', { class: 'tabs', role: 'tablist' });
    [['new', 'New feedback'], ['mine', 'My feedback']].forEach(function (t) {
      var b = el('button', { class: 'tab', role: 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false', text: t[1],
        onclick: function () { state.tab = t[0]; state.detail = null; render(); } });
      if (t[0] === 'mine' && n) b.appendChild(el('span', { class: 'count', text: String(n) }));
      if (t[0] === 'mine' && unreadCount()) b.appendChild(el('span', { class: 'new', 'aria-label': 'updates' }));
      tabs.appendChild(b);
    });
    headEl.appendChild(tabs);
  }

  // ---------------------------------------------------------------- new
  function saveDraft() { store.set('draft:' + location.pathname, state.message); store.set('draft:type', state.type); }

  function renderNew() {
    if (state.lastId) return renderThanks();
    bodyEl.appendChild(el('h3', { text: 'Share your thoughts' }));
    bodyEl.appendChild(el('p', { class: 'sub', text: SITE === 'portal' ? 'Ideas, bugs, design notes, copy edits: anything about either version helps.' : SITE === 'ads' ? 'Thoughts on the ad library or the ads. To comment on one ad, open it and use its Feedback tab.' : 'Bugs, design notes, copy edits, ideas — anything about this page helps.' }));

    if (SITE === 'portal') {
      // On the version page, people may be thinking about either site.
      bodyEl.appendChild(el('span', { class: 'label', style: 'margin-top:0', text: 'What’s it about?' }));
      var about = el('div', { class: 'chips', role: 'group', 'aria-label': 'Which version' });
      ABOUT.forEach(function (a) {
        about.appendChild(el('button', { class: 'chip', type: 'button', 'aria-pressed': state.about === a[0] ? 'true' : 'false', text: a[1],
          onclick: function () { state.about = a[0]; store.set('draft:about', a[0]); render(); } }));
      });
      bodyEl.appendChild(about);
    }
    bodyEl.appendChild(el('span', { class: 'label', text: 'What kind of feedback?' }));
    var chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Feedback type' });
    TYPES.forEach(function (t) {
      chips.appendChild(el('button', { class: 'chip', type: 'button', title: t[2], 'aria-pressed': state.type === t[0] ? 'true' : 'false', text: t[1],
        onclick: function () { state.type = t[0]; saveDraft(); render(); } }));
    });
    bodyEl.appendChild(chips);

    bodyEl.appendChild(el('span', { class: 'label', text: 'Details' }));
    var ta = el('textarea', { placeholder: PLACEHOLDER[state.type], 'aria-label': 'Your feedback' });
    ta.value = state.message;
    ta.addEventListener('input', function () { state.message = ta.value; saveDraft(); updateSend(); });
    ta.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); });
    ta.addEventListener('paste', function (e) {
      var files = [].slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
      if (files.length) { e.preventDefault(); files.forEach(addFile); }
    });
    bodyEl.appendChild(ta);

    var file = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
    file.addEventListener('change', function () { [].slice.call(file.files).forEach(addFile); file.value = ''; });
    bodyEl.appendChild(el('div', { class: 'tools' }, [
      el('button', { class: 'tool', type: 'button', html: ICON.camera + 'Screenshot', title: 'Capture this page and mark it up', onclick: captureFlow }),
      el('button', { class: 'tool', type: 'button', html: ICON.target + 'Point at it', title: 'Click the exact element you mean', onclick: pickFlow }),
      el('button', { class: 'tool', type: 'button', html: ICON.upload + 'Upload', title: 'Attach an image (or paste / drop one)', onclick: function () { file.click(); } }),
      file,
    ]));

    if (state.pin) {
      bodyEl.appendChild(el('div', { class: 'pin' }, [
        el('span', { html: ICON.target }),
        el('code', { text: state.pin.label, title: state.pin.selector }),
        el('button', { type: 'button', 'aria-label': 'Remove pinned element', html: ICON.close, onclick: function () { state.pin = null; render(); } }),
      ]));
    }
    if (state.shots.length) {
      var shots = el('div', { class: 'shots' });
      state.shots.forEach(function (s, i) {
        shots.appendChild(el('div', { class: 'shot' }, [
          el('img', { src: s.dataUrl, alt: 'Screenshot ' + (i + 1) }),
          el('div', { class: 'acts' }, [
            el('button', { type: 'button', 'aria-label': 'Edit screenshot', html: ICON.edit, onclick: function () { annotate(s.original || s.dataUrl, null, function (r) { if (r) { state.shots[i] = r; render(); } }, s.original); } }),
            el('button', { type: 'button', 'aria-label': 'Remove screenshot', html: ICON.trash, onclick: function () { state.shots.splice(i, 1); render(); } }),
          ]),
        ]));
      });
      bodyEl.appendChild(shots);
    }

    bodyEl.appendChild(el('span', { class: 'label', text: 'How important is it?' }));
    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Priority' });
    PRIORITY.forEach(function (p) {
      seg.appendChild(el('button', { type: 'button', 'data-v': p[0], 'aria-pressed': state.priority === p[0] ? 'true' : 'false', text: p[1],
        onclick: function () { state.priority = p[0]; render(); } }));
    });
    bodyEl.appendChild(seg);

    bodyEl.appendChild(el('div', { class: 'ctx' }, [
      'On', el('b', { text: SITE === 'portal' ? 'the version page' : SITE === 'ads' ? 'the ad library' : SITE.toUpperCase() + ' ' + (location.pathname === '/' ? 'home' : location.pathname) }),
      '· ' + window.innerWidth + '×' + window.innerHeight,
    ]));
    if (state.error) bodyEl.appendChild(el('div', { class: 'error', role: 'alert', text: state.error }));

    var btn = el('button', { class: 'primary', type: 'button', html: (state.sending ? 'Sending…' : 'Send feedback ') + (state.sending ? '' : ICON.send), onclick: send });
    footEl.appendChild(btn);
    footEl.appendChild(el('div', { class: 'hint' }, [
      el('span', { text: state.me ? 'Sending as ' + state.me.email : '' }),
      el('span', { html: '<kbd>⌘</kbd> <kbd>Enter</kbd> to send' }),
    ]));
    function updateSend() { btn.disabled = state.sending || !state.message.trim(); }
    updateSend();
    setTimeout(function () { if (!state.message) ta.focus(); }, 30);

    panel.ondragover = function (e) { e.preventDefault(); };
    panel.ondrop = function (e) {
      e.preventDefault();
      [].slice.call(e.dataTransfer.files || []).filter(function (f) { return /^image\//.test(f.type); }).forEach(addFile);
    };
  }

  function renderThanks() {
    var id = state.lastId;
    bodyEl.appendChild(el('div', { class: 'done' }, [
      el('div', { class: 'badge', html: ICON.check }),
      el('h3', { text: 'Thank you!' }),
      el('p', { class: 'sub', text: 'Feedback #' + id + ' is with the team. You’ll see replies and status changes under My feedback.' }),
      el('div', { class: 'row-btns' }, [
        el('button', { class: 'ghost', type: 'button', text: 'View it', onclick: function () { state.lastId = null; openDetail(id); } }),
        el('button', { class: 'primary', style: 'width:auto', type: 'button', text: 'Add another', onclick: function () { state.lastId = null; render(); } }),
      ]),
    ]));
  }

  function addFile(f) {
    if (state.shots.length >= 6) return toast('Up to 6 images per item.');
    var r = new FileReader();
    r.onload = function () { shrink(r.result, function (d) { state.shots.push(d); render(); }); };
    r.readAsDataURL(f);
  }

  function shrink(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 2000 / img.width);
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var out = c.toDataURL('image/webp', 0.86);
      if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/jpeg', 0.86);
      cb({ dataUrl: out, width: c.width, height: c.height, original: dataUrl });
    };
    img.src = dataUrl;
  }

  function context() {
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      userAgent: navigator.userAgent,
      language: navigator.language,
      referrer: document.referrer || null,
      pinned: state.pin,
    };
  }

  function send() {
    if (state.sending || !state.message.trim()) return;
    state.sending = true;
    state.error = '';
    render();
    api('feedback', { method: 'POST', body: {
      type: state.type, priority: state.priority, message: state.message.trim(), site: SITE === 'portal' ? state.about : SITE,
      url: location.href, path: location.pathname + location.search, pageTitle: document.title,
      context: context(), screenshots: state.shots.map(function (s) { return { dataUrl: s.dataUrl, width: s.width, height: s.height }; }),
    } }).then(function (d) {
      state.sending = false;
      state.message = ''; state.shots = []; state.pin = null; state.priority = 'normal';
      saveDraft();
      state.lastId = d.id;
      render();
      refreshMine();
    }).catch(function (e) {
      state.sending = false;
      state.error = e.message || 'Something went wrong. Please try again.';
      render();
    });
  }

  // ------------------------------------------------------- element picker
  function cssPath(node) {
    if (!(node instanceof Element)) return '';
    if (node.id && !/^yui_|^\d/.test(node.id)) return '#' + CSS.escape(node.id);
    var parts = [];
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      var sel = node.tagName.toLowerCase();
      if (node.id && !/^yui_|^\d/.test(node.id)) { parts.unshift('#' + CSS.escape(node.id)); break; }
      var cls = [].slice.call(node.classList).filter(function (c) { return !/^(yui|preScale|scaleIn|preFade|fadeIn|v1-)/.test(c); }).slice(0, 2);
      if (cls.length) sel += '.' + cls.map(function (c) { return CSS.escape(c); }).join('.');
      var p = node.parentElement;
      if (p) {
        var same = [].slice.call(p.children).filter(function (c) { return c.tagName === node.tagName; });
        if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function pickFlow() {
    panel.classList.add('hidden');
    var hl = el('div', { class: 'pick-hl' });
    var tip = el('div', { class: 'pick-tip', html: 'Click the part of the page you mean · <b>Esc</b> to cancel' });
    root.appendChild(hl);
    root.appendChild(tip);
    var current = null;
    function move(e) {
      var t = document.elementFromPoint(e.clientX, e.clientY);
      if (!t || t === hostEl) return;
      current = t;
      var r = t.getBoundingClientRect();
      hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px'; hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
    }
    function done(cancel) {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      hl.remove(); tip.remove();
      panel.classList.remove('hidden');
      if (!cancel && current) {
        var r = current.getBoundingClientRect();
        var txt = (current.innerText || current.alt || current.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        state.pin = {
          selector: cssPath(current), tag: current.tagName.toLowerCase(), text: txt,
          rect: { x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
          label: current.tagName.toLowerCase() + (txt ? ' · “' + txt.slice(0, 40) + (txt.length > 40 ? '…' : '') + '”' : ''),
        };
      }
      render();
    }
    function click(e) { e.preventDefault(); e.stopPropagation(); done(false); }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); done(true); } }
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
  }

  // ------------------------------------------------------ screenshot capture
  function captureFlow() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast('Screen capture isn’t available in this browser — upload or paste an image instead.');
      return;
    }
    var pinRect = state.pin ? state.pin.rect : null;
    hostEl.style.visibility = 'hidden';
    setOffset(false);
    navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 5 }, audio: false,
      preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
    }).then(function (stream) {
      var video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      return video.play().then(function () {
        // Let the share prompt disappear and the page repaint before grabbing a frame.
        return new Promise(function (res) { setTimeout(res, 450); });
      }).then(function () {
        var c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        stream.getTracks().forEach(function (t) { t.stop(); });
        return c.toDataURL('image/png');
      });
    }).then(function (png) {
      hostEl.style.visibility = '';
      setOffset(true);
      var preset = null;
      if (pinRect) {
        // Pre-draw a box around the pinned element (capture is the visible tab at device scale).
        preset = { kind: 'box', color: '#c83a2a', vp: { w: window.innerWidth, h: window.innerHeight },
          x: pinRect.x - window.scrollX, y: pinRect.y - window.scrollY - (bar ? BAR_H : 0), w: pinRect.w, h: pinRect.h };
      }
      annotate(png, preset, function (r) { if (r) { state.shots.push(r); } render(); });
    }).catch(function (e) {
      hostEl.style.visibility = '';
      setOffset(true);
      if (e && e.name !== 'NotAllowedError') toast('Couldn’t capture the screen — you can upload or paste an image instead.');
      render();
    });
  }

  // ------------------------------------------------------ annotation editor
  function annotate(src, preset, cb) {
    var img = new Image();
    img.onload = function () { openEditor(img, preset, cb, src); };
    img.src = src;
  }

  function openEditor(img, preset, cb, original) {
    var COLORS = ['#c83a2a', '#daff6b', '#1c300b', '#ffffff', '#1e7bd8'];
    var tool = 'box', color = COLORS[0], shapes = [], drawing = null, crop = null;
    if (preset && preset.vp) {
      var sx = img.width / preset.vp.w, sy = img.height / preset.vp.h;
      shapes.push({ kind: 'box', color: preset.color, x: preset.x * sx, y: preset.y * sy, w: preset.w * sx, h: preset.h * sy, lw: 4 * sx });
    }
    var overlay = el('div', { class: 'annot', role: 'dialog', 'aria-label': 'Mark up screenshot' });
    var canvas = el('canvas');
    canvas.width = img.width; canvas.height = img.height;
    var ctx = canvas.getContext('2d');
    var bar = el('div', { class: 'annot-bar' });
    bar.appendChild(el('span', { class: 'title', text: 'Mark it up' }));
    var tools = [['box', 'Box', ICON.box], ['arrow', 'Arrow', ICON.arrow], ['pen', 'Draw', ICON.pen], ['mark', 'Highlight', ICON.mark],
      ['text', 'Text', ICON.text], ['blur', 'Hide (blur)', ICON.blur], ['crop', 'Crop', ICON.crop]];
    var toolBtns = {};
    tools.forEach(function (t) {
      var b = el('button', { class: 'tb', type: 'button', title: t[1], 'aria-label': t[1], 'aria-pressed': tool === t[0] ? 'true' : 'false', html: t[2],
        onclick: function () { tool = t[0]; Object.keys(toolBtns).forEach(function (k) { toolBtns[k].setAttribute('aria-pressed', k === tool ? 'true' : 'false'); }); } });
      toolBtns[t[0]] = b;
      bar.appendChild(b);
    });
    bar.appendChild(el('span', { class: 'sep' }));
    var sws = [];
    COLORS.forEach(function (c) {
      var b = el('button', { class: 'sw', type: 'button', 'aria-label': 'Colour ' + c, style: 'background:' + c, 'aria-pressed': c === color ? 'true' : 'false',
        onclick: function () { color = c; sws.forEach(function (s) { s.setAttribute('aria-pressed', s === b ? 'true' : 'false'); }); } });
      sws.push(b);
      bar.appendChild(b);
    });
    bar.appendChild(el('span', { class: 'sep' }));
    bar.appendChild(el('button', { class: 'tb', type: 'button', title: 'Undo (⌘Z)', 'aria-label': 'Undo', html: ICON.undo, onclick: undo }));
    bar.appendChild(el('span', { class: 'sep' }));
    bar.appendChild(el('button', { class: 'act cancel', type: 'button', text: 'Cancel', onclick: function () { close(null); } }));
    bar.appendChild(el('button', { class: 'act ok', type: 'button', text: 'Attach screenshot', onclick: finish }));
    overlay.appendChild(bar);
    overlay.appendChild(el('div', { class: 'annot-stage' }, [canvas]));
    root.appendChild(overlay);
    panel.classList.add('hidden');

    function lw() { return Math.max(3, img.width / 400); }
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    }
    function drawShape(s) {
      ctx.save();
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.lw || lw(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (s.kind === 'box') { ctx.strokeRect(s.x, s.y, s.w, s.h); }
      else if (s.kind === 'mark') { ctx.globalAlpha = 0.35; ctx.fillRect(s.x, s.y, s.w, s.h); }
      else if (s.kind === 'pen') { ctx.beginPath(); s.pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke(); }
      else if (s.kind === 'arrow') {
        var a = Math.atan2(s.y2 - s.y, s.x2 - s.x), h = (s.lw || lw()) * 4.5;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - h * Math.cos(a - 0.45), s.y2 - h * Math.sin(a - 0.45));
        ctx.lineTo(s.x2 - h * Math.cos(a + 0.45), s.y2 - h * Math.sin(a + 0.45));
        ctx.closePath(); ctx.fill();
      } else if (s.kind === 'text') {
        var fs = Math.max(18, img.width / 55);
        ctx.font = '600 ' + fs + 'px "YFB Inter Tight", Arial, sans-serif';
        var w = ctx.measureText(s.text).width;
        ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(s.x - 6, s.y - fs, w + 12, fs * 1.35);
        ctx.fillStyle = s.color; ctx.fillText(s.text, s.x, s.y + fs * 0.1);
      } else if (s.kind === 'blur') {
        var x = Math.round(Math.min(s.x, s.x + s.w)), y = Math.round(Math.min(s.y, s.y + s.h)), w2 = Math.round(Math.abs(s.w)), h2 = Math.round(Math.abs(s.h));
        if (w2 > 2 && h2 > 2) {
          var px = Math.max(8, Math.round(img.width / 120));
          var t = document.createElement('canvas'); t.width = Math.max(1, Math.ceil(w2 / px)); t.height = Math.max(1, Math.ceil(h2 / px));
          t.getContext('2d').drawImage(img, x, y, w2, h2, 0, 0, t.width, t.height);
          ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w2, h2);
        }
      }
      ctx.restore();
    }
    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      shapes.filter(function (s) { return s.kind === 'blur'; }).forEach(drawShape);
      shapes.filter(function (s) { return s.kind !== 'blur'; }).forEach(drawShape);
      if (drawing && drawing.kind !== 'crop') drawShape(drawing);
      var c = drawing && drawing.kind === 'crop' ? drawing : crop;
      if (c) {
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.5)';
        var cx = Math.min(c.x, c.x + c.w), cy = Math.min(c.y, c.y + c.h), cw = Math.abs(c.w), ch = Math.abs(c.h);
        ctx.fillRect(0, 0, canvas.width, cy); ctx.fillRect(0, cy + ch, canvas.width, canvas.height - cy - ch);
        ctx.fillRect(0, cy, cx, ch); ctx.fillRect(cx + cw, cy, canvas.width - cx - cw, ch);
        ctx.strokeStyle = '#daff6b'; ctx.lineWidth = lw() * 0.6; ctx.setLineDash([lw() * 3, lw() * 2]); ctx.strokeRect(cx, cy, cw, ch);
        ctx.restore();
      }
    }
    function undo() { if (crop) crop = null; else shapes.pop(); redraw(); }
    canvas.addEventListener('pointerdown', function (e) {
      var p = pos(e);
      canvas.setPointerCapture(e.pointerId);
      if (tool === 'text') { placeText(e, p); return; }
      if (tool === 'pen') drawing = { kind: 'pen', color: color, pts: [p], lw: lw() };
      else if (tool === 'arrow') drawing = { kind: 'arrow', color: color, x: p.x, y: p.y, x2: p.x, y2: p.y, lw: lw() };
      else drawing = { kind: tool, color: color, x: p.x, y: p.y, w: 0, h: 0, lw: lw() };
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      var p = pos(e);
      if (drawing.kind === 'pen') drawing.pts.push(p);
      else if (drawing.kind === 'arrow') { drawing.x2 = p.x; drawing.y2 = p.y; }
      else { drawing.w = p.x - drawing.x; drawing.h = p.y - drawing.y; }
      redraw();
    });
    canvas.addEventListener('pointerup', function () {
      if (!drawing) return;
      var d = drawing; drawing = null;
      if (d.kind === 'crop') { if (Math.abs(d.w) > 10 && Math.abs(d.h) > 10) crop = d; }
      else if (d.kind === 'pen' ? d.pts.length > 1 : d.kind === 'arrow' ? Math.hypot(d.x2 - d.x, d.y2 - d.y) > 6 : Math.abs(d.w) > 4 && Math.abs(d.h) > 4) {
        if (d.kind === 'box' || d.kind === 'mark' || d.kind === 'blur') { if (d.w < 0) { d.x += d.w; d.w = -d.w; } if (d.h < 0) { d.y += d.h; d.h = -d.h; } }
        shapes.push(d);
      }
      redraw();
    });
    function placeText(e, p) {
      var input = el('input', { class: 'annot-text', type: 'text', placeholder: 'Type, then Enter', style: 'left:' + e.clientX + 'px;top:' + (e.clientY - 18) + 'px' });
      root.appendChild(input);
      setTimeout(function () { input.focus(); }, 0);
      function commit() {
        if (input.value.trim()) shapes.push({ kind: 'text', color: color, x: p.x, y: p.y, text: input.value.trim() });
        input.remove(); redraw();
      }
      input.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') input.remove(); });
      input.addEventListener('blur', commit);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'Enter' && !(e.target && e.target.tagName === 'INPUT')) { e.preventDefault(); finish(); }
    }
    document.addEventListener('keydown', onKey, true);
    function finish() {
      drawing = null;
      var c = crop; crop = null; redraw();
      var out = canvas;
      if (c) {
        var cx = Math.min(c.x, c.x + c.w), cy = Math.min(c.y, c.y + c.h), cw = Math.abs(c.w), ch = Math.abs(c.h);
        out = document.createElement('canvas'); out.width = Math.round(cw); out.height = Math.round(ch);
        out.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
      }
      shrink(out.toDataURL('image/png'), function (r) { r.original = original; close(r); });
    }
    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      panel.classList.remove('hidden');
      cb(result);
    }
    redraw();
  }

  // ------------------------------------------------------------ my feedback
  function statusPill(s) { return el('span', { class: 'pill s-' + s, text: STATUS[s] || s }); }
  function typeName(t) { var x = TYPES.filter(function (y) { return y[0] === t; })[0]; return x ? x[1] : t; }

  function renderMine() {
    if (!state.items) { bodyEl.appendChild(el('div', { class: 'spinner', 'aria-label': 'Loading' })); return; }
    var here = location.pathname + location.search;
    var list = state.filter === 'page' ? state.items.filter(function (i) { return i.path === here && i.site === SITE; }) : state.items;
    var seg = el('div', { class: 'seg filter', role: 'group', 'aria-label': 'Show' });
    [['page', 'This page'], ['all', 'Everywhere (' + state.items.length + ')']].forEach(function (f) {
      seg.appendChild(el('button', { type: 'button', 'aria-pressed': state.filter === f[0] ? 'true' : 'false', text: f[1], onclick: function () { state.filter = f[0]; render(); } }));
    });
    bodyEl.appendChild(seg);
    if (!list.length) {
      bodyEl.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: state.filter === 'page' ? 'Nothing here yet' : 'No feedback yet' }),
        el('p', { text: state.filter === 'page' ? 'You haven’t left feedback on this page.' : 'Your feedback will appear here with replies from the team.' }),
        el('button', { class: 'ghost', type: 'button', text: 'Leave feedback', onclick: function () { state.tab = 'new'; render(); } }),
      ]));
      return;
    }
    list.forEach(function (i) {
      var b = el('button', { class: 'item', type: 'button', onclick: function () { openDetail(i.id); } }, [
        el('div', { class: 'meta' }, [
          el('span', { class: 'pill t', text: typeName(i.type) }), statusPill(i.status),
          el('span', { text: '#' + i.id + ' · ' + ago(i.created_at) }),
          i.comment_count ? el('span', { text: '· ' + i.comment_count + ' repl' + (i.comment_count === 1 ? 'y' : 'ies') }) : null,
          isUnread(i) ? el('span', { class: 'unread', title: 'New activity' }) : null,
        ]),
        el('p', { text: i.message }),
        state.filter === 'all' ? el('div', { class: 'meta', style: 'margin:6px 0 0' }, [el('span', { text: i.site.toUpperCase() + ' ' + i.path })]) : null,
      ]);
      bodyEl.appendChild(b);
    });
  }

  function openDetail(id) {
    state.tab = 'mine';
    state.detail = { id: id, data: null };
    render();
    api('feedback/' + id).then(function (d) {
      state.detail = { id: id, data: d };
      markSeen(d.item);
      if (state.items) state.items.forEach(function (i) { if (i.id === id) markSeen(i); });
      updateDot();
      render();
    }).catch(function (e) { state.detail = null; toast(e.message); render(); });
  }

  function renderDetail() {
    var d = state.detail.data;
    bodyEl.appendChild(el('button', { class: 'back', type: 'button', html: ICON.back + 'All feedback', onclick: function () { state.detail = null; render(); } }));
    if (!d) { bodyEl.appendChild(el('div', { class: 'spinner' })); return; }
    var i = d.item;
    var wrap = el('div', { class: 'detail' });
    wrap.appendChild(el('div', { class: 'meta', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:rgba(30,30,30,.62)' }, [
      el('span', { class: 'pill t', text: typeName(i.type) }), statusPill(i.status), el('span', { text: '#' + i.id + ' · ' + ago(i.created_at) }),
    ]));
    wrap.appendChild(el('p', { class: 'msg', text: i.message }));
    if (d.attachments.length) {
      var g = el('div', { class: 'gallery' });
      d.attachments.forEach(function (a) {
        var src = API + 'attachments/' + a.id;
        g.appendChild(el('a', { href: src, target: '_blank', rel: 'noopener' }, [el('img', { src: src, alt: 'Screenshot', loading: 'lazy' })]));
      });
      wrap.appendChild(g);
    }
    var here = i.url && i.url !== location.href;
    wrap.appendChild(el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap' }, [
      here ? el('a', { class: 'linkish', href: i.url, html: 'Open page ' + ICON.ext }) : null,
      i.status === 'new' ? el('button', { class: 'linkish danger', type: 'button', style: 'border:0;background:none;padding:0', html: ICON.trash + ' Withdraw',
        onclick: function () {
          if (!confirm('Withdraw this feedback?')) return;
          api('feedback/' + i.id, { method: 'DELETE' }).then(function () { state.detail = null; toast('Feedback withdrawn'); refreshMine(); render(); });
        } }) : null,
    ]));

    var thread = el('div', { class: 'thread' });
    thread.appendChild(el('span', { class: 'label', style: 'margin-top:0', text: d.comments.length ? 'Conversation' : 'No replies yet' }));
    d.comments.forEach(function (c) {
      var mine = state.me && c.author_email === state.me.email;
      thread.appendChild(el('div', { class: 'cmt' }, [
        el('div', { class: 'who' }, [mine ? 'You' : c.author_email.split('@')[0], !mine ? el('span', { class: 'team', text: 'Web team' }) : null, el('span', { text: ago(c.created_at) })]),
        el('p', { text: c.body }),
      ]));
    });
    var ta = el('textarea', { placeholder: 'Reply to the team…', 'aria-label': 'Reply' });
    var sendBtn = el('button', { type: 'button', 'aria-label': 'Send reply', html: ICON.send, onclick: function () {
      if (!ta.value.trim()) return;
      sendBtn.disabled = true;
      api('feedback/' + i.id + '/comments', { method: 'POST', body: { body: ta.value } }).then(function (nd) {
        state.detail.data = nd; markSeen(nd.item); refreshMine(); render();
      }).catch(function (e) { sendBtn.disabled = false; toast(e.message); });
    } });
    ta.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendBtn.click(); });
    thread.appendChild(el('div', { class: 'reply' }, [ta, sendBtn]));
    wrap.appendChild(thread);
    bodyEl.appendChild(wrap);
  }
})();
