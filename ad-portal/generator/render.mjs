// Renders the campaign's display ads: a JPEG still per concept and an animated GIF per headline and size.
//
//   npm ci --prefix v2          (fonts and photos come from the V2 site)
//   node ad-portal/generator/render.mjs [--size 300x250] [--headline h1] [--view pouch|in-use|motion]
//
// Needs Playwright with Chromium (require('playwright')), Python 3 with Pillow, and ffmpeg.
// Writes ad-portal/seed/ (files + manifest.json); encode.py keeps every file under 150 KB.
// Then `npm run seed:remote` uploads them to R2 and records them in D1.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')));
}

const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
const c = JSON.parse(readFileSync(join(here, 'campaign.json'), 'utf8'));
const sizes = c.sizes.filter((s) => !arg('size') || s.id === arg('size'));
const heads = c.headlines.filter((h) => !arg('headline') || h.id === arg('headline'));
const views = ['pouch', 'in-use', 'motion'].filter((v) => !arg('view') || v === arg('view'));
const FPS = 10;
const SCALE = 2;

const work = join(tmpdir(), 'yondr-ads-' + c.id);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const browser = await chromium.launch();
const jobs = [];
for (const size of sizes) {
  // Rendered at 2x, then encode.py downsamples with Lanczos and a light sharpen: photos come out much crisper
  // than the browser's own 1x downscale.
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: SCALE });
  for (const h of heads) {
    for (const view of views) {
      await page.goto(pathToFileURL(join(here, 'ad.html')).href);
      const { duration } = await page.evaluate((spec) => window.build(spec), { c, size, h, view, base: pathToFileURL(repo).href + '/' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
      const name = `${c.id}-${h.id}-${view}-${size.id}`;
      const ad = page.locator('.ad');
      if (view !== 'motion') {
        const png = join(work, name + '.png');
        await ad.screenshot({ path: png });
        jobs.push({ kind: 'still', name, size: size.id, headline: h.id, view, png });
      } else {
        const dir = join(work, name);
        mkdirSync(dir);
        const frames = [];
        const n = Math.round(duration * FPS);
        for (let i = 0; i <= n; i++) {
          const t = i / FPS;
          await page.evaluate((t) => window.seek(t), t);
          const png = join(dir, String(i).padStart(4, '0') + '.png');
          await ad.screenshot({ path: png });
          frames.push(png);
        }
        jobs.push({ kind: 'motion', name, size: size.id, headline: h.id, view, frames, fps: FPS, hold: 0 });
      }
      process.stdout.write('.');
    }
  }
  await page.close();
}
await browser.close();
console.log(`\nrendered ${jobs.length} ads`);

const jobsFile = join(work, 'jobs.json');
writeFileSync(jobsFile, JSON.stringify({ campaign: c, jobs, partial: !!(arg('size') || arg('headline') || arg('view')) }));
execFileSync('python3', [join(here, 'encode.py'), jobsFile, join(here, '..', 'seed')], { stdio: 'inherit' });
