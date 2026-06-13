import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

type ImplStatus = "kickoff" | "piloto" | "capacitacion" | "golive" | "operando" | "pausado";

type Filter = "todas" | "activas" | "operando";

interface Tenant {
  id: string;
  name: string;
}

interface ImplementationRow {
  id: string;
  tenant_id: string;
  order_id: string | null;
  status: ImplStatus;
  start_date: string | null;
  golive_date: string | null;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface MilestoneRow {
  id: string;
  implementation_id: string;
  title: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  sort: number;
}

interface Notice {
  kind: "ok" | "error";
  text: string;
}

const STATUSES: ImplStatus[] = ["kickoff", "piloto", "capacitacion", "golive", "operando", "pausado"];

const STATUS_LABELS: Record<ImplStatus, string> = {
  kickoff: "Kickoff",
  piloto: "Piloto",
  capacitacion: "Capacitación",
  golive: "Go-live",
  operando: "Operando",
  pausado: "Pausado",
};

const STATUS_BADGE: Record<ImplStatus, string> = {
  kickoff: "border border-white/15 text-white/70",
  piloto: "border border-white/15 text-white/70",
  capacitacion: "border border-white/15 text-white/70",
  golive: "border border-gold/40 text-gold",
  operando: "bg-gold/15 font-semibold text-gold",
  pausado: "bg-coral/15 text-coral",
};

const DEFAULT_MILESTONES = [
  "Reunión de kickoff con dirección",
  "Registro de fundas e inventario",
  "Carga de cursos y alumnos",
  "Invitación de usuarios del colegio",
  "Capacitación a docentes",
  "Piloto en curso seleccionado",
  "Go-live colegio completo",
];

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40";
const selectClass = `${inputClass} [&>option]:bg-ink`;
const labelClass = "font-mono text-[11px] uppercase tracking-[0.16em] text-white/50";
const primaryBtnClass =
  "rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtnClass =
  "rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50";
const dateInputClass =
  "rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white [color-scheme:dark] focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40";

function one<T extends { name: string }>(value: T | T[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "—";
  return value?.name ?? "—";
}

/** Fecha local del navegador como YYYY-MM-DD. */
function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isActiveStatus(status: ImplStatus): boolean {
  return status !== "operando" && status !== "pausado";
}

export default function AdminImplementations({ session }: { session: Session }) {
  const access = useMyAccess();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [implementations, setImplementations] = useState<ImplementationRow[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");

  // crear implementación
  const [newTenantId, setNewTenantId] = useState("");
  const [newStartDate, setNewStartDate] = useState(todayLocal());
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // hito custom por implementación
  const [newMilestone, setNewMilestone] = useState<Record<string, string>>({});
  const [addingMilestone, setAddingMilestone] = useState<string | null>(null);

  // notas por implementación
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  const loadMilestones = useCallback(async () => {
    const { data } = await supabase
      .from("implementation_milestones")
      .select("id, implementation_id, title, due_date, done, done_at, sort")
      .order("sort");
    setMilestones((data as MilestoneRow[]) ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, i] = await Promise.all([
      supabase.from("tenants").select("id, name").eq("is_customer", true).order("name"),
      supabase
        .from("implementations")
        .select(
          "id, tenant_id, order_id, status, start_date, golive_date, owner_id, notes, created_at, tenants(name)"
        )
        .order("created_at", { ascending: false }),
      loadMilestones(),
    ]);
    setTenants((t.data as Tenant[]) ?? []);
    setImplementations((i.data as ImplementationRow[]) ?? []);
    setLoading(false);
  }, [loadMilestones]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const milestonesByImpl = useMemo(() => {
    const map = new Map<string, MilestoneRow[]>();
    for (const m of milestones) {
      const group = map.get(m.implementation_id);
      if (group) group.push(m);
      else map.set(m.implementation_id, [m]);
    }
    return map;
  }, [milestones]);

  const visible = useMemo(() => {
    let list = implementations;
    if (filter === "activas") list = list.filter((i) => isActiveStatus(i.status));
    else if (filter === "operando") list = list.filter((i) => i.status === "operando");
    return [...list].sort((a, b) => {
      const aActive = isActiveStatus(a.status) ? 0 : 1;
      const bActive = isActiveStatus(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [implementations, filter]);

  /* ════ crear ════ */
  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTenantId) return;
    setCreating(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("implementations")
      .insert({
        tenant_id: newTenantId,
        status: "kickoff",
        start_date: newStartDate || null,
        owner_id: session.user.id,
        notes: newNotes.trim() || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setNotice({
        kind: "error",
        text: `No se pudo crear la implementación: ${error?.message ?? "sin respuesta"}`,
      });
      setCreating(false);
      return;
    }

    const { error: milestoneError } = await supabase.from("implementation_milestones").insert(
      DEFAULT_MILESTONES.map((title, index) => ({
        implementation_id: data.id,
        title,
        sort: index,
      }))
    );

    if (milestoneError) {
      setNotice({
        kind: "error",
        text: `Implementación creada, pero falló la creación de hitos: ${milestoneError.message}`,
      });
    } else {
      setNotice({ kind: "ok", text: "Implementación creada con sus hitos iniciales." });
    }
    setNewTenantId("");
    setNewStartDate(todayLocal());
    setNewNotes("");
    await refresh();
    setCreating(false);
  };

  /* ════ implementación: estado, fechas, notas ════ */
  const handleStatusChange = async (impl: ImplementationRow, status: ImplStatus) => {
    setImplementations((prev) => prev.map((i) => (i.id === impl.id ? { ...i, status } : i)));
    const { error } = await supabase.from("implementations").update({ status }).eq("id", impl.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo actualizar el estado: ${error.message}` });
      await refresh();
    }
  };

  const handleDateChange = async (
    impl: ImplementationRow,
    field: "start_date" | "golive_date",
    value: string
  ) => {
    const date = value || null;
    setImplementations((prev) =>
      prev.map((i) => (i.id === impl.id ? { ...i, [field]: date } : i))
    );
    const { error } = await supabase
      .from("implementations")
      .update({ [field]: date })
      .eq("id", impl.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo actualizar la fecha: ${error.message}` });
      await refresh();
    }
  };

  const handleSaveNotes = async (impl: ImplementationRow) => {
    const text = (notesDraft[impl.id] ?? impl.notes ?? "").trim();
    setSavingNotes(impl.id);
    const { error } = await supabase
      .from("implementations")
      .update({ notes: text || null })
      .eq("id", impl.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudieron guardar las notas: ${error.message}` });
    } else {
      setImplementations((prev) =>
        prev.map((i) => (i.id === impl.id ? { ...i, notes: text || null } : i))
      );
      setNotice({ kind: "ok", text: "Notas guardadas." });
    }
    setSavingNotes(null);
  };

  /* ════ hitos ════ */
  const handleToggleMilestone = async (milestone: MilestoneRow) => {
    const done = !milestone.done;
    const done_at = done ? new Date().toISOString() : null;
    setMilestones((prev) =>
      prev.map((m) => (m.id === milestone.id ? { ...m, done, done_at } : m))
    );
    const { error } = await supabase
      .from("implementation_milestones")
      .update({ done, done_at })
      .eq("id", milestone.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo actualizar el hito: ${error.message}` });
      await loadMilestones();
    }
  };

  const handleMilestoneDue = async (milestone: MilestoneRow, value: string) => {
    const due_date = value || null;
    setMilestones((prev) =>
      prev.map((m) => (m.id === milestone.id ? { ...m, due_date } : m))
    );
    const { error } = await supabase
      .from("implementation_milestones")
      .update({ due_date })
      .eq("id", milestone.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo actualizar la fecha del hito: ${error.message}` });
      await loadMilestones();
    }
  };

  const handleAddMilestone = async (implId: string) => {
    const title = (newMilestone[implId] ?? "").trim();
    if (!title) return;
    const group = milestonesByImpl.get(implId) ?? [];
    const sort = group.length > 0 ? Math.max(...group.map((m) => m.sort)) + 1 : 0;
    setAddingMilestone(implId);
    const { error } = await supabase
      .from("implementation_milestones")
      .insert({ implementation_id: implId, title, sort });
    if (error) {
      setNotice({ kind: "error", text: `No se pudo agregar el hito: ${error.message}` });
    } else {
      setNewMilestone((prev) => ({ ...prev, [implId]: "" }));
      await loadMilestones();
    }
    setAddingMilestone(null);
  };

  /* ════ guard ════ */
  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="Implementaciones">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  const today = todayLocal();

  return (
    <AppShell title="Implementaciones">
      <div className="space-y-6">
        {notice && (
          <p
            role="status"
            className={`text-sm leading-relaxed ${notice.kind === "error" ? "text-coral" : "text-gold"}`}
          >
            {notice.text}
          </p>
        )}

        {/* ── crear implementación ── */}
        <div className="glass p-7">
          <h2 className="font-display text-lg uppercase text-white">Nueva implementación</h2>
          <p className="mt-2 text-sm text-white/60">
            Crea el proyecto de puesta en marcha de un colegio. Parte en Kickoff con los hitos
            estándar ya cargados.
          </p>
          <form onSubmit={handleCreate} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={labelClass}>Colegio</span>
              <select
                required
                value={newTenantId}
                onChange={(e) => setNewTenantId(e.target.value)}
                className={selectClass}
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
              <span className={labelClass}>Fecha de inicio</span>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Responsable / notas</span>
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Responsable, acuerdos, contexto…"
                className={inputClass}
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <button type="submit" disabled={creating || !newTenantId} className={primaryBtnClass}>
                {creating ? "Creando…" : "Crear implementación"}
              </button>
            </div>
          </form>
        </div>

        {/* ── filtro ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="block w-56">
            <span className={labelClass}>Mostrar</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className={selectClass}
            >
              <option value="todas">Todas</option>
              <option value="activas">Activas</option>
              <option value="operando">Operando</option>
            </select>
          </label>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
            {visible.length} implementación{visible.length === 1 ? "" : "es"}
          </span>
        </div>

        {/* ── lista ── */}
        {loading ? (
          <p className="text-sm text-white/50">Cargando…</p>
        ) : visible.length === 0 ? (
          <div className="glass max-w-xl p-8">
            <p className="text-sm text-white/60">
              {implementations.length === 0
                ? "Crea la primera implementación cuando cierres un colegio."
                : "No hay implementaciones en este filtro."}
            </p>
          </div>
        ) : (
          visible.map((impl) => {
            const items = milestonesByImpl.get(impl.id) ?? [];
            const doneCount = items.filter((m) => m.done).length;
            const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;
            return (
              <div
                key={impl.id}
                className={`glass p-7 ${impl.status === "operando" ? "border-gold/30" : ""}`}
              >
                {/* cabecera */}
                <div className="flex flex-wrap items-center gap-4">
                  <h2 className="font-display text-lg uppercase text-white">
                    {one(impl.tenants)}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${STATUS_BADGE[impl.status]}`}
                  >
                    {STATUS_LABELS[impl.status]}
                  </span>
                  <select
                    value={impl.status}
                    onChange={(e) => handleStatusChange(impl, e.target.value as ImplStatus)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink"
                    aria-label="Cambiar estado"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                        Inicio
                      </span>
                      <input
                        type="date"
                        value={impl.start_date ?? ""}
                        onChange={(e) => handleDateChange(impl, "start_date", e.target.value)}
                        className={dateInputClass}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                        Go-live
                      </span>
                      <input
                        type="date"
                        value={impl.golive_date ?? ""}
                        onChange={(e) => handleDateChange(impl, "golive_date", e.target.value)}
                        className={dateInputClass}
                      />
                    </label>
                  </div>
                </div>

                {/* progreso */}
                <div className="mt-5 flex items-center gap-4">
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                    {doneCount}/{items.length} hitos
                  </span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gold transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                  {/* hitos */}
                  <div>
                    <h3 className={labelClass}>Hitos</h3>
                    {items.length === 0 ? (
                      <p className="mt-3 text-sm text-white/50">Sin hitos todavía.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {items.map((m) => {
                          const overdue = !m.done && !!m.due_date && m.due_date < today;
                          return (
                            <li
                              key={m.id}
                              className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5"
                            >
                              <input
                                type="checkbox"
                                checked={m.done}
                                onChange={() => handleToggleMilestone(m)}
                                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#7FCEEC]"
                                aria-label={m.title}
                              />
                              <span
                                className={`min-w-0 flex-1 text-sm ${
                                  m.done ? "text-white/40 line-through" : "text-white"
                                }`}
                              >
                                {m.title}
                              </span>
                              <input
                                type="date"
                                value={m.due_date ?? ""}
                                onChange={(e) => handleMilestoneDue(m, e.target.value)}
                                className={`${dateInputClass} ${overdue ? "border-coral/60 text-coral" : ""}`}
                                aria-label="Fecha límite del hito"
                              />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-3">
                      <input
                        value={newMilestone[impl.id] ?? ""}
                        onChange={(e) =>
                          setNewMilestone((prev) => ({ ...prev, [impl.id]: e.target.value }))
                        }
                        placeholder="Nuevo hito…"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddMilestone(impl.id)}
                        disabled={
                          addingMilestone === impl.id || !(newMilestone[impl.id] ?? "").trim()
                        }
                        className={`shrink-0 ${secondaryBtnClass}`}
                      >
                        Agregar
                      </button>
                    </div>
                  </div>

                  {/* notas */}
                  <div>
                    <h3 className={labelClass}>Notas</h3>
                    <textarea
                      value={notesDraft[impl.id] ?? impl.notes ?? ""}
                      onChange={(e) =>
                        setNotesDraft((prev) => ({ ...prev, [impl.id]: e.target.value }))
                      }
                      rows={5}
                      placeholder="Responsable, acuerdos, próximos pasos…"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveNotes(impl)}
                      disabled={savingNotes === impl.id}
                      className={`mt-3 ${secondaryBtnClass}`}
                    >
                      {savingNotes === impl.id ? "Guardando…" : "Guardar notas"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
