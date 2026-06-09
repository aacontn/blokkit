export type PageType = "website" | "article";

export interface RouteSeoEntry {
    path: string;
    title: string;
    description: string;
    keywords: string[];
    llmSummary: string;
    changefreq: "daily" | "weekly" | "monthly" | "yearly";
    priority: number;
    type?: PageType;
    image?: string;
    noindex?: boolean;
    publishedTime?: string;
    modifiedTime?: string;
}

export const SITE_NAME = "BloKKit";
export const SITE_URL = (import.meta.env.PUBLIC_SITE_URL ?? "https://blokkit.cl").replace(/\/$/, "");
export const SITE_LOCALE = "es_CL";
export const SITE_LANGUAGE = "es-CL";
export const DEFAULT_OG_IMAGE = "/images/blokkit-fundas.webp";
export const ORG_LOGO = "/images/Logo-Blokkit-white.png";
export const SITE_TWITTER_HANDLE = import.meta.env.PUBLIC_TWITTER_HANDLE ?? "@blokkit_cl";

const ROUTES: RouteSeoEntry[] = [
    {
        path: "/",
        title: "BloKKit | Funda Bloqueadora de Señal para Teléfonos en Colegios y Empresas",
        description:
            "Sistema de fundas bloqueadoras de señal Faraday que crea zonas libres de distracciones sin confiscar teléfonos. Ideal para colegios, universidades y empresas en Chile y Latinoamérica.",
        keywords: [
            "Funda Bloqueadora de señal para telefonos",
            "control de celulares en colegios",
            "funda faraday celular",
            "bloqueo de señal faraday",
            "prohibición de celulares en aula",
            "bloqueo de teléfonos en empresas",
        ],
        llmSummary:
            "BloKKit ofrece un sistema operativo para restringir el uso de celulares en aulas y entornos críticos mediante funda Faraday, dock de apertura y plataforma de trazabilidad.",
        changefreq: "weekly",
        priority: 1.0,
    },
    {
        path: "/producto",
        title: "Producto | BloKKit — Funda Bloqueadora de Señal, Dock y Plataforma",
        description:
            "Conoce el ecosistema BloKKit: Funda bloqueadora de señal Faraday, Dock de Desbloqueo y Plataforma Digital de trazabilidad.",
        keywords: [
            "funda bloqueadora de señal para telefonos",
            "funda faraday",
            "dock de desbloqueo",
            "plataforma de trazabilidad",
            "sistema de custodia de celulares",
        ],
        llmSummary:
            "La solución BloKKit se compone de tres módulos: funda para bloqueo de señal, dock para aperturas autorizadas y panel web para seguimiento operativo.",
        changefreq: "weekly",
        priority: 0.9,
        image: "/images/dock-standard.webp",
    },
    {
        path: "/beneficios",
        title: "Beneficios | BloKKit — Ventajas por Sector",
        description:
            "Descubre los beneficios de BloKKit para colegios, universidades, empresas, gobierno, policías, justicia y eventos.",
        keywords: [
            "beneficios control de celulares",
            "mejorar foco en clases",
            "productividad sin celular",
            "reducción de incidentes digitales",
            "soluciones por sector",
        ],
        llmSummary:
            "Esta página resume resultados esperados por sector al implementar BloKKit, incluyendo mejoras en foco, convivencia, cumplimiento y continuidad operacional.",
        changefreq: "weekly",
        priority: 0.8,
    },
    {
        path: "/soluciones",
        title: "Soluciones | BloKKit — Por Vertical y Contexto",
        description:
            "Soluciones operativas BloKKit para educación, empresas, gobierno, policías, justicia y eventos.",
        keywords: [
            "soluciones de control de celulares",
            "implementación por contexto",
            "protocolo institucional",
            "cumplimiento operativo",
            "gestión de excepciones",
        ],
        llmSummary:
            "BloKKit adapta su despliegue por contexto operativo con fases de diagnóstico, capacitación, implementación y monitoreo continuo.",
        changefreq: "weekly",
        priority: 0.85,
    },
    {
        path: "/evidencia",
        title: "Evidencia | BloKKit — Datos e Impacto Internacional",
        description:
            "Evidencia internacional y contexto Chile para decisiones de implementación BloKKit con medición real de impacto.",
        keywords: [
            "evidencia uso de celulares en colegios",
            "estudios foco académico",
            "impacto de restricción de móviles",
            "datos de convivencia escolar",
            "contexto chile celulares",
        ],
        llmSummary:
            "Compila datos de adopción digital, normativa y resultados observados en implementación de restricciones de celular en contextos educativos.",
        changefreq: "weekly",
        priority: 0.85,
    },
    {
        path: "/prensa",
        title: "Prensa | BloKKit — Cobertura en Medios",
        description:
            "Noticias y entrevistas sobre BloKKit en medios nacionales e internacionales.",
        keywords: [
            "prensa blokkit",
            "noticias inhibidores de señal",
            "medios sobre control de celulares",
            "entrevistas blokkit",
            "casos reales en colegios",
        ],
        llmSummary:
            "Reúne cobertura periodística y entrevistas audiovisuales sobre implementación de bloqueo de celulares y sus efectos en entornos educativos.",
        changefreq: "weekly",
        priority: 0.7,
    },
    {
        path: "/contacto",
        title: "Contacto BloKKit | Agendar Reunión",
        description:
            "Contacta a BloKKit para implementar control de celulares en colegios, universidades, empresas, gobierno y eventos.",
        keywords: [
            "contacto blokkit",
            "agendar reunion control de celulares",
            "implementación bloqueo celular",
            "asesoría protocolo institucional",
            "solicitar propuesta blokkit",
        ],
        llmSummary:
            "Formulario y canales directos para coordinar diagnóstico, diseño de protocolo y propuesta de implementación BloKKit por institución.",
        changefreq: "monthly",
        priority: 0.75,
    },
    {
        path: "/ley-celulares-2026",
        title: "Ley de Celulares 2026 — BloKKit | Cumplimiento Sin Conflicto",
        description:
            "Todo sobre la nueva ley que prohíbe celulares en colegios chilenos desde marzo 2026. Requisitos, excepciones y cumplimiento operativo.",
        keywords: [
            "ley de celulares 2026 chile",
            "prohibición de celulares en colegios",
            "RICE celulares",
            "superintendencia educación celulares",
            "cumplimiento normativa escolar",
        ],
        llmSummary:
            "Guía práctica sobre la ley chilena de 2026 para uso de celulares en colegios: vigencia, exigencias, excepciones, riesgos de implementación y propuesta operativa.",
        changefreq: "weekly",
        priority: 0.9,
        type: "article",
        publishedTime: "2026-01-01T00:00:00-03:00",
    },
    {
        path: "/privacidad",
        title: "Política de Privacidad | BloKKit",
        description:
            "Política de privacidad de BloKKit para el tratamiento de datos personales en consultas, soporte y operación comercial.",
        keywords: [
            "política de privacidad blokkit",
            "protección de datos personales",
            "tratamiento de datos",
            "privacidad sitio web",
        ],
        llmSummary:
            "Documento legal sobre recopilación, uso, resguardo y derechos de titulares de datos personales en BloKKit.",
        changefreq: "yearly",
        priority: 0.2,
    },
    {
        path: "/terminos",
        title: "Términos y Condiciones | BloKKit",
        description:
            "Términos y condiciones de uso del sitio web de BloKKit y lineamientos generales para información comercial.",
        keywords: [
            "términos y condiciones blokkit",
            "uso del sitio web",
            "condiciones legales",
            "aviso legal blokkit",
        ],
        llmSummary:
            "Documento legal que regula el uso del sitio de BloKKit, responsabilidades, limitaciones y contacto.",
        changefreq: "yearly",
        priority: 0.2,
    },
    {
        path: "/login",
        title: "Iniciar Sesión | BloKKit",
        description:
            "Accede al portal BloKKit para gestionar operaciones, soporte y cumplimiento institucional.",
        keywords: ["login blokkit", "portal blokkit", "acceso plataforma blokkit"],
        llmSummary:
            "Página de acceso al portal interno de BloKKit para operación y trazabilidad institucional.",
        changefreq: "monthly",
        priority: 0.3,
        noindex: true,
    },
];

const normalizePath = (path: string) => {
    const base = path.trim();
    if (!base || base === "/") return "/";
    const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
    return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};

export const getRouteSeoByPath = (path: string): RouteSeoEntry | undefined => {
    const normalized = normalizePath(path);
    return ROUTES.find((route) => normalizePath(route.path) === normalized);
};

export const getAllRouteSeo = (): RouteSeoEntry[] => [...ROUTES];

export const toAbsoluteUrl = (path: string, site = SITE_URL): string => {
    return new URL(path, site.endsWith("/") ? site : `${site}/`).toString();
};
