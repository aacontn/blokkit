import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import AppShell from "../components/AppShell";

interface LoginProps {
  loading: boolean;
  session: Session | null;
}

export default function Login({ loading, session }: LoginProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    return <Navigate to="/home" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithOtp({
      email
    });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Check your email for the login link.");
    }

    setSubmitting(false);
  };

  return (
    <AppShell title="Login">
      <div className="glass max-w-xl p-8">
        <h1 className="text-2xl font-semibold text-white">Acceso a la suite</h1>
        <p className="mt-2 text-sm text-white/70">
          Ingresa tu email. Recibiras un link seguro para entrar.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-white/70">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cobalt"
              placeholder="tu@email.com"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Enviando..." : "Enviar link"}
          </button>
        </form>

        {status && (
          <p className="mt-4 text-sm text-white/70">{status}</p>
        )}

        <p className="mt-6 text-xs uppercase tracking-[0.2em] text-white/40">
          CSR only. Supabase auth runs in the browser.
        </p>
      </div>
    </AppShell>
  );
}
