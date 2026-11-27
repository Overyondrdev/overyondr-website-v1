# overyondr.com V1 — instructions for Claude

**Read [docs/PLATFORM.md](docs/PLATFORM.md) before changing sign-in, deploys, DNS, Cloudflare settings or adding a
site**: what runs where, the Yondr Google sign-in, Access seats, and deploy lessons. **Read
[docs/OPERATIONS.md](docs/OPERATIONS.md) for how sessions work here** (merge when ready, one area per session),
the risk register and planned restructuring.

V1 is the overyondr.com Squarespace site, migrated page-for-page to a static Astro build
served by one Cloudflare Worker. Visitors must see exactly what they saw on Squarespace;
change what they see only to fix a bug (and say so in the PR).

## Where things deploy
Every merge to `main` is built by Cloudflare Workers Builds and live about a minute later:

| Host | Serves |
| --- | --- |
| `overyondrdev.com`, `www.` | Portal page with the **Yondr Website V1** / **V2** buttons (`src/pages/portal.astro`) |
| `v1.overyondrdev.com` | The migrated V1 site |
| `v2.overyondrdev.com` | V2, the Loba redesign (work in progress), built from `v2/` into `dist/__v2` |
| `cards.overyondrdev.com` | Christmas card list app: its own repo, [Overyondrdev/christmass-cards](https://github.com/Overyondrdev/christmass-cards) |

- All of overyondrdev.com requires a **Yondr Google sign-in** (`auth/`, Worker `yondr-auth` at `auth.overyondrdev.com`):
  only verified `@overyondr.com` Google Workspace accounts. Every site checks the shared `yondr_session` cookie itself
  with a copy of `auth/src/session.js` (keep copies identical; CI checks). Cloudflare Access is set to Bypass for these
  hosts because Access charges a seat per person (docs/PLATFORM.md §2–3). Never add a host without the session check, and keep
  `workers_dev` and `preview_urls` `false` in every Wrangler config.
- Host routing and query-string pages live in `src/worker/index.js`.
- overyondr.com still points to Squarespace. Do NOT add overyondr.com routes to `wrangler.jsonc`;
  that happens only at cutover, after sign-off. The Worker already serves V1 for any non-dev host.
- Dev hosts are `noindex` via `public/_headers`. Keep it that way.
- `ads.overyondrdev.com` (ad library) is a separate Worker, `yondr-ad-portal`, in its own repository
  **Overyondrdev/digital-ads-portal** (moved out of `ad-portal/` here in November 2026, with its history). It has its own
  CI and Workers Builds deploy; it keeps a copy of `auth/src/session.js` that must stay identical.

## Auto-fix
`.github/workflows/autofix.yml`, `autofix-guard.yml` and `autofix-report.yml` let Yondr Ops fix objective bugs from the
feedback tool automatically (rules: docs/OPERATIONS.md §6.3; flow, setup and security: `Overyondrdev/yondr-ops` README
"Auto-fix"). Only issues labelled `autofix` by the ops account start them. Keep `FORBIDDEN` identical in `autofix.yml`
and `autofix-guard.yml`; changes to these workflows go through the owner (CODEOWNERS `.github/`).

## Feedback tool
The feedback tool is its own product: Worker `yondr-feedback` on **feedback.overyondrdev.com**, repo
**Overyondrdev/yondr-feedback** (widget, API, admin dashboard, data). Change it there, not here.
- This Worker only embeds it: `withWidget` in `src/worker/index.js` adds
  `<script src="https://feedback.overyondrdev.com/widget.js" data-project="portal|v1|v2" data-toolbar="website">` to HTML
  on `*.overyondrdev.com` only — never on overyondr.com. `data-toolbar="website"` turns on the preview toolbar and tour.
- `overyondrdev.com/admin` redirects (301) to `feedback.overyondrdev.com/admin`. The portal's "Feedback dashboard" link
  appears for admins (it asks `feedback.overyondrdev.com/api/me`). `[data-yfb-open]` and `[data-yfb-tour]` buttons in
  pages keep working.
- Local dev: `DEV_EMAIL="you@overyondr.com"` in `.dev.vars` (git-ignored) signs you in on localhost only.

## How to ship a change
1. Branch from `main` (`design/<short-name>`, `content/<page>` or `fix/<thing>`).
2. Make the change, then `npm ci` (first time) and `npm run build`. It must pass.
3. Commit, push, open a PR into `main` using `.github/pull_request_template.md`.
4. Wait for the GitHub check **build** to pass.
5. Merge (squash). Check the change on v1.overyondrdev.com.
Never force-push `main`. Never commit `dist/`, `node_modules/`, `.migrate/`, `.env*` or secrets.

## Where things live
| Path | What |
| --- | --- |
| `src/v1/pages/<url>.html` | A page's `<body>` HTML exactly as Squarespace rendered it (URLs rewritten to local assets). Edit content here. |
| `src/v1/pages/<url>.json` | That page's `<head>` data: title, description, social tags, canonical, body class |
| `src/v1/pages/__q/*` | Pages Squarespace served via query strings (`/blog?author=…`, `?offset=…`, tags) |
| `src/v1/site.json` | Site stylesheet list and the query-string route table used by the Worker |
| `src/layouts/V1Page.astro` | Shared `<head>` for every V1 page |
| `public/css/squarespace/` | The site's Squarespace stylesheets, self-hosted. Don't hand-edit; override in `public/css/v1.css` |
| `public/css/v1.css` | Our overrides and styles for re-implemented components |
| `public/js/site.js` | All V1 behaviour (menus, accordions, marquee, slideshows, lightbox…). Replaces Squarespace's scripts and jQuery |
| `public/images`, `public/files`, `public/s`, `public/videos`, `public/fonts` | Self-hosted assets (`/s/…` keeps the old Squarespace file URLs) |
| `public/_redirects` | Redirects (same as the live site) |
| `public/brand/` | Official Yondr brand files (wordmarks, icons) and the brand fonts Fraunces + Inter Tight (OFL). Portal, widget and admin follow the Yondr Brand Guidelines v1.0 |
| `scripts/migrate/` | One-off migration tooling: `crawl.py` (snapshot live site), `build.py` (generate the above), `compare.mjs` (live vs local screenshots) |
| `scripts/migrate/missing-on-live-site.txt` | Assets that are already broken on the live Squarespace site |

## Rules
- Keep URLs identical to the Squarespace site. No trailing slashes. If a URL must change,
  add a 301 in `public/_redirects` in the same PR.
- Never load anything from Squarespace hosts (`*.squarespace-cdn.com`, `static1.squarespace.com`,
  `assets.squarespace.com`, `*.sqspcdn.com`). The build fails if any remain.
- Re-running `scripts/migrate/build.py` regenerates `src/v1/pages` and the asset folders and
  overwrites manual edits there. After the first content edit, treat `src/v1/pages` as the source.
- Prefer CSS overrides in `public/css/v1.css` and behaviour in `public/js/site.js` over editing page HTML in bulk.
- Third-party embeds that still work as before: HubSpot forms, Vimeo/YouTube, Elfsight, Shopify links.
- Analytics tags (Google, LinkedIn, HubSpot tracking, Ahrefs, Spotify) are intentionally not on the dev site;
  they are re-added at cutover.
- Ask before adding a dependency. Keep pages accessible and working at 375px wide.

## Commands
- `npm run dev` — Astro dev server (pages only; the Worker routing isn't applied)
- `npm run build` — build into `dist/` plus the Squarespace-reference check
- `npx wrangler dev` — run the real Worker + assets locally (after `npm run build`)
- `npm run check:links` — broken-link check on `dist/`
