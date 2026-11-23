// @ts-check
import { defineConfig } from 'astro/config';

// V1: the Squarespace site rebuilt as static pages (see scripts/migrate/). Same URLs, no trailing slashes.
// public/sitemap.xml is the original Squarespace sitemap with image URLs rewritten to this site.
export default defineConfig({
  site: 'https://www.overyondr.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' }, // /about -> about.html
});
