import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

interface AdminUsersProps {
  session: Session;
}

interface Tenant {
  id: string;
  name: string;
}

interface RoleRow {
  name: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

interface MembershipRow {
  id: string;
  user_id: string;
  tenant_id: string;
  active: boolean;
  roles: { name: string } | { name: string }[] | null;
  tenants: { name: string } | { name: string }[] | null;
}

const ROLE_LABELS: Record<string, string> = {
  CLIENT_USER: "Cliente · Usuario",
  CLIENT_ADMIN: "Cliente · Admin",
  INTERNAL_SUPPORT: "BloKKit · Soporte",
  INTERNAL_OPERATIONS: "BloKKit · Operaciones",
  INTERNAL_SALES: "BloKKit · Ventas",
  INTERNAL_ADMIN_ERP: "BloKKit · Admin ERP",
  SYS_ADMIN: "BloKKit · Sys Admin",
  SYS_ADMIN_GENERAL: "BloKKit · Sys Admin General",
};

function one<T extends { name: string }>(value: T | T[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "—";
  return value?.name ?? "—";
}

export default function AdminUsers(_props: AdminUsersProps) {
  const access = useMyAccess();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);

  // invitación
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [roleName, setRoleName] = useState("CLIENT_USER");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // nuevo colegio/empresa
  const [newTenant, setNewTenant] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, r, p, m] = await Promise.all([
      supabase.from("tenants").select("id, name").order("name"),
      supabase.from("roles").select("name").order("name"),
      supabase.from("profiles").select("id, full_name, email, created_at").order("created_at"),
      supabase.from("memberships").select("id, user_id, tenant_id, active, roles(name), tenants(name)"),
    ]);
    setTenants((t.data as Tenant[]) ?? []);
    setRoles((r.data as RoleRow[]) ?? []);
    setProfiles((p.data as ProfileRow[]) ?? []);
    setMemberships((m.data as MembershipRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows = useMemo(() => {
    const byUser = new Map(profiles.map((p) => [p.id, p]));
    return memberships
      .map((m) => ({
        membership: m,
        profile: byUser.get(m.user_id) ?? null,
      }))
      .sort((a, b) => (a.profile?.email ?? "").localeCompare(b.profile?.email ?? ""));
  }, [memberships, profiles]);

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviting(true);
    setNotice(null);

    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: { email, tenant_id: tenantId, role_name: roleName },
    });

    if (error) {
      let message = error.message;
      try {
        const ctx = await (error as { context?: Response }).context?.json();
        if (ctx?.error) message = ctx.error;
      } catch {
        /* sin body json */
      }
      setNotice({ kind: "error", text: message });
    } else {
      setNotice({ kind: "ok", text: data?.message ?? "Invitación enviada." });
      setEmail("");
      await refresh();
    }
    setInviting(false);
  };

  const handleCreateTenant = async () => {
    if (!newTenant.trim()) return;
    setCreatingTenant(true);
    const { error } = await supabase.from("tenants").insert({ name: newTenant.trim() });
    if (error) {
      setNotice({ kind: "error", text: `No se pudo crear: ${error.message}` });
    } else {
      setNotice({ kind: "ok", text: `"${newTenant.trim()}" creado.` });
      setNewTenant("");
      await refresh();
    }
    setCreatingTenant(false);
  };

  const toggleActive = async (m: MembershipRow) => {
    const { error } = await supabase
      .from("memberships")
      .update({ active: !m.active })
      .eq("id", m.id);
    if (!error) await refresh();
  };

  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="Usuarios">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Usuarios y accesos">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ── Invitar ── */}
        <div className="space-y-6">
          <div className="glass p-7">
            <h2 className="font-display text-lg uppercase text-white">Invitar usuario</h2>
            <p className="mt-2 text-sm text-white/60">
              Le llega un correo con su acceso, ya asignado a su colegio/empresa y tipo de usuario.
            </p>

            <form onSubmit={handleInvite} className="mt-5 space-y-4">
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="persona@institucion.cl"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </label>

              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">Colegio / empresa</span>
                <select
                  required
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink"
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">Tipo de usuario</span>
                <select
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink"
                >
                  {roles.map((r) => (
                    <option key={r.name} value={r.name}>
                      {ROLE_LABELS[r.name] ?? r.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                disabled={inviting}
                className="w-full rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
              >
                {inviting ? "Enviando…" : "Enviar invitación"}
              </button>
            </form>
          </div>

          <div className="glass p-7">
            <h2 className="font-display text-lg uppercase text-white">Nuevo colegio / empresa</h2>
            <div className="mt-4 flex gap-3">
              <input
                value={newTenant}
                onChange={(e) => setNewTenant(e.target.value)}
                placeholder="Colegio San Ejemplo"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              <button
                type="button"
                onClick={handleCreateTenant}
                disabled={creatingTenant || !newTenant.trim()}
                className="shrink-0 rounded-full border border-white/20 px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Crear
              </button>
            </div>
          </div>

          {notice && (
            <p
              role="status"
              className={`text-sm leading-relaxed ${notice.kind === "error" ? "text-coral" : "text-gold"}`}
            >
              {notice.text}
            </p>
          )}
        </div>

        {/* ── Listado ── */}
        <div className="glass p-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg uppercase text-white">Accesos</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
              {rows.length} membresía{rows.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-white/50">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="mt-6 text-sm text-white/50">Aún no hay usuarios.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    <th className="pb-3 pr-4 font-medium">Usuario</th>
                    <th className="pb-3 pr-4 font-medium">Colegio / empresa</th>
                    <th className="pb-3 pr-4 font-medium">Tipo</th>
                    <th className="pb-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ membership, profile }) => (
                    <tr key={membership.id} className="border-b border-white/5">
                      <td className="py-3 pr-4">
                        <div className="text-white">{profile?.full_name ?? "—"}</div>
                        <div className="text-xs text-white/50">{profile?.email ?? membership.user_id}</div>
                      </td>
                      <td className="py-3 pr-4 text-white/80">{one(membership.tenants)}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70">
                          {ROLE_LABELS[one(membership.roles)] ?? one(membership.roles)}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(membership)}
                          className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                            membership.active
                              ? "bg-gold/15 text-gold hover:bg-gold/25"
                              : "bg-coral/15 text-coral hover:bg-coral/25"
                          }`}
                          title={membership.active ? "Click para desactivar" : "Click para activar"}
                        >
                          {membership.active ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
