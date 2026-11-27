# yondr-auth — Google sign-in for overyondrdev.com

**https://auth.overyondrdev.com** signs Yondr people in with their Google Workspace account and gives them one
session that every `*.overyondrdev.com` site accepts: the website (`overyondrdev.com`, `www`, `v1`, `v2`), the ad
library (`ads`), marketing requests (`requests`) and Christmas cards (`cards`).

It replaces Cloudflare Access logins, which cost a Zero Trust seat for every person who signs in. Access is set to
**Bypass** for these hosts, so each site checks the session itself and nothing is public.

## How it works

1. A site sees no valid `yondr_session` cookie and redirects to `https://auth.overyondrdev.com/login?return=<url>`.
2. `/login` sends the person to Google (OpenID Connect, Authorization Code flow with PKCE, `state` and `nonce`,
   `hd=overyondr.com`).
3. `/callback` exchanges the code, verifies Google's ID token (signature, issuer, audience, expiry, nonce) and only
   accepts **verified** accounts whose Workspace domain (`hd`) **and** email domain are `overyondr.com`.
4. It sets `yondr_session`: an ES256-signed token (12 hours) in a cookie for `.overyondrdev.com` (HttpOnly, Secure,
   SameSite=Lax), and sends the person back. Returns only go to `https://*.overyondrdev.com`.
5. Each site verifies the cookie with `src/session.js` and the public key in its `YONDR_AUTH_PUBLIC_JWK` variable.
   Copies of `session.js` live in `src/worker/` and in the digital-ads-portal (`src/yondr-session.js`),
   christmass-cards and marketing-request-portal repos. CI checks the copy in this repo; digital-ads-portal and
   christmass-cards compare theirs with this one in their own CI. When `session.js` changes, copy it unchanged into
   the other repos too.

`/logout?return=<url>` ends the session everywhere. `/.well-known/jwks.json` publishes the public key.

## Setup (once)

1. **Google Cloud** (a Google Workspace admin for overyondr.com):
   - console.cloud.google.com → create a project `overyondrdev-sign-in`.
   - APIs & Services → **OAuth consent screen** → User type **Internal** (only overyondr.com accounts), app name
     `Yondr (overyondrdev.com)`, support email, scopes `openid`, `email`, `profile`.
   - APIs & Services → **Credentials** → Create credentials → **OAuth client ID** → **Web application**, name
     `yondr-auth`, Authorized redirect URI `https://auth.overyondrdev.com/callback`. Copy the client ID and secret.
2. **Cloudflare** → Workers & Pages → `yondr-auth` → Settings → Variables and Secrets → add as **Secret**:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. (`SESSION_PRIVATE_JWK` is already set.)
3. **Cloudflare Zero Trust** → Access → Applications: a **Bypass** application for `auth.overyondrdev.com`, then
   switch the `overyondrdev.com` application to **Bypass** once sign-in works: step by step in [CUTOVER.md](CUTOVER.md).

## Rotating the session key

Generate a new ES256 JWK with a new `kid`, `npx wrangler -c auth/wrangler.jsonc secret put SESSION_PRIVATE_JWK`,
and put its public part in every site's `YONDR_AUTH_PUBLIC_JWK`; everyone signs in again.

## People directory (name and email autofill)

Every name/email field on overyondrdev.com autofills from the **Yondr Team Contact List** Google Sheet (owner decision,
27 Nov 2026). This Worker keeps the copy and serves the shared picker; the sites only load it.

- **Sync** (`src/directory.js`): 4 times a day (cron `23 1,7,13,19 * * *`, UTC) and, as a safety net, in the background
  when someone uses the picker and the last attempt is over 7 hours old. It reads the sheet with a **read-only Google
  service account** and stores in KV `yondr-directory` only first name, last name, email and title — **never phone
  numbers or locations**. Rows without a valid @overyondr.com email are skipped and listed (by row number) in the
  status. An update that would remove more than **20 %** of people at once is **not applied** (a filter or sorting slip
  in the sheet can't wipe the directory) and the status says why. People removed from the sheet stay as inactive:
  not suggested any more, but `/api/people/lookup` still names them on old records.
- **API** (signed-in staff only; credentialed CORS for `https://*.overyondrdev.com`; GET only):
  `GET /api/people` → `{ updated, people: [{ name, email, title }] }` (active people);
  `GET /api/people/lookup?emails=a,b` → names for known addresses (inactive included, with `active`);
  `GET /api/people/status` → `{ ok, error, last_ok, last_attempt, active, inactive, skipped_rows, history }` (no names).
- **Picker** (`src/people-picker.client.js`, served at `https://auth.overyondrdev.com/people-picker.js`): no
  dependencies, ARIA 1.2 combobox, at most 6 matches, recent picks on an empty field, works under strict CSPs
  (constructed stylesheet; no inline styles). Usage and rules: `docs/PLATFORM.md` §8.

### Setup (once, owner, browser only)
1. **Google Cloud** (console.cloud.google.com, project of the Yondr sign-in): *APIs & Services → Library →* **Google
   Sheets API → Enable**.
2. *IAM & Admin → Service accounts → Create service account*: name `yondr-directory-reader`, no roles, Done.
3. Open it → *Keys → Add key → Create new key → JSON*. A file downloads: it is the key. Don't email or paste it in chat.
4. In the sheet: **Share** → paste the service account's email (`yondr-directory-reader@….iam.gserviceaccount.com`)
   → **Viewer**, untick *Notify*. Nothing else is shared with it.
5. **Cloudflare** → Workers & Pages → `yondr-auth` → Settings → Variables and Secrets → **Add** → type **Secret**, name
   `DIRECTORY_SA_KEY`, value = the whole content of the JSON file → Deploy. Then delete the downloaded file.
6. Open any page with a person field, or wait for the next scheduled run: the status at
   `https://auth.overyondrdev.com/api/people/status` shows `ok: true` and the number of people.

If step 3 says key creation is disabled, the Workspace's Google Cloud policy blocks service account keys: an admin
allows it for this project (*IAM & Admin → Organization policies →* "Disable service account key creation" → override
for this project only).

## Develop

```sh
cd auth
npm run check        # syntax + unit tests (Node's test runner, no dependencies)
npx wrangler -c wrangler.jsonc deploy
```
