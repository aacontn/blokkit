// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://blokkit.cl",
  output: "static",
  integrations: [
    react(),
    sitemap({
      i18n: { defaultLocale: "es", locales: { es: "es-CL" } },
    }),
  ],
  vite: {
    css: {
      preprocessorOptions: {},
    },
    build: {
      cssMinify: "lightningcss",
    },
  },
});
