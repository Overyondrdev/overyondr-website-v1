// Lists the copy fields every size and version of the ad shows, from the template itself: build() reports the
// data-field elements an ad keeps after hiding what its layout doesn't use. Paste the output into FIELDS in
// public/editor.js after changing generator/ad.html, so the portal's editor offers exactly the text on each ad.
//
//   node ad-portal/generator/fields.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')));
}
const c = JSON.parse(readFileSync(join(here, 'campaign.json'), 'utf8'));
const browser = await chromium.launch();
const out = {};
for (const size of c.sizes) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  out[size.id] = {};
  for (const view of ['pouch', 'in-use', 'motion']) {
    const seen = new Set();
    for (const h of c.headlines) {
      await page.goto(pathToFileURL(join(here, 'ad.html')).href);
      const r = await page.evaluate((spec) => window.build(spec), { c, size, h, view, base: pathToFileURL(repo).href + '/' });
      r.fields.forEach((f) => seen.add(f));
    }
    out[size.id][view] = [...seen];
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(out));
