import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface LoginProps {
  loading: boolean;
  session: Session | null;
}

export default function Login({ loading, session }: LoginProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    return <Navigate to="/home" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        // el portal es solo para cuentas creadas/invitadas por BloKKit:
        // el formulario jamás registra usuarios nuevos
        shouldCreateUser: false,
      },
    });

    if (error) {
      const notAllowed = /signup|not allowed|otp_disabled/i.test(
        `${error.message} ${("code" in error && error.code) || ""}`
      );
      setStatus({
        kind: "error",
        text: notAllowed
          ? "Este correo no está habilitado en el portal. Escríbenos a hola@blokkit.cl para solicitar acceso."
          : `No pudimos enviar el link: ${error.message}`,
      });
    } else {
      setStatus({ kind: "ok", text: "Listo — revisa tu correo y abre el link de acceso." });
    }

    setSubmitting(false);
  };

  return (
    // pantalla propia, sin el nav del shell: desde aquí no hay a dónde navegar
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <img src="/Logo-Blokkit-white.png" alt="BloKKit" className="h-9 w-auto" />

      <div className="glass mt-8 w-full max-w-md p-8 sm:p-10">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
          · Portal BloKKit
        </span>
        <h1 className="mt-3 font-display text-2xl uppercase leading-tight text-white">
          Acceso al portal
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          Ingresa tu email institucional y te enviamos un link seguro de acceso. Sin contraseñas.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
              placeholder="nombre@institucion.cl"
              autoComplete="email"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full rounded-full bg-gold px-4 py-3.5 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Enviando…" : "Enviar link de acceso"}
          </button>
        </form>

        {status && (
          <p
            className={`mt-5 text-sm leading-relaxed ${
              status.kind === "error" ? "text-coral" : "text-gold"
            }`}
            role="status"
          >
            {status.text}
          </p>
        )}
      </div>

      <a
        href="https://blokkit.cl"
        className="mt-8 font-mono text-[11px] uppercase tracking-[0.16em] text-white/40 transition-colors hover:text-white/70"
      >
        ← Volver a blokkit.cl
      </a>
    </div>
  );
}
