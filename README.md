# overyondr.com — V1

The **V1** site: the Squarespace site at overyondr.com migrated page-for-page to a static
[Astro](https://astro.build) build, served by a Cloudflare Worker with static assets.
Same pages, same URLs, same look — without Squarespace's platform scripts, and with every
image, file, video and font self-hosted. The redesign (V2) will live in its own repository.

## Where it runs
| URL | What |
| --- | --- |
| https://overyondrdev.com | Portal: **Yondr Website V1** / **Yondr Website V2** buttons |
| https://v1.overyondrdev.com | This site |
| https://v2.overyondrdev.com | V2 placeholder |

All three are protected by Cloudflare Access (one-time code emailed to `@overyondr.com` addresses).
overyondr.com itself still points to Squarespace until cutover.

## Run locally
```sh
nvm use            # Node 22
npm ci
npm run build      # build + check nothing still loads from Squarespace
npx wrangler dev   # http://localhost:8787 serves V1 through the real Worker
```

## How changes ship
1. Branch from `main`, open a pull request.
2. CI builds the site and fails if anything still loads from Squarespace.
3. After merge, Cloudflare Workers Builds deploys `main` automatically.

## Migration
`scripts/migrate/` holds the tooling used to move the site off Squarespace:
`crawl.py` snapshots every page, `build.py` turns the snapshot into `src/v1/pages` and
self-hosted assets, and `compare.mjs` screenshots live vs migrated pages. See `CLAUDE.md`
for the full map of the repo and the rules for changing it.

## Status
All 135 pages, the blog (59 posts, author/tag pages, older-posts pages, RSS) and the 404 page
are migrated. Analytics tags and production domains are added at cutover.
