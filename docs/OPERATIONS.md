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
| `overyondr-website-v1` | Website Worker: portal, V1 (migrated Squarespace site), V2 (`v2/`), feedback tool, and `auth/` (the sign-in Worker) | Main repo. `main` protected; merges deploy via Workers Builds |
| `digital-ads-portal` | Ad library, `ads.overyondrdev.com` | Moved out of `ad-portal/` on 27 Nov ([v1 #30](https://github.com/Overyondrdev/overyondr-website-v1/pull/30) removes the old copy) |
| `christmass-cards` | Client Christmas-card address collection, `cards.overyondrdev.com` | Moved out of `apps/christmas-cards/` on 27 Nov ([v1 #20](https://github.com/Overyondrdev/overyondr-website-v1/pull/20) removes the old copy) |
| `marketing-request-portal` | Marketing request intake and approvals, `requests.overyondrdev.com` | Own repo from the start |
| `overyondr-website-v2` | **Orphaned.** Early standalone copy of V2; `main` is empty. The real V2 is `overyondr-website-v1/v2/` | Archive it (see R3) |

All five are **public** on GitHub (R1).

### Cloudflare (account `3fac6c19097c5692e17198cffa818085`)
| Worker | Hosts | Data | Deploys from |
| --- | --- | --- | --- |
| `overyondr-website-v1` | `overyondrdev.com`, `www`, `v1`, `v2` | D1 `yondr-feedback`, KV `yondr-feedback-screenshots`, Workers AI | Workers Builds on merge to `main` |
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
2. **Always branch, always PR, never push or force-push `main`.** Wait for the required checks. Squash-merge.
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
| R1 | High | All five repos are public: sign-in, admin and data-handling code, config IDs and internal docs are readable by anyone | Make all five private (GitHub → Settings → General → Change visibility). Workers Builds keeps working | GitHub (owner only) |
| R2 | Medium | Feedback admin: a non-owner admin could demote an owner by re-adding them as admin, then remove them | **Fixed** in this PR (`src/worker/feedback/api.js`) | v1 |
| R3 | Medium | Orphaned `overyondr-website-v2` repo still claims `v2.overyondrdev.com` in its `wrangler.jsonc`, with no sign-in check. A deploy from it would take the v2 host away from the website Worker and could make V2 public. No such Worker exists today | Replace its README with a pointer to `overyondr-website-v1/v2/`, remove the route, archive the repo; delete branch `claude/confident-ritchie-seh2sa` in both repos | v2 repo |
| R4 | Medium | Ad library accepts any Cloudflare Access token from the team (no audience or email-domain check) as a fallback | Remove the Access fallback (Access is now Bypass) or check the audience and domain | `digital-ads-portal` `src/access.ts` |
| R5 | Medium | Ad library help article "Signing in" still describes one-time email codes and week-long sessions; the real sign-in is Google with 12-hour sessions | Update `public/help-content.js` | `digital-ads-portal` |
| R6 | Medium | Three open v1 PRs (#20, #29, #30) edit the same files (`CLAUDE.md`, CI, docs); `PLATFORM.md` in #29 still lists ads and cards as living in this repo | Merge #20 and #30 first, then update #29 to the new repo layout and merge | v1 |
| R7 | Medium | V2 lead forms show "sent" but only log the data when `PUBLIC_FORM_ENDPOINT` is unset (`v2/src/pages/get-started.astro`, footer newsletter) | Must be wired to HubSpot (or similar) before V2 launches | v1 `v2/` |
| R8 | Medium | Access-token fallbacks remain in the website, ad library and cards; Christmas cards still routes the old email-code sign-in API | Once Zero Trust shows 0 seats for a week, remove all Access fallbacks and `ACCESS_*` vars | all |
| R9 | Low | Test plus-addresses can't sign in with Google, so role testing on live sites has no test accounts | Decide: dedicated Workspace test users, or test with colleagues | owner |
| R10 | Low | `v1.overyondrdev.com` was missing from the `noindex` rules in `public/_headers` | **Fixed** in this PR | v1 |
| R11 | Low | CI actions are pinned to tags not SHAs; Dependabot doesn't watch `v2/` or `auth/` | Pin before cutover; add Dependabot entries | v1 |
| R12 | Low | Copyright reads "© Yondr, Inc. 2027" while it is 2026 (deliberate, #25) and is hard-coded in ~200 files | Confirm intended; generate the year at build time later | v1 |
| R13 | Low | Stale "Cloudflare Access" wording in code comments and docs (`README.md`, `wrangler.jsonc`, `v2/CLAUDE.md`, `v2/README.md`, `src/worker/index.js`) | Sweep after #29 merges | v1 |
| R14 | Low | Root `check:links` reports ~294 broken links, nearly all false positives (redirects, query-string pages, blocked external hosts); the step is non-blocking | Configure skips so real breaks show; make blocking at cutover | v1 |

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
