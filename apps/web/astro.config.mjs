// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? "https://blokkit.cl",
  output: "server",
  adapter: node({
    mode: "standalone",
  }),

  vite: {
    plugins: [tailwindcss()]
  }
});
