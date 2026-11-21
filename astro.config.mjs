// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// V1 is a faithful replica of the Squarespace site: static output, same URLs.
export default defineConfig({
  site: 'https://www.overyondr.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' }, // /about -> about.html, matching Squarespace's slash-less URLs
  integrations: [sitemap()],
});
