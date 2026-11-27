# 07 · Auto-fix

Auto-fix lets Yondr Ops fix **objective bugs** reported through the feedback tool automatically: a Claude agent
writes the fix, it goes through a pull request with every check, deploys, is verified, and is **reverted
automatically** if anything breaks. **It is off until the owner switches it on** (Ops → Settings).

## The owner's rules

- **Only bugs.** Ideas, questions and praise never auto-fix.
- **Only objective bugs**: verifiable problems such as errors, broken links, a form that fails, broken layout at
  375 px, text that differs from its source, or sign-in failures.
- **Subjective issues never auto-fix**, even when marked critical: looks, wording, tone, preference. They go to a
  person. **Unsure counts as subjective.**
- **Objective critical bugs** are fixed immediately; other objective bugs are queued (at most 3 an hour).
- **Every step is logged** (Ops → Auto-fixes) and every fix has a **Revert** button.
- **You're told:** `autofix_started`, `autofix_merged`, `autofix_failed` and `autofix_reverted` alerts, plus the daily
  report.

## How a fix happens

1. Someone reports a bug with the feedback widget.
2. The feedback tool sends it to Ops. Ops **triages**: type, which project and repository, and objective or subjective
   (Workers AI classifier; admins can override with *Mark objective* / *Mark subjective*).
3. For an objective bug, Ops opens a GitHub issue labelled `autofix` in the right repository (website V1 or V2 today;
   other repositories go to a person until they get the workflows).
4. The `autofix.yml` workflow runs Claude, which may **only edit files and run the build**. A separate step checks the
   change mechanically:
   - **no sign-in code, Worker routing, Wrangler config, CI, migrations, dependencies, `_headers` or `_redirects`**;
   - **at most 10 files and 200 lines**.

   If it passes, the step opens the PR. `autofix-guard.yml` checks again and turns on auto-merge, which waits for the
   required checks.
5. After the merge, Ops watches the deploy and the site checks **for 15 minutes**. Failure → automatic revert PR.
   Otherwise → *verified*.

Only the ops GitHub account (org variable `AUTOFIX_ACTORS`) can start a fix. A dedicated robot account
(`yondr-ops-bot`) is planned, so it isn't tied to a person.

## Spending limits

Auto-fix uses a pay-per-use Claude API key.
- **Budget: $50 a month.** Owners are warned at **50 %** and **70 %**, and **ahead of time** if the forecast is over
  budget.
- **At 90 % ($45) it pauses.** Nothing new starts until an owner **approves** more in Ops (Auto-fixes → Spend), or the
  month ends.
- **Backstop:** the Claude Console workspace has a hard spend limit of **$60**.
- Budget alerts always reach owners and ignore quiet hours.

## Privacy: public issues, private people

The repositories are public, so auto-fix issues and PRs are public too. The owner accepted this **on the condition that
personal details stay private**:
- **Sent:** the bug's text, the page and asset, and the type and priority.
- **Removed first, twice** (in Feedback and again in Ops): emails, phone numbers, street addresses and postcodes,
  secrets in URLs and tokens.
- **Never sent:** who reported it, assignees, voters, commenters, any name, or the screenshots themselves.
- The widget warns people reporting a bug not to include personal or confidential details.

## Switching it on (owner)

Prerequisites:
- the robot account and its tokens (`GITHUB_TOKEN` on Ops, `AUTOFIX_PR_TOKEN` org secret);
- `ANTHROPIC_API_KEY` (org secret);
- `OPS_INGEST_TOKEN`;
- the `AUTOFIX_ACTORS` variable;
- labels, *Allow auto-merge*, and **build** as a required check on `main`.

Then:
1. Ops → Settings → **Auto-fix engine → on**.
2. Run one harmless test bug end to end (the hub session sets it up).
3. Watch Ops → Auto-fixes.

To stop it: switch it off (nothing new starts), or delete `AUTOFIX_ACTORS` (no workflow runs at all).

Full flow, setup and security model: `yondr-ops` README "Auto-fix"; owner rules: `docs/OPERATIONS.md` §6.3.
