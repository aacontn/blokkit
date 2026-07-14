// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://blokkit.cl",
  output: "static",
  // Canónicas con slash final (así las sirve Cloudflare Pages): evita que los
  // href internos disparen el redirect 308 sin-slash → con-slash.
  trailingSlash: "always",
  // Inlina el CSS en el HTML para evitar requests render-blocking (mejora FCP/LCP en primera carga).
  build: { inlineStylesheets: "always" },
  integrations: [
    react(),
    sitemap({
      i18n: { defaultLocale: "es", locales: { es: "es-CL" } },
      serialize(item) {
        // lastmod solo con fechas reales y curadas — un lastmod = hora de build
        // en cada deploy es "no confiable" para Google y anula la señal.
        const LASTMOD = {
          "https://blokkit.cl/ley-celulares-2026/": "2026-06-11",
        };
        if (LASTMOD[item.url]) item.lastmod = LASTMOD[item.url];
        return item;
      },
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
