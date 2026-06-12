import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * contact-lead — endpoint PÚBLICO del formulario de contacto de blokkit.cl.
 * (Deployada vía MCP 2026-06-12, verify_jwt: false a propósito: form anónimo.)
 * Defensas propias: honeypot, validación estricta, límites de largo y dedupe
 * por email/día. Crea un deal stage=lead source=web; con RESEND_API_KEY
 * notifica a hola@blokkit.cl.
 */

const ALLOWED_ORIGINS = new Set([
  "https://blokkit.cl",
  "https://www.blokkit.cl",
  "https://blokkit.pages.dev",
  "http://localhost:4321",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://blokkit.cl";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ message: "Método no permitido" }, 405, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ message: "Solicitud inválida" }, 400, origin);
  }

  // honeypot: los bots llenan el campo oculto — responder 200 sin hacer nada
  if (clean(body.website, 10)) {
    return json({ ok: true }, 200, origin);
  }

  const name = clean(body.name, 120);
  const role = clean(body.role, 120);
  const email = clean(body.email, 160).toLowerCase();
  const institution = clean(body.institution, 160);
  const sector = clean(body.sector, 60);
  const message = clean(body.message, 2000);

  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ message: "Revisa nombre, email y mensaje — son obligatorios." }, 400, origin);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // dedupe suave: si ya hay 3+ leads web con este email hoy, silencio
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const { count: dupes } = await svc
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("source", "web")
    .eq("contact_email", email)
    .gte("created_at", today.toISOString());
  if ((dupes ?? 0) >= 3) {
    return json({ ok: true }, 200, origin);
  }

  const notes = [
    role ? `Cargo: ${role}` : null,
    sector ? `Sector: ${sector}` : null,
    `Mensaje: ${message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: insertErr } = await svc.from("deals").insert({
    prospect_name: institution || name,
    stage: "lead",
    source: "web",
    contact_name: name,
    contact_email: email,
    notes,
  });

  if (insertErr) {
    console.error("contact-lead insert error", insertErr.message);
    return json({ message: "No pudimos registrar tu solicitud. Escríbenos a hola@blokkit.cl" }, 500, origin);
  }

  // notificación interna (best-effort; sin RESEND_API_KEY simplemente se omite)
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "BloKKit <hola@blokkit.cl>",
          to: ["hola@blokkit.cl"],
          subject: `Nuevo lead web: ${institution || name}`,
          text: `Nombre: ${name}\nEmail: ${email}\nInstitución: ${institution || "-"}\nCargo: ${role || "-"}\nSector: ${sector || "-"}\n\n${message}\n\n→ Ya está en el CRM: https://app.blokkit.cl/admin/crm`,
        }),
      });
      await svc.from("email_log").insert({ provider: "resend", kind: "lead_notify", recipient: "hola@blokkit.cl" });
    } catch (e) {
      console.error("contact-lead notify error", e);
    }
  }

  return json({ ok: true }, 200, origin);
});
