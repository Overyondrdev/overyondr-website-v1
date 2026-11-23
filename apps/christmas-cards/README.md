# Yondr Christmas Cards

**https://cards.overyondrdev.com** — Yondr staff add the clients who should receive a Christmas card.
The card team sees everything at **/admin**. Behind Cloudflare Access like the rest of overyondrdev.com
(one-time code to any `@overyondr.com` email), so we always know who added each client.

A separate Worker (`yondr-christmas-cards`) and database (D1 `yondr-christmas-cards`) from the website.

## What it does
- **Add one client** — form with an address check before saving. If the address looks wrong we show what
  we'd change (highlighted) with *Use suggested* / *Keep mine*; problems we can't fix are listed with *Save anyway*.
- **Upload a list** — `.xlsx`, `.csv`, or cells pasted from a spreadsheet. Columns are matched automatically
  (first + last name columns are combined), every address is checked, duplicates are flagged, then
  people review suggestions before adding.
- **Your clients** — everyone sees and edits only what they added.
- **Admin** (`/admin`) — totals, who added what, every client with filters, uploads, CSV export for the mail
  house, mark flagged addresses as checked, admins, and settings (deadline, intro message, close the list).

## Address checking (`src/address.js`)
1. Built-in rules always run: required fields, postal-code formats (US, CA, UK and ~25 more), US state/ZIP
   agreement, Canadian provinces, plus safe clean-ups (state names → codes, lost ZIP leading zeros, postcode spacing).
2. **Google Address Validation** (with USPS CASS data for US addresses) runs when the Worker secret
   `GOOGLE_MAPS_API_KEY` is set. It confirms the building exists, catches missing suite numbers and suggests
   corrections. Results are cached in D1 for 60 days. Without the key, only step 1 runs ("Basic check passed").

   To turn it on: Google Cloud console → enable *Address Validation API* → create an API key restricted to that
   API → `npx wrangler secret put GOOGLE_MAPS_API_KEY` in this folder (or Cloudflare dashboard → Workers →
   yondr-christmas-cards → Settings → Variables and secrets).

## Run locally
```sh
cd apps/christmas-cards
npm ci
echo 'DEV_EMAIL="you@overyondr.com"' > .dev.vars     # signs you in without Access
npx wrangler dev
npx wrangler d1 execute yondr-christmas-cards --local --command \
  "INSERT INTO admins (email, role, added_at) VALUES ('you@overyondr.com', 'owner', datetime('now'))"
```

## Deploy
`npx wrangler deploy` from this folder. The schema is applied automatically on the first request.
For deploy-on-merge, connect this Worker to the repo in Cloudflare (Workers Builds) with root directory
`apps/christmas-cards`.

## Files
| Path | What |
| --- | --- |
| `src/index.js` | Worker entry: `/api/*` → API, everything else → static files in `public/` |
| `src/api.js` | JSON API (clients, bulk check/save, admin) |
| `src/address.js` | Address rules + Google Address Validation |
| `src/auth.js` | Cloudflare Access identity (same as the website's feedback tool) |
| `src/schema.js` / `schema.sql` | D1 tables |
| `public/index.html`, `app.js` | Staff page and upload flow |
| `public/admin.html`, `admin.js` | Admin |
| `public/shared.js`, `sheet.js`, `app.css` | Shared UI, CSV/Excel reader, styles |
