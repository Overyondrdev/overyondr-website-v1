# overyondr.com V1 — instructions for Claude

**Read [docs/PLATFORM.md](docs/PLATFORM.md) before changing sign-in, deploys, DNS, Cloudflare settings or adding a
site**: what runs where, the Yondr Google sign-in, Access seats, and deploy lessons.

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

- All of overyondrdev.com requires a **Yondr Google sign-in** (`auth/`, Worker `yondr-auth` at `auth.overyondrdev.com`):
  only verified `@overyondr.com` Google Workspace accounts. Every site checks the shared `yondr_session` cookie itself
  with a copy of `auth/src/session.js` (keep copies identical; CI checks). Cloudflare Access is set to Bypass for these
  hosts because Access charges a seat per person (docs/PLATFORM.md §2–3). Never add a host without the session check, and keep
  `workers_dev` and `preview_urls` `false` in every Wrangler config.
- Host routing and query-string pages live in `src/worker/index.js`.
- overyondr.com still points to Squarespace. Do NOT add overyondr.com routes to `wrangler.jsonc`;
  that happens only at cutover, after sign-off. The Worker already serves V1 for any non-dev host.
- Dev hosts are `noindex` via `public/_headers`. Keep it that way.
- `ads.overyondrdev.com` (ad library) is a separate Worker, `yondr-ad-portal`, in `ad-portal/` with its own
  `wrangler.toml`, R2 bucket and D1 database. It is not part of this site's build or deploy; see `ad-portal/README.md`.
  CI checks it in the `ad-portal` job of `.github/workflows/ci.yml`; when changing portal features, update its help
  articles in `ad-portal/public/help-content.js`.

## Feedback tool
Yondr staff leave feedback on any dev page through a widget; the team reviews it at **overyondrdev.com/admin**.
- Widget: `public/__feedback/widget.js` (Shadow DOM, no dependencies). The Worker injects it into HTML on
  `*.overyondrdev.com` only — never on overyondr.com. Screenshots use the browser's screen-capture API
  (one "Share this tab" prompt), then a mark-up editor; images can also be pasted, dropped or uploaded.
- The same script adds the preview toolbar on V1/V2 (All versions, V1/V2 switch, Tour, Give feedback; the page is
  pushed down 44px and top-pinned fixed/sticky elements are moved below it) and the tour. The tour is offered on a
  person's first 3 visits (visit = back after 30+ min), once per visit; finishing ends it; the 1st skip points at the Tour
  button and offers to resume next visit; the 2nd skip is final. Part-way tours are still offered after visit 3.
  State is the `yfb_tour` cookie on `.overyondrdev.com` (shared by all dev hosts); any `[data-yfb-tour]` element replays it.
- API: `src/worker/feedback/api.js` at `/__feedback/api/*`. Identity = the Yondr Google sign-in session (`auth.js`, via
  `src/worker/yondr-session.js`); Access tokens are still accepted during the switch. Data: D1 `yondr-feedback` (`env.DB`, schema in `schema.js`, applied
  automatically), screenshots in KV (`env.SHOTS`), AI summaries via Workers AI (`env.AI`).
- Admin: `src/pages/admin.astro` + `public/__feedback/admin.{js,css}`. Roles live in the `admins` table (owner/admin);
  owners/admins add others under People & access. Non-admins see an "Admins only" page.
- Local dev: `DEV_EMAIL="you@overyondr.com"` in `.dev.vars` (git-ignored) signs you in without Access. Make yourself an
  admin locally with `npx wrangler d1 execute yondr-feedback --local --command "INSERT INTO admins ..."`.

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
| `src/worker/feedback/`, `public/__feedback/`, `src/pages/admin.astro` | Feedback widget, API and admin dashboard |
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
