import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

interface AdminCrmProps {
  session: Session;
}

type TenantKind = "colegio" | "universidad" | "empresa" | "gobierno" | "evento" | "otro";

type DealStage = "lead" | "contactado" | "propuesta" | "negociacion" | "ganado" | "perdido";

interface TenantRow {
  id: string;
  name: string;
  kind: TenantKind | null;
  comuna: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
}

interface DealRow {
  id: string;
  tenant_id: string | null;
  prospect_name: string | null;
  stage: DealStage;
  amount: number | string | null;
  notes: string | null;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface Notice {
  kind: "ok" | "error";
  text: string;
}

const TENANT_KINDS: TenantKind[] = ["colegio", "universidad", "empresa", "gobierno", "evento", "otro"];

const KIND_LABELS: Record<TenantKind, string> = {
  colegio: "Colegio",
  universidad: "Universidad",
  empresa: "Empresa",
  gobierno: "Gobierno",
  evento: "Evento",
  otro: "Otro",
};

const STAGES: DealStage[] = ["lead", "contactado", "propuesta", "negociacion", "ganado", "perdido"];

const STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead",
  contactado: "Contactado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

const STAGE_CLASS: Record<DealStage, string> = {
  lead: "text-white/60",
  contactado: "text-white/60",
  propuesta: "text-gold",
  negociacion: "text-gold",
  ganado: "text-gold font-semibold",
  perdido: "text-coral",
};

const ACTIVE_STAGES: DealStage[] = ["lead", "contactado", "propuesta", "negociacion"];

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40";
const selectClass = `${inputClass} [&>option]:bg-ink`;
const labelClass = "font-mono text-[11px] uppercase tracking-[0.16em] text-white/50";

function one<T extends { name: string }>(value: T | T[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "—";
  return value?.name ?? "—";
}

function friendlyError(error: { code?: string; message: string }, duplicateText: string): string {
  if (error.code === "23505") return duplicateText;
  return error.message;
}

interface AccountFormState {
  kind: TenantKind;
  comuna: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
}

const EMPTY_ACCOUNT_FORM: AccountFormState = {
  kind: "colegio",
  comuna: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  notes: "",
};

export default function AdminCrm({ session }: AdminCrmProps) {
  const access = useMyAccess();

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  // crear cuenta
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<TenantKind>("colegio");
  const [creatingAccount, setCreatingAccount] = useState(false);

  // editar cuenta (panel inline)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);
  const [savingAccount, setSavingAccount] = useState(false);

  // crear oportunidad
  const [dealTenantId, setDealTenantId] = useState("");
  const [dealProspect, setDealProspect] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [creatingDeal, setCreatingDeal] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, d] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, kind, comuna, contact_name, contact_email, contact_phone, notes")
        .order("name"),
      supabase
        .from("deals")
        .select("id, tenant_id, prospect_name, stage, amount, notes, created_at, tenants(name)")
        .order("created_at", { ascending: false }),
    ]);
    setTenants((t.data as TenantRow[]) ?? []);
    setDeals((d.data as DealRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const editingTenant = useMemo(
    () => tenants.find((t) => t.id === editingId) ?? null,
    [tenants, editingId],
  );

  const totals = useMemo(() => {
    let active = 0;
    let won = 0;
    for (const deal of deals) {
      const amount = deal.amount == null ? 0 : Number(deal.amount);
      if (!Number.isFinite(amount)) continue;
      if (ACTIVE_STAGES.includes(deal.stage)) active += amount;
      if (deal.stage === "ganado") won += amount;
    }
    return { active, won };
  }, [deals]);

  const dealsByStage = useMemo(() => {
    const map = new Map<DealStage, DealRow[]>(STAGES.map((s) => [s, []]));
    for (const deal of deals) {
      map.get(deal.stage)?.push(deal);
    }
    return map;
  }, [deals]);

  const startEdit = (tenant: TenantRow) => {
    setEditingId(tenant.id);
    setEditForm({
      kind: tenant.kind ?? "otro",
      comuna: tenant.comuna ?? "",
      contact_name: tenant.contact_name ?? "",
      contact_email: tenant.contact_email ?? "",
      contact_phone: tenant.contact_phone ?? "",
      notes: tenant.notes ?? "",
    });
    setNotice(null);
  };

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreatingAccount(true);
    setNotice(null);
    const { error } = await supabase
      .from("tenants")
      .insert({ name: newName.trim(), kind: newKind });
    if (error) {
      setNotice({
        kind: "error",
        text: friendlyError(error, "Ya existe una cuenta con ese nombre."),
      });
    } else {
      setNotice({ kind: "ok", text: `Cuenta "${newName.trim()}" creada.` });
      setNewName("");
      setNewKind("colegio");
      await refresh();
    }
    setCreatingAccount(false);
  };

  const handleSaveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    setSavingAccount(true);
    setNotice(null);
    const { error } = await supabase
      .from("tenants")
      .update({
        kind: editForm.kind,
        comuna: editForm.comuna.trim() || null,
        contact_name: editForm.contact_name.trim() || null,
        contact_email: editForm.contact_email.trim() || null,
        contact_phone: editForm.contact_phone.trim() || null,
        notes: editForm.notes.trim() || null,
      })
      .eq("id", editingId);
    if (error) {
      setNotice({
        kind: "error",
        text: friendlyError(error, "Ya existe una cuenta con esos datos."),
      });
    } else {
      setNotice({ kind: "ok", text: "Cuenta actualizada." });
      setEditingId(null);
      await refresh();
    }
    setSavingAccount(false);
  };

  const handleCreateDeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const prospect = dealProspect.trim();
    if (!dealTenantId && !prospect) {
      setNotice({
        kind: "error",
        text: "Selecciona una cuenta existente o escribe el nombre de un prospecto.",
      });
      return;
    }

    let amount: number | null = null;
    if (dealAmount.trim()) {
      const parsed = Number(dealAmount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setNotice({ kind: "error", text: "El monto estimado debe ser un número válido." });
        return;
      }
      amount = parsed;
    }

    setCreatingDeal(true);
    const { error } = await supabase.from("deals").insert({
      tenant_id: dealTenantId || null,
      prospect_name: dealTenantId ? null : prospect,
      stage: "lead",
      amount,
      notes: dealNotes.trim() || null,
      owner_id: session.user.id,
    });
    if (error) {
      setNotice({
        kind: "error",
        text: friendlyError(error, "Ya existe una oportunidad con esos datos."),
      });
    } else {
      setNotice({ kind: "ok", text: "Oportunidad creada en etapa Lead." });
      setDealTenantId("");
      setDealProspect("");
      setDealAmount("");
      setDealNotes("");
      await refresh();
    }
    setCreatingDeal(false);
  };

  const handleStageChange = async (deal: DealRow, stage: DealStage) => {
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage } : d)));
    const { error } = await supabase.from("deals").update({ stage }).eq("id", deal.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo actualizar la etapa: ${error.message}` });
      await refresh();
    }
  };

  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="CRM">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="CRM · Cuentas y ventas">
      <div className="space-y-6">
        {notice && (
          <p
            role="status"
            className={`text-sm leading-relaxed ${notice.kind === "error" ? "text-coral" : "text-gold"}`}
          >
            {notice.text}
          </p>
        )}

        {/* ── Cuentas ── */}
        <div className="glass p-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg uppercase text-white">Cuentas</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
              {tenants.length} cuenta{tenants.length === 1 ? "" : "s"}
            </span>
          </div>

          <form onSubmit={handleCreateAccount} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="block min-w-[220px] flex-1">
              <span className={labelClass}>Nueva cuenta</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Colegio San Ejemplo"
                className={inputClass}
              />
            </label>
            <label className="block w-44">
              <span className={labelClass}>Tipo</span>
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as TenantKind)}
                className={selectClass}
              >
                {TENANT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={creatingAccount || !newName.trim()}
              className="rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingAccount ? "Creando…" : "Crear cuenta"}
            </button>
          </form>

          {loading ? (
            <p className="mt-6 text-sm text-white/50">Cargando…</p>
          ) : tenants.length === 0 ? (
            <p className="mt-6 text-sm text-white/50">Aún no hay cuentas.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    <th className="pb-3 pr-4 font-medium">Nombre</th>
                    <th className="pb-3 pr-4 font-medium">Tipo</th>
                    <th className="pb-3 pr-4 font-medium">Comuna</th>
                    <th className="pb-3 pr-4 font-medium">Contacto</th>
                    <th className="pb-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white">{tenant.name}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70">
                          {tenant.kind ? KIND_LABELS[tenant.kind] : "—"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-white/80">{tenant.comuna ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <div className="text-white">{tenant.contact_name ?? "—"}</div>
                        {(tenant.contact_email || tenant.contact_phone) && (
                          <div className="text-xs text-white/50">
                            {[tenant.contact_email, tenant.contact_phone]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            editingId === tenant.id ? setEditingId(null) : startEdit(tenant)
                          }
                          className="rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold"
                        >
                          {editingId === tenant.id ? "Cerrar" : "Editar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingTenant && (
            <form
              onSubmit={handleSaveAccount}
              className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                Editar · {editingTenant.name}
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className={labelClass}>Tipo</span>
                  <select
                    value={editForm.kind}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, kind: e.target.value as TenantKind }))
                    }
                    className={selectClass}
                  >
                    {TENANT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Comuna</span>
                  <input
                    value={editForm.comuna}
                    onChange={(e) => setEditForm((f) => ({ ...f, comuna: e.target.value }))}
                    placeholder="Providencia"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Nombre de contacto</span>
                  <input
                    value={editForm.contact_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, contact_name: e.target.value }))}
                    placeholder="María Pérez"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Email de contacto</span>
                  <input
                    type="email"
                    value={editForm.contact_email}
                    onChange={(e) => setEditForm((f) => ({ ...f, contact_email: e.target.value }))}
                    placeholder="contacto@institucion.cl"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Teléfono de contacto</span>
                  <input
                    value={editForm.contact_phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, contact_phone: e.target.value }))}
                    placeholder="+56 9 1234 5678"
                    className={inputClass}
                  />
                </label>
                <label className="block sm:col-span-2 lg:col-span-3">
                  <span className={labelClass}>Notas</span>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Contexto comercial, acuerdos, próximos pasos…"
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAccount ? "Guardando…" : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ── Nueva oportunidad ── */}
        <div className="glass p-7">
          <h2 className="font-display text-lg uppercase text-white">Nueva oportunidad</h2>
          <p className="mt-2 text-sm text-white/60">
            Asóciala a una cuenta existente o anota un prospecto nuevo. Entra al pipeline en etapa
            Lead.
          </p>
          <form onSubmit={handleCreateDeal} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={labelClass}>Cuenta existente</span>
              <select
                value={dealTenantId}
                onChange={(e) => {
                  setDealTenantId(e.target.value);
                  if (e.target.value) setDealProspect("");
                }}
                className={selectClass}
              >
                <option value="">— Sin cuenta —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>O prospecto nuevo</span>
              <input
                value={dealProspect}
                onChange={(e) => setDealProspect(e.target.value)}
                disabled={!!dealTenantId}
                placeholder="Municipalidad de Ñuñoa"
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Monto estimado (CLP)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={dealAmount}
                onChange={(e) => setDealAmount(e.target.value)}
                placeholder="2500000"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Notas</span>
              <input
                value={dealNotes}
                onChange={(e) => setDealNotes(e.target.value)}
                placeholder="Referido, licitación, contacto en feria…"
                className={inputClass}
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={creatingDeal}
                className="rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingDeal ? "Creando…" : "Crear oportunidad"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Pipeline ── */}
        <div className="glass p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-lg uppercase text-white">Pipeline</h2>
            <div className="flex flex-wrap gap-6">
              <div>
                <span className={labelClass}>Pipeline activo</span>
                <div className="mt-1 text-lg text-white">{clp.format(totals.active)}</div>
              </div>
              <div>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                  Ganado
                </span>
                <div className="mt-1 text-lg font-semibold text-gold">{clp.format(totals.won)}</div>
              </div>
            </div>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-white/50">Cargando…</p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {STAGES.map((stage) => {
                const stageDeals = dealsByStage.get(stage) ?? [];
                return (
                  <div key={stage} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                      <span
                        className={`font-mono text-[11px] uppercase tracking-[0.16em] ${STAGE_CLASS[stage]}`}
                      >
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="font-mono text-[10px] text-white/40">
                        {stageDeals.length}
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {stageDeals.length === 0 ? (
                        <p className="text-xs text-white/30">—</p>
                      ) : (
                        stageDeals.map((deal) => (
                          <div
                            key={deal.id}
                            className="rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="truncate text-sm text-white">
                              {deal.tenant_id ? one(deal.tenants) : deal.prospect_name ?? "—"}
                            </div>
                            <div className={`mt-1 text-xs ${STAGE_CLASS[deal.stage]}`}>
                              {deal.amount != null ? clp.format(Number(deal.amount)) : "Sin monto"}
                            </div>
                            {deal.notes && (
                              <p className="mt-1 line-clamp-2 text-xs text-white/50">
                                {deal.notes}
                              </p>
                            )}
                            <select
                              value={deal.stage}
                              onChange={(e) =>
                                handleStageChange(deal, e.target.value as DealStage)
                              }
                              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink"
                              aria-label="Cambiar etapa"
                            >
                              {STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {STAGE_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <Link
                              to={`/admin/cotizaciones?deal=${deal.id}`}
                              className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 transition hover:text-gold"
                            >
                              Cotizar →
                            </Link>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
