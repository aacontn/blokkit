# BloKKit Web

Sitio corporativo de BloKKit construido con Astro.

## Modo de salida

La app web corre en `output: "server"` con `@astrojs/node` para soportar endpoints como `/api/contact`.
El build genera `apps/web/dist/server/entry.mjs` para ejecutar en Node.

## Comandos

Desde la raíz del monorepo:

- `npm run dev --workspace=@blokkit/web`
- `npm run build --workspace=@blokkit/web`
- `npm run preview --workspace=@blokkit/web`

## Variables de entorno SEO / Analytics

Opcionales. Si no se definen, el sitio sigue funcionando sin scripts de tracking.

- `PUBLIC_SITE_URL` (ej: `https://blokkit.cl`)
- `PUBLIC_GOOGLE_SITE_VERIFICATION`
- `PUBLIC_BING_SITE_VERIFICATION`
- `PUBLIC_FACEBOOK_DOMAIN_VERIFICATION`
- `PUBLIC_GTM_ID` (ej: `GTM-XXXXXXX`)
- `PUBLIC_GA_MEASUREMENT_ID` (ej: `G-XXXXXXXXXX`, solo si no usas GTM)
- `PUBLIC_TWITTER_HANDLE` (ej: `@blokkit_cl`)

Notas:

- Si existe `PUBLIC_GTM_ID`, se prioriza GTM.
- Si no existe GTM y sí existe `PUBLIC_GA_MEASUREMENT_ID`, se inyecta `gtag.js`.
- Se emite un evento de page view en carga inicial y en `astro:page-load`.

## Variables de entorno formulario de contacto (Mail Relay API)

Necesarias para que `POST /api/contact` pueda enviar correos usando `POST /api/v1/send_emails`.

- `MAILRELAY_API_TOKEN` (API key en header `X-AUTH-TOKEN`)
- `MAILRELAY_FROM_EMAIL` (remitente validado en Mail Relay)
- `MAILRELAY_FROM_NAME` (opcional, default: `BloKKit Web`)
- `MAILRELAY_API_BASE_URL` (opcional, default: `https://blokkit.ipzmarketing.com/api/v1`)
- `CONTACT_FORM_TO_EMAIL` (opcional, default: `hola@blokkit.cl`)
