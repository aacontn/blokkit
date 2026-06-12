import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * invite-user v2 — invitaciones con contador diario + failover de proveedor.
 * (Deployada vía MCP 2026-06-11, verify_jwt: true. Esta copia es de referencia.)
 * Canales:
 *   1. Resend API (limpio) hasta RESEND_DAILY_INVITE_CAP envíos/día — reserva
 *      el resto de la cuota de la cuenta (100/día free) para magic links vía SMTP.
 *   2. Brevo API como failover (sobre el umbral o ante error de Resend).
 *   3. Sin API keys configuradas → inviteUserByEmail clásico (SMTP) como fallback.
 * Secrets esperados (Edge Functions → Secrets): RESEND_API_KEY, BREVO_API_KEY (opcional).
 * Solo SYS_ADMIN / SYS_ADMIN_GENERAL pueden llamarla.
 */

const RESEND_DAILY_INVITE_CAP = 60;
const PORTAL_URL = "https://app.blokkit.cl";

const ALLOWED_ORIGINS = new Set([
  "https://app.blokkit.cl",
  "https://blokkit-app.pages.dev",
  "http://localhost:4173",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : PORTAL_URL;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

/* ── plantilla de invitación (espejo de infra/supabase/email-templates/invite.html) ── */
function inviteHtml(actionLink: string, email: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#F2F2F2;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;"><tr><td align="center" style="padding:8px 0 24px;"><img src="https://blokkit.cl/images/Logo-Blokkit.png" alt="BloKKit" width="132" style="display:block;width:132px;height:auto;" /></td></tr><tr><td style="background-color:#FFFFFF;border:1px solid rgba(31,31,31,0.08);border-radius:20px;padding:36px 32px;"><p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3FA8E0;">&middot; Portal BloKKit</p><h1 style="margin:14px 0 0;font-size:24px;line-height:1.15;font-weight:800;text-transform:uppercase;letter-spacing:-0.2px;color:#1F1F1F;">Tienes acceso al portal</h1><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#55565A;">Tu cuenta <strong style="color:#1F1F1F;">${email}</strong> fue habilitada en el portal BloKKit: tickets de soporte, seguimiento de implementaci&oacute;n y gesti&oacute;n de tu operaci&oacute;n.</p><table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0;width:100%;"><tr><td align="center"><a href="${actionLink}" target="_blank" style="display:inline-block;background-color:#1F1F1F;color:#FFFFFF;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;padding:15px 34px;border-radius:999px;">Activar mi acceso</a></td></tr></table><p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#8A8D93;">Despu&eacute;s de activar, entras cuando quieras desde <a href="${PORTAL_URL}/login" style="color:#3FA8E0;text-decoration:none;">app.blokkit.cl</a> con tu correo &mdash; te llega un link seguro, sin contrase&ntilde;as.</p></td></tr><tr><td align="center" style="padding:22px 12px 0;"><p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9A9A98;">BloKKit &middot; Ambientes libres de distracciones<br /><a href="https://blokkit.cl" style="color:#3FA8E0;text-decoration:none;">blokkit.cl</a></p></td></tr></table></td></tr></table>`;
}

function inviteText(actionLink: string): string {
  return `Tienes acceso al portal BloKKit.\n\nActiva tu acceso: ${actionLink}\n\nDespués de activar, entra cuando quieras desde ${PORTAL_URL}/login con tu correo — te llega un link seguro, sin contraseñas.\n\nBloKKit · blokkit.cl`;
}

/* ── proveedores ── */
async function sendViaResend(apiKey: string, to: string, html: string, text: string): Promise<{ ok: boolean; status: number; detail: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "BloKKit <hola@blokkit.cl>",
      to: [to],
      subject: "Te invitamos al portal BloKKit",
      html,
      text,
    }),
  });
  const detail = await res.text();
  return { ok: res.ok, status: res.status, detail: detail.slice(0, 300) };
}

async function sendViaBrevo(apiKey: string, to: string, html: string, text: string): Promise<{ ok: boolean; status: number; detail: string }> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "BloKKit", email: "hola@blokkit.cl" },
      to: [{ email: to }],
      subject: "Te invitamos al portal BloKKit",
      htmlContent: html,
      textContent: text,
    }),
  });
  const detail = await res.text();
  return { ok: res.ok, status: res.status, detail: detail.slice(0, 300) };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405, origin);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 1. llamador autenticado y sys admin
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Sin autorización" }, 401, origin);

  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401, origin);

  const { data: callerRoles } = await svc
    .from("memberships")
    .select("active, roles(name)")
    .eq("user_id", userData.user.id)
    .eq("active", true);

  const isSysAdmin = (callerRoles ?? []).some((m: { roles: { name: string } | { name: string }[] | null }) => {
    const r = m.roles;
    const name = Array.isArray(r) ? r[0]?.name : r?.name;
    return name === "SYS_ADMIN" || name === "SYS_ADMIN_GENERAL";
  });
  if (!isSysAdmin) return json({ error: "Solo administradores BloKKit pueden invitar usuarios" }, 403, origin);

  // 2. input
  let body: { email?: string; tenant_id?: string; role_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, origin);
  }
  const email = body.email?.trim().toLowerCase();
  const tenantId = body.tenant_id;
  const roleName = body.role_name ?? "CLIENT_USER";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email inválido" }, 400, origin);

  const { data: tenant } = await svc.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
  if (!tenant) return json({ error: "Colegio/empresa no existe" }, 400, origin);

  const { data: role } = await svc.from("roles").select("id, name").eq("name", roleName).maybeSingle();
  if (!role) return json({ error: "Rol no existe" }, 400, origin);

  // 3. usuario existente → solo membresía, sin correo
  const { data: existing } = await svc.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    const { error: upsertErr } = await svc.from("memberships").upsert(
      { user_id: existing.id, tenant_id: tenant.id, role_id: role.id, active: true },
      { onConflict: "user_id,tenant_id" }
    );
    if (upsertErr) return json({ error: `No se pudo actualizar la membresía: ${upsertErr.message}` }, 500, origin);
    return json({ ok: true, action: "membership_updated", message: `${email} ya tenía cuenta: membresía en ${tenant.name} actualizada a ${role.name}.` }, 200, origin);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const brevoKey = Deno.env.get("BREVO_API_KEY");

  // 4. sin API keys → camino clásico vía SMTP de Supabase
  if (!resendKey && !brevoKey) {
    const { error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
      data: { tenant_id: tenant.id, role_name: role.name },
      redirectTo: PORTAL_URL,
    });
    if (inviteErr) return json({ error: `No se pudo invitar: ${inviteErr.message}` }, 500, origin);
    await svc.from("email_log").insert({ provider: "smtp", kind: "invite", recipient: email });
    return json({ ok: true, action: "invited", provider: "smtp", message: `Invitación enviada a ${email} (${tenant.name} · ${role.name}).` }, 200, origin);
  }

  // 5. generar el link sin enviar (lo enviamos nosotros)
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { tenant_id: tenant.id, role_name: role.name },
      redirectTo: PORTAL_URL,
    },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return json({ error: `No se pudo generar la invitación: ${linkErr?.message ?? "sin link"}` }, 500, origin);
  }
  const actionLink = linkData.properties.action_link;
  const html = inviteHtml(actionLink, email);
  const text = inviteText(actionLink);

  // 6. contador del día (UTC) para Resend
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: resendToday } = await svc
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("provider", "resend")
    .gte("sent_at", todayStart.toISOString());

  const underCap = (resendToday ?? 0) < RESEND_DAILY_INVITE_CAP;

  // 7. selección de proveedor + failover
  let provider = "";
  let sendResult: { ok: boolean; status: number; detail: string } | null = null;

  if (resendKey && underCap) {
    provider = "resend";
    sendResult = await sendViaResend(resendKey, email, html, text);
    if (!sendResult.ok && brevoKey) {
      provider = "brevo";
      sendResult = await sendViaBrevo(brevoKey, email, html, text);
    }
  } else if (brevoKey) {
    provider = "brevo";
    sendResult = await sendViaBrevo(brevoKey, email, html, text);
    if (!sendResult.ok && resendKey) {
      provider = "resend";
      sendResult = await sendViaResend(resendKey, email, html, text);
    }
  } else if (resendKey) {
    // solo Resend configurado y sobre el umbral: enviamos igual (mejor que fallar)
    provider = "resend";
    sendResult = await sendViaResend(resendKey, email, html, text);
  }

  if (!sendResult?.ok) {
    return json({ error: `El correo no pudo enviarse (${provider || "sin proveedor"}: ${sendResult?.status ?? "-"}). El usuario quedó creado — reintenta la invitación más tarde.`, detail: sendResult?.detail }, 502, origin);
  }

  await svc.from("email_log").insert({ provider, kind: "invite", recipient: email, detail: `status ${sendResult.status}` });

  const viaMsg = provider === "brevo" ? " (vía canal de respaldo)" : "";
  return json({ ok: true, action: "invited", provider, message: `Invitación enviada a ${email} (${tenant.name} · ${role.name})${viaMsg}.` }, 200, origin);
});
