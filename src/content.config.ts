import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Blog posts migrated from Squarespace. Slug = file name = existing URL slug.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
  }),
});

// Phone-free legislation hub: one file per state/city.
const legislation = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legislation' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    region: z.string(),
  }),
});

export const collections = { blog, legislation };
