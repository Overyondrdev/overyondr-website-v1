# Display ads

Generates the Harvard study ads for the ad portal (ads.overyondrdev.com) from one HTML template in the V2 website style.
Run from the website repo root: fonts and photos come from `v2/`.

| File | What |
| --- | --- |
| `campaign.json` | Copy (headlines, descriptions, stat, CTA, source line), sizes, photos. Edit this to change wording. |
| `ad.html` | The template: three scenes (students using the pouch, the 1–2 weeks stat, the pouch end card) laid out for each size. |
| `render.mjs` | Opens the template in Chromium, screenshots every still and every motion frame. |
| `encode.py` | JPEG stills and GIF motion, each under 150 KB; writes `ad-portal/seed/` (`still/`, `motion/`, `source/`, `manifest.json`). |

## Run

```sh
npm ci --prefix v2                 # fonts and photos come from the V2 site
node ad-portal/generator/render.mjs        # all 90 ads, about 5 minutes
node ad-portal/generator/render.mjs --size 728x90 --headline h2 --view motion   # just some
cd ad-portal && npm run seed:remote -- --by you@overyondr.com   # load them into the portal
```

Needs Playwright with Chromium, Python 3 with Pillow, and ffmpeg.

## What you get, per headline (5) and size (6)

- `still/<set>-<h>-pouch-<size>.jpg`: the pouch on its own
- `still/<set>-<h>-in-use-<size>.jpg`: students using the pouch
- `motion/<set>-<h>-motion-<size>.gif`: 13.6 s animation, plays twice (27 s, under the 30 s limit), stops on the end card

Motion is built from masked reveals (text never moves; a mask uncovers it) and a lime wipe, and the pouch stays still
between the last two scenes. That keeps each GIF frame small, so the large sizes fit under 150 KB at full colour.
If a file goes over 150 KB, `encode.py` fails the run.

Each motion ad also gets a poster, its end card as a JPEG (`<name>.gif.poster.jpg`), which the portal shows in the
grid instead of the animation. `scripts/seed.mjs` uploads posters with the ads (`--posters-only` uploads just those).
The template's fonts live in `fonts/` (OFL); the portal serves the same `ad.html` at `/render/ad.html` to re-render ads
after copy edits, so a change here changes both. Run `npm run pull-copy` first if copy was edited in the portal.

Every text element in `ad.html` carries `data-field` (its copy path), and `build()` returns the fields an ad shows.
The portal's editor offers exactly those, from the `FIELDS` table in `public/editor.js`: after changing the template,
run `node ad-portal/generator/fields.mjs` and paste its output there. The stat line on the stills (`stat.line`)
highlights the stat number and the word after it.

Everything is rendered at 2× and downsampled with Lanczos plus a light unsharp mask (lighter for motion), which keeps
the photos crisp: the browser's own 1× downscale of the 2000 px photos is noticeably soft. The largest motion ads then
use fewer than 256 colours to stay under 150 KB (`colors` in the run output).

336×280 is the 300×250 layout scaled 1.12×, so the two share one set of CSS rules in `ad.html`.
