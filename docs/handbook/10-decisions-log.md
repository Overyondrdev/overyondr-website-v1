# 10 · Decisions log

Owner decisions that shape the platform, newest first. **Add a line whenever the owner decides something that
changes how the platform works or how we work.** Each entry gives the date, the decision, why, and where it lives.

| Date | Decision | Why / notes | Where |
| --- | --- | --- | --- |
| 27 Nov 2026 | **Handbook = the single source of truth**, kept continually up to date; master in GitHub, reading copy in Drive | New people and agents must get up to speed from one place | This handbook |
| 27 Nov 2026 | **People directory autofill on every person field**, now and in future, including the fields for adding users and admins. Data from the Yondr Team Contact List via a read-only service account; sync a few times a day (4×); show name and title (no city); never a long dropdown | Faster, error-free entry; one list for the whole platform | [05](05-people-directory.md), `docs/PLATFORM.md` §8 |
| 27 Nov 2026 | **Every portal's Yondr logo returns to overyondrdev.com; headers are sticky** | Easy navigation across the portal, especially on long pages | All sites |
| 27 Nov 2026 | **overyondrdev.com becomes the Dev Portal**: one sign-in, then choose Website Review, Marketing Requests, Ad Campaigns, Christmas Card Request (seasonal) | It grew from a website preview into the team's portal | [04](04-portals-guide.md) |
| 27 Nov 2026 | **Never use Cloudflare Access seats anywhere**: the catch-all Access rule switched to Bypass too; Ops alerts on any seat-costing rule | Seats cost per person; 1 seat bought; 25 people once locked everyone out | [03](03-sign-in-and-access.md) |
| 27 Nov 2026 | **V1 and V2 fully separate** (repositories, Workers, designers). V2 moved to its own Worker and repository | Different designers; V2 becomes the public site | [02](02-platform-map.md) |
| 27 Nov 2026 | **Resend for all email** from overyondrdev.com, one key per sending Worker | One provider, revocable keys | [06](06-operations.md#email) |
| 27 Nov 2026 | **Auto-fix: only objective bugs**; objective critical fixed immediately, subjective never; log + revert; updates by alert | Speed without risking judgement calls | [07](07-auto-fix.md) |
| 27 Nov 2026 | **Auto-fix spend: $50/month**, warned at 50 %/70 % and ahead of time; pause at 90 % until an owner approves; Console limit $60 | Never a surprise bill | [07](07-auto-fix.md#spending-limits) |
| 27 Nov 2026 | **Auto-fix issues may be public as long as personal details stay private** | Free GitHub plan; privacy first | [07](07-auto-fix.md#privacy-public-issues-private-people) |
| 27 Nov 2026 | **No Terminal steps for the owner**: everything in the browser (e.g. a Claude API key instead of a CLI token) | The owner works in the browser | [08](08-how-we-work.md) |
| 27 Nov 2026 | **Christmas card addresses are kept** and curated into per-rep lists | Ongoing client communications | [04](04-portals-guide.md#christmas-card-request-cardsoveryondrdevcom-seasonal) |
| 27 Nov 2026 | **Feedback tool is its own pluggable product**; on the website (portal, V1, V2) with the preview toolbar; other tools add it only when the owner decides | Reusable across tools | [04](04-portals-guide.md) |
| 27 Nov 2026 | **Daily status report** that the owner can reply to by number to get things done; weekly hygiene report | Proactive management; no dashboards to chase | [06](06-operations.md#the-daily-report-and-the-weekly-hygiene-report) |
| 27 Nov 2026 | **No Google Workspace test user**; HubSpot wiring for V2 forms **parked** | Not needed now | [11](11-status-and-roadmap.md) |
| 27 Nov 2026 | **Sessions merge and deploy when ready** unless told otherwise | Momentum; the owner reviews outcomes, not PRs | [08](08-how-we-work.md) |
| 27 Nov 2026 | **Repositories stay public** (GitHub free plan) | Cost; so never commit secrets or personal data | [08](08-how-we-work.md) |
| 27 Nov 2026 | **Workers Paid plan** in use | Crons, limits | — |
| Nov 2026 | **Sign-in moved from Cloudflare Access to our own Google sign-in** (`auth.overyondrdev.com`) | Seats ran out; Bypass costs nothing | `auth/CUTOVER.md` |
| — | **overyondr.com cutover only after owner sign-off** | It's the public website | [02](02-platform-map.md#overyondrcom-the-public-site) |
