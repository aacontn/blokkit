// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://blokkit.cl",
  output: "static",
  // Inlina el CSS en el HTML para evitar requests render-blocking (mejora FCP/LCP en primera carga).
  build: { inlineStylesheets: "always" },
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
