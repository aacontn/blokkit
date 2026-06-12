import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, useParams } from "react-router-dom";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

interface AdminDealDetailProps {
  session: Session;
}

type DealStage = "lead" | "contactado" | "propuesta" | "negociacion" | "ganado" | "perdido";

type ActivityKind = "llamada" | "reunion" | "correo" | "whatsapp" | "nota";

type QuoteStatus = "borrador" | "enviada" | "aceptada" | "rechazada" | "vencida";

interface TenantEmbed {
  name: string;
  kind: string | null;
  comuna: string | null;
  is_customer: boolean;
}

interface DealRow {
  id: string;
  tenant_id: string | null;
  prospect_name: string | null;
  stage: DealStage;
  amount: number | string | null;
  source: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  expected_close_date: string | null;
  created_at: string;
  tenants: TenantEmbed | TenantEmbed[] | null;
}

interface ActivityRow {
  id: string;
  kind: ActivityKind;
  body: string;
  next_step: string | null;
  next_step_date: string | null;
  created_by: string | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  name: string;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}

interface StageHistoryRow {
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_at: string;
}

interface QuoteRow {
  id: string;
  quote_number: number;
  net_total: number | string;
  status: QuoteStatus;
  created_at: string;
}

interface Notice {
  kind: "ok" | "error";
  text: string;
}

const STAGES: DealStage[] = ["lead", "contactado", "propuesta", "negociacion", "ganado", "perdido"];

const STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead",
  contactado: "Contactado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

const STAGE_BADGE: Record<DealStage, string> = {
  lead: "border border-white/15 text-white/60",
  contactado: "border border-white/15 text-white/60",
  propuesta: "border border-gold/40 text-gold",
  negociacion: "border border-gold/40 text-gold",
  ganado: "bg-gold/15 text-gold",
  perdido: "bg-coral/15 text-coral",
};

const ACTIVITY_KINDS: ActivityKind[] = ["llamada", "reunion", "correo", "whatsapp", "nota"];

const KIND_LABELS: Record<ActivityKind, string> = {
  llamada: "Llamada",
  reunion: "Reunión",
  correo: "Correo",
  whatsapp: "WhatsApp",
  nota: "Nota",
};

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
};

const QUOTE_STATUS_CLASS: Record<QuoteStatus, string> = {
  borrador: "text-white/60",
  enviada: "text-gold",
  aceptada: "text-gold font-semibold",
  rechazada: "text-coral",
  vencida: "text-coral",
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40";
const selectClass = `${inputClass} [&>option]:bg-ink`;
const labelClass = "font-mono text-[11px] uppercase tracking-[0.16em] text-white/50";

/** Los embeds de PostgREST llegan como objeto o array según la FK. */
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function stageLabel(stage: string | null): string {
  if (!stage) return "—";
  return (STAGE_LABELS as Record<string, string>)[stage] ?? stage;
}

/** Fecha-solo (YYYY-MM-DD) parseada en horario local, sin sorpresas de UTC. */
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDateOnly(value: string): string {
  return parseDateOnly(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isPastDate(value: string): boolean {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return parseDateOnly(value).getTime() < todayStart.getTime();
}

/** Fecha relativa simple: hoy / ayer / fecha es-CL. */
function relativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminDealDetail({ session }: AdminDealDetailProps) {
  const { id } = useParams();
  const access = useMyAccess();

  const [deal, setDeal] = useState<DealRow | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [history, setHistory] = useState<StageHistoryRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  // cabecera editable
  const [amountInput, setAmountInput] = useState("");
  const [savingAmount, setSavingAmount] = useState(false);
  const [closeDate, setCloseDate] = useState("");
  const [dealContact, setDealContact] = useState({ name: "", email: "", phone: "" });
  const [savingContact, setSavingContact] = useState(false);

  // nueva actividad
  const [actKind, setActKind] = useState<ActivityKind>("llamada");
  const [actBody, setActBody] = useState("");
  const [actNextStep, setActNextStep] = useState("");
  const [actNextStepDate, setActNextStepDate] = useState("");
  const [addingActivity, setAddingActivity] = useState(false);

  // nuevo contacto de la cuenta
  const [newContactName, setNewContactName] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactPrimary, setNewContactPrimary] = useState(false);
  const [addingContact, setAddingContact] = useState(false);

  const loadActivities = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("deal_activities")
      .select("id, kind, body, next_step, next_step_date, created_by, created_at")
      .eq("deal_id", id)
      .order("created_at", { ascending: false });
    const rows = (data as ActivityRow[]) ?? [];
    setActivities(rows);

    const authorIds = Array.from(
      new Set(rows.map((a) => a.created_by).filter((v): v is string => !!v))
    );
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      const map: Record<string, string> = {};
      for (const p of (profs as { id: string; full_name: string | null; email: string | null }[]) ??
        []) {
        const label = p.full_name ?? p.email;
        if (label) map[p.id] = label;
      }
      setAuthors(map);
    }
  }, [id]);

  const loadContacts = useCallback(async (tenantId: string) => {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, role_title, email, phone, is_primary")
      .eq("tenant_id", tenantId)
      .order("is_primary", { ascending: false })
      .order("name");
    setContacts((data as ContactRow[]) ?? []);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("deal_stage_history")
      .select("id, from_stage, to_stage, changed_at")
      .eq("deal_id", id)
      .order("changed_at", { ascending: false });
    setHistory((data as StageHistoryRow[]) ?? []);
  }, [id]);

  const loadQuotes = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("quotes")
      .select("id, quote_number, net_total, status, created_at")
      .eq("deal_id", id)
      .order("quote_number", { ascending: false });
    setQuotes((data as QuoteRow[]) ?? []);
  }, [id]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("deals")
        .select(
          "id, tenant_id, prospect_name, stage, amount, source, contact_name, contact_email, contact_phone, expected_close_date, created_at, tenants(name, kind, comuna, is_customer)"
        )
        .eq("id", id)
        .maybeSingle();

      if (!mounted) return;

      const row = (data as DealRow | null) ?? null;
      setDeal(row);
      if (row) {
        setAmountInput(row.amount == null ? "" : String(Number(row.amount)));
        setCloseDate(row.expected_close_date ?? "");
        setDealContact({
          name: row.contact_name ?? "",
          email: row.contact_email ?? "",
          phone: row.contact_phone ?? "",
        });
        await Promise.all([
          loadActivities(),
          loadHistory(),
          loadQuotes(),
          row.tenant_id ? loadContacts(row.tenant_id) : Promise.resolve(),
        ]);
      }
      if (mounted) setLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [id, loadActivities, loadContacts, loadHistory, loadQuotes]);

  const tenant = useMemo(() => (deal ? one(deal.tenants) : null), [deal]);

  const dealName = tenant?.name ?? deal?.prospect_name ?? "Sin nombre";

  // anti-deals-fríos: ¿hay algún próximo paso agendado hoy o a futuro?
  const hasUpcomingNextStep = useMemo(
    () => activities.some((a) => a.next_step && a.next_step_date && !isPastDate(a.next_step_date)),
    [activities]
  );

  const isOpenStage = deal != null && deal.stage !== "ganado" && deal.stage !== "perdido";

  const handleStageChange = async (stage: DealStage) => {
    if (!deal) return;
    const previous = deal.stage;
    setDeal({ ...deal, stage });
    setNotice(null);
    const { error } = await supabase.from("deals").update({ stage }).eq("id", deal.id);
    if (error) {
      setDeal((d) => (d ? { ...d, stage: previous } : d));
      setNotice({ kind: "error", text: `No se pudo actualizar la etapa: ${error.message}` });
    } else {
      setNotice({ kind: "ok", text: `Etapa actualizada a ${STAGE_LABELS[stage]}.` });
      await loadHistory();
    }
  };

  const handleSaveAmount = async () => {
    if (!deal) return;
    let amount: number | null = null;
    if (amountInput.trim()) {
      const parsed = Number(amountInput);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setNotice({ kind: "error", text: "El monto estimado debe ser un número válido." });
        return;
      }
      amount = parsed;
    }
    setSavingAmount(true);
    setNotice(null);
    const { error } = await supabase.from("deals").update({ amount }).eq("id", deal.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo guardar el monto: ${error.message}` });
    } else {
      setDeal({ ...deal, amount });
      setNotice({ kind: "ok", text: "Monto estimado actualizado." });
    }
    setSavingAmount(false);
  };

  const handleCloseDateChange = async (value: string) => {
    setCloseDate(value);
    if (!deal) return;
    const { error } = await supabase
      .from("deals")
      .update({ expected_close_date: value || null })
      .eq("id", deal.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo guardar la fecha: ${error.message}` });
    } else {
      setDeal({ ...deal, expected_close_date: value || null });
    }
  };

  const handleSaveDealContact = async () => {
    if (!deal) return;
    setSavingContact(true);
    setNotice(null);
    const payload = {
      contact_name: dealContact.name.trim() || null,
      contact_email: dealContact.email.trim() || null,
      contact_phone: dealContact.phone.trim() || null,
    };
    const { error } = await supabase.from("deals").update(payload).eq("id", deal.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo guardar el contacto: ${error.message}` });
    } else {
      setDeal({ ...deal, ...payload });
      setNotice({ kind: "ok", text: "Contacto del deal actualizado." });
    }
    setSavingContact(false);
  };

  const handleAddActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deal || !actBody.trim()) return;
    setAddingActivity(true);
    setNotice(null);
    const { error } = await supabase.from("deal_activities").insert({
      deal_id: deal.id,
      kind: actKind,
      body: actBody.trim(),
      next_step: actNextStep.trim() || null,
      next_step_date: actNextStepDate || null,
      created_by: session.user.id,
    });
    if (error) {
      setNotice({ kind: "error", text: `No se pudo registrar la actividad: ${error.message}` });
    } else {
      setActBody("");
      setActNextStep("");
      setActNextStepDate("");
      setNotice({ kind: "ok", text: "Actividad registrada." });
      await loadActivities();
    }
    setAddingActivity(false);
  };

  const handleAddContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deal?.tenant_id || !newContactName.trim()) return;
    setAddingContact(true);
    setNotice(null);

    // si el nuevo es principal, primero des-marcamos al resto de la cuenta
    if (newContactPrimary) {
      const { error: clearError } = await supabase
        .from("contacts")
        .update({ is_primary: false })
        .eq("tenant_id", deal.tenant_id);
      if (clearError) {
        setNotice({
          kind: "error",
          text: `No se pudo actualizar el contacto principal: ${clearError.message}`,
        });
        setAddingContact(false);
        return;
      }
    }

    const { error } = await supabase.from("contacts").insert({
      tenant_id: deal.tenant_id,
      name: newContactName.trim(),
      role_title: newContactRole.trim() || null,
      email: newContactEmail.trim() || null,
      phone: newContactPhone.trim() || null,
      is_primary: newContactPrimary,
    });
    if (error) {
      setNotice({ kind: "error", text: `No se pudo agregar el contacto: ${error.message}` });
    } else {
      setNewContactName("");
      setNewContactRole("");
      setNewContactEmail("");
      setNewContactPhone("");
      setNewContactPrimary(false);
      setNotice({ kind: "ok", text: "Contacto agregado." });
      await loadContacts(deal.tenant_id);
    }
    setAddingContact(false);
  };

  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="Oportunidad">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Oportunidad">
      {loading ? (
        <p className="text-sm text-white/50">Cargando…</p>
      ) : !deal ? (
        <div className="glass max-w-xl p-8">
          <h2 className="font-display text-lg uppercase text-white">Oportunidad no encontrada</h2>
          <p className="mt-2 text-sm text-white/60">
            No existe o no tienes permisos para verla.
          </p>
          <Link
            to="/admin/crm"
            className="mt-5 inline-block rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold"
          >
            ← Volver al CRM
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Cabecera ── */}
          <div className="glass p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link
                to="/admin/crm"
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50 transition hover:text-gold"
              >
                ← Volver al CRM
              </Link>
              <Link
                to={`/admin/cotizaciones?deal=${deal.id}`}
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 transition hover:text-gold"
              >
                Cotizar →
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl uppercase text-white">{dealName}</h1>
              <span
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${STAGE_BADGE[deal.stage]}`}
              >
                {STAGE_LABELS[deal.stage]}
              </span>
              {deal.source && (
                <span
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    deal.source === "web"
                      ? "border-gold/40 text-gold"
                      : "border-white/15 text-white/60"
                  }`}
                >
                  {deal.source}
                </span>
              )}
              {tenant && (
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    tenant.is_customer
                      ? "bg-gold/15 text-gold"
                      : "border border-white/15 text-white/45"
                  }`}
                >
                  {tenant.is_customer ? "Cliente" : "Prospecto"}
                </span>
              )}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
              Creada {relativeDate(deal.created_at)}
              {tenant?.comuna ? ` · ${tenant.comuna}` : ""}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className={labelClass}>Monto estimado (CLP)</span>
                <div className="flex items-end gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="2500000"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={handleSaveAmount}
                    disabled={savingAmount}
                    className="shrink-0 rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingAmount ? "…" : "Guardar"}
                  </button>
                </div>
                <span className="mt-1 block font-mono text-[10px] text-white/40">
                  {deal.amount != null ? clp.format(Number(deal.amount)) : "Sin monto"}
                </span>
              </label>

              <label className="block">
                <span className={labelClass}>Cierre estimado</span>
                <input
                  type="date"
                  value={closeDate}
                  onChange={(e) => handleCloseDateChange(e.target.value)}
                  className={`${inputClass} [color-scheme:dark]`}
                />
              </label>

              <label className="block">
                <span className={labelClass}>Etapa</span>
                <select
                  value={deal.stage}
                  onChange={(e) => handleStageChange(e.target.value as DealStage)}
                  className={selectClass}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!deal.tenant_id && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <span className={labelClass}>Contacto del prospecto</span>
                <div className="mt-1 grid gap-4 sm:grid-cols-3">
                  <input
                    value={dealContact.name}
                    onChange={(e) => setDealContact((c) => ({ ...c, name: e.target.value }))}
                    placeholder="Nombre"
                    className={inputClass}
                  />
                  <input
                    type="email"
                    value={dealContact.email}
                    onChange={(e) => setDealContact((c) => ({ ...c, email: e.target.value }))}
                    placeholder="correo@institucion.cl"
                    className={inputClass}
                  />
                  <input
                    value={dealContact.phone}
                    onChange={(e) => setDealContact((c) => ({ ...c, phone: e.target.value }))}
                    placeholder="+56 9 1234 5678"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveDealContact}
                  disabled={savingContact}
                  className="mt-4 rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingContact ? "Guardando…" : "Guardar contacto"}
                </button>
              </div>
            )}
          </div>

          {notice && (
            <p
              role="status"
              className={`text-sm leading-relaxed ${notice.kind === "error" ? "text-coral" : "text-gold"}`}
            >
              {notice.text}
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            {/* ── Actividades ── */}
            <div className="glass p-7">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg uppercase text-white">Actividades</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                  {activities.length} registro{activities.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* aviso anti-deals-fríos: solo para deals abiertos */}
              {isOpenStage && !hasUpcomingNextStep && (
                <div className="mt-4 rounded-xl border border-coral/40 bg-coral/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-coral">
                  Sin próximo paso agendado
                </div>
              )}

              <form onSubmit={handleAddActivity} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <label className="block">
                    <span className={labelClass}>Tipo</span>
                    <select
                      value={actKind}
                      onChange={(e) => setActKind(e.target.value as ActivityKind)}
                      className={selectClass}
                    >
                      {ACTIVITY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>¿Qué pasó?</span>
                    <textarea
                      required
                      rows={2}
                      value={actBody}
                      onChange={(e) => setActBody(e.target.value)}
                      placeholder="Llamé al sostenedor, pidió propuesta para 300 fundas…"
                      className={inputClass}
                    />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
                  <label className="block">
                    <span className={labelClass}>Próximo paso (opcional)</span>
                    <input
                      value={actNextStep}
                      onChange={(e) => setActNextStep(e.target.value)}
                      placeholder="Enviar cotización, llamar de vuelta…"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Fecha próximo paso</span>
                    <input
                      type="date"
                      value={actNextStepDate}
                      onChange={(e) => setActNextStepDate(e.target.value)}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={addingActivity || !actBody.trim()}
                      className="rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {addingActivity ? "Registrando…" : "Registrar"}
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-6 space-y-3">
                {activities.length === 0 ? (
                  <p className="text-sm text-white/50">
                    Aún no hay actividades. Registra la primera interacción.
                  </p>
                ) : (
                  activities.map((a) => {
                    const author =
                      a.created_by === session.user.id
                        ? "Tú"
                        : a.created_by
                          ? authors[a.created_by] ?? null
                          : null;
                    const overdue = a.next_step_date ? isPastDate(a.next_step_date) : false;
                    return (
                      <div key={a.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                            [{KIND_LABELS[a.kind]?.toUpperCase() ?? a.kind.toUpperCase()}]
                          </span>
                          <span className="font-mono text-[10px] text-white/40">
                            {relativeDate(a.created_at)}
                          </span>
                          {author && (
                            <span className="font-mono text-[10px] text-white/40">· {author}</span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/80">
                          {a.body}
                        </p>
                        {a.next_step && (
                          <span
                            className={`mt-3 inline-flex rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                              overdue ? "bg-coral/15 text-coral" : "bg-gold/15 text-gold"
                            }`}
                          >
                            Próximo: {a.next_step}
                            {a.next_step_date ? ` · ${formatDateOnly(a.next_step_date)}` : ""}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-6">
              {/* ── Contactos de la cuenta ── */}
              {deal.tenant_id && (
                <div className="glass p-7">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-lg uppercase text-white">Contactos</h2>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                      {tenant?.name ?? ""}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {contacts.length === 0 ? (
                      <p className="text-sm text-white/50">Aún no hay contactos en esta cuenta.</p>
                    ) : (
                      contacts.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-white">{c.name}</span>
                            {c.is_primary && (
                              <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-gold">
                                Principal
                              </span>
                            )}
                          </div>
                          {c.role_title && (
                            <div className="mt-1 text-xs text-white/60">{c.role_title}</div>
                          )}
                          {(c.email || c.phone) && (
                            <div className="mt-1 text-xs text-white/50">
                              {[c.email, c.phone].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <form
                    onSubmit={handleAddContact}
                    className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5"
                  >
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                      Agregar contacto
                    </h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>Nombre</span>
                        <input
                          required
                          value={newContactName}
                          onChange={(e) => setNewContactName(e.target.value)}
                          placeholder="María Pérez"
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Cargo</span>
                        <input
                          value={newContactRole}
                          onChange={(e) => setNewContactRole(e.target.value)}
                          placeholder="Directora"
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Email</span>
                        <input
                          type="email"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          placeholder="contacto@institucion.cl"
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Teléfono</span>
                        <input
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                          placeholder="+56 9 1234 5678"
                          className={inputClass}
                        />
                      </label>
                    </div>
                    <label className="mt-4 flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={newContactPrimary}
                        onChange={(e) => setNewContactPrimary(e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#7FCEEC]"
                      />
                      <span className="text-sm text-white/80">Contacto principal</span>
                    </label>
                    <button
                      type="submit"
                      disabled={addingContact || !newContactName.trim()}
                      className="mt-5 rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {addingContact ? "Agregando…" : "Agregar"}
                    </button>
                  </form>
                </div>
              )}

              {/* ── Cotizaciones del deal ── */}
              <div className="glass p-7">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-lg uppercase text-white">Cotizaciones</h2>
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                    {quotes.length}
                  </span>
                </div>
                <div className="mt-4">
                  {quotes.length === 0 ? (
                    <p className="text-sm text-white/50">Aún no hay cotizaciones.</p>
                  ) : (
                    quotes.map((q) => (
                      <div
                        key={q.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-3 last:border-0"
                      >
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-sm text-white">BK{q.quote_number}</span>
                          <span className="text-sm text-white/80">
                            {clp.format(Number(q.net_total))}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`font-mono text-[10px] uppercase tracking-[0.12em] ${QUOTE_STATUS_CLASS[q.status]}`}
                          >
                            {QUOTE_STATUS_LABELS[q.status]}
                          </span>
                          <span className="font-mono text-[10px] text-white/40">
                            {new Date(q.created_at).toLocaleDateString("es-CL", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Link
                  to={`/admin/cotizaciones?deal=${deal.id}`}
                  className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 transition hover:text-gold"
                >
                  Ver en Cotizaciones →
                </Link>
              </div>

              {/* ── Historial de etapas ── */}
              <div className="glass p-7">
                <h2 className="font-display text-lg uppercase text-white">Historial de etapas</h2>
                <div className="mt-4">
                  {history.length === 0 ? (
                    <p className="text-sm text-white/50">Sin movimientos aún.</p>
                  ) : (
                    history.map((h) => (
                      <div
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-3 last:border-0"
                      >
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/70">
                          {stageLabel(h.from_stage)} → {stageLabel(h.to_stage)}
                        </span>
                        <span className="font-mono text-[10px] text-white/40">
                          {new Date(h.changed_at).toLocaleDateString("es-CL", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
