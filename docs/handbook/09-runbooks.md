# 09 · Runbooks

Step-by-step for common jobs. Anything marked **(owner)** needs the owner's login or approval.

## Get a new colleague access

Nothing to do: everyone with an @overyondr.com Google account can sign in. To give them a role:
- **Admin of Feedback and Ops**: Feedback → People & access → type their name → pick → *Admin* → **Add admin**.
- **Marketing Requests**: People & routing → **Add a person** → pick from the directory → role and manager.
- **Ad Campaigns**: People → **Give someone access** → pick → role → Save.
- **Christmas cards**: /admin → Admins → pick → **Add admin**.
- Add them to the **Team Contact List** sheet if they're not there, so they show up in the pickers within about 6 hours.

## Someone leaves

1. Remove them from the Team Contact List: they stop appearing in pickers at the next sync.
2. Their Google account is disabled by IT, so they can no longer sign in anywhere.
3. Remove admin or elevated roles in each tool (the quarterly access review lists them).

## Add a new site or portal

1. Own repository, own Worker on `<name>.overyondrdev.com`, with `workers_dev: false` and `preview_urls: false`.
2. Copy `auth/src/session.js` unchanged; set `YONDR_AUTH_PUBLIC_JWK` and `ALLOWED_EMAIL_DOMAINS="overyondr.com"`.
3. Check the session on **every** request, static files included (`run_worker_first: true` or bundle the files).
   Pages → `loginUrl(request)`; APIs → 401.
4. **Before the address goes live:** test signed out (you must land on the sign-in page). Access is Bypass, so nothing
   else protects it.
5. Add its name and one-line purpose to `SITES` in `auth/src/pages.js` (shown on the sign-in page), and deploy `auth`.
6. Add the host to Ops: `GATE` in `yondr-ops/src/checks.js` (+ `EXPECTED_INVENTORY`, `WORKERS`, `BUILDS`).
7. **(owner, recommended)** Add the host to the Access app "Yondr sites (Google sign-in)", which is Bypass.
8. Add a portal tile: one entry in `portals` in `overyondr-website-v1/src/pages/portal.astro` (if it was announced, move
   it out of `comingSoon` there).
9. Header: Yondr logo → `https://overyondrdev.com/`, sticky header, person fields with the picker.
10. Update this handbook ([Platform map](02-platform-map.md), [Portals guide](04-portals-guide.md)) and
    `docs/OPERATIONS.md` §1.

## Add a person field

Use the picker: script tag + `data-people` + CSP. See [People directory](05-people-directory.md#adding-the-picker-to-a-field-developers-and-agents).

## Roll back a bad deploy

- **Fastest:** Ops → **Deploys** → the Worker → **Roll back** (owners; confirmed and audited).
- Or Cloudflare → Workers → the Worker → Deployments → previous version → *Rollback*.
- Then fix forward with a pull request. A rollback isn't the end state.

## Restore a database from backup

1. **(owner)** Decide which database and which date (Ops → Backups lists them).
2. Restore into the scratch database `yondr-ops-restore-drill` first and check it (that is what the monthly drill
   does).
3. Restoring over a **live** database deletes newer data: **owner approval required**, and take a fresh backup first.
   Steps: `yondr-ops` README "Backups → Restore".

## Rotate a key

Ops → **Keys** shows where each key lives and its notes.

1. Create the new key at its source (Google Cloud, Cloudflare, Resend, Claude Console, GitHub).
2. Put it in place: Cloudflare → Worker → Settings → Variables and Secrets (type **Secret**), or GitHub org secrets.
3. Revoke the old key.
4. Update the expiry date in Ops → Keys.

Never paste keys into chat, email or files.

## The people directory isn't updating

1. Ops → Overview → "People directory": read the error.
2. "Not updated for 13 hours": the scheduled task "overyondrdev.com people directory refresh" didn't run or the owner's
   Google Sheets connection was disconnected. Reconnect Google Sheets in Claude (Settings → Connectors) or ask the hub
   session to run the import. ("Not set up" means neither the task nor a service account has loaded it yet.)
3. "Couldn't read the sheet (403/404)": the sheet isn't shared with the service account, or the Sheets API is off.
4. "Not applied: N people would have been removed": check the sheet's filters and sorting. The update applies once
   the sheet is complete again.

## Email isn't arriving

1. Ops → Alerts → **Send test alert**, then check Alerts → log (sent / failed).
2. Sent but not received at work: the company's Gmail is filtering it. IT adds `overyondrdev.com` to approved
   senders (Admin console → Apps → Google Workspace → Gmail → Spam, phishing and malware → Spam).
3. Failed: check the Resend key on the sending Worker, and the Resend dashboard's logs.

## Publish the handbook to Drive

The master copy is `docs/handbook/` in `overyondr-website-v1`. The Drive copies (folder **OverYondrDev →
Handbook**) are generated from it:
1. Each chapter is converted to a Word file with its images: `pandoc <chapter>.md -o <chapter>.docx
   --resource-path=docs/handbook`.
2. It is uploaded into the Handbook folder as a Google Doc, replacing the previous version of that chapter.
3. The *00 · START HERE* index doc lists every chapter with its link.
4. `docs/handbook/drive.json` records the folder and each chapter's Google Doc id. Update it when a chapter is
   re-published as a new doc, and move the old doc to the bin.
5. Point the index doc's chapter link at the new doc (edit the link in place; the index's own id and URL never
   change).

The hub session does this after any handbook change and checks it daily. Don't edit the Drive copies by hand.

## Approve extra auto-fix spend (owner)

Ops → Auto-fixes → **Spend** → Approve (up to $100 at a time, audited). If the month's approvals go above $10 extra,
raise the Claude Console limit too.
