import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useMyAccess } from "../lib/access";

interface AppShellProps {
  title: string;
  children: ReactNode;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
    isActive ? "text-gold" : "text-white/60 hover:text-white"
  }`;

export default function AppShell({ title, children }: AppShellProps) {
  const access = useMyAccess();

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <NavLink to="/home" className="flex items-center" aria-label="Portal BloKKit">
            <img src="/Logo-Blokkit-white.png" alt="BloKKit" className="h-7 w-auto" />
          </NavLink>
          <nav className="flex flex-wrap items-center gap-5">
            <NavLink to="/home" className={navLinkClass}>
              Inicio
            </NavLink>
            <NavLink to="/tickets" end className={navLinkClass}>
              Tickets
            </NavLink>
            <NavLink to="/tickets/new" className={navLinkClass}>
              Nuevo ticket
            </NavLink>
            {access?.isStaff && (
              <NavLink to="/admin/tickets" className={navLinkClass}>
                Admin
              </NavLink>
            )}
            {access?.isSysAdmin && (
              <NavLink to="/admin/users" className={navLinkClass}>
                Usuarios
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
          · {title}
        </div>
        {children}
      </main>
    </div>
  );
}
