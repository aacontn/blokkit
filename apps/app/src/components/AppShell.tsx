import { ReactNode } from "react";
import { NavLink } from "react-router-dom";

interface AppShellProps {
  title: string;
  children: ReactNode;
}

export default function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-xs font-semibold">
              BK
            </span>
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Blokkit Suite</div>
          </div>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-white/70">
            <NavLink
              to="/home"
              className={({ isActive }) =>
                isActive ? "text-white" : "hover:text-white"
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/tickets"
              className={({ isActive }) =>
                isActive ? "text-white" : "hover:text-white"
              }
            >
              Tickets
            </NavLink>
            <NavLink
              to="/tickets/new"
              className={({ isActive }) =>
                isActive ? "text-white" : "hover:text-white"
              }
            >
              New Ticket
            </NavLink>
            <NavLink
              to="/admin/tickets"
              className={({ isActive }) =>
                isActive ? "text-white" : "hover:text-white"
              }
            >
              Admin
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 text-sm uppercase tracking-[0.3em] text-white/40">{title}</div>
        {children}
      </main>
    </div>
  );
}
