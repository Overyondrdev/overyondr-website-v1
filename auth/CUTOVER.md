# Cutover: from Cloudflare Access to the Yondr Google sign-in (instructions for a browser agent in Chrome)

You are a browser agent in Chrome. You will finish moving every `*.overyondrdev.com` site from Cloudflare Access
(which charges a Zero Trust seat per person) to the Yondr Google sign-in at `auth.overyondrdev.com`, then free the
seats. Do the parts **in order**. After each step, check the **You should see** line. If the screen doesn't match,
stop, take a screenshot and ask Chad.

**Never:**
- switch anything to Bypass before step 8 has worked;
- delete an Access application (set it to Bypass instead, so it can be undone);
- type, read out or paste a client secret into chat. Hand the keyboard to Chad when a secret is entered;
- change anything for hosts other than the ones named here.

| Thing | Value |
| --- | --- |
| Cloudflare account | `3fac6c19097c5692e17198cffa818085` |
| Sign-in Worker | `yondr-auth` at `https://auth.overyondrdev.com` |
| Google redirect URI | `https://auth.overyondrdev.com/callback` |
| Access app to add (Part C) | `auth.overyondrdev.com (Yondr Google sign-in)`, Bypass |
| Access app to add (Part D) | `Yondr sites (Google sign-in)`, Bypass, for the hosts that check the Google sign-in |
| Access app to narrow (Part D) | `overyondrdev.com (Yondr website dev)`: keep it on Allow, but remove the bare `overyondrdev.com` hostname so only `*.overyondrdev.com` remains (it then only covers subdomains that aren't listed elsewhere) |
| Access app to bypass (Part D) | `Yondr Christmas Cards` (path `cards.overyondrdev.com/auth`) |

Every web host on overyondrdev.com is one of these Workers, and each checks the Google sign-in itself:
`overyondrdev.com`, `www`, `v1`, `v2` (overyondr-website-v1), `ads` (yondr-ad-portal), `requests`
(yondr-marketing-requests), `cards` (yondr-christmas-cards), `auth` (yondr-auth). The other DNS records are mail only.

---

## Part 0: Plans (checked 26 November 2026)

- **Workers: Paid** ($5/month, 10 million requests a month included). Enough for several hundred people; nothing to do.
- **Zero Trust: Standard** ($7 per seat per month) with **1 seat bought and 25 in use** ("25 of 1 available seats").
  That is why people were blocked. Keep this plan. After the cutover nobody signs in through Access, so Part E brings
  seat use down to **0 of 1** and it stays there.

## Part A: Google sign-in client (Google Cloud; needs an overyondr.com Google account, ideally a Workspace admin)

1. Open `https://console.cloud.google.com/projectcreate`. Project name `overyondrdev-sign-in`; Organization
   `overyondr.com`. Click **Create**, then make sure the new project is selected at the top of the page.
2. Open `https://console.cloud.google.com/auth/branding` (Google Auth Platform → Branding; on older screens: APIs &
   Services → OAuth consent screen). Click **Get started** if asked.
   - App name: `Yondr (overyondrdev.com)`. User support email: Chad's or a shared address. Click **Next**.
   - Audience: **Internal**. This limits sign-in to overyondr.com accounts. Click **Next**.
   - Contact email: the same address. Agree, **Continue**, **Create**.
   **You should see** the app listed as Internal. If "Internal" can't be chosen, the project isn't in the
   overyondr.com organization: stop and ask Chad.
3. Open `https://console.cloud.google.com/auth/clients` (Clients; older screens: APIs & Services → Credentials →
   Create credentials → OAuth client ID). Click **Create client**.
   - Application type: **Web application**. Name: `yondr-auth`.
   - Authorized redirect URIs → **Add URI**: `https://auth.overyondrdev.com/callback` (exactly).
   - Leave Authorized JavaScript origins empty. Click **Create**.
   **You should see** a dialog with a **Client ID** and **Client secret**. Leave it open for Part B.

## Part B: Give the sign-in Worker its Google client (Cloudflare)

4. Open `https://dash.cloudflare.com/3fac6c19097c5692e17198cffa818085/workers-and-pages`, then `yondr-auth`, then
   **Settings**, then **Variables and Secrets**.
5. **Add**: Type **Secret**, name `GOOGLE_CLIENT_ID`, value: the Client ID from step 3. **Deploy**.
6. **Add**: Type **Secret**, name `GOOGLE_CLIENT_SECRET`. **Hand over to Chad** to paste the Client secret. **Deploy**.
   **You should see** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_PRIVATE_JWK` listed as secrets.

## Part C: Let people reach the sign-in page, and test it

7. Open `https://one.dash.cloudflare.com/` → choose the account → **Access** (or **Access controls**) →
   **Applications** → **Add an application** → **Self-hosted**.
   - Name `auth.overyondrdev.com (Yondr Google sign-in)`. Domain: subdomain `auth`, domain `overyondrdev.com`,
     path empty.
   - Policy: name `Bypass: the sign-in page`, Action **Bypass**, Include **Everyone**. Save.
   **You should see** the new application in the list.
8. Open a new **Incognito** window and go to `https://auth.overyondrdev.com/`.
   **You should see** "Sign in · Use your Yondr Google account" (not a Cloudflare Access page). Click **Sign in with
   Google**, ask Chad to choose his `@overyondr.com` account.
   **You should see** "You’re signed in as chad@…". If you see "Sign-in isn’t set up yet", Part B is incomplete. If
   Google shows "Error 400: redirect_uri_mismatch", fix the URI in step 3.
   If you see **"Use your Yondr account"** although Chad used his @overyondr.com account, the Workspace's primary domain
   isn't overyondr.com: stop and tell Chad (the fix is one setting, `ALLOWED_WORKSPACE_DOMAINS` on `yondr-auth`; the
   Worker log line "sign-in refused … hd=…" shows the right value). If Google says the app is blocked by the
   administrator, a Workspace admin must allow it: admin.google.com → Security → Access and data control → API controls
   → App access control → find `Yondr (overyondrdev.com)` → **Trusted**.
9. The website change is live (pull request `Overyondrdev/overyondr-website-v1#26`, merged and deployed on
   26 November 2026), so every site checks the Google sign-in itself. Continue to Part D once step 8 worked.

## Part D: Switch the sites to the Google sign-in in Access (only after step 8 worked)

10. Zero Trust → Access → **Applications** → **Add an application** → **Self-hosted**.
    - Name `Yondr sites (Google sign-in)`.
    - Add these public hostnames (subdomain + domain `overyondrdev.com`, path empty), one per **+ Add public hostname**:
      `www`, `v1`, `v2`, `ads`, `requests`. Do **not** add the bare `overyondrdev.com` yet (step 11).
    - Policy: name `Bypass: these sites check the Yondr Google sign-in`, Action **Bypass**, Include **Everyone**. Save.
    **You should see** the application with 5 hostnames.
11. Open `overyondrdev.com (Yondr website dev)` → **Overview / Configure** → under its hostnames, **remove the bare
    `overyondrdev.com`** (keep `*.overyondrdev.com` and its Allow policy unchanged). Save. Then open
    `Yondr sites (Google sign-in)` again, **+ Add public hostname**: subdomain empty, domain `overyondrdev.com`. Save.
    **You should see** `Yondr sites (Google sign-in)` with 6 hostnames, and `overyondrdev.com (Yondr website dev)`
    with only `*.overyondrdev.com`.
11b. Open `Yondr Christmas Cards` (`cards.overyondrdev.com/auth`) → its policy → Action **Bypass**, Include
    **Everyone**. Save. (The app `cards.overyondrdev.com (Christmas cards: own email-code sign-in)` is already Bypass.)
12. In a fresh **Incognito** window, open each address, sign in with Google when asked, and check the page loads:
    - `https://overyondrdev.com/` (portal with V1/V2 buttons)
    - `https://v1.overyondrdev.com/`, then `https://v2.overyondrdev.com/` (no second sign-in needed)
    - `https://ads.overyondrdev.com/`, `https://requests.overyondrdev.com/`
    - `https://cards.overyondrdev.com/` → **Sign in with Google**
    **You should see** a Google sign-in once, then every site open. A Cloudflare Access page (orange/black "Sign in
    with Cloudflare Access" or an email-code prompt) anywhere means that host isn't covered by a Bypass app yet:
    fix it before Part E, because each Access sign-in uses a seat.
13. In another fresh Incognito window, sign in with a **non-Yondr** Google account (e.g. a personal Gmail) at
    `https://v1.overyondrdev.com/`.
    **You should see** "Use your Yondr account … Only @overyondr.com Google accounts can use Yondr’s overyondrdev.com
    sites", and no site content.

**If anything in step 12 or 13 is wrong:** change the policy of `Yondr sites (Google sign-in)` to **Allow** with Include
**Emails ending in** `@overyondr.com` (this restores the old Access login on those hosts immediately), then report what
you saw.

## Part E: Free the seats

14. Zero Trust → **Team & Resources** (or My Team) → **Users**. Filter **Seat usage: Active**. Tick every user, then
    **Action → Remove users → Remove**. Nobody loses access: the sites no longer use Access, so removed users don't
    come back as seats.
    **You should see** every user as **Inactive**.
15. Zero Trust → **Settings** → **Admin controls** (or Account) → **Remove inactive users from seats** → **Edit** →
    **1 month** → **Save**. This catches anyone who still signs in through an Access-protected page in future.
16. Zero Trust **Overview**: **You should see** 0 seats in use (Cloudflare can take a few minutes to update it). Don't
    continue until it does.
17. Ask Chad to glance at **dash.cloudflare.com → Manage account → Billing → Invoices** for any Zero Trust charge
    above one seat this month. If there is one, Cloudflare billing support (same page) can review it: the extra users
    were blocked from signing in and have been removed.

## Part F: Report back

Tell Chad:
- Google client created (project name, Internal audience): yes/no.
- Secrets on `yondr-auth`: names listed.
- Test sign-in (step 8): worked?
- Plans from Part 0 (Workers plan; Zero Trust plan and seats purchased).
- Bypass applied to which applications and hostnames (steps 7, 10, 11, 11b).
- Step 12: which sites opened; step 13: non-Yondr account blocked?
- Seats before → after; seat expiration set; seats shown as 0 of 1; any extra charge seen (step 17).
- Anything that looked different from these instructions.
