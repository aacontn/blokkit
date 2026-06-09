import { useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import AppShell from "../components/AppShell";

interface HomeProps {
  loading: boolean;
  session: Session | null;
}

export default function Home({ loading, session }: HomeProps) {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
  };

  return (
    <AppShell title="Home">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass p-8">
          <h2 className="text-xl font-semibold text-white">Estado de sesion</h2>
          {loading ? (
            <p className="mt-3 text-sm text-white/70">Cargando sesion...</p>
          ) : session ? (
            <div className="mt-4 space-y-2 text-sm text-white/70">
              <p>Usuario: {session.user.email}</p>
              <p>Autenticado con Supabase en el navegador.</p>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="mt-4 rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white disabled:opacity-60"
              >
                {signingOut ? "Cerrando..." : "Cerrar sesion"}
              </button>
            </div>
          ) : (
            <div className="mt-4 text-sm text-white/70">
              <p>No hay sesion activa.</p>
              <Link className="mt-3 inline-flex text-gold" to="/login">
                Ir a login
              </Link>
            </div>
          )}
        </div>
        <div className="glass p-8">
          <h2 className="text-xl font-semibold text-white">Proximo paso</h2>
          <p className="mt-3 text-sm text-white/70">
            Esta es la base del portal. Tickets y backoffice se agregan en la siguiente fase.
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 p-4 text-sm text-white/60">
            CSR only. Data fetching runs in the browser with Supabase SDK.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
