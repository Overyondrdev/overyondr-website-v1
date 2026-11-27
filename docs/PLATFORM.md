# overyondrdev.com platform guide

How Yondr's preview sites and internal tools on `overyondrdev.com` fit together, how people sign in, how things
deploy, and what we learned the hard way. **Read this before changing sign-in, deploys, DNS, Cloudflare settings or
adding a site.** Each repository's CLAUDE.md points here.

## 1. What runs where

All in Cloudflare account `3fac6c19097c5692e17198cffa818085`. Every site is a Worker on a custom domain.

| Host | Worker | Code | Deploys |
| --- | --- | --- | --- |
| `overyondrdev.com`, `www`, `v1` | `overyondr-website-v1` | this repo (`src/`) | **Workers Builds** on merge to `main` (PR + **build** check required) |
| `v2` | `overyondr-website-v2` (the redesign; own sign-in check) | repo `Overyondrdev/overyondr-website-v2` (moved out of `v2/` here) | Workers Builds from that repo |
| `ads` | `yondr-ad-portal` | repo `Overyondrdev/digital-ads-portal` (moved out of `ad-portal/` here) | see that repo's README |
| `cards` | `yondr-christmas-cards` | repo `Overyondrdev/christmass-cards` (moved out of `apps/christmas-cards/` here) | Workers Builds from that repo |
| `auth` | `yondr-auth` (the sign-in) | this repo, `auth/` | `npx wrangler -c wrangler.jsonc deploy` in `auth/` |
| `requests` | `yondr-marketing-requests` | repo `Overyondrdev/marketing-request-portal` | `npx wrangler deploy` (migrations first: `npm run deploy`) |
| `ops` | `yondr-ops` (monitoring, alerts, backups, auto-fix log; D1 `yondr-ops`, R2 `yondr-ops-backups`) | repo `Overyondrdev/yondr-ops` | `npm run deploy` (bundled; see its README) |
| `feedback` | `yondr-feedback` (feedback tool: widget, API, admin; D1 `yondr-feedback`, KV, AI) | repo `Overyondrdev/yondr-feedback` | `npm run deploy` (bundled; see its README) |

Everything else in the `overyondrdev.com` DNS zone is mail (Resend: `resend._domainkey`, `send`; Cloudflare Email
Service: `cf-bounce*`; `_dmarc` with `p=reject`). Don't change those records.

`overyondr.com` itself is still on Squarespace. Nothing here may add `overyondr.com` routes before the cutover.

## 2. Sign-in: the Yondr Google sign-in (no Cloudflare Access seats)

**Rule: every `*.overyondrdev.com` site checks the Yondr Google sign-in itself.** Cloudflare Access is set to
**Bypass** for these hosts and plays no part in signing people in.

How it works:
1. A site sees no valid `yondr_session` cookie → redirects to `https://auth.overyondrdev.com/login?return=<url>`.
2. That page (`auth/src/pages.js`) says which site you're going to and what happens; **Continue with Google** starts
   Google sign-in (`/login/google`, OpenID Connect with PKCE, state and nonce).
3. `auth` accepts only **verified Google Workspace** accounts whose Workspace (`hd`) and email are `overyondr.com`, then
   sets `yondr_session`: an ES256-signed token, 12 hours, cookie for `.overyondrdev.com` (HttpOnly, Secure, Lax).
4. Each site verifies it with its copy of `auth/src/session.js` and the public key in its `YONDR_AUTH_PUBLIC_JWK`
   variable. Copies: `src/worker/yondr-session.js` (here; CI compares it with `auth/src/session.js`), and one in each
   other site's repository (`digital-ads-portal`, `christmass-cards`, `marketing-request-portal`). When
   `auth/src/session.js` changes, update every copy.

The Google client is an **Internal** OAuth app in Google Cloud project `overyondrdev-sign-in`; its ID and secret are
secrets on `yondr-auth` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), with `SESSION_PRIVATE_JWK` (the signing key).
Details and key rotation: `auth/README.md`. Estate inventory, session rules and risks: `docs/OPERATIONS.md`. How the switch from Access was done: `auth/CUTOVER.md`.

The sites still also accept a Cloudflare Access token (left over from the switch). It's harmless (still
`@overyondr.com` only) and can be removed once nobody needs it.

### Adding a new site (checklist)
1. Put it on its own subdomain as a Worker with `workers_dev: false` and `preview_urls: false`.
2. Copy `auth/src/session.js` into it unchanged; set `YONDR_AUTH_PUBLIC_JWK` (copy it from any site's config) and
   `ALLOWED_EMAIL_DOMAINS = "overyondr.com"`.
3. Check the session on **every** request, including static files (use `run_worker_first: true`, or bundle the files
   into the Worker). Pages: redirect to `loginUrl(request)`. APIs: answer 401 JSON. Sign-out links:
   `https://auth.overyondrdev.com/logout?return=<site>`.
4. Add the site's name and one-line purpose to `SITES` in `auth/src/pages.js` (shown on the sign-in page).
5. Deploy, then add the hostname to the Access application **"Yondr sites (Google sign-in)"** (Bypass).
   (Optional since 27 Nov 2026: the wildcard application is Bypass too, so no host ever costs a seat. It also means
   **Access no longer protects a new host**: the site's own session check is the only lock, so do step 3 before the
   host goes live, and add the host to `GATE` in `Overyondrdev/yondr-ops` `src/checks.js` so Ops alerts within 5
   minutes if it is ever reachable signed out.)
6. In an Incognito window: the site sends you to the sign-in page, comes back after Google, and a personal Gmail is
   refused.

### If sign-in breaks
- Roll back on any host: Zero Trust → Access → Applications → "Yondr sites (Google sign-in)" → policy Action
  **Allow**, Include **Emails ending in** `@overyondr.com`. Access logins return at once (and cost seats again).
- "Use your Yondr account" for real staff: the Workspace's primary domain isn't `overyondr.com` → set
  `ALLOWED_WORKSPACE_DOMAINS` on `yondr-auth` (the log line `sign-in refused … hd=…` shows the value).
- Google "app blocked by administrator": a Workspace admin marks `Yondr (overyondrdev.com)` as Trusted (admin.google.com
  → Security → API controls → App access control).

## 3. Cloudflare Access and seats: what we learned

- **Every distinct email that signs in through Access uses a Zero Trust seat** for the month, whichever login method
  (one-time code, Google, …). Plus-addresses (`chad+test@`) are separate people. Being a Yondr employee doesn't matter.
- The account is on **Zero Trust Standard** with **1 seat bought**; 25 people signing in through Access hit the limit
  ("Your Cloudflare Access organization has used all of its available seats") and blocked everyone else.
- **Bypass** policies don't authenticate, so they use no seats. That's why sign-in moved into our Workers.
- Access applications match the **most specific** hostname/path. The wildcard app "overyondrdev.com (Yondr website
  dev)" (`*.overyondrdev.com`) is **Bypass** (owner decision, 27 Nov 2026: never use Access seats anywhere). It used
  to be Allow, as a safety net for hosts not yet in a Bypass app. **Never set any overyondrdev.com Access policy back to
  Allow**: that charges a seat per person again. The safety net is now each site's own session check plus Ops' sign-in
  checks (`GATE`, `site_exposed` alert).
- Target state: Zero Trust → Overview shows **0 of 1** seats used. If it creeps up, someone is reaching a host that is
  still behind Access: find it (Zero Trust → Logs → Access) and add it to the Bypass app (after it checks the session).
  "Remove inactive users from seats" is set to 1 month.

## 4. Deploying: what we learned

- **The website repo's `main` is protected**: changes need a pull request and the **build** check. Merges deploy via
  Workers Builds. The **"Workers Builds: overyondr-website-v1"** check on pull requests always fails (branch preview
  upload: "name … must match the name of your Worker"); it isn't required and doesn't affect production.
- **From a Claude cloud session, `wrangler deploy` can't upload Workers static assets** (the asset-upload step gets a
  401 through the session's proxy). So the ad library, Christmas cards and marketing requests **bundle their files into
  the Worker script** (each repo's build step) and deploy fine from anywhere. The website uses static assets
  and deploys only through Workers Builds.
- `wrangler deploy` **replaces dashboard plain-text variables** with what's in the config: keep every variable in
  `wrangler.jsonc`/`wrangler.toml`. Secrets survive deploys; set them with `npx wrangler secret put NAME` or the
  dashboard (type **Secret**).
- `wrangler types` reads `.dev.vars`: move it aside first, or local values end up in the generated types.
- Local `wrangler dev` rewrites every request's host to the first route, so host-based logic can't be tested locally
  with a Host header; and Workers AI bindings need remote mode (use a temporary config without the binding to test).

## 5. Secrets, privacy and repositories

- Never commit secrets or personal email addresses. Owner/admin lists are secrets (`OWNER_EMAILS`). Tests and seed
  data use fictional `@overyondr.com` people.
- `DEV_EMAIL` (sign in as someone without Google) is **local only** (`.dev.vars`); it must never be set on a deployed
  Worker: it would skip sign-in.
- All five repositories (`overyondr-website-v1`, `overyondr-website-v2`, `marketing-request-portal`,
  `digital-ads-portal`, `christmass-cards`) are **public** on GitHub, and stay public
  for now (decision: GitHub free plan). So treat every commit as published: no secrets, no personal email addresses,
  no client data, no internal-only notes; IDs and public keys are fine.

## 6. Email

**Rule (owner, 27 Nov 2026): all email sent from overyondrdev.com goes through Resend.** Each sending Worker has its own
Resend API key (sending access, domain `overyondrdev.com`) in a secret named `RESEND_API_KEY`, so one key can be
revoked without touching the others. Don't add Cloudflare Email Service (`send_email`) or any other provider.

| Sender | Used by | Service | Notes |
| --- | --- | --- | --- |
| `marketing@overyondrdev.com` ("Yondr Marketing") | marketing requests notifications | **Resend** (secret `RESEND_API_KEY`, `EMAIL_ENABLED` on) | No inbox: most emails reply to the person who acted. |
| `alerts@overyondrdev.com` ("Yondr Ops") | ops alerts and digests | **Resend** (secret `RESEND_API_KEY` on `yondr-ops`) | No inbox. |
| `cards@overyondrdev.com` | Christmas cards | Cloudflare Email Service today → **moving to Resend** (cards repo) | The `cf-bounce` records can go once cards has moved (ask first: DNS). |

`overyondrdev.com` has DMARC `p=reject`; Resend's DKIM (`resend._domainkey`) satisfies it.

## 7. Testing

- **Plus-addresses (`chad+test@overyondr.com`) can't sign in any more.** They worked with Access, which only emailed a
  code to the address; Google signs in real Workspace accounts only. To test other roles on the live sites, give a
  colleague the role (marketing portal: People & routing), or create dedicated test users in Google Workspace (each is a
  Workspace licence). The marketing portal's old `chad+…` test people can be switched off there (Active toggle).
- Locally: `DEV_EMAIL` in `.dev.vars`, plus an `X-Dev-Email` header to act as someone else (marketing portal, ad library).
- After any sign-in change, check in Incognito: a signed-out visit lands on the sign-in page for the right site; signed
  in, every site opens; a personal Gmail is refused; APIs answer 401 when signed out.

## 8. People fields: always the directory picker

**Rule (owner, 27 Nov 2026): every field where someone enters a Yondr person — assignee, approver, watcher, owner,
reviewer, rep, admin, user, alert recipient — now and in future, uses the shared directory picker.** Typing shows the
few relevant people (name and title, at most 6), never a long list. Data comes from the Yondr Team Contact List sheet
via `auth.overyondrdev.com` (`auth/README.md` "People directory"); no site keeps its own copy of the staff list.

How to add it to a field:
1. Load the script once per page: `<script src="https://auth.overyondrdev.com/people-picker.js" defer></script>`.
2. Mark the field: `<input type="email" data-people>` (it gets the person's email). Options: `data-people-fill="name"`
   (it gets the name), `data-people-external` (also accepts addresses outside the directory, e.g. owners adding a
   guest). Fields rendered later by JavaScript are picked up automatically.
3. CSP: allow `https://auth.overyondrdev.com` in `script-src` and `connect-src`. No inline styles are needed.
4. To fill a name field too, or add the person straight away, listen for `people:select` (`event.detail` =
   `{ name, email, title }`; it bubbles). `input` and `change` also fire.
5. Keep server-side validation as it is (work emails only where the field requires it). The picker helps people
   type; it doesn't replace checks.

Don't add `<datalist>`s or custom staff dropdowns for people fields; replace any you find.

