# overyondr.com V2 — instructions for Claude

A static Astro site served by a Cloudflare Worker (static assets only). V2 is the redesign built from the
V3 prototype; see README.md for the page map, design system and pre-launch content list.

## Where things deploy

V2 lives in the `v2/` folder of the **overyondr-website-v1** repository (merged from overyondr-website-v2).
The repo root `npm run build` builds V2 (`npm run build --prefix v2`) and `scripts/merge-v2.mjs` copies `v2/dist`
into `dist/__v2`. One Cloudflare Worker (repo root `wrangler.jsonc`, `src/worker/index.js`) serves it on
**https://v2.overyondrdev.com**, behind the Yondr Google sign-in (see `docs/PLATFORM.md` in the repo root), with the
feedback widget injected.
There is no separate V2 Worker or `wrangler.jsonc` — don't add one (it would take the v2 domain from the main Worker).
`public/_redirects` and `public/_headers` here still work: the Worker applies them for the V2 host.
Do NOT add overyondr.com routes; that happens only at cutover, after sign-off.

## How to ship a change

1. Branch from `main` (`design/<short-name>` or `content/<page>`).
2. Make the change, then in `v2/` run `npm ci` (first time), `npm run build` and `npm run check:links`. Both must pass.
   To see it as deployed, run `npm run build` then `npx wrangler dev` from the repo root (V2 = the `v2.` host).
3. Run `npm run format` before committing (CI runs `prettier --check`).
4. Push the branch and open a PR into `main` using `.github/pull_request_template.md`.
   Never force-push `main`. Never commit `dist/`, `node_modules/`, `.env*`, `walkthrough/` or secrets.

## Rules

- Every page uses `Base.astro` with a `title` and `description`. Every image has `alt` text (`alt=""` if decorative).
- Use the tokens and surfaces in `src/styles/global.css`; don't hard-code new colours or font sizes.
- Images go in `src/assets/images` and are rendered with `<Img>`. Never load from `images.squarespace-cdn.com`
  or `static1.squarespace.com` (the build fails).
- Scoped component styles don't reach child components; use `:global()` for markup rendered by `<Img>` etc.
- Keep it accessible: semantic headings, visible focus, keyboard-operable menus/tabs/carousels,
  `prefers-reduced-motion` respected, works at 375px with no horizontal scroll.
- Never invent quotes, statistics or legal facts. Attribute quotes to a real source.
- No URL changes without a 301 in `public/_redirects`. URLs have no trailing slash.
- Plain Astro + CSS + small vanilla TS. Ask before adding a dependency or a UI framework.
