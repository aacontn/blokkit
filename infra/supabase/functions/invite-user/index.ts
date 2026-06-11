import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * invite-user — invitación de usuarios del portal BloKKit.
 * Solo SYS_ADMIN / SYS_ADMIN_GENERAL pueden llamarla. La service key
 * vive únicamente aquí (server-side); el browser jamás la ve.
 * Body: { email, tenant_id, role_name }
 * Deployada vía MCP el 2026-06-11 (verify_jwt: true).
 */

const ALLOWED_ORIGINS = new Set([
  "https://app.blokkit.cl",
  "https://blokkit-app.pages.dev",
  "http://localhost:4173",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://app.blokkit.cl";
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

  // 1. identificar al llamador desde su JWT
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Sin autorización" }, 401, origin);

  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "Sesión inválida" }, 401, origin);
  }
  const callerId = userData.user.id;

  // 2. el llamador debe ser admin global de BloKKit
  const { data: callerRoles } = await svc
    .from("memberships")
    .select("active, roles(name)")
    .eq("user_id", callerId)
    .eq("active", true);

  const isSysAdmin = (callerRoles ?? []).some((m: { roles: { name: string } | { name: string }[] | null }) => {
    const r = m.roles;
    const name = Array.isArray(r) ? r[0]?.name : r?.name;
    return name === "SYS_ADMIN" || name === "SYS_ADMIN_GENERAL";
  });
  if (!isSysAdmin) {
    return json({ error: "Solo administradores BloKKit pueden invitar usuarios" }, 403, origin);
  }

  // 3. validar input
  let body: { email?: string; tenant_id?: string; role_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, origin);
  }
  const email = body.email?.trim().toLowerCase();
  const tenantId = body.tenant_id;
  const roleName = body.role_name ?? "CLIENT_USER";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Email inválido" }, 400, origin);
  }
  const { data: tenant } = await svc.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
  if (!tenant) return json({ error: "Colegio/empresa no existe" }, 400, origin);

  const { data: role } = await svc.from("roles").select("id, name").eq("name", roleName).maybeSingle();
  if (!role) return json({ error: "Rol no existe" }, 400, origin);

  // 4. ¿ya existe? → asegurar membresía en ese tenant con ese rol
  const { data: existing } = await svc.from("profiles").select("id").eq("email", email).maybeSingle();

  if (existing) {
    const { error: upsertErr } = await svc.from("memberships").upsert(
      { user_id: existing.id, tenant_id: tenant.id, role_id: role.id, active: true },
      { onConflict: "user_id,tenant_id" }
    );
    if (upsertErr) return json({ error: `No se pudo actualizar la membresía: ${upsertErr.message}` }, 500, origin);
    return json({ ok: true, action: "membership_updated", message: `${email} ya tenía cuenta: membresía en ${tenant.name} actualizada a ${role.name}.` }, 200, origin);
  }

  // 5. invitar — el trigger handle_new_user lee tenant_id/role_name del metadata
  const { error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
    data: { tenant_id: tenant.id, role_name: role.name },
    redirectTo: "https://app.blokkit.cl",
  });
  if (inviteErr) {
    return json({ error: `No se pudo invitar: ${inviteErr.message}` }, 500, origin);
  }

  return json({ ok: true, action: "invited", message: `Invitación enviada a ${email} (${tenant.name} · ${role.name}).` }, 200, origin);
});
