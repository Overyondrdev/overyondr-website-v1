# The overyondrdev.com Handbook

**The single source of truth for everything on overyondrdev.com**: what exists, how it works, how we work, what was
decided and why, and what happens next. If you are new (a person or a Claude agent), start with
[01 Start here](01-start-here.md). It gets you up to speed in about 15 minutes.

| # | Chapter | Read it when |
| --- | --- | --- |
| 01 | [Start here](01-start-here.md) | You're new, or coming back after a while |
| 02 | [Platform map](02-platform-map.md) | You need to know what runs where: sites, Workers, repositories, data |
| 03 | [Sign-in and access (no Cloudflare seats)](03-sign-in-and-access.md) | Anything about logging in, Cloudflare Access, adding a site |
| 04 | [The portals: a user guide](04-portals-guide.md) | You (or a colleague) want to use the Dev Portal and its tools |
| 05 | [People directory and autofill](05-people-directory.md) | Name/email fields, the Team Contact List, adding person fields |
| 06 | [Operations: monitoring, alerts, backups, email](06-operations.md) | Something is down, an alert arrived, backups, keys, email |
| 07 | [Auto-fix](07-auto-fix.md) | Bugs fixed automatically: rules, spending limits, reverting |
| 08 | [How we work (people and agents)](08-how-we-work.md) | Before you change anything: rules, merging, what needs approval |
| 09 | [Runbooks](09-runbooks.md) | Step-by-step for common jobs |
| 10 | [Decisions log](10-decisions-log.md) | Why things are the way they are |
| 11 | [Status and roadmap](11-status-and-roadmap.md) | What's done, what's open, what's next |
| 12 | [Glossary](12-glossary.md) | A word you don't know |

## Where this lives, and how it stays true

- **Master copy:** this folder, `docs/handbook/` in the public repository
  [Overyondrdev/overyondr-website-v1](https://github.com/Overyondrdev/overyondr-website-v1/tree/main/docs/handbook).
  Every Claude agent reads it there. Images are in `images/`.
- **Reading copy:** the same chapters as Google Docs in the team's Drive folder **OverYondrDev → Handbook**,
  regenerated from the master copy by the hub session ([Runbooks](09-runbooks.md#publish-the-handbook-to-drive)).
  Don't edit the Drive copies: changes there are overwritten. Comment on them, or ask the hub session.
- **Deep technical references** stay next to the code and are linked from here: `docs/PLATFORM.md` (sign-in, deploys,
  Cloudflare lessons), `docs/OPERATIONS.md` (inventory, session rules, risk register), each repository's `README.md`
  and `CLAUDE.md`.
- **The rule:** a change that alters what this handbook says updates the handbook **in the same pull request**
  ([How we work](08-how-we-work.md#docs-move-with-code)). The hub session checks it daily; the weekly hygiene report
  flags drift.

_Last full review: 27 November 2026._
