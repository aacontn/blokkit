import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../components/AppShell";
import { useProfile } from "../lib/profile";
import { hasFundasAccess, useMyAccess } from "../lib/access";

interface HomeProps {
  loading: boolean;
  session: Session | null;
}

interface QuickLink {
  to: string;
  title: string;
  desc: string;
}

function QuickCard({ to, title, desc }: QuickLink) {
  return (
    <Link
      to={to}
      className="glass block p-6 transition hover:-translate-y-0.5 hover:shadow-glow"
    >
      <h2 className="font-display text-base uppercase text-white">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{desc}</p>
      <span className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
        Entrar →
      </span>
    </Link>
  );
}

export default function Home({ session }: HomeProps) {
  const access = useMyAccess();
  const { profile } = useProfile(session?.user.id);

  const firstName =
    profile?.full_name?.split(" ")[0] ??
    session?.user.email?.split("@")[0] ??
    "";

  const links: QuickLink[] = [
    { to: "/tickets", title: "Mis tickets", desc: "Revisa el estado de tus solicitudes de soporte." },
    { to: "/tickets/new", title: "Nuevo ticket", desc: "Abre una solicitud al equipo BloKKit." },
  ];

  if (access && hasFundasAccess(access)) {
    links.unshift(
      {
        to: "/escanear",
        title: "Escanear y asignar",
        desc: "Registro diario por QR: escanea, elige curso y alumno.",
      },
      {
        to: "/fundas",
        title: "Fundas",
        desc: "Cursos, alumnos, inventario y asignaciones de hoy.",
      },
    );
  }

  if (access?.isStaff) {
    links.push({
      to: "/admin/tickets",
      title: "Tickets admin",
      desc: "Gestión y asignación de tickets de soporte.",
    });
  }

  if (access?.isSysAdmin) {
    links.push(
      { to: "/admin/dashboard", title: "Dashboard", desc: "El negocio completo de un vistazo: ventas, finanzas y operación." },
      { to: "/admin/crm", title: "CRM", desc: "Cuentas, pipeline de ventas y seguimiento comercial." },
      { to: "/admin/cotizaciones", title: "Cotizaciones", desc: "Crea y gestiona cotizaciones con numeración automática." },
      { to: "/admin/users", title: "Usuarios", desc: "Invita usuarios por colegio y administra accesos." }
    );
  }

  return (
    <AppShell title="Inicio">
      <div className="mb-8">
        <h1 className="font-display text-2xl uppercase leading-tight text-white">
          Hola{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          ¿Qué necesitas hacer hoy?
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <QuickCard key={l.to} {...l} />
        ))}
      </div>
    </AppShell>
  );
}
