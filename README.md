# overyondr.com — V1

The **V1** site: a faithful copy of the Squarespace site at overyondr.com, rebuilt
as a static [Astro](https://astro.build) site and served by Cloudflare Workers
(static assets). The redesign (V2) will live in its own repository.

## Run locally

```sh
nvm use          # Node 22
npm ci
npm run dev      # http://localhost:4321
npm run preview  # build, then serve with Cloudflare's runtime
```

## Where things live

| Path | What |
| --- | --- |
| `src/pages/` | One file per URL, matching the Squarespace paths exactly |
| `src/content/blog/` | Blog posts (Markdown). File name = URL slug |
| `src/content/legislation/` | Phone-free legislation hub, one file per state |
| `src/data/nav.ts` | Header and footer navigation |
| `public/images`, `public/files` | Images and PDFs copied off the Squarespace CDN |
| `public/_redirects` | Old URL → new URL redirects |
| `wrangler.jsonc` | Cloudflare Worker config |

## How changes ship

1. Branch from `main`, open a pull request.
2. CI builds the site, checks links, and fails if anything still loads from the Squarespace CDN.
3. Cloudflare posts a preview URL on the pull request.
4. After review and merge, Cloudflare deploys `main` automatically.

## Status

Scaffold only. No content migrated, and the live domain still points to Squarespace.
