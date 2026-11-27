# Yondr Christmas Cards

**https://cards.overyondrdev.com** — Yondr staff add the clients who should receive a Christmas card.
The card team sees everything at **/admin**. Everyone signs in with an `@overyondr.com` email and a one-time
code, so we always know who added each client.

A separate Worker (`yondr-christmas-cards`) and database (D1 `yondr-christmas-cards`) from the website.

## Sign-in (`public/signin.html`, `/auth` in `src/index.js`)
- Signed-out visitors go to `/auth`, which sends them to the Yondr Google sign-in (`auth.overyondrdev.com`; see
  `docs/PLATFORM.md` in the repo root) and back. `/auth` then starts the app's own 30-day session cookie and returns
  the person to where they were going. `/signin` only shows sign-in errors now.
- Cloudflare Access is on **Bypass** for the whole host (including `/auth`), so the app's own session is the gate
  and nobody uses an Access seat. Access tokens are still accepted, left over from the switch.
- Why not send codes ourselves: `src/signin.js` can still email codes through Cloudflare Email Sending
  (`/api/signin/start`), and Cloudflare reported them delivered, but Yondr's mail system silently held them. The page
  no longer uses that path. If IT approves `cards@overyondrdev.com`, it can be switched back.

## What it does
- **First-visit guide**: three short steps (welcome, how to add clients, then a choice to download the address
  spreadsheet, upload one, or add a client by hand). Shown once per person (tracked in D1) and again from
  *See how it works*.
- **Address spreadsheet** (`public/yondr-christmas-card-list.xlsx`): a styled Excel file with required columns in
  Dark Green, dropdowns for Country (US, UK, Mexico first) and Department, a text-formatted ZIP column and a
  "How to fill this in" tab. Rebuild it with `python3 scripts/make-template.py` (needs openpyxl) whenever the
  department list changes, so its dropdown matches.
- **Google Sheets option**: every *Download Excel* button has an *Open in Google Sheets* button next to it. It opens
  `docs.google.com/spreadsheets/d/<id>/copy` for a view-only, locked master in Chad's Google Drive ("Yondr Christmas
  card list (template – make a copy)"), so each person gets their own private copy and lists never mix. They then
  download it as Excel and upload it, or paste the cells. If the spreadsheet changes, upload the new .xlsx to Drive
  as a Google Sheet, share it view-only by link, lock it, and update `SHEETS_COPY_URL` in `public/app.js` and the
  link in `public/index.html`.
- **Required for every client**: name, organization, street address, city, postal code, country (state/region for
  the US, Mexico, Canada and Australia), plus the sender's department. Country has no preselected value; US, UK
  and Mexico are listed first.
- **Add one client** — the person's department (dropdown, remembered for next time), then a form with an address check before saving. If the address looks wrong we show what
  we'd change (highlighted) with *Use suggested* / *Keep mine*; problems we can't fix are listed with *Save anyway*.
- **Upload a list** — `.xlsx`, `.csv`, or cells pasted from a spreadsheet. Columns are matched automatically
  (first + last name columns are combined), every address is checked, duplicates are flagged, then
  people review suggestions before adding.
- **Your clients** — everyone sees and edits only what they added.
- **Admin** (`/admin`) — totals, who added what, every client with filters, uploads, CSV export for the mail
  house, mark flagged addresses as checked, admins, and settings (deadline, intro message, department list,
  close the list). Department is a column, a filter and an overview chart.

## Address checking (`src/address.js`)
1. Built-in rules always run: required fields, postal-code formats (US, CA, UK, MX and ~25 more), US state/ZIP
   agreement, Canadian provinces, plus safe clean-ups (state names → codes, lost ZIP leading zeros, postcode spacing).
2. Free lookups, no account or key:
   - **US**: the US Census Bureau geocoder (`geocoding.geo.census.gov`) matches the building number against official
     street address ranges and suggests the corrected street, city, state and ZIP. It retries with just the ZIP, and
     with the state the ZIP belongs to, so a wrong city or state still finds the address.
   - **Everywhere else**: OpenStreetMap Nominatim (`nominatim.openstreetmap.org`) finds the street or building and
     suggests the right postal code. If the street isn't mapped, it still checks the postal code belongs to the city.
     Nominatim's rules: at most 1 request a second (calls are queued ~1.1 s apart), an identifying User-Agent, and
     attribution ("© OpenStreetMap contributors" in the page footer and on check results).
   - These confirm an address exists. They can't confirm mail delivery or suite numbers the way USPS can.
   Results are cached in D1 for 60 days, so re-checking the same address costs nothing.
3. Optional: if the Worker secret `GOOGLE_MAPS_API_KEY` is ever set (Google Address Validation API, with USPS data
   for US addresses), Google is used instead of the free lookups.

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
| `src/auth.js` | Who is signed in: the Yondr Google session (`src/yondr-session.js`), a legacy Access token, else the app's session |
| `src/signin.js` | Email-code sign-in, sessions and the code email |
| `src/schema.js` / `schema.sql` | D1 tables |
| `public/signin.html`, `signin.js` | Sign-in page |
| `public/index.html`, `app.js` | Staff page, upload flow and first-visit guide |
| `public/admin.html`, `admin.js` | Admin |
| `public/shared.js`, `sheet.js`, `app.css` | Shared UI, CSV/Excel reader, styles |
| `public/yondr-christmas-card-list.xlsx`, `scripts/make-template.py` | The downloadable address spreadsheet and its generator |
