# Blokkit Platform

Monorepo para la plataforma digital de Blokkit.

## Estructura

```
apps/
  web/      → Landing page pública (Astro + React)
  portal/   → Sistema de administración (React + Vite)

packages/
  ui/       → Componentes compartidos
  config/   → Configuraciones ESLint, TypeScript
```

## Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo de la web
npm run dev:web

# Desarrollo del portal
npm run dev:portal

# Desarrollo de ambos
npm run dev
```

## Tech Stack

- **Web**: Astro + React + Tailwind CSS + Framer Motion
- **Portal**: React + Vite + TanStack Query + Supabase
- **UI**: Shadcn/ui + Lucide Icons
