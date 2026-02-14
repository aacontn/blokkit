import { getAllRouteSeo, toAbsoluteUrl, SITE_URL } from "../lib/seo";

const buildSitemapXml = () => {
  const urls = getAllRouteSeo()
    .filter((route) => !route.noindex)
    .map((route) => {
      const loc = toAbsoluteUrl(route.path, SITE_URL);
      const lastmod = route.modifiedTime ?? route.publishedTime;

      const lines = [
        "  <url>",
        `    <loc>${loc}</loc>`,
      ];

      if (lastmod) {
        lines.push(`    <lastmod>${lastmod}</lastmod>`);
      }

      lines.push(
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority.toFixed(2)}</priority>`,
        "  </url>",
      );

      return lines.join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
  ].join("\n");
};

export const GET = () => {
  return new Response(buildSitemapXml(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
