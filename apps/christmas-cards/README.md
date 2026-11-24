# Yondr Christmas Cards

**https://cards.overyondrdev.com** — Yondr staff add the clients who should receive a Christmas card.
The card team sees everything at **/admin**. Everyone signs in with an `@overyondr.com` email and a one-time
code, so we always know who added each client.

A separate Worker (`yondr-christmas-cards`) and database (D1 `yondr-christmas-cards`) from the website.

## Sign-in (`src/signin.js`, `public/signin.html`)
- `/signin`: enter an `@overyondr.com` email → we email a 6-digit code → a 30-day session cookie. Codes expire
  after 10 minutes and allow 5 tries; requests are throttled per email and per IP. Codes and session tokens are
  stored only as hashes.
- Emails are sent with **Cloudflare Email Sending** (`send_email` binding `EMAIL`, from `EMAIL_FROM`). It needs the
  Workers Paid plan and `overyondrdev.com` onboarded under Compute → Email Service → Email Sending.
- Cloudflare Access (the `*.overyondrdev.com` app) still sits in front today. While it does, its verified
  email is used and `/signin` never shows. To make `/signin` the only gate, add an Access application for
  `cards.overyondrdev.com` with a single **Bypass / Everyone** policy (a more specific hostname wins over the
  wildcard). Do that only after email sending works, or nobody can sign in.

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
| `src/auth.js` | Who is signed in: Cloudflare Access token, else the email-code session |
| `src/signin.js` | Email-code sign-in, sessions and the code email |
| `src/schema.js` / `schema.sql` | D1 tables |
| `public/signin.html`, `signin.js` | Sign-in page |
| `public/index.html`, `app.js` | Staff page, upload flow and first-visit guide |
| `public/admin.html`, `admin.js` | Admin |
| `public/shared.js`, `sheet.js`, `app.css` | Shared UI, CSV/Excel reader, styles |
| `public/yondr-christmas-card-list.xlsx`, `scripts/make-template.py` | The downloadable address spreadsheet and its generator |
