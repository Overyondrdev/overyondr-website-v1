# Cutover: from Cloudflare Access to the Yondr Google sign-in (instructions for a browser agent in Chrome)

You are a browser agent in Chrome. You will finish moving every `*.overyondrdev.com` site from Cloudflare Access
(which charges a Zero Trust seat per person) to the Yondr Google sign-in at `auth.overyondrdev.com`, then free the
seats. Do the parts **in order**. After each step, check the **You should see** line. If the screen doesn't match,
stop, take a screenshot and ask Chad.

**Never:**
- switch anything to Bypass before Part C says you may;
- delete an Access application (set it to Bypass instead, so it can be undone);
- type, read out or paste a client secret into chat. Hand the keyboard to Chad when a secret is entered;
- change anything for hosts other than the ones named here.

| Thing | Value |
| --- | --- |
| Cloudflare account | `3fac6c19097c5692e17198cffa818085` |
| Sign-in Worker | `yondr-auth` at `https://auth.overyondrdev.com` |
| Google redirect URI | `https://auth.overyondrdev.com/callback` |
| Access app to bypass | `overyondrdev.com (Yondr website dev)` (covers `overyondrdev.com` and `*.overyondrdev.com`) |
| Access app to bypass | `Yondr Christmas Cards` (path `cards.overyondrdev.com/auth`) |
| Access app to add | `auth.overyondrdev.com (Yondr Google sign-in)`, Bypass |

---

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
9. **Stop here and ask Chad** to confirm that the website change is live (pull request
   `Overyondrdev/overyondr-website-v1#26` merged and deployed). Don't continue until he says yes: until then the
   website relies on Access and would become public.

## Part D: Switch Access to Bypass (only after step 9 is confirmed)

10. Zero Trust → Access → **Applications** → `overyondrdev.com (Yondr website dev)` → **Policies** (or Configure) →
    open the policy `Yondr staff (@overyondr.com)`. Change **Action** to **Bypass**, and **Include** to **Everyone**
    (remove the "Emails ending in" rule). Rename it to `Bypass: sites check the Yondr Google sign-in`. **Save**.
11. Same for the application `Yondr Christmas Cards` (`cards.overyondrdev.com/auth`): policy Action **Bypass**,
    Include **Everyone**. **Save**.
    **You should see** every application's policy showing **Bypass**.
12. In a fresh **Incognito** window, open each address, sign in with Google when asked, and check the page loads:
    - `https://overyondrdev.com/` (portal with V1/V2 buttons)
    - `https://v1.overyondrdev.com/`, then `https://v2.overyondrdev.com/` (no second sign-in needed)
    - `https://ads.overyondrdev.com/`, `https://requests.overyondrdev.com/`
    - `https://cards.overyondrdev.com/` → **Sign in with Google**
    **You should see** a Google sign-in once, then every site open. A Cloudflare Access page anywhere means that
    application isn't on Bypass yet.
13. In another fresh Incognito window, sign in with a **non-Yondr** Google account (e.g. a personal Gmail) at
    `https://v1.overyondrdev.com/`.
    **You should see** "Use your Yondr account … Only @overyondr.com Google accounts can use Yondr’s overyondrdev.com
    sites", and no site content.

**If anything in step 12 or 13 is wrong:** set the policies from steps 10 and 11 back to **Allow** with Include
**Emails ending in** `@overyondr.com` (this restores the old login immediately), then report what you saw.

## Part E: Free the seats

14. Zero Trust → **Team & Resources** (or My Team) → **Users**. Filter **Seat usage: Active**. Tick every user, then
    **Action → Remove users → Remove**. Nobody loses access: the sites no longer use Access, so removed users don't
    come back as seats.
    **You should see** every user as **Inactive**.
15. Zero Trust → **Settings** → **Admin controls** (or Account) → **Remove inactive users from seats** → **Edit** →
    **1 month** → **Save**. This catches anyone who still signs in through an Access-protected page in future.
16. Zero Trust **Overview**: **You should see** 0 seats in use (Cloudflare can take a few minutes to update it).

## Part F: Report back

Tell Chad:
- Google client created (project name, Internal audience): yes/no.
- Secrets on `yondr-auth`: names listed.
- Test sign-in (step 8): worked?
- Bypass applied to which applications (steps 7, 10, 11).
- Step 12: which sites opened; step 13: non-Yondr account blocked?
- Seats before → after; seat expiration set.
- Anything that looked different from these instructions.
