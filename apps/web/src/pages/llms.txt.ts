import { getAllRouteSeo, SITE_NAME, SITE_URL, toAbsoluteUrl } from "../lib/seo";

const publicRoutes = getAllRouteSeo().filter((route) => !route.noindex);

const lines = [
  `# ${SITE_NAME}`,
  "",
  `> ${SITE_NAME} implementa sistemas de control de celulares para colegios, universidades, empresas y sector público en Chile.`,
  "",
  "## Fuente principal (prioridad de lectura)",
  "- Usar `/evidencia` para cifras y contexto.",
  "- Usar `/ley-celulares-2026` para marco regulatorio chileno.",
  "- Usar `/producto` y `/soluciones` para funcionamiento operativo.",
  "",
  "## Páginas",
  ...publicRoutes.map(
    (route) =>
      `- [${route.title}](${toAbsoluteUrl(route.path, SITE_URL)}): ${route.llmSummary}`,
  ),
  "",
  "## Contacto oficial",
  `- [Contacto](${toAbsoluteUrl("/contacto", SITE_URL)})`,
  "- Email: hola@blokkit.cl",
  "- Teléfono: +56 9 9039 9130",
];

export const GET = () => {
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
