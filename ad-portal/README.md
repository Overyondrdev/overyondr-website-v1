# yondr-ad-portal

The Yondr ad library at **https://ads.overyondrdev.com**: preview ads, download them (one or a zip), approve or ask
for changes, comment, set each ad's status and run dates, upload new ads, and log which ads each campaign uses.

It is its own Cloudflare Worker (`yondr-ad-portal`), separate from `overyondr-website-v1`, which runs
overyondrdev.com, `www`, `v1` and `v2`. It lives in this folder only because the website repo was the repo to hand;
the folder is self-contained and can move to its own repository unchanged.

| What | Where |
| --- | --- |
| Worker (API, file serving, uploads) | `src/index.ts`; roles in `src/roles.ts`; Access check in `src/access.ts` |
| Browser renderer for copy edits | `public/render.js` (JPEG + GIF encoder), `public/editor.js` (Edit copy tab); template served at `/render/ad.html` |
| App (no framework, no dependencies) | `public/index.html`, `public/app.js`, `public/app.css`, `public/brand/`, bundled into the script and served by `src/static.ts` |
| D1 schema (`yondr-ad-portal-db`) | `migrations/0001_init.sql` |
| Ad files (`yondr-ad-portal-assets`, private R2 bucket) | served by the Worker at `/files/<key>`, keys `sets/<set>/…` |
| Harvard study ads (generated) | `seed/` (90 ads + source images + `manifest.json`) |
| Ad generator | `generator/` (see its README) |
| Loader for generated ads | `scripts/seed.mjs` |

## Sign-in

Cloudflare Access app "overyondrdev.com (Yondr website dev)" covers `*.overyondrdev.com`, so people sign in with an
`@overyondr.com` email before any request reaches the Worker. As a safety net the Worker also checks Access's signed
token (`Cf-Access-Jwt-Assertion`: Yondr team signature, issuer, expiry; `src/access.ts`) and takes the email from it
for `uploaded_by`, reviews and comments. Requests without a valid token get a 403, so the portal stays private even if
the host were ever left out of Access. `workers_dev` and `preview_urls` are off so nothing bypasses Access.
The R2 bucket stays private (no r2.dev URL, no custom domain): files are only served through the Worker.
To limit the portal to the marketing team later, add a separate Access app for `ads.overyondrdev.com`.

## Roles

| Role | Can |
| --- | --- |
| Viewer | Browse ads, download them (one or a zip), comment. Everyone who signs in starts here (`DEFAULT_ROLE`). |
| Editor | + Edit copy and CTA (re-renders the ads), upload ads, set status and run dates, approve / needs changes, manage campaigns, add ad sets. |
| Admin | + Give people roles on the **People** tab, delete any ad or campaign. |

Owners (`OWNER_EMAILS` in `wrangler.toml`) are always admins and can't be changed from the portal. Roles live in the
`users` table; changes are logged in `activity` and shown on the People tab. The API enforces every role check.

## Editing copy

**On an ad** (the usual way): editors click **Edit** on any ad card, or **Edit text** in its details, or follow a
link ending `#ad=<id>/edit`. They see only the text that ad shows, a live preview of exactly that ad (motion ads jump
to the scene being edited), and choose **Every ad with this text** (the shared copy; the footer says how many ads it
updates) or **Only this ad** (a per-ad override stored in the ad's `meta.overrides`, shown as “Own copy”; later shared
edits skip that field on that ad until someone chooses “Go back to the shared copy”). Ads uploaded as finished files
offer **Replace file** instead (same size and format). Viewers get **Suggest a change**, which opens a Copy comment on
the ad; editors see an **Edit text** link on those comments.

**The Edit copy tab** shows every shared field at once, for set-wide changes.

Editors change the tagline, buttons, stat, source lines, headlines and descriptions on the **Edit copy** tab, with a
live preview. Saving works out which ads show the changed text, re-renders them **in the editor's browser** from the
same template the offline generator uses (`generator/ad.html`; drawn at 2×, downsampled and sharpened, JPEG under
150 KB, GIF with a built-in encoder under 150 KB), uploads them over the old files and sets them back to In review.
Keep the tab open until it finishes: a headline change re-renders 18 ads (about 2 minutes), the main button about 75
(about 10 minutes). Use Chrome, Edge or Firefox. If you stop part-way, nothing is saved.

The portal is now where copy lives. Before re-rendering offline, run `npm run pull-copy` so `generator/campaign.json`
matches it (`seed.mjs` only writes the copy the first time, or with `--copy`).

## Tour and help center

- **Tour** (`public/tour.js`): spotlights the real page, one short card per step. First visit: the tour for your role
  (viewer 7 steps; editors and admins get theirs on top). If your role goes up later, your next visit shows a short
  "You’re now an editor/admin" tour of just what’s new. What each person has seen is `users.tour_role` (migration
  `0003`), so it follows them across browsers. Replay: **Help → Take the tour**, or `/?tour=1`.
- **Help center** at `/help` (`public/help.html`, `help.js`, `help.css`; articles in **`public/help-content.js`**).
  Instant search and ⌘K / Ctrl K palette, topics, articles with role badges, deep links (`/help#<article>`),
  “Was this helpful?” and “Still stuck?” (lists admins; suggestions are saved). Feedback lands in `help_feedback` and
  shows on the People tab. Admin articles are only listed for admins. The library links to articles with small “?”
  buttons (`helpLink()` in `app.js`).
- **When a feature changes, update its article in `help-content.js`** (and the tour step in `tour.js` if it moved).

## Data

- `ad_sets`: a set of ads made together, with its copy (headlines, descriptions, CTA) as JSON.
- `ads`: one file each: title, headline, type (pouch / in-use / motion / other), size, format, bytes, **R2 key**,
  status (in review / approved / needs changes / archived), campaign start/end dates, uploaded by, timestamps.
- `set_files`: supporting files (pouch cut-out, photos). `campaigns` + `campaign_ads`: where ads run.
- `reviews` (approve / needs changes, one per person per ad), `comments`, `downloads`.
- `users` (role per email, last visit) and `activity` (role changes, copy edits, re-renders): migration `0002_roles.sql`.

Deleting an ad (its uploader or an admin) removes its R2 file too; editors can archive instead.
There is no click-through URL in the portal: the ads team sets it in each ad platform.

## Develop

```sh
cd ad-portal
npm install
echo 'DEV_EMAIL="you@overyondr.com"' > .dev.vars      # stands in for the Access sign-in locally (git-ignored)
                                                       # send an X-Dev-Email header to try other people's roles
npm run migrate:local
npm run seed:local -- --by you@overyondr.com           # ~3 minutes: uploads 93 files to local R2
npm run dev                                            # http://localhost:8787
```

Always run wrangler with `-c wrangler.toml` (the npm scripts do): otherwise it picks up the website's `wrangler.jsonc`
in the parent folder.

## Deploy

```sh
npm run migrate:remote                                  # once per new migration
npx wrangler -c wrangler.toml deploy                    # also attaches ads.overyondrdev.com (creates its DNS record)
npm run seed:remote -- --by you@overyondr.com           # first time, or after re-rendering the ads
```

The app's files are bundled into the Worker script (`[[rules]]` in `wrangler.toml`) rather than uploaded as Workers
static assets, so a deploy is a single script upload with an ordinary API token. If you add a file to `public/`,
add it to `src/static.ts`.

Then open https://ads.overyondrdev.com: the Access sign-in comes first. Re-seeding is safe: it replaces files and keeps
each ad's status, title, dates, reviews and comments.
