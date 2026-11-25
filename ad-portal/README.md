# yondr-ad-portal

The Yondr ad library at **https://ads.overyondrdev.com**: find ads (search, filters, grid or matrix), download them
(one, a selection or a kit), review and approve them, comment and suggest changes, edit their copy (the ads re-render),
upload new ones, and log which ads each campaign uses. A bell keeps people posted.

It is its own Cloudflare Worker (`yondr-ad-portal`), separate from `overyondr-website-v1` (overyondrdev.com, `www`,
`v1`, `v2`). It lives in this folder of the website repo; the folder is self-contained and can move to its own
repository unchanged.

| What | Where |
| --- | --- |
| Worker: API, files, uploads | `src/index.ts`; roles `src/roles.ts`; notifications `src/notify.ts`; Access check `src/access.ts`; app files `src/static.ts` |
| App (no framework, no runtime dependencies) | `public/index.html`, `app.js`, `app.css`, `tour.js`, `brand/` |
| Editing (loaded only for editors) | `public/editor.js` (edit an ad, Edit copy tab, history), `public/render.js` (renderer + GIF encoder) |
| Help center (`/help`) | `public/help.html`, `help.js`, `help.css`; **articles in `public/help-content.js`** |
| D1 schema (`yondr-ad-portal-db`) | `migrations/0001`–`0004` |
| Ad files (`yondr-ad-portal-assets`, private R2) | served at `/files/<key>`; keys `sets/<set>/…`; motion posters at `<key>.poster.jpg` |
| Harvard study ads (generated) | `seed/` (90 ads, 30 posters, source images, `manifest.json`) |
| Ad generator / loader / copy sync | `generator/` (see its README), `scripts/seed.mjs`, `scripts/pull-copy.mjs` |

## Sign-in

Cloudflare Access app "overyondrdev.com (Yondr website dev)" covers `*.overyondrdev.com`: people sign in with an
`@overyondr.com` email before a request reaches the Worker. As a safety net the Worker also checks Access's signed
token (`Cf-Access-Jwt-Assertion`: Yondr team signature, issuer, expiry; `src/access.ts`) and takes the email from it.
Requests without a valid token get a 403, so the portal stays private even if the host were left out of Access.
`workers_dev` and `preview_urls` are off. The R2 bucket is private: files are only served through the Worker.
To limit the portal to the marketing team later, add a separate Access app for `ads.overyondrdev.com`.

## Roles

| Role | Can |
| --- | --- |
| Viewer | Browse, search, download (one, a zip, a kit), comment and suggest changes. Everyone starts here (`DEFAULT_ROLE`). Sees **approved** ads by default. |
| Editor | + Edit copy and CTA (ads re-render), upload, replace files, set status and run dates, review queue and bulk approve, campaigns, ad sets, copy history. |
| Admin | + People tab (roles, recent changes, help feedback), delete any ad or campaign. |

Owners (`OWNER_EMAILS` in `wrangler.toml`) are always admins and can't be changed from the portal. Roles live in
`users`; the API enforces every check (`src/roles.ts`), the UI only hides what you can't do.

## How things work

**Speed.** Motion ads show a still poster (their end card) in the grid and play on hover, so the grid loads no GIFs.
Ad URLs carry `?v=<updated_at>` and are cached as `immutable`; replaced files get a new URL. The editor and renderer
load only for editors (in idle time). One request (`GET /api/sets/<id>`) starts the page: the set, its ads,
campaigns, the sets list and who you are. Off-screen groups use `content-visibility: auto`.

**Editing copy.** Editors click **Edit** on an ad (or **Edit text** in its details, or a link ending `#ad=<id>/edit`):
only that ad's text, a live preview (motion ads jump to the scene being edited) and a choice: **Every ad with this
text** (the shared copy) or **Only this ad** (an override in the ad's `meta.overrides`, shown as “Own copy”; “Go back
to the shared copy” undoes it). **Edit copy** shows every shared field for set-wide changes, with **History**: every
save is kept in `copy_versions`; **Load** puts an old version in the form to preview and save. Ads uploaded as files
offer **Replace file**. Viewers get **Suggest a change** (a Copy comment); editors get an **Edit text** link on it.

**Saving.** The affected ads are re-rendered in the editor's browser from the same template as the offline generator
(`generator/ad.html`, served at `/render/ad.html`): drawn at 2× through an SVG snapshot, downsampled and sharpened,
JPEG or GIF under 150 KB, plus a poster for motion ads. Images are shrunk once to the size the ad shows; frames where
nothing moves reuse the previous snapshot; downsampling and GIF encoding run in a pool of Web Workers while the page
captures the next ad. Measured on a 4-core machine: a headline change (18 ads, 6 motion) takes about 25 seconds.
It runs **in the background** (a progress card bottom-left, “Updating…” badges) so people keep browsing; the tab must
stay open. Stopping before the end saves nothing. Works in Chrome, Edge and Firefox (not Safari).
Server-side rendering (Cloudflare Browser Rendering + Queues) would let people close the tab; it isn't used yet.

**Review.** New, edited and uploaded ads are **In review**. Editors get a **Review (n)** queue: A approves,
N asks for changes (with an optional note sent as a comment), arrows step through. Selected ads can be approved or
set to any status in one request (`PATCH /api/ads`).

**Notifications** (`src/notify.ts`). The bell shows: suggestions and comments (to editors and the ad's uploader),
ads that need review after edits or uploads (to editors), “needs changes” (to editors and the uploader) and role
changes (to the person). It refreshes every minute while the tab is visible. **Slack** (optional): create an incoming
webhook for a channel, then `npx wrangler -c wrangler.toml secret put SLACK_WEBHOOK_URL`; the same messages are posted
there with a link to the ad.

**Finding and downloading.** Search (headline, size, version, status…), filters, **Grid** or **Matrix**
(headlines × sizes, one version at a time) and **Download kit** (every size / mobile / desktop, one or all headlines,
versions, approved only), all as zips sorted into `still/` and `motion/` folders by size.

**Tour and help.** `public/tour.js`: viewer 4 steps, editor 5, admin 6; one “You’re now an editor/admin” step after a
promotion; seen state in `users.tour_role`; replay from **Help → Take the tour** or `/?tour=1`. Help center at `/help`
with search, ⌘K / Ctrl K, role badges and “Was this helpful?” (saved in `help_feedback`, shown on the People tab).
**When a feature changes, update its article in `public/help-content.js`** and the tour step if it moved.

There is no click-through URL in the portal: the ads team sets it in each ad platform.

## Data

- `ad_sets` (copy as JSON), `ads` (one file each: title, headline, type, size, format, bytes, **R2 key**, poster key,
  status, run dates, `meta` incl. overrides), `set_files` (source images), `campaigns` + `campaign_ads`.
- `reviews`, `comments`, `downloads`; `users` (role, last visit, tour) and `activity` (roles, copy edits, re-renders,
  uploads); `notifications` (one row per recipient); `copy_versions`; `help_feedback`.

## Develop

```sh
cd ad-portal
npm install
echo 'DEV_EMAIL="you@overyondr.com"' > .dev.vars      # stands in for the Access sign-in locally (git-ignored);
                                                       # send an X-Dev-Email header to act as someone else
npm run migrate:local
npm run seed:local -- --by you@overyondr.com           # uploads the ads, posters and source images to local R2
npm run dev                                            # http://localhost:8787
npm run typecheck                                      # TypeScript, strict (also runs in CI)
```

Always run wrangler with `-c wrangler.toml` (the npm scripts do), or it picks up the website's `wrangler.jsonc`.
App files are bundled into the Worker script (`[[rules]]` in `wrangler.toml`); a new file in `public/` must be added
to `src/static.ts`.

## CI and deploy

- **CI**: the `ad-portal` job in `.github/workflows/ci.yml` runs on every pull request and push: `npm ci`, type check,
  `node --check` on the app scripts and a dry-run bundle. No secrets.
- **Deploy (recommended): Cloudflare Workers Builds**, like the websites, so merges to `main` deploy themselves and no
  Cloudflare secrets live in GitHub. One-time setup in the Cloudflare dashboard: Workers & Pages → `yondr-ad-portal` →
  Settings → Builds → Connect the `overyondr-website-v1` repository, then set
  - Root directory: `ad-portal`
  - Build command: `npm ci && npm run typecheck`
  - Deploy command: `npx wrangler -c wrangler.toml d1 migrations apply yondr-ad-portal-db --remote && npx wrangler -c wrangler.toml deploy`
  - Production branch: `main`; build watch paths: `ad-portal/*`
- **Manual deploy** (with a Cloudflare API token in `CLOUDFLARE_API_TOKEN`):

```sh
npm run migrate:remote                                  # applies new migrations
npm run deploy                                          # also attaches ads.overyondrdev.com
npm run seed:remote -- --by you@overyondr.com           # first time, or after re-rendering ads offline
node scripts/seed.mjs --remote --posters-only           # just upload motion posters (after generating them)
```

Re-seeding is safe: files are replaced and records keep their status, title, dates, reviews and comments. The set's
copy is written only the first time or with `--copy`; the portal owns it after that (`npm run pull-copy` brings portal
edits into `generator/campaign.json` before an offline re-render).
