# overyondr.com V1 — instructions for Claude

A static Astro site served by a Cloudflare Worker (static assets only).
V1 is a faithful replica of the Squarespace site at overyondr.com; design and flow
iterations happen here and are reviewed on the dev domain before cutover.

## Where things deploy
- Every merge to `main` is built by Cloudflare Workers Builds and goes live on
  **https://overyondrdev.com** (and www) about a minute later.
- Every pull request gets a Cloudflare preview URL, posted as a comment on the PR.
- overyondr.com still points to Squarespace. Do NOT add overyondr.com routes to
  `wrangler.jsonc`; that happens only at cutover, after sign-off.
- The dev domain is `noindex` via `public/_headers`. Keep it that way.

## How to ship a change
1. Branch from `main` (`design/<short-name>` or `content/<page>`).
2. Make the change, then run `npm ci` (first time) and `npm run build`. It must pass.
3. Commit with a clear message, push the branch, open a PR into `main` using
   `.github/pull_request_template.md`.
4. Wait for the GitHub check **build** to pass and open the Cloudflare preview URL.
5. Merge (squash). The change appears on overyondrdev.com shortly after.
Never force-push `main`. Never commit `dist/`, `node_modules/`, `.env*` or secrets.

## Where things live
| Path | What |
| --- | --- |
| `src/layouts/Base.astro` | Page shell: `<head>`, header nav, footer. Global styles go here or in `src/styles/` |
| `src/components/` | Reusable UI pieces (`.astro`) |
| `src/pages/` | One file per URL. `src/pages/about.astro` → `/about` |
| `src/data/nav.ts` | Header and footer navigation |
| `src/content/blog/` | Blog posts in Markdown (file name = URL slug) |
| `src/content/legislation/` | Phone-free legislation hub, one file per state/city |
| `public/images`, `public/files` | Images and PDFs (served from `/images/...`, `/files/...`) |
| `public/_redirects` | Old URL → new URL redirects |
| `public/_headers` | Response headers (noindex for dev) |
| `wrangler.jsonc` | Cloudflare Worker config and domains |

## Rules
- Keep URLs identical to the Squarespace site. No trailing slashes (`/about`, not `/about/`).
  If a URL must change, add a 301 in `public/_redirects` in the same PR.
- Never load images or files from `images.squarespace-cdn.com` or `static1.squarespace.com`.
  Download them into `public/images` or `public/files`. The build fails if any remain.
- Every page uses `Base.astro` with a `title` and `description`. Every image has `alt` text.
- Plain Astro + CSS. Ask before adding a dependency or a UI framework.
- Keep it accessible: semantic headings, visible focus styles, sufficient colour contrast,
  works at phone width (375px) with no horizontal scroll.

## Commands
- `npm run dev` — local dev server at http://localhost:4321
- `npm run build` — production build into `dist/` plus the Squarespace-CDN check
- `npm run check:links` — broken-link check on `dist/` (run after build)
