# Display ads

Generates the ads in the ad library (ads.overyondrdev.com) from one HTML template in the V2 website style.

| File | What |
| --- | --- |
| `campaign.json` | Copy (headlines, descriptions, stat, CTA, source line), sizes, photos. Edit this to change wording. |
| `ad.html` | The template: three scenes (students using the pouch, the 1–2 weeks stat, the pouch end card) laid out for each size. |
| `render.mjs` | Opens the template in Chromium, screenshots every still and every motion frame. |
| `encode.py` | JPEG stills and GIF motion, each under 150 KB; writes `public/__ads/<set>/manifest.json` and `source/` images. |

## Run

```sh
npm ci --prefix v2                 # fonts and photos come from the V2 site
node scripts/ads/render.mjs        # all 90 ads, about 5 minutes
node scripts/ads/render.mjs --size 728x90 --headline h2 --view motion   # just some
```

Needs Playwright with Chromium, Python 3 with Pillow, and ffmpeg.

## What you get, per headline (5) and size (6)

- `still/<set>-<h>-pouch-<size>.jpg`: the pouch on its own
- `still/<set>-<h>-in-use-<size>.jpg`: students using the pouch
- `motion/<set>-<h>-motion-<size>.gif`: 13.6 s animation, plays twice (27 s, under the 30 s limit), stops on the end card

Motion is built from masked reveals (text never moves; a mask uncovers it) and a lime wipe, and the pouch stays still
between the last two scenes. That keeps each GIF frame small, so the large sizes fit under 150 KB at full colour.
If a file goes over 150 KB, `encode.py` fails the run.

336×280 is the 300×250 layout scaled 1.12×, so the two share one set of CSS rules in `ad.html`.
