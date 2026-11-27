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

## Develop

```sh
cd auth
npm run check        # syntax + unit tests (Node's test runner, no dependencies)
npx wrangler -c wrangler.jsonc deploy
```
