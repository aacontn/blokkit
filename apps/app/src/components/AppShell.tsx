import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { hasFundasAccess, useMyAccess } from "../lib/access";

interface AppShellProps {
  title: string;
  children: ReactNode;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
    isActive ? "bg-white/[0.06] text-gold" : "text-white/55 hover:bg-white/[0.04] hover:text-white"
  }`;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
      {children}
    </p>
  );
}

export default function AppShell({ title, children }: AppShellProps) {
  const access = useMyAccess();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setEmail(data.session?.user.email ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const nav = (
    <>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" onClick={() => setMenuOpen(false)}>
        <SectionLabel>General</SectionLabel>
        <NavLink to="/home" className={linkClass}>
          Inicio
        </NavLink>
        <NavLink to="/tickets" end className={linkClass}>
          Tickets
        </NavLink>
        <NavLink to="/tickets/new" className={linkClass}>
          Nuevo ticket
        </NavLink>

        {access && hasFundasAccess(access) && (
          <>
            <SectionLabel>Operación</SectionLabel>
            <NavLink to="/fundas" className={linkClass}>
              Fundas
            </NavLink>
          </>
        )}

        {access?.isStaff && (
          <>
            <SectionLabel>Administración</SectionLabel>
            <NavLink to="/admin/tickets" className={linkClass}>
              Tickets admin
            </NavLink>
            {access.isSysAdmin && (
              <>
                <NavLink to="/admin/dashboard" className={linkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/admin/crm" className={linkClass}>
                  CRM
                </NavLink>
                <NavLink to="/admin/cotizaciones" className={linkClass}>
                  Cotizaciones
                </NavLink>
                <NavLink to="/admin/operaciones" className={linkClass}>
                  Operaciones
                </NavLink>
                <NavLink to="/admin/implementaciones" className={linkClass}>
                  Implementaciones
                </NavLink>
                <NavLink to="/admin/finanzas" className={linkClass}>
                  Finanzas
                </NavLink>
                <NavLink to="/admin/users" className={linkClass}>
                  Usuarios
                </NavLink>
              </>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-white/10 p-4">
        {email && (
          <p className="mb-3 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/40" title={email}>
            {email}
          </p>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full rounded-full border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60 transition hover:border-coral/60 hover:text-coral"
        >
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      {/* ── sidebar desktop ── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/10 bg-ink/60 backdrop-blur-xl lg:flex">
        <div className="px-6 py-6">
          <NavLink to="/home" aria-label="Portal BloKKit">
            <img src="/Logo-Blokkit-white.png" alt="BloKKit" className="h-7 w-auto" />
          </NavLink>
        </div>
        {nav}
      </aside>

      {/* ── top bar móvil ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-ink/80 px-5 py-3 backdrop-blur-xl lg:hidden">
        <NavLink to="/home" aria-label="Portal BloKKit">
          <img src="/Logo-Blokkit-white.png" alt="BloKKit" className="h-6 w-auto" />
        </NavLink>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </header>

      {/* ── drawer móvil ── */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-white/10 bg-ink">
            <div className="flex items-center justify-between px-5 py-5">
              <img src="/Logo-Blokkit-white.png" alt="BloKKit" className="h-6 w-auto" />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/15 text-white"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* ── contenido: ocupa el ancho disponible junto al sidebar, no una
           columna estrecha centrada (cap generoso para ultra-wide) ── */}
      <main className="px-5 py-8 lg:pl-[260px] lg:pr-10 lg:pt-10">
        <div className="w-full max-w-[1680px]">
          <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
            · {title}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
