import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { OPERATE_ROLES, canOperateTenant, useMyAccess } from "../../lib/access";

/**
 * ScanFlow — flujo guiado de asignación diaria por QR, pensado para el
 * teléfono (columna centrada que también funciona en escritorio).
 * Pasos: escanear funda → elegir curso → elegir alumno → listo.
 * Pantalla completa, sin el sidebar: el profesor escanea en cadena
 * en la puerta del colegio.
 */

interface ScanFlowProps {
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
type PouchStatus = "active" | "lost" | "retired";
interface PouchRow {
  id: string;
  code: string;
  status: PouchStatus;
}

type Step = "tenant" | "scan" | "curso" | "alumno" | "listo";

/* BarcodeDetector (API experimental, no está en lib.dom) */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

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

const SIN_CURSO = "__sin_curso__";

export default function ScanFlow({ session }: ScanFlowProps) {
  const access = useMyAccess();
  const navigate = useNavigate();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  /** alumnos con funda hoy (id) y fundas asignadas hoy (code → nombre) */
  const [assignedStudents, setAssignedStudents] = useState<Set<string>>(new Set());
  const [assignedPouches, setAssignedPouches] = useState<Map<string, string>>(new Map());
  const [todayCount, setTodayCount] = useState(0);

  const [step, setStep] = useState<Step>("scan");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasDetector = useMemo(
    () => typeof window !== "undefined" && "BarcodeDetector" in window,
    [],
  );

  const [pouch, setPouch] = useState<PouchRow | null>(null);
  const [course, setCourse] = useState<CourseRow | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [result, setResult] = useState<{ code: string; student: string; course: string } | null>(
    null,
  );

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
      if (rows.length === 1) setTenant(rows[0]);
      else if (rows.length > 1) setStep("tenant");
    };
    load();
    return () => {
      mounted = false;
    };
  }, [access, operativeTenantIds]);

  /* ── datos del tenant ── */
  const loadTenantData = useCallback(async (tid: string) => {
    const today = todayLocal();
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
        .select("student_id, pouches(code), students(full_name)")
        .eq("tenant_id", tid)
        .eq("assigned_on", today),
    ]);
    setCourses((c.data as CourseRow[]) ?? []);
    setStudents((s.data as StudentRow[]) ?? []);
    const aRows = (a.data as
      | {
          student_id: string;
          pouches: { code: string } | { code: string }[] | null;
          students: { full_name: string } | { full_name: string }[] | null;
        }[]
      | null) ?? [];
    setAssignedStudents(new Set(aRows.map((r) => r.student_id)));
    setAssignedPouches(
      new Map(
        aRows
          .map((r) => [one(r.pouches)?.code, one(r.students)?.full_name] as const)
          .filter((p): p is [string, string] => !!p[0]),
      ),
    );
    setTodayCount(aRows.length);
  }, []);

  useEffect(() => {
    if (tenant) loadTenantData(tenant.id);
  }, [tenant, loadTenantData]);

  /* ── escáner ── */
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (!Detector) return;
        const detector = new Detector({ formats: ["qr_code"] });
        timer = window.setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          try {
            const codes = await detector.detect(v);
            const value = codes[0]?.rawValue;
            if (value) {
              setScanning(false);
              void validateCode(value.trim());
            }
          } catch {
            /* frame no procesable */
          }
        }, 300);
      } catch {
        if (!cancelled) {
          setError("No se pudo acceder a la cámara. Usa el ingreso manual.");
          setScanning(false);
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  /* ── validar la funda escaneada/ingresada ── */
  const validateCode = useCallback(
    async (raw: string) => {
      if (!tenant) return;
      const code = raw.trim();
      if (!code) return;
      setBusy(true);
      setError(null);

      // un QR puede traer una URL o texto extra: nos quedamos con el código.
      const cleaned = code.split(/[\s/?#]/).filter(Boolean).pop() ?? code;

      const { data, error: qErr } = await supabase
        .from("pouches")
        .select("id, code, status")
        .eq("tenant_id", tenant.id)
        .eq("code", cleaned)
        .maybeSingle();
      setBusy(false);

      if (qErr) {
        setError(qErr.message);
        return;
      }
      const p = data as PouchRow | null;
      if (!p) {
        setError(`Funda "${cleaned}" no registrada en ${tenant.name}.`);
        return;
      }
      if (p.status !== "active") {
        setError(p.status === "lost" ? `La funda ${p.code} está perdida.` : `La funda ${p.code} está dada de baja.`);
        return;
      }
      const already = assignedPouches.get(p.code);
      if (already) {
        setError(`La funda ${p.code} ya fue asignada hoy a ${already}.`);
        return;
      }
      setPouch(p);
      setManualCode("");
      setStep("curso");
    },
    [tenant, assignedPouches],
  );

  /* ── asignar al alumno elegido ── */
  const assignTo = useCallback(
    async (student: StudentRow) => {
      if (!tenant || !pouch) return;
      if (assignedStudents.has(student.id)) {
        setError(`${student.full_name} ya tiene una funda asignada hoy.`);
        return;
      }
      setBusy(true);
      setError(null);
      const today = todayLocal();
      const { error: insErr } = await supabase.from("pouch_assignments").insert({
        tenant_id: tenant.id,
        pouch_id: pouch.id,
        student_id: student.id,
        assigned_on: today,
        assigned_by: session.user.id,
      });
      setBusy(false);

      if (insErr) {
        if (insErr.code === "23505") {
          // la base atrapó un duplicado (funda o alumno ya con asignación hoy)
          await loadTenantData(tenant.id);
          setError("Esa funda o ese alumno ya tienen asignación hoy. Revisa y reintenta.");
          return;
        }
        setError(insErr.message);
        return;
      }

      setResult({
        code: pouch.code,
        student: student.full_name,
        course: course ? `${course.name} ${course.year}` : "Sin curso",
      });
      // actualizar marcadores locales sin recargar todo
      setAssignedStudents((prev) => new Set(prev).add(student.id));
      setAssignedPouches((prev) => new Map(prev).set(pouch.code, student.full_name));
      setTodayCount((n) => n + 1);
      setStep("listo");
    },
    [tenant, pouch, course, assignedStudents, session.user.id, loadTenantData],
  );

  const startOver = () => {
    setPouch(null);
    setCourse(null);
    setStudentQuery("");
    setResult(null);
    setError(null);
    setStep("scan");
  };

  /* ── derivados ── */
  const courseStudentCount = useCallback(
    (courseId: string | null) => students.filter((s) => s.course_id === courseId).length,
    [students],
  );
  const hasUncoursed = useMemo(() => students.some((s) => s.course_id === null), [students]);

  const courseStudents = useMemo(() => {
    const target = course?.id ?? null;
    const inCourse = students.filter((s) =>
      course?.id === SIN_CURSO ? s.course_id === null : s.course_id === target,
    );
    const q = studentQuery.trim().toLowerCase();
    const filtered = q ? inCourse.filter((s) => s.full_name.toLowerCase().includes(q)) : inCourse;
    return filtered;
  }, [students, course, studentQuery]);

  /* ════ UI ════ */
  const exit = () => navigate("/fundas");

  // sin acceso operativo a ningún colegio
  if (access && !access.isSysAdmin && operativeTenantIds.length === 0) {
    return (
      <ScanShell tenantName={null} todayCount={0} onExit={() => navigate("/home")}>
        <p className="text-center text-sm text-white/60">
          Esta función es para la operación del colegio.
        </p>
      </ScanShell>
    );
  }

  if (!access || !tenantsLoaded) {
    return (
      <ScanShell tenantName={null} todayCount={0} onExit={() => navigate("/home")}>
        <p className="text-center text-sm text-white/50">Cargando…</p>
      </ScanShell>
    );
  }

  return (
    <ScanShell tenantName={tenant?.name ?? null} todayCount={todayCount} onExit={exit}>
      {error && (
        <div className="mb-5 rounded-2xl border border-coral/40 bg-coral/10 px-5 py-4 text-center text-sm text-coral">
          {error}
        </div>
      )}

      {/* paso 0 · elegir institución (solo si hay varias) */}
      {step === "tenant" && (
        <div>
          <StepLabel>1 · Institución</StepLabel>
          <div className="mt-4 space-y-3">
            {tenants.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTenant(t);
                  setStep("scan");
                }}
                className="block w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-left text-base font-medium text-white transition hover:border-gold hover:bg-white/[0.08]"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* paso 1 · escanear */}
      {step === "scan" && tenant && (
        <div>
          <StepLabel>Escanea la funda</StepLabel>

          <div className="mt-4 overflow-hidden rounded-3xl border border-white/15 bg-black/40">
            {scanning ? (
              <div className="relative aspect-square w-full">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="h-2/3 w-2/3 rounded-2xl border-2 border-gold/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!hasDetector) {
                    setError("Tu dispositivo no permite escanear con la cámara — ingresa el código abajo.");
                    return;
                  }
                  setError(null);
                  setScanning(true);
                }}
                className="grid aspect-square w-full place-items-center text-center"
              >
                <span className="flex flex-col items-center gap-3 text-white/70">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" strokeLinecap="round" />
                    <rect x="7" y="7" width="10" height="10" rx="1.5" />
                  </svg>
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                    {hasDetector ? "Tocar para escanear" : "Cámara no disponible"}
                  </span>
                </span>
              </button>
            )}
          </div>

          {scanning && (
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="mt-3 w-full rounded-full border border-white/20 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70"
            >
              Detener cámara
            </button>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void validateCode(manualCode);
            }}
            className="mt-5"
          >
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
              o ingresa el código
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="FND-0001"
                autoCapitalize="characters"
                autoComplete="off"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-center font-mono text-base tracking-widest text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              <button
                type="submit"
                disabled={busy || !manualCode.trim()}
                className="shrink-0 rounded-2xl bg-gold px-6 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition disabled:opacity-50"
              >
                {busy ? "…" : "OK"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* paso 2 · elegir curso */}
      {step === "curso" && pouch && (
        <div>
          <ScannedBadge code={pouch.code} />
          <StepLabel>Elige el curso</StepLabel>
          {courses.length === 0 && !hasUncoursed ? (
            <p className="mt-4 text-center text-sm text-white/60">
              Este colegio aún no tiene cursos ni alumnos cargados.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {courses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCourse(c);
                    setStudentQuery("");
                    setStep("alumno");
                  }}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-5 text-center transition hover:border-gold hover:bg-white/[0.08]"
                >
                  <div className="font-display text-xl uppercase text-white">{c.name}</div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                    {c.year} · {courseStudentCount(c.id)} alumnos
                  </div>
                </button>
              ))}
              {hasUncoursed && (
                <button
                  type="button"
                  onClick={() => {
                    setCourse({ id: SIN_CURSO, name: "Sin curso", year: 0 });
                    setStudentQuery("");
                    setStep("alumno");
                  }}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-5 text-center transition hover:border-gold hover:bg-white/[0.08]"
                >
                  <div className="font-display text-lg uppercase text-white/80">Sin curso</div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                    {courseStudentCount(null)} alumnos
                  </div>
                </button>
              )}
            </div>
          )}
          <BackButton onClick={() => setStep("scan")} />
        </div>
      )}

      {/* paso 3 · elegir alumno */}
      {step === "alumno" && pouch && course && (
        <div>
          <ScannedBadge code={pouch.code} />
          <StepLabel>
            Alumno · {course.name}
            {course.year ? ` ${course.year}` : ""}
          </StepLabel>
          <input
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
            placeholder="Buscar alumno…"
            className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <div className="mt-3 max-h-[48vh] space-y-2 overflow-y-auto">
            {courseStudents.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/50">
                {studentQuery ? "Sin coincidencias." : "Este curso no tiene alumnos cargados."}
              </p>
            ) : (
              courseStudents.map((s) => {
                const taken = assignedStudents.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={taken || busy}
                    onClick={() => void assignTo(s)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition ${
                      taken
                        ? "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50"
                        : "border-white/15 bg-white/5 hover:border-gold hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className="text-base font-medium text-white">{s.full_name}</span>
                    {taken ? (
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                        ya asignada
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                        Asignar →
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <BackButton onClick={() => setStep("curso")} />
        </div>
      )}

      {/* paso 4 · listo */}
      {step === "listo" && result && (
        <div className="text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gold/15">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#7FCEEC" strokeWidth="2.4">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-gold">Asignada</p>
          <p className="mt-2 font-display text-2xl uppercase text-white">{result.student}</p>
          <p className="mt-1 text-sm text-white/60">
            {result.code} · {result.course}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            {todayCount} asignadas hoy
          </p>

          <button
            type="button"
            onClick={startOver}
            className="mt-7 w-full rounded-full bg-gold py-4 font-mono text-[13px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5"
          >
            Escanear siguiente
          </button>
          <button
            type="button"
            onClick={exit}
            className="mt-3 w-full rounded-full border border-white/20 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70"
          >
            Terminar
          </button>
        </div>
      )}
    </ScanShell>
  );
}

/* ── piezas de UI ── */

function ScanShell({
  tenantName,
  todayCount,
  onExit,
  children,
}: {
  tenantName: string | null;
  todayCount: number;
  onExit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-ink/80 px-4 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir"
          className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-white/70">
            {tenantName ?? "Escaneo"}
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
          Hoy {todayCount}
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-8">{children}</main>
    </div>
  );
}

function StepLabel({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-center font-display text-xl uppercase leading-tight text-white">{children}</h1>
  );
}

function ScannedBadge({ code }: { code: string }) {
  return (
    <div className="mb-4 flex items-center justify-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Funda</span>
      <span className="rounded-full bg-gold/15 px-3 py-1 font-mono text-[12px] font-semibold tracking-widest text-gold">
        {code}
      </span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 w-full rounded-full border border-white/15 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 transition hover:text-white"
    >
      ← Atrás
    </button>
  );
}
