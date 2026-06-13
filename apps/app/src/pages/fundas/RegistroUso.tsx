import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { OPERATE_ROLES, useMyAccess } from "../../lib/access";

/**
 * Registro de uso — quién usó funda cada día, por curso. Doble función:
 * trazabilidad (el diferenciador BloKKit) y toma de asistencia (entregar
 * el teléfono = presente). Selector de fecha para consultar el histórico
 * y exportación a CSV.
 */

interface RegistroUsoProps {
  session: Session;
}

interface Tenant {
  id: string;
  name: string;
}
interface CourseRow {
  id: string;
  name: string;
  year: number;
}
interface StudentRow {
  id: string;
  full_name: string;
  identifier: string | null;
  course_id: string | null;
}
interface AssignmentInfo {
  code: string;
  time: string | null;
}

type Filter = "todos" | "con" | "sin";

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function fmtTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function prettyDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long" });
}

const SIN_CURSO = "__sin_curso__";
const labelClass = "font-mono text-[11px] uppercase tracking-[0.16em] text-white/50";
const chipClass = "rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70";

export default function RegistroUso(_props: RegistroUsoProps) {
  const access = useMyAccess();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);
  const [tenantId, setTenantId] = useState("");

  const [date, setDate] = useState(todayLocal());
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  /** student_id → funda asignada ese día */
  const [byStudent, setByStudent] = useState<Map<string, AssignmentInfo>>(new Map());
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");

  const operativeTenantIds = useMemo(() => {
    if (!access) return [];
    return Array.from(
      new Set(
        access.memberships
          .filter((m) => OPERATE_ROLES.includes(m.role) || m.role.startsWith("INTERNAL_"))
          .map((m) => m.tenantId),
      ),
    );
  }, [access]);

  /* ── tenants ── */
  useEffect(() => {
    if (!access) return;
    let mounted = true;
    const load = async () => {
      let rows: Tenant[] = [];
      if (access.isSysAdmin) {
        const { data } = await supabase
          .from("tenants")
          .select("id, name")
          .eq("is_customer", true)
          .order("name");
        rows = (data as Tenant[]) ?? [];
      } else if (operativeTenantIds.length > 0) {
        const { data } = await supabase
          .from("tenants")
          .select("id, name")
          .in("id", operativeTenantIds)
          .order("name");
        rows = (data as Tenant[]) ?? [];
      }
      if (!mounted) return;
      setTenants(rows);
      setTenantsLoaded(true);
      if (rows.length === 1) setTenantId(rows[0].id);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [access, operativeTenantIds]);

  /* ── datos del tenant + fecha ── */
  const load = useCallback(async (tid: string, day: string) => {
    setLoading(true);
    const [c, s, a] = await Promise.all([
      supabase
        .from("courses")
        .select("id, name, year")
        .eq("tenant_id", tid)
        .eq("active", true)
        .order("year", { ascending: false })
        .order("name"),
      supabase
        .from("students")
        .select("id, full_name, identifier, course_id")
        .eq("tenant_id", tid)
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("pouch_assignments")
        .select("student_id, created_at, pouches(code)")
        .eq("tenant_id", tid)
        .eq("assigned_on", day),
    ]);
    setCourses((c.data as CourseRow[]) ?? []);
    setStudents((s.data as StudentRow[]) ?? []);
    const aRows = (a.data as
      | { student_id: string; created_at: string | null; pouches: { code: string } | { code: string }[] | null }[]
      | null) ?? [];
    setByStudent(
      new Map(
        aRows.map((r) => [r.student_id, { code: one(r.pouches)?.code ?? "—", time: r.created_at }] as const),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tenantId) load(tenantId, date);
  }, [tenantId, date, load]);

  /* ── agrupar por curso ── */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQ = (s: StudentRow) =>
      !q || s.full_name.toLowerCase().includes(q) || (s.identifier ?? "").toLowerCase().includes(q);
    const passesFilter = (s: StudentRow) => {
      const has = byStudent.has(s.id);
      return filter === "todos" || (filter === "con" && has) || (filter === "sin" && !has);
    };

    const buckets: { id: string; label: string; students: StudentRow[]; conFunda: number; total: number }[] = [];
    const pushBucket = (id: string, label: string, courseId: string | null) => {
      const all = students.filter((s) => s.course_id === courseId);
      if (all.length === 0) return;
      const conFunda = all.filter((s) => byStudent.has(s.id)).length;
      const visible = all.filter((s) => matchesQ(s) && passesFilter(s));
      buckets.push({ id, label, students: visible, conFunda, total: all.length });
    };
    for (const c of courses) pushBucket(c.id, `${c.name} ${c.year}`, c.id);
    pushBucket(SIN_CURSO, "Sin curso", null);
    return buckets;
  }, [students, courses, byStudent, filter, query]);

  /* ── resumen ── */
  const summary = useMemo(() => {
    const total = students.length;
    const con = students.filter((s) => byStudent.has(s.id)).length;
    const pct = total > 0 ? Math.round((con / total) * 100) : 0;
    return { total, con, sin: total - con, pct };
  }, [students, byStudent]);

  /* ── exportar CSV ── */
  const exportCsv = () => {
    const tenantName = tenants.find((t) => t.id === tenantId)?.name ?? "colegio";
    const courseLabel = (cid: string | null) => {
      if (!cid) return "Sin curso";
      const c = courses.find((x) => x.id === cid);
      return c ? `${c.name} ${c.year}` : "—";
    };
    const header = ["Curso", "Alumno", "Identificador", "Estado", "Funda", "Hora"];
    const lines = students
      .slice()
      .sort((a, b) => {
        const ca = courseLabel(a.course_id);
        const cb = courseLabel(b.course_id);
        return ca === cb ? a.full_name.localeCompare(b.full_name) : ca.localeCompare(cb);
      })
      .map((s) => {
        const info = byStudent.get(s.id);
        return [
          courseLabel(s.course_id),
          s.full_name,
          s.identifier ?? "",
          info ? "Con funda" : "Sin funda",
          info?.code ?? "",
          info ? fmtTime(info.time) : "",
        ];
      });
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registro-uso-${tenantName.replace(/\s+/g, "-").toLowerCase()}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── guard ── */
  if (access && !access.isSysAdmin && operativeTenantIds.length === 0) {
    return (
      <AppShell title="Registro de uso">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">Esta sección es para la operación del colegio.</p>
        </div>
      </AppShell>
    );
  }

  const shiftDate = (deltaDays: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setDate(`${d.getFullYear()}-${m}-${day}`);
  };

  return (
    <AppShell title="Registro de uso">
      <div className="space-y-6">
        {/* ── controles ── */}
        <div className="glass p-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-[240px] flex-1">
              <span className={labelClass}>Institución</span>
              {tenants.length === 1 ? (
                <p className="mt-2 font-display text-lg uppercase text-white">{tenants[0].name}</p>
              ) : (
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink"
                >
                  <option value="" disabled>
                    {tenantsLoaded ? "Selecciona…" : "Cargando…"}
                  </option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <span className={labelClass}>Día</span>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftDate(-1)}
                  aria-label="Día anterior"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 text-white/70 transition hover:border-gold hover:text-gold"
                >
                  ‹
                </button>
                <input
                  type="date"
                  value={date}
                  max={todayLocal()}
                  onChange={(e) => setDate(e.target.value || todayLocal())}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                <button
                  type="button"
                  onClick={() => shiftDate(1)}
                  disabled={date >= todayLocal()}
                  aria-label="Día siguiente"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 text-white/70 transition hover:border-gold hover:text-gold disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>
          </div>

          {tenantId && (
            <p className="mt-4 text-sm capitalize text-white/50">{prettyDate(date)}</p>
          )}
        </div>

        {!tenantId ? (
          <p className="px-1 text-sm text-white/50">Selecciona una institución para ver el registro.</p>
        ) : (
          <>
            {/* ── resumen ── */}
            <div className="glass p-7">
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div className="flex flex-wrap items-end gap-8">
                  <div>
                    <div className="font-display text-3xl text-gold">{summary.con}</div>
                    <div className={labelClass}>con funda</div>
                  </div>
                  <div>
                    <div className="font-display text-3xl text-white/70">{summary.sin}</div>
                    <div className={labelClass}>sin funda</div>
                  </div>
                  <div>
                    <div className="font-display text-3xl text-white">{summary.total}</div>
                    <div className={labelClass}>alumnos</div>
                  </div>
                  <div>
                    <div className="font-display text-3xl text-white">{summary.pct}%</div>
                    <div className={labelClass}>uso del día</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={students.length === 0}
                  className="rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:opacity-40"
                >
                  Exportar CSV
                </button>
              </div>
              {/* barra de uso */}
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gold" style={{ width: `${summary.pct}%` }} />
              </div>
            </div>

            {/* ── filtros ── */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-2">
                {(
                  [
                    ["todos", "Todos"],
                    ["con", "Con funda"],
                    ["sin", "Sin funda"],
                  ] as [Filter, string][]
                ).map(([key, lbl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition ${
                      filter === key
                        ? "bg-gold text-ink"
                        : "border border-white/15 text-white/60 hover:text-white"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar alumno…"
                className="min-w-[200px] flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>

            {/* ── cursos ── */}
            {loading ? (
              <p className="px-1 text-sm text-white/50">Cargando…</p>
            ) : groups.length === 0 ? (
              <p className="px-1 text-sm text-white/50">
                Este colegio aún no tiene cursos ni alumnos cargados.
              </p>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {groups.map((g) => (
                  <div key={g.id} className="glass p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/10 pb-3">
                      <h2 className="font-display text-lg uppercase text-white">{g.label}</h2>
                      <span className={chipClass}>
                        <span className="text-gold">{g.conFunda}</span> / {g.total} con funda
                      </span>
                    </div>
                    {g.students.length === 0 ? (
                      <p className="mt-4 text-sm text-white/40">
                        {filter === "todos" ? "Sin alumnos." : "Sin alumnos en este filtro."}
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y divide-white/5">
                        {g.students.map((s) => {
                          const info = byStudent.get(s.id);
                          return (
                            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <span
                                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                                    info ? "bg-gold/15 text-gold" : "border border-white/15 text-white/30"
                                  }`}
                                  aria-hidden="true"
                                >
                                  {info ? (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  ) : (
                                    "·"
                                  )}
                                </span>
                                <span className="truncate text-sm text-white">{s.full_name}</span>
                              </div>
                              {info ? (
                                <span className="shrink-0 text-right">
                                  <span className="font-mono text-[11px] tracking-widest text-gold">{info.code}</span>
                                  <span className="ml-2 font-mono text-[10px] text-white/40">{fmtTime(info.time)}</span>
                                </span>
                              ) : (
                                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
                                  sin funda
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
