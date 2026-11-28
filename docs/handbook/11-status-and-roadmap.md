# 11 · Status and roadmap

_Updated 27 November 2026. The daily status report is the live view; this page is the summary._

## Live and working

- **Dev Portal home** with the four portals; Website Review at `/website`.
- **Yondr Google sign-in** on every site. **0 Cloudflare seats**: every Access rule is Bypass, and Ops alerts on any
  change.
- **Website V1** (Squarespace rebuild) and **V2** (redesign) as separate sites, each with the feedback widget and
  toolbar.
- **Marketing Requests, Ad Campaigns, Christmas cards**: live. Every one has the logo link back to the portal, a sticky
  header and the directory picker.
- **Feedback tool** (widget + admin) and **Yondr Ops**:
  - monitoring every 5 minutes, alerts by Resend email;
  - nightly backups and the monthly restore drill;
  - issues, deploys and rollback, keys calendar, access review;
  - auto-fix built but **off**.
- **People directory**: built and live. Suggestions start once the service account key is added (see below).
- **Security hygiene**: code scanning, Dependabot, pinned CI actions, a secret scan in CI, security headers.

## Needs the owner

| # | Item | Why | How |
| --- | --- | --- | --- |
| 1 | Add the directory service account key | Turns on name/email suggestions everywhere | [05 → Setup](05-people-directory.md#setup-done-once-by-the-owner) |
| 2 | Email IT: allow mail from overyondrdev.com; create the GitHub bot group address | Alerts reach work inboxes; robot account | Drafted email in the hub session |
| 3 | Create the GitHub robot account `yondr-ops-bot` and move the auto-fix tokens to it | Auto-fix shouldn't depend on a personal account | Steps in the hub session; [07](07-auto-fix.md#switching-it-on-owner) |
| 4 | Then: auto-fix end-to-end test, and decide whether to switch it on | Auto-fix | [07](07-auto-fix.md) |
| 5 | Decide: Marketing Requests Assign/Reassign as short team dropdowns (recommended) or a team-only picker | People directory rule | Hub session |

## In progress / next

- **V2 launch-quality checks** (accessibility, page speed, SEO) currently fail in CI (non-blocking). They must pass
  before V2 can replace overyondr.com.
- **Christmas cards**: move email to Resend; per-rep lists; remove the old email-code sign-in and Access fallbacks
  (risk R8).
- **Clean-up**: delete merged branches the agents couldn't remove; sweep stale "Cloudflare Access" wording (R13).

## Later

- **overyondr.com cutover** to the signed-off site. Needs:
  - owner sign-off;
  - V1/V2 parity or V2 readiness;
  - analytics re-added;
  - redirects verified;
  - a rollback plan;
  - DNS approval.
- **V2 forms → HubSpot** (parked, R7).
- Enforce the content security policy on V1 after the cutover review (R18).

Risks are tracked in `docs/OPERATIONS.md` §3 (risk register). The weekly hygiene report reviews them.
