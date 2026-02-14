import { SITE_URL } from "../lib/seo";

const lines = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /login",
  "",
  "User-agent: GPTBot",
  "Allow: /",
  "",
  "User-agent: ChatGPT-User",
  "Allow: /",
  "",
  "User-agent: Google-Extended",
  "Allow: /",
  "",
  "User-agent: ClaudeBot",
  "Allow: /",
  "",
  "User-agent: PerplexityBot",
  "Allow: /",
  "",
  "User-agent: CCBot",
  "Allow: /",
  "",
  `Sitemap: ${new URL("/sitemap.xml", SITE_URL).toString()}`,
];

export const GET = () => {
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
