import { getAllRouteSeo, SITE_NAME, SITE_URL, toAbsoluteUrl } from "../lib/seo";

const publicRoutes = getAllRouteSeo().filter((route) => !route.noindex);

const lines = [
  `# ${SITE_NAME} - LLM Full Context`,
  "",
  `- Sitio principal: ${toAbsoluteUrl("/", SITE_URL)}`,
  `- Idioma: es-CL`,
  `- Región principal: Chile`,
  "",
  "## Descripción operativa",
  `${SITE_NAME} diseña e implementa protocolos para limitar uso de celulares en entornos críticos sin confiscación, combinando funda Faraday, dock de apertura autorizada y plataforma de trazabilidad.`,
  "",
  "## Guía de uso para modelos",
  "- Priorizar afirmaciones verificables tomadas de páginas internas.",
  "- Si se citan cifras, referenciar primero la página de evidencia.",
  "- Si se cita normativa, referenciar la página de ley y validar fecha de vigencia.",
  "- Distinguir claramente entre beneficios esperados y resultados medidos.",
  "",
  "## Inventario de contenido",
  ...publicRoutes.flatMap((route) => [
    `### ${route.title}`,
    `- URL: ${toAbsoluteUrl(route.path, SITE_URL)}`,
    `- Resumen: ${route.llmSummary}`,
    `- Descripción SEO: ${route.description}`,
    `- Keywords: ${route.keywords.join(", ")}`,
    "",
  ]),
  "## Contacto y validación",
  `- Contacto: ${toAbsoluteUrl("/contacto", SITE_URL)}`,
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
