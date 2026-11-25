# yondr-ad-portal

The Yondr ad library at **https://ads.overyondrdev.com**: preview ads, download them (one or a zip), approve or ask
for changes, comment, set each ad's status and run dates, upload new ads, and log which ads each campaign uses.

It is its own Cloudflare Worker (`yondr-ad-portal`), separate from `overyondr-website-v1`, which runs
overyondrdev.com, `www`, `v1` and `v2`. It lives in this folder only because the website repo was the repo to hand;
the folder is self-contained and can move to its own repository unchanged.

| What | Where |
| --- | --- |
| Worker (API, file serving, uploads) | `src/index.ts` |
| App (no framework, no dependencies) | `public/index.html`, `public/app.js`, `public/app.css`, `public/brand/` |
| D1 schema (`yondr-ad-portal-db`) | `migrations/0001_init.sql` |
| Ad files (`yondr-ad-portal-assets`, private R2 bucket) | served by the Worker at `/files/<key>`, keys `sets/<set>/…` |
| Harvard study ads (generated) | `seed/` (90 ads + source images + `manifest.json`) |
| Ad generator | `generator/` (see its README) |
| Loader for generated ads | `scripts/seed.mjs` |

## Sign-in

Cloudflare Access app "overyondrdev.com (Yondr website dev)" covers `*.overyondrdev.com`, so people sign in with an
`@overyondr.com` email before any request reaches the Worker. The Worker reads `Cf-Access-Authenticated-User-Email`
for `uploaded_by`, reviews and comments. `workers_dev` and `preview_urls` are off so nothing bypasses Access.
The R2 bucket stays private (no r2.dev URL, no custom domain): files are only served through the Worker.
To limit the portal to the marketing team later, add a separate Access app for `ads.overyondrdev.com`.

## Data

- `ad_sets`: a set of ads made together, with its copy (headlines, descriptions, CTA) as JSON.
- `ads`: one file each: title, headline, type (pouch / in-use / motion / other), size, format, bytes, **R2 key**,
  status (in review / approved / needs changes / archived), campaign start/end dates, uploaded by, timestamps.
- `set_files`: supporting files (pouch cut-out, photos). `campaigns` + `campaign_ads`: where ads run.
- `reviews` (approve / needs changes, one per person per ad), `comments`, `downloads`.

Deleting an ad (only its uploader can) removes its R2 file too; anyone can archive instead.
There is no click-through URL in the portal: the ads team sets it in each ad platform.

## Develop

```sh
cd ad-portal
npm install
echo 'DEV_EMAIL="you@overyondr.com"' > .dev.vars      # stands in for the Access header locally (git-ignored)
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

Then open https://ads.overyondrdev.com: the Access sign-in comes first. Re-seeding is safe: it replaces files and keeps
each ad's status, title, dates, reviews and comments.
