# Blokkit — directrices del proyecto

Monorepo `blokkit-platform`. Producto: fundas bloqueadoras de señal para celulares
(colegios, universidades, empresas, gobierno y eventos). Chile.

## 🚀 Deploy — leer antes de tocar git

**El deploy es `git push` a `main`. No hay otro camino.** Cloudflare Pages está
git-connected: cualquier push a `main` publica a producción **sin paso de aprobación**.
Tratar un push como un deploy, no como un commit.

Nada se pushea solo: los cambios locales no salen hasta que alguien corre `git push`.
Lo automático es lo que pasa *después* del push. No hay `.github/workflows`; publica la
integración git nativa de Pages. *(Verificado 2026-07-16: el live sirve la metadata que
dejó `de7d5f7` sin que mediara ninguna acción manual de deploy.)*

| | |
|---|---|
| Plataforma | Cloudflare Pages |
| Cuenta | `espaciodigital` |
| Proyecto Pages | `blokkit` (+ `blokkit-mailing`, aparte) |
| Repo | `github.com/aacontn/blokkit` (cuenta `aacontn`), rama `main` |
| Dominios | `blokkit.cl` (web) · `app.blokkit.cl` (portal) |

⚠️ **`wrangler` local NO sirve para esta cuenta.** Está autenticado como
`jaime.briggs.l@gmail.com` y no tiene acceso API a `espaciodigital` desde esta máquina.
No intentar `wrangler pages deploy` — falla o publica en la cuenta equivocada.
Un API token tampoco es necesario: el camino es el push.

## 🧱 Stack

- **Monorepo npm workspaces**: `apps/*`, `packages/*`, `infra/workers/*`.
- `apps/web` — sitio público `blokkit.cl`. Astro 6 + React 19, `output: "static"`,
  adapter Cloudflare. Three.js (`@react-three/fiber`), Framer Motion, Lenis.
- `apps/app` — portal de clientes `app.blokkit.cl`. React + Vite + Supabase
  (login, admin, tickets). `noindex`.
- `functions/` — Pages Functions del sitio web (mismo origen que `blokkit.cl`).
- `infra/supabase/functions` — `contact-lead`, `invite-user`, `send-quote`.
- `infra/workers` — `kapso-webhook`, `supabase-keepalive`.

## 💻 Desarrollo

```bash
nvm use            # Node 22 (.nvmrc) — NO usar el Node de Codex.app
npm install
npm run dev:web    # :4321
npm run dev:app
```

Preview del build: `.claude/launch.json` → `web-preview` (`astro preview`, :4321).
⚠️ El 404 que se ve en preview es el interno de Astro; el `404.astro` custom solo
aparece servido por Pages.

## 📧 Formulario de contacto — Resend, NO Mailrelay

Lo resuelve `functions/api/contact.ts` (Pages Function, honeypot + validación) vía
**Resend**. Mailrelay quedó fuera en `a41458a` — si aparece mencionado en algún lado,
es residuo obsoleto.

Variables (viven en **Pages dashboard → env vars**):

| Variable | Nota |
|---|---|
| `RESEND_API_KEY` | Secreto. Obligatorio; sin él la function loguea error y no envía. |
| `CONTACT_FORM_FROM` | Default `BloKKit Web <contacto@blokkit.cl>` (dominio verificado en Resend). |
| `CONTACT_FORM_TO_EMAIL` | Default `hola@blokkit.cl`. |

## 📊 Medición — GTM

`BaseLayout` implementa **GTM** (no gtag/GA4 directo). El ID vive en Pages dashboard
→ env vars como `PUBLIC_GTM_ID` (plaintext; un ID de GTM no es secreto). Contenedor:
cuenta Tag Manager "Blokkit" (Google de Alfonso), contenedor web `blokkit.cl`.
⚠️ El contenedor parte **vacío**: GTM carga pero no mide nada hasta que se le
configure adentro una etiqueta (p. ej. GA4). Cambiar la env var solo surte efecto
en el **siguiente build** (retry deploy o push).

## 🔐 Secretos — regla dura

**Nunca un valor de secreto en el repo, en `CLAUDE.md`, ni en el chat.** Los secretos
viven en el **Pages dashboard (env vars)**; acá solo se documenta *dónde* están.
`.env.example` lista los nombres, siempre vacíos. Si un valor llega igual, no lo
guardes: anota dónde vive y márcalo para rotar.

## 🔎 SEO — convenciones

- **`apps/web/src/lib/seo.ts` es la fuente única** de title/description/schema por ruta.
  Las páginas no pasan title/description propios.
- ⚠️ **`keywords[]` NO se renderiza** — `BaseLayout` lo declara en props pero no emite
  `<meta name="keywords">` (correcto: Google lo ignora desde 2009). Es documentación
  interna; editarlo no cambia nada en Google.
- **Política de términos** (decisión de producto, no de SEO):
  - **"Faraday" no va en title ni description** — confunde a quien lee el snippet.
    Sí en `llmSummary` (solo lo lee el AI Overview) y en el cuerpo, donde hay espacio
    para explicarlo.
  - **"Inhibidor" sí va**, porque es lo que la prensa y las bases de licitación usan y
    es como busca la gente — pero **siempre en negación** ("no es un inhibidor ni un
    jammer"). Nunca afirmar que el producto lo sea: un jammer emite interferencia y su
    uso puede sancionarse; la funda bloquea de forma pasiva.
- `lastmod` del sitemap es **curado a mano** en `astro.config.mjs` (`serialize`), no la
  hora de build: un lastmod que cambia en cada deploy anula la señal. No automatizar.
- `trailingSlash: "always"` — así lo sirve Pages; evita el 308 en cada href interno.
- El canal de adquisición es la **categoría + la cita en AI Overview**, no la marca:
  nadie busca "blokkit" (y el término lo domina un mod de Minecraft homónimo).

## ⚠️ Gotchas

- **Bot Fight Mode domina la performance móvil.** Su script se come varios segundos en
  navegadores automatizados: cualquier Lighthouse móvil de laboratorio sale distorsionado
  (LCP inflado). Un usuario real no recibe ese desafío — no perseguir ese número.
- **robots.txt y crawlers de IA se gestionan en el dashboard de Cloudflare**, no solo en
  el repo.
- **Cotizador interno** en `blokkit.cl/cotizador`: asset estático en
  `apps/web/public/cotizador/index.html`, PIN client-side + `noindex`. No es parte del
  build de Astro.
- El README de la raíz conserva historia de la consolidación (jun 2026); su línea sobre
  que el live sirve "la versión pre-rediseño" quedó obsoleta.

## 🗂️ Registro

Ficha cruzada en **OrbitDeck** (`~/Developer/OrbitDeck/data/projects.json`, id `blokkit`).
Si cambia deploy, cuenta, repo, servicios o dónde viven las keys, actualizar **ambos**.
