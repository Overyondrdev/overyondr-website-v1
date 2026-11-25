# Cloudflare Access sign-in page (Yondr branded)

`login.html` is the page people see when they sign in to anything on `*.overyondrdev.com` (the one-time code page).
Cloudflare inserts its own sign-in box where `<cf-access-authbox></cf-access-authbox>` sits; everything else is ours.
It is not part of the site build: it lives in Cloudflare Zero Trust.

## Full custom page (removes Cloudflare branding)

Needs the Zero Trust **Pay-as-you-go** or **Enterprise** plan (templates aren't available on Zero Trust Free).

1. Cloudflare One → **Reusable components** → **Custom pages** → **Access custom pages** → **Manage** → **Create custom page**.
2. Name `Yondr sign-in`, type **Login**. Paste `login.html`, check **Problems**, then **Publish**.
3. Assign it: **Access controls** → **Applications** → "overyondrdev.com (Yondr website dev)" → **Additional settings** →
   **Custom block pages** → **Login page** → **Custom page** → `Yondr sign-in` → **Save**
   (or **Set as default** on the template to use it for every Access app).
4. Sign out (`https://overyondr.cloudflareaccess.com/cdn-cgi/access/logout`) and open overyondrdev.com to check it,
   on a phone too.

Rules from Cloudflare: no JavaScript, keep exactly one `<cf-access-authbox>`, keep `message.text` visible (it explains
sign-in problems), HTTPS-only external assets. No `<link>` or `<svg>` (the editor rejects them): fonts are
`@font-face` rules pointing at Google's font files, and the logo is an `<img>` from the public R2 bucket
`yondr-brand-public` (`https://pub-3b315bec28984b5c8320e77f4b7ab91b.r2.dev/yondr-off-white.svg`), because
overyondrdev.com's own files are behind Access and can't load before sign-in. That bucket holds only public brand files.

## Current setup (live)

The template is published as `Yondr sign-in` and assigned to the Access app "overyondrdev.com (Yondr website dev)"
(`custom_pages` on the app). **Apply instant authentication is off** on that app: with it on, Access skips the login
page and goes straight to Cloudflare's own one-time-code screen, so this page would never show. The logo is served from
the public R2 bucket `yondr-brand-public`. The account is on Zero Trust Standard (needed for custom pages).
To roll back: set the app's Login page to **Cloudflare default** (and turn instant authentication back on if wanted).

## On the Free plan (partial)

Cloudflare One → **Reusable components** → **Custom pages** → **Access login page** → **Manage**:
- Organization name: `Yondr`
- Logo: an HTTPS URL that is reachable without signing in (not overyondrdev.com)
- Background color: `#1C300B`
- Header: `Yondr team only. Sign in with your @overyondr.com email.`
- Footer: `Need access? Ask the web team.`

Some Cloudflare branding stays on the page on this plan.

## By API (what an automated setup needs)

A token with **Access: Custom Pages Write** (templates) and **Access: Apps and Policies Write** (assigning it), or
**Access: Organizations, Identity Providers, and Groups Write** for the Free-plan login design.
