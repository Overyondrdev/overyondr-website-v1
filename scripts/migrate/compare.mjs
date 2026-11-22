// Screenshot pages on the live Squarespace site and on a local build, side by side.
// Usage: node scripts/migrate/compare.mjs <localBase> <outDir> [path ...]
//   e.g. npx wrangler dev --port 8787 &  node scripts/migrate/compare.mjs http://localhost:8787 .migrate/compare / /about
// With no paths, every page in the snapshot manifest is compared.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Playwright isn't a project dependency; resolve it from wherever it is installed (CommonJS resolution honours NODE_PATH / global installs).
const { chromium } = createRequire(import.meta.url)('playwright');

const [localBase, outDir, ...paths] = process.argv.slice(2);
const LIVE = 'https://www.overyondr.com';
const list = paths.length
  ? paths
  : JSON.parse(fs.readFileSync('.migrate/snapshot/manifest.json', 'utf8')).filter((e) => e.kind === 'html' && e.path).map((e) => e.path);
const viewports = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }];
fs.mkdirSync(outDir, { recursive: true });

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launch({ proxy });
async function shot(ctx, url, file) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  } catch { /* screenshot whatever loaded */ }
  // Trigger lazy content, then return to top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}' });
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  for (const p of list) {
    const slug = (p === '/' ? 'index' : p.replace(/^\//, '').replace(/[^A-Za-z0-9_-]+/g, '_')) + '.' + vp.name;
    await shot(ctx, LIVE + p, path.join(outDir, slug + '.live.png'));
    await shot(ctx, localBase + p, path.join(outDir, slug + '.local.png'));
    console.log('shot', vp.name, p);
  }
  await ctx.close();
}
await browser.close();
