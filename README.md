# BloKKit Platform

Monorepo unificado (2026-06-09). Fuente única de verdad para todo el desarrollo BloKKit.

## Estructura
- `apps/web` — sitio público blokkit.cl (Astro 6 + React 19). Incluye el rediseño de mayo 2026 (charcoal + cyan #7FCEEC + Archivo Black).
- `apps/app` — plataforma/portal de clientes (React + Vite + Supabase): login, admin, tickets.
- `packages/ui`, `packages/shared` — código compartido.
- `infra/` — Supabase + Cloudflare Workers.
- `docs/` — assets de marca.

## Desarrollo
```bash
nvm use            # Node 22 (Homebrew/nvm — NO usar el Node de Codex.app)
npm install
npm run dev:web    # web en :4321
npm run dev:app    # app
```

## Historia de la unificación
Consolidado desde: `Claude Code/BloKKit-clean` (web, rediseño mayo), `Desktop/Blokkit/Web y App Blokkit` (app + packages + infra), `blokkit-platform-respaldo-2026-05-11` (clone git feb). GitHub `aacontn/blokkit` quedó en feb 2026; el live blokkit.cl sirve la versión pre-rediseño.
