# overyondrdev.com operations hub

The one place that says **what exists, who is working on what, what is at risk and how we work**. It sits on top of
the technical guide in `docs/PLATFORM.md` (sign-in, deploys, Cloudflare lessons), which you should also read.

Kept current by the hub Claude session. A scheduled daily check runs every morning and reports to the site owner. If you
change anything listed here (add a host, move code, change sign-in, add a database), update this file in the same PR.

_Last full audit: 27 Nov 2026._

## 1. Estate inventory

### Repositories (GitHub org `Overyondrdev`)
| Repo | What it is | Status |
| --- | --- | --- |
| `overyondr-website-v1` | Website Worker: portal, V1 (migrated Squarespace site), V2 (`v2/`, moving out per 6.2), and `auth/` (the sign-in Worker) | Main repo. `main` protected; merges deploy via Workers Builds |
| `digital-ads-portal` | Ad library, `ads.overyondrdev.com` | Moved out of `ad-portal/` on 27 Nov ([v1 #30](https://github.com/Overyondrdev/overyondr-website-v1/pull/30), merged) |
| `christmass-cards` | Client Christmas-card address collection, `cards.overyondrdev.com` | Moved out of `apps/christmas-cards/` on 27 Nov ([v1 #20](https://github.com/Overyondrdev/overyondr-website-v1/pull/20) removes the old copy) |
| `marketing-request-portal` | Marketing request intake and approvals, `requests.overyondrdev.com` | Own repo from the start |
| `yondr-feedback` | Feedback tool: widget, API, admin, `feedback.overyondrdev.com` | Own repo since 27 Nov (6.1) |
| `yondr-ops` | Ops hub: monitoring every 5 min, alerts (people & rules), nightly backups, auto-fix engine (triage, issues, verification) + revert, `ops.overyondrdev.com` | Own repo since 27 Nov (6.3) |
| `overyondr-website-v2` | Future home of V2 (section 6.2). Today `main` is empty and the live V2 is built from `overyondr-website-v1/v2/` | Being set up |

All seven are **public** on GitHub, by decision (GitHub free plan). Treat every commit as published (R1).

### Cloudflare (account `3fac6c19097c5692e17198cffa818085`)
| Worker | Hosts | Data | Deploys from |
| --- | --- | --- | --- |
| `overyondr-website-v1` | `overyondrdev.com`, `www`, `v1`, `v2` | none (static assets) | Workers Builds on merge to `main` |
| `yondr-feedback` | `feedback` | D1 `yondr-feedback`, KV `yondr-feedback-screenshots`, Workers AI | `npm run deploy` in `yondr-feedback` |
| `yondr-ops` | `ops` (+ crons: every 5 min monitoring, every 5 min auto-fix, 03:17 UTC backups) | D1 `yondr-ops`, R2 `yondr-ops-backups`, Workers AI; reads the other four D1 databases (read-only) for admins and backups | `npm run deploy` in `yondr-ops` |
| `yondr-auth` | `auth` | none (secrets only) | `wrangler deploy` in `auth/` |
| `yondr-ad-portal` | `ads` | D1 `yondr-ad-portal-db`, R2 `yondr-ad-portal-assets` | Workers Builds from `digital-ads-portal` |
| `yondr-christmas-cards` | `cards` | D1 `yondr-christmas-cards` (client addresses: **personal data**), email binding | Workers Builds from `christmass-cards` |
| `yondr-marketing-requests` | `requests` | D1 `yondr-marketing-requests-db`, R2 `yondr-marketing-requests-files`, Resend email | `wrangler deploy` |

Also: R2 bucket `yondr-brand-public` (brand files). `overyondr.com` itself is still on Squarespace.

### Live checks that must always hold
- Every `*.overyondrdev.com` host answers a signed-out visit with a redirect to `auth.overyondrdev.com/login`
  (`cards` uses its own `/auth` step, which starts the same Google sign-in).
- `workers_dev: false` and `preview_urls: false` in every Wrangler config.
- No Worker serves an `overyondr.com` route before cutover sign-off.
- Zero Trust → Overview shows **0 of 1** Access seats used.

## 2. How Claude sessions work here

Several Claude sessions work on this estate at once. To keep it calm:

1. **One session per area.** Website/V1/V2/feedback/auth; ad library; marketing requests; Christmas cards; hub (this
   doc, cross-cutting checks). A session working outside its area says so in its PR.
2. **Always branch, always PR, never push or force-push `main`.** Wait for the required checks.
   **When a PR is ready, merge it yourself (squash) and push — don't wait for the owner** (owner's standing instruction,
   27 Nov 2026), unless the owner said otherwise for that piece of work. "Ready" means: required checks green, branch
   up to date with `main`, docs updated, no open review questions. After merging, check the change live and say what you
   checked. Still ask first for: `overyondr.com` cutover, deleting data or databases, DNS changes, and anything the owner
   asked to approve.
3. **Cross-cutting changes** (sign-in, `session.js`, DNS, Access, shared docs such as `CLAUDE.md`/`PLATFORM.md`) are
   announced in the PR description with "Affects: <other repos>". Before opening one, check for open PRs touching the
   same files and rebase after they merge, rather than racing.
4. **Docs move with code.** A PR that changes behaviour updates the README/CLAUDE.md/help article that describes it.
5. **No new Worker, host, database or bucket** without adding it to section 1 and following the new-site checklist in
   `PLATFORM.md`.
6. **`session.js` copies stay identical** in every repo (CI checks in each). A change to `auth/src/session.js` means a
   PR in every repo listed in `PLATFORM.md` §2.
7. **Never commit secrets or personal email addresses.** Owner lists are secrets (`OWNER_EMAILS`).
8. **Finish cleanly.** Delete merged branches; don't leave work only on a branch.

## 3. Risk register

Severity: **High** = could expose data or break sign-in; **Medium** = real defect or drift that will bite; **Low** = tidy-up.

| # | Sev | Risk | Action | Where |
| --- | --- | --- | --- | --- |
| R1 | Accepted | All repos are public (owner decision: GitHub free plan). Code, config IDs and docs are readable by anyone | Keep public. Never commit secrets, personal emails, client data or internal-only notes; review diffs with that in mind | all |
| R2 | Medium | Feedback admin: a non-owner admin could demote an owner by re-adding them as admin, then remove them | **Fixed** (v1 #31; carried into `yondr-feedback`) | feedback |
| R3 | Medium | Orphaned `overyondr-website-v2` repo still claims `v2.overyondrdev.com` in its `wrangler.jsonc`, with no sign-in check. A deploy from it would take the v2 host away from the website Worker and could make V2 public. No such Worker exists today | Superseded by section 6.2: the repo gets the real V2 and its own Worker with the sign-in check; until then nobody deploys from it | v2 repo |
| R4 | Resolved | Ad library accepts any Cloudflare Access token from the team (no audience or email-domain check) as a fallback | **Fixed** 27 Nov ([digital-ads-portal#3](https://github.com/Overyondrdev/digital-ads-portal/pull/3)): Google session only; checked live (fake Access token → 401) | `digital-ads-portal` |
| R5 | Resolved | Ad library help article "Signing in" still describes one-time email codes and week-long sessions; the real sign-in is Google with 12-hour sessions | **Fixed** 27 Nov (digital-ads-portal#3) | `digital-ads-portal` |
| R6 | Low | Open v1 PRs #20 (remove cards copy) and #29 (`PLATFORM.md`) touch nearby files; #30 merged 27 Nov. #29 is updated for the new repo layout and no longer overlaps #20 | Merge #20 and #29 in either order; then #29's author changes cards from "moving to" to "in" | v1 |
| R7 | Medium | V2 lead forms show "sent" but only log the data when `PUBLIC_FORM_ENDPOINT` is unset (`v2/src/pages/get-started.astro`, footer newsletter) | Must be wired to HubSpot (or similar) before V2 launches | v1 `v2/` |
| R8 | Medium | Access-token fallbacks remain in the website, ad library and cards; Christmas cards still routes the old email-code sign-in API | Once Zero Trust shows 0 seats for a week, remove all Access fallbacks and `ACCESS_*` vars | all |
| R9 | Low | Test plus-addresses (`name+test@`) can't sign in with Google, so role testing on live sites has no test accounts | Decide: dedicated Workspace test users, or test with colleagues | owner |
| R10 | Low | `v1.overyondrdev.com` was missing from the `noindex` rules in `public/_headers` | **Fixed** in this PR | v1 |
| R11 | Low | CI actions are pinned to tags not SHAs; Dependabot doesn't watch `v2/` or `auth/` | Pin before cutover; add Dependabot entries | v1 |
| R12 | Low | Copyright reads "© Yondr, Inc. 2027" while it is 2026 (deliberate, #25) and is hard-coded in ~200 files | Confirm intended; generate the year at build time later | v1 |
| R13 | Low | Stale "Cloudflare Access" wording in code comments and docs (`README.md`, `wrangler.jsonc`, `v2/CLAUDE.md`, `v2/README.md`, `src/worker/index.js`) | Sweep after #29 merges | v1 |
| R14 | Low | Root `check:links` reports ~294 broken links, nearly all false positives (redirects, query-string pages, blocked external hosts); the step is non-blocking | Configure skips so real breaks show; make blocking at cutover | v1 |
| R15 | Low | GitHub/npm report moderate advisories (minimatch/glob via `linkinator`, the build-time link checker; root and `v2/`). Not shipped to visitors; only reads our own files in CI | Upgrade or replace `linkinator` when a non-breaking fix exists | v1 |
| R16 | Medium | Workers Builds for `yondr-ad-portal` gets no push events from `digital-ads-portal` (Cloudflare's GitHub app likely lacks access to the new repo), so merges there don't deploy until someone builds by hand | Owner: GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure → add `digital-ads-portal` (and `christmass-cards` if missing) | GitHub (owner only) |
| R17 | Resolved | Ad library's `OWNER_EMAILS` is a committed plain variable, not a secret | **Fixed** 27 Nov ([digital-ads-portal#4](https://github.com/Overyondrdev/digital-ads-portal/pull/4)): now a secret | `digital-ads-portal` |
| R18 | Low | V1 sends `Content-Security-Policy-Report-Only`, not an enforced CSP: V1 is Squarespace's page HTML (inline scripts and styles) plus HubSpot, Vimeo, YouTube, Elfsight and Shopify embeds, and an enforced policy could silently break one. The other security headers (HSTS without `includeSubDomains`, nosniff, Referrer-Policy, `X-Frame-Options: SAMEORIGIN`, Permissions-Policy without `display-capture` so the feedback widget can take screenshots) are enforced on every Worker response | CSP report-only on V1; enforce after cutover review: check the browser console on every page type with the embeds loading, tighten (drop `'unsafe-inline'` where possible), then switch to `Content-Security-Policy`. Consider HSTS `includeSubDomains` once every overyondr.com subdomain is HTTPS | v1 `src/worker/index.js` (`SECURITY_HEADERS`, `CSP_REPORT_ONLY`) |

## 4. Daily check (what the morning report covers)
1. Every host above redirects signed-out visitors to sign-in; `auth` answers; `overyondr.com` still Squarespace.
2. TLS certificates have more than 14 days left.
3. Cloudflare: list of Workers, D1, KV, R2 matches section 1 (new or missing items flagged).
4. Repos: commits to `main` in the last 24 h, open PRs and their age, stale branches, failing CI.
5. Claude sessions: which are working, blocked on the owner, or finished with something to merge.
6. Risk register: anything new; anything closed.

## 5. Cutover readiness (overyondr.com → this Worker)
Not started. Needs owner sign-off. Before it: V1 parity sign-off (`scripts/migrate/compare.mjs`), analytics tags
re-added, `overyondr.com` routes in `wrangler.jsonc`, root link check blocking, actions SHA-pinned, R1/R3/R7 closed,
redirects verified against the live site, and a rollback plan (point DNS back to Squarespace).

## 6. Planned restructuring (owner decisions, 27 Nov 2026)

### 6.1 Feedback tool becomes its own product (first)
Status: **done 27 Nov.** Live on `feedback.overyondrdev.com` (in the Access Bypass app); the website embeds it (#32);
data upgraded in place (`project`, `asset`, `asset_label`). **Scope (owner, 27 Nov): the widget is on the website only**
(portal, V1, V2). Other tools add it only when the owner decides to.
The feedback widget, API, admin dashboard and data move out of the website into a **universal, pluggable tool** that
any site or internal tool can add with one script tag, to collect documented, individual feedback on pages and on
specific assets (an ad, a request, a card design).
- New repo **`Overyondrdev/yondr-feedback`**, own Worker **`yondr-feedback`** on **`feedback.overyondrdev.com`**.
- Keeps the existing data: D1 `yondr-feedback`, KV `yondr-feedback-screenshots` and Workers AI move to the new Worker's
  bindings (no copy, no migration). Admin moves to `feedback.overyondrdev.com/admin`; `overyondrdev.com/admin`
  redirects there.
- Embed: `<script src="https://feedback.overyondrdev.com/widget.js" data-project="v1" defer>`; optional
  `data-asset="<id>"` or `YondrFeedback.open({ asset })` to attach feedback to one item. The API allows credentialed
  requests from `https://*.overyondrdev.com` only and checks the Yondr sign-in like every site.
- The website preview toolbar and tour become an optional module of the same script (`data-toolbar="website"`).
- Website, V2 and the portals then only carry the script tag.

### 6.2 V2 becomes its own site (second)
V1 and V2 must not be confused: V2 is on its way to becoming the public main website.
- V2 code moves from `overyondr-website-v1/v2/` to **`Overyondrdev/overyondr-website-v2`** (its `main` is empty
  today; the orphaned early copy there is replaced). Own Worker **`overyondr-website-v2`** serving
  `v2.overyondrdev.com`, with its own copy of `session.js`, Workers Builds deploys, and the feedback script tag.
- The V1 Worker stops serving `v2.` and `dist/__v2`; `v2/` and its CI steps are removed from the V1 repo.
- Switch-over: the new Worker is verified first, then the `v2.overyondrdev.com` domain is moved to it in one step, then
  the V1 cleanup PR merges. Signed-out visitors must still land on the sign-in page throughout.
- Later, the `overyondr.com` cutover will point at whichever site is signed off as the public site.

### 6.3 Operations: alerts, backups, auto-fix (owner decisions, 27 Nov 2026)
- **Email: Resend for all overyondrdev.com email** (PLATFORM.md §6), one API key per sending Worker.
- **More owner decisions (27 Nov):** no Google Workspace test user (signed-in checks stay manual); HubSpot wiring
  for V2's forms is parked (R7 stays open, not urgent); the feedback widget stays on **V1 and V2** (and the portal), with
  the preview toolbar, including after V2 moves to its own Worker.
- **Yondr Ops** (`ops.overyondrdev.com`, repo `yondr-ops`, live 27 Nov): checks every site every 5 minutes; alerts on
  change (and "resolved"), critical re-alerts hourly; admins (the feedback admin list) add people on **Alerts** and pick
  per person: alert types, email/Slack, severity, quiet hours. Owners always get `site_down`/`site_exposed`. Every alert
  is logged. Nightly backups of all D1 databases to R2: 30 daily + 12 monthly, the same for personal data (the
  Christmas-card addresses are **kept**, by owner decision; owner-only downloads).
- **Until email/Slack are connected**: an hourly Claude scheduled task checks every host and pushes to the owner's phone
  only when something fails. Retire it once Ops alerts are delivering.
- **Auto-fix rules (owner):** only feedback of type **bug** can be auto-fixed, and only when it is **objective**
  (verifiable: errors, broken links, a form that fails, broken layout at 375 px, text differing from its source,
  sign-in failures). **Subjective** issues (look, wording, tone, preference), even if marked critical, never auto-fix:
  they go to a person. Objective critical bugs are fixed immediately; other objective bugs are queued. Fixes go
  through a PR with all checks, can't touch sign-in, deploy config, CI or migrations, have a size limit, are verified
  after deploy and reverted automatically if anything breaks. Every step is logged in Ops (**Auto-fixes**), each with
  a **Revert** button; updates go out as `autofix_*` alerts. Master switch `autofix_enabled` is off until the owner turns
  it on. Engine: Claude Code GitHub Action with a Claude API key from Claude Console (`ANTHROPIC_API_KEY` org secret, monthly spend limit set in Console; owner decision 27 Nov: no Terminal step).
- **How it is built** (27 Nov 2026; full flow, setup and security model: `yondr-ops` README "Auto-fix"):
  the feedback tool reports every item to Ops; Ops triages (type, project → repo, objective/subjective by Workers AI,
  where *unsure = subjective*; admins can override with **Mark objective / Mark subjective**) and, for an objective bug,
  opens a GitHub issue labelled `autofix` in the target repo (critical: at once; others: at most 3 an hour, setting).
  `.github/workflows/autofix.yml` (in this repo and `overyondr-website-v2`; other repos are added later and until then
  their bugs go to a person) lets Claude edit files and run the build only; a separate step checks the change
  mechanically (no sign-in/`auth/`/`src/worker/`, Wrangler, CI, migrations, dependencies, `_headers`/`_redirects`;
  ≤ 10 files, ≤ 200 lines) and opens the PR; `autofix-guard.yml` checks again and turns on auto-merge, which waits
  for the required checks. After the merge Ops watches the Workers Builds deploy and the site checks for 15 minutes:
  failure → automatic revert PR; otherwise "verified". Only the ops account (variable `AUTOFIX_ACTORS`) can start a fix;
  issues and PRs are public, so the feedback tool sends no personal data and staff should keep bug reports free of
  confidential details. Required before switching on: the owner setup list in that README (tokens, org secrets and
  variable, labels, *Allow auto-merge*, `build` as a required check on `main`).
- **Christmas cards:** addresses are associated with each rep and curated into per-rep lists for ongoing
  communications (work in the cards repo).
