import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { canManageTenant, canOperateTenant, OPERATE_ROLES, useMyAccess } from "../../lib/access";

interface FundasProps {
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
  active: boolean;
}

interface StudentRow {
  id: string;
  full_name: string;
  identifier: string | null;
  course_id: string | null;
  active: boolean;
}

type PouchStatus = "active" | "lost" | "retired";

interface PouchRow {
  id: string;
  code: string;
  status: PouchStatus;
}

interface AssignmentRow {
  id: string;
  assigned_on: string;
  created_at?: string | null;
  pouches: { code: string } | { code: string }[] | null;
  students: AssignedStudent | AssignedStudent[] | null;
}

interface AssignedStudent {
  id: string;
  full_name: string;
  course_id: string | null;
}

type Tab = "hoy" | "cursos" | "inventario";

interface Notice {
  kind: "ok" | "error";
  text: string;
}

/* ── BarcodeDetector (API experimental, no está en lib.dom) ── */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const POUCH_STATUS_LABELS: Record<PouchStatus, string> = {
  active: "Activa",
  lost: "Perdida",
  retired: "De baja",
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Fecha local del navegador como YYYY-MM-DD (suficiente para "hoy"). */
function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40";
const selectClass = `${inputClass} [&>option]:bg-ink`;
const labelClass = "font-mono text-[11px] uppercase tracking-[0.16em] text-white/50";
const primaryBtnClass =
  "rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtnClass =
  "rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50";
const chipClass =
  "rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70";

export default function Fundas({ session }: FundasProps) {
  const access = useMyAccess();

  /* ── institución ── */
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);
  const [tenantId, setTenantId] = useState("");

  /* ── datos del tenant ── */
  const [counts, setCounts] = useState<{ active: number; today: number } | null>(null);
  const [todayRows, setTodayRows] = useState<AssignmentRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);

  /* ── UI general ── */
  const [tab, setTab] = useState<Tab>("hoy");
  const [notice, setNotice] = useState<Notice | null>(null);

  /* ── pestaña asignación ── */
  const [code, setCode] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasDetector] = useState(
    () => typeof window !== "undefined" && "BarcodeDetector" in window,
  );

  /* ── pestaña cursos ── */
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseYear, setNewCourseYear] = useState(String(new Date().getFullYear()));
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null); // "none" = sin curso
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentIdentifier, setNewStudentIdentifier] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  /* ── pestaña inventario ── */
  const [invText, setInvText] = useState("");
  const [rangePrefix, setRangePrefix] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [registering, setRegistering] = useState(false);
  const [pouchSearch, setPouchSearch] = useState("");
  const [pouches, setPouches] = useState<PouchRow[]>([]);
  const [pouchTotal, setPouchTotal] = useState(0);

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

  const canOperate = access !== null && tenantId !== "" && canOperateTenant(access, tenantId);
  const canManage = access !== null && tenantId !== "" && canManageTenant(access, tenantId);

  const coursesById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const courseLabel = useCallback(
    (courseId: string | null): string => {
      if (!courseId) return "Sin curso";
      const c = coursesById.get(courseId);
      return c ? `${c.name} ${c.year}` : "—";
    },
    [coursesById],
  );

  /* ════ carga de tenants ════ */
  useEffect(() => {
    if (!access) return;
    let mounted = true;
    const load = async () => {
      if (access.isSysAdmin) {
        // solo clientes operativos — los prospectos del CRM no operan fundas
        const { data } = await supabase
          .from("tenants")
          .select("id, name")
          .eq("is_customer", true)
          .order("name");
        if (mounted) setTenants((data as Tenant[]) ?? []);
      } else if (operativeTenantIds.length > 0) {
        const { data } = await supabase
          .from("tenants")
          .select("id, name")
          .in("id", operativeTenantIds)
          .order("name");
        if (mounted) setTenants((data as Tenant[]) ?? []);
      } else if (mounted) {
        setTenants([]);
      }
      if (mounted) setTenantsLoaded(true);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [access, operativeTenantIds]);

  useEffect(() => {
    if (tenants.length === 1 && tenantId !== tenants[0].id) {
      setTenantId(tenants[0].id);
    }
  }, [tenants, tenantId]);

  /* ════ loaders por tenant ════ */
  const loadCounts = useCallback(async (tid: string) => {
    const today = todayLocal();
    const [a, t] = await Promise.all([
      supabase
        .from("pouches")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("status", "active"),
      supabase
        .from("pouch_assignments")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("assigned_on", today),
    ]);
    setCounts({ active: a.count ?? 0, today: t.count ?? 0 });
  }, []);

  const loadToday = useCallback(async (tid: string) => {
    const today = todayLocal();
    const base = "id, assigned_on, pouches(code), students(id, full_name, course_id)";
    const withTime = await supabase
      .from("pouch_assignments")
      .select(`${base}, created_at`)
      .eq("tenant_id", tid)
      .eq("assigned_on", today)
      .order("created_at", { ascending: false });
    if (!withTime.error) {
      setTodayRows((withTime.data as AssignmentRow[]) ?? []);
      return;
    }
    // fallback si la tabla no tiene created_at
    const plain = await supabase
      .from("pouch_assignments")
      .select(base)
      .eq("tenant_id", tid)
      .eq("assigned_on", today);
    const rows = ((plain.data as AssignmentRow[]) ?? []).slice().reverse();
    setTodayRows(rows);
  }, []);

  const loadCourses = useCallback(async (tid: string) => {
    const { data } = await supabase
      .from("courses")
      .select("id, name, year, active")
      .eq("tenant_id", tid)
      .eq("active", true)
      .order("year", { ascending: false })
      .order("name");
    setCourses((data as CourseRow[]) ?? []);
  }, []);

  const loadStudents = useCallback(async (tid: string) => {
    const { data } = await supabase
      .from("students")
      .select("id, full_name, identifier, course_id, active")
      .eq("tenant_id", tid)
      .eq("active", true)
      .order("full_name");
    setStudents((data as StudentRow[]) ?? []);
  }, []);

  const loadPouches = useCallback(async (tid: string, search: string) => {
    let query = supabase
      .from("pouches")
      .select("id, code, status", { count: "exact" })
      .eq("tenant_id", tid);
    if (search.trim()) query = query.ilike("code", `%${search.trim()}%`);
    const { data, count } = await query.order("code").limit(50);
    setPouches((data as PouchRow[]) ?? []);
    setPouchTotal(count ?? 0);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    setNotice(null);
    setCounts(null);
    setTodayRows([]);
    setCourses([]);
    setStudents([]);
    setSelectedStudent(null);
    setStudentQuery("");
    setCode("");
    setSelectedCourseId(null);
    setPouchSearch("");
    Promise.all([
      loadCounts(tenantId),
      loadToday(tenantId),
      loadCourses(tenantId),
      loadStudents(tenantId),
    ]);
  }, [tenantId, loadCounts, loadToday, loadCourses, loadStudents]);

  useEffect(() => {
    if (!tenantId) return;
    loadPouches(tenantId, pouchSearch);
  }, [tenantId, pouchSearch, loadPouches]);

  /* ════ escáner QR ════ */
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector;
        if (!Detector) return;
        const detector = new Detector({ formats: ["qr_code"] });

        timer = window.setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          try {
            const barcodes = await detector.detect(v);
            const value = barcodes[0]?.rawValue;
            if (value) {
              setCode(value.trim());
              setScanning(false);
              codeInputRef.current?.focus();
            }
          } catch {
            /* frame no procesable, se ignora */
          }
        }, 300);
      } catch {
        if (!cancelled) {
          setNotice({ kind: "error", text: "No se pudo acceder a la cámara." });
          setScanning(false);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [scanning]);

  /* ════ asignación ════ */
  const studentMatches = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return students.filter((s) => s.full_name.toLowerCase().includes(q)).slice(0, 8);
  }, [students, studentQuery]);

  const pickStudent = (s: StudentRow) => {
    setSelectedStudent(s);
    setStudentQuery("");
  };

  const handleAssign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId) return;
    const codeTrim = code.trim();
    if (!codeTrim) {
      setNotice({ kind: "error", text: "Ingresa el código de la funda." });
      return;
    }
    if (!selectedStudent) {
      setNotice({ kind: "error", text: "Selecciona un alumno." });
      return;
    }
    setAssigning(true);
    setNotice(null);

    const { data: pouchData, error: pouchError } = await supabase
      .from("pouches")
      .select("id, code, status")
      .eq("tenant_id", tenantId)
      .eq("code", codeTrim)
      .maybeSingle();

    if (pouchError) {
      setNotice({ kind: "error", text: pouchError.message });
      setAssigning(false);
      return;
    }
    const pouch = pouchData as PouchRow | null;
    if (!pouch) {
      setNotice({ kind: "error", text: `Funda "${codeTrim}" no registrada en esta institución.` });
      setAssigning(false);
      return;
    }
    if (pouch.status !== "active") {
      setNotice({
        kind: "error",
        text:
          pouch.status === "lost"
            ? `La funda ${pouch.code} está marcada como perdida.`
            : `La funda ${pouch.code} está dada de baja.`,
      });
      setAssigning(false);
      return;
    }

    const today = todayLocal();
    const { error } = await supabase.from("pouch_assignments").insert({
      tenant_id: tenantId,
      pouch_id: pouch.id,
      student_id: selectedStudent.id,
      assigned_on: today,
      assigned_by: session.user.id,
    });

    if (error) {
      if (error.code === "23505") {
        const { data: dup } = await supabase
          .from("pouch_assignments")
          .select("id, students(full_name)")
          .eq("pouch_id", pouch.id)
          .eq("assigned_on", today)
          .maybeSingle();
        const dupRow = dup as
          | { students: { full_name: string } | { full_name: string }[] | null }
          | null;
        if (dupRow) {
          const name = one(dupRow.students)?.full_name ?? "otro alumno";
          setNotice({ kind: "error", text: `Esta funda ya fue asignada hoy a ${name}.` });
        } else {
          setNotice({
            kind: "error",
            text: `${selectedStudent.full_name} ya tiene funda asignada hoy.`,
          });
        }
      } else {
        setNotice({ kind: "error", text: error.message });
      }
    } else {
      setNotice({
        kind: "ok",
        text: `Funda ${pouch.code} asignada a ${selectedStudent.full_name}.`,
      });
      setCode("");
      setSelectedStudent(null);
      setStudentQuery("");
      codeInputRef.current?.focus();
      await Promise.all([loadToday(tenantId), loadCounts(tenantId)]);
    }
    setAssigning(false);
  };

  const handleUnassign = async (assignmentId: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("pouch_assignments").delete().eq("id", assignmentId);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      await Promise.all([loadToday(tenantId), loadCounts(tenantId)]);
    }
  };

  /* ════ cursos y alumnos ════ */
  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId || !newCourseName.trim()) return;
    const year = parseInt(newCourseYear, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setNotice({ kind: "error", text: "Año inválido." });
      return;
    }
    setCreatingCourse(true);
    setNotice(null);
    const { error } = await supabase
      .from("courses")
      .insert({ tenant_id: tenantId, name: newCourseName.trim(), year, active: true });
    if (error) {
      setNotice({
        kind: "error",
        text:
          error.code === "23505"
            ? `Ya existe el curso "${newCourseName.trim()}" en ${year}.`
            : error.message,
      });
    } else {
      setNotice({ kind: "ok", text: `Curso "${newCourseName.trim()}" creado.` });
      setNewCourseName("");
      await loadCourses(tenantId);
    }
    setCreatingCourse(false);
  };

  const selectedCourseStudents = useMemo(() => {
    if (selectedCourseId === null) return [];
    if (selectedCourseId === "none") return students.filter((s) => s.course_id === null);
    return students.filter((s) => s.course_id === selectedCourseId);
  }, [students, selectedCourseId]);

  const studentCountByCourse = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      const key = s.course_id ?? "none";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [students]);

  const targetCourseId = selectedCourseId === "none" ? null : selectedCourseId;

  const handleAddStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId || selectedCourseId === null || !newStudentName.trim()) return;
    setAddingStudent(true);
    setNotice(null);
    const { error } = await supabase.from("students").insert({
      tenant_id: tenantId,
      course_id: targetCourseId,
      full_name: newStudentName.trim(),
      identifier: newStudentIdentifier.trim() || null,
      active: true,
    });
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: `${newStudentName.trim()} agregado.` });
      setNewStudentName("");
      setNewStudentIdentifier("");
      await loadStudents(tenantId);
    }
    setAddingStudent(false);
  };

  const handleBulkAdd = async () => {
    if (!tenantId || selectedCourseId === null) return;
    const rows = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, identifier] = line.split(";").map((part) => part.trim());
        return {
          tenant_id: tenantId,
          course_id: targetCourseId,
          full_name: name,
          identifier: identifier || null,
          active: true,
        };
      })
      .filter((row) => row.full_name);
    if (rows.length === 0) {
      setNotice({ kind: "error", text: "No hay alumnos válidos en el texto." });
      return;
    }
    setBulkLoading(true);
    setNotice(null);
    const { error } = await supabase.from("students").insert(rows);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({
        kind: "ok",
        text: `${rows.length} alumno${rows.length === 1 ? "" : "s"} agregado${rows.length === 1 ? "" : "s"}.`,
      });
      setBulkText("");
      await loadStudents(tenantId);
    }
    setBulkLoading(false);
  };

  const handleMoveStudent = async (student: StudentRow, value: string) => {
    if (!tenantId) return;
    const newCourseId = value === "none" ? null : value;
    const { error } = await supabase
      .from("students")
      .update({ course_id: newCourseId })
      .eq("id", student.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      await loadStudents(tenantId);
    }
  };

  const handleDeactivateStudent = async (student: StudentRow) => {
    if (!tenantId) return;
    const { error } = await supabase
      .from("students")
      .update({ active: false })
      .eq("id", student.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: `${student.full_name} desactivado.` });
      await loadStudents(tenantId);
    }
  };

  /* ════ inventario ════ */
  const handleGenerateRange = () => {
    const from = parseInt(rangeFrom, 10);
    const to = parseInt(rangeTo, 10);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
      setNotice({ kind: "error", text: "Rango inválido." });
      return;
    }
    if (to - from + 1 > 5000) {
      setNotice({ kind: "error", text: "Rango demasiado grande (máximo 5000 códigos)." });
      return;
    }
    const pad = rangeFrom.trim().length;
    const codes: string[] = [];
    for (let i = from; i <= to; i += 1) {
      codes.push(`${rangePrefix.trim()}${String(i).padStart(pad, "0")}`);
    }
    setInvText((prev) => (prev.trim() ? `${prev.trimEnd()}\n` : "") + codes.join("\n"));
    setNotice(null);
  };

  const countAllPouches = useCallback(async (tid: string): Promise<number> => {
    const { count } = await supabase
      .from("pouches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tid);
    return count ?? 0;
  }, []);

  const handleRegisterPouches = async () => {
    if (!tenantId) return;
    const codes = Array.from(
      new Set(
        invText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    );
    if (codes.length === 0) {
      setNotice({ kind: "error", text: "Ingresa al menos un código." });
      return;
    }
    setRegistering(true);
    setNotice(null);
    const before = await countAllPouches(tenantId);
    const { error } = await supabase
      .from("pouches")
      .upsert(
        codes.map((c) => ({ tenant_id: tenantId, code: c, status: "active" })),
        { onConflict: "tenant_id,code", ignoreDuplicates: true },
      );
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      const after = await countAllPouches(tenantId);
      const created = Math.max(0, after - before);
      const duplicated = codes.length - created;
      setNotice({
        kind: "ok",
        text: `${created} funda${created === 1 ? "" : "s"} registrada${created === 1 ? "" : "s"}${
          duplicated > 0 ? ` (${duplicated} ya existía${duplicated === 1 ? "" : "n"})` : ""
        }.`,
      });
      setInvText("");
      await Promise.all([loadPouches(tenantId, pouchSearch), loadCounts(tenantId)]);
    }
    setRegistering(false);
  };

  const handlePouchStatus = async (pouch: PouchRow, status: PouchStatus) => {
    if (!tenantId) return;
    const { error } = await supabase.from("pouches").update({ status }).eq("id", pouch.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({
        kind: "ok",
        text: `Funda ${pouch.code} marcada como ${POUCH_STATUS_LABELS[status].toLowerCase()}.`,
      });
      await Promise.all([loadPouches(tenantId, pouchSearch), loadCounts(tenantId)]);
    }
  };

  /* ════ guards ════ */
  if (!access || (access && !tenantsLoaded)) {
    return (
      <AppShell title="Fundas">
        <p className="text-sm text-white/50">Cargando…</p>
      </AppShell>
    );
  }

  if (!access.isSysAdmin && operativeTenantIds.length === 0) {
    return (
      <AppShell title="Fundas">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">Esta sección es para la operación del colegio.</p>
        </div>
      </AppShell>
    );
  }

  const availableCount = counts ? Math.max(0, counts.active - counts.today) : null;
  const selectedTenant = tenants.find((t) => t.id === tenantId) ?? null;

  return (
    <AppShell title="Fundas">
      <div className="space-y-6">
        {/* ── institución + resumen ── */}
        <div className="glass p-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-[260px] flex-1">
              <span className={labelClass}>Institución</span>
              {tenants.length === 1 && selectedTenant ? (
                <p className="mt-2 font-display text-lg uppercase text-white">
                  {selectedTenant.name}
                </p>
              ) : (
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
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
              )}
            </div>
            {tenantId && (
              <div className="flex flex-wrap gap-2">
                <span className={chipClass}>
                  Fundas activas · <span className="text-gold">{counts ? counts.active : "…"}</span>
                </span>
                <span className={chipClass}>
                  Asignadas hoy · <span className="text-gold">{counts ? counts.today : "…"}</span>
                </span>
                <span className={chipClass}>
                  Disponibles ·{" "}
                  <span className="text-gold">{availableCount === null ? "…" : availableCount}</span>
                </span>
              </div>
            )}
          </div>
          {tenants.length === 0 && (
            <p className="mt-4 text-sm text-white/50">No hay instituciones registradas.</p>
          )}
        </div>

        {tenantId && (
          <>
            {/* ── pestañas ── */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["hoy", "Asignación de hoy"],
                  ["cursos", "Cursos y alumnos"],
                  ["inventario", "Inventario de fundas"],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key);
                    setNotice(null);
                  }}
                  className={`rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition ${
                    tab === key
                      ? "border-gold text-gold"
                      : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {notice && (
              <p
                role="status"
                className={`text-sm leading-relaxed ${notice.kind === "error" ? "text-coral" : "text-gold"}`}
              >
                {notice.text}
              </p>
            )}

            {/* ════ pestaña: asignación de hoy ════ */}
            {tab === "hoy" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="glass p-7">
                  <h2 className="font-display text-lg uppercase text-white">Asignar funda</h2>
                  <p className="mt-2 text-sm text-white/60">
                    Escanea o escribe el código de la funda y elige al alumno.
                  </p>

                  <form onSubmit={handleAssign} className="mt-5 space-y-4">
                    <label className="block">
                      <span className={labelClass}>Código de funda</span>
                      <div className="flex gap-3">
                        <input
                          ref={codeInputRef}
                          autoFocus
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          placeholder="BLK-0001"
                          autoComplete="off"
                          spellCheck={false}
                          className={`${inputClass} font-mono`}
                        />
                        {hasDetector && (
                          <button
                            type="button"
                            onClick={() => setScanning(true)}
                            className={`mt-2 shrink-0 ${secondaryBtnClass}`}
                          >
                            Escanear QR
                          </button>
                        )}
                      </div>
                    </label>

                    <div>
                      <span className={labelClass}>Alumno</span>
                      {selectedStudent ? (
                        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
                          <div>
                            <p className="text-sm text-white">{selectedStudent.full_name}</p>
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
                              {courseLabel(selectedStudent.course_id)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(null)}
                            className="rounded-full border border-white/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white transition hover:border-gold hover:text-gold"
                          >
                            Cambiar
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            value={studentQuery}
                            onChange={(e) => setStudentQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (studentMatches.length > 0) pickStudent(studentMatches[0]);
                              }
                            }}
                            placeholder="Busca por nombre…"
                            autoComplete="off"
                            className={inputClass}
                          />
                          {studentQuery.trim() && (
                            <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
                              {studentMatches.length === 0 ? (
                                <li className="px-4 py-3 text-sm text-white/50">Sin resultados.</li>
                              ) : (
                                studentMatches.map((s) => (
                                  <li key={s.id}>
                                    <button
                                      type="button"
                                      onClick={() => pickStudent(s)}
                                      className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-white/5"
                                    >
                                      <span className="text-sm text-white">{s.full_name}</span>
                                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                                        {courseLabel(s.course_id)}
                                      </span>
                                    </button>
                                  </li>
                                ))
                              )}
                            </ul>
                          )}
                        </>
                      )}
                    </div>

                    <button type="submit" disabled={assigning} className={`w-full ${primaryBtnClass}`}>
                      {assigning ? "Asignando…" : "Asignar"}
                    </button>
                  </form>
                </div>

                <div className="glass p-7">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-lg uppercase text-white">Asignaciones de hoy</h2>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                      {todayRows.length} funda{todayRows.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {todayRows.length === 0 ? (
                    <p className="mt-6 text-sm text-white/50">Aún no hay asignaciones hoy.</p>
                  ) : (
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                            <th className="pb-3 pr-4 font-medium">Funda</th>
                            <th className="pb-3 pr-4 font-medium">Alumno</th>
                            <th className="pb-3 pr-4 font-medium">Curso</th>
                            <th className="pb-3 pr-4 font-medium">Hora</th>
                            {canOperate && <th className="pb-3 font-medium" />}
                          </tr>
                        </thead>
                        <tbody>
                          {todayRows.map((row) => {
                            const student = one(row.students);
                            return (
                              <tr key={row.id} className="border-b border-white/5">
                                <td className="py-3 pr-4 font-mono text-white">
                                  {one(row.pouches)?.code ?? "—"}
                                </td>
                                <td className="py-3 pr-4 text-white/80">
                                  {student?.full_name ?? "—"}
                                </td>
                                <td className="py-3 pr-4 text-white/60">
                                  {student ? courseLabel(student.course_id) : "—"}
                                </td>
                                <td className="py-3 pr-4 text-white/60">
                                  {formatTime(row.created_at)}
                                </td>
                                {canOperate && (
                                  <td className="py-3">
                                    <button
                                      type="button"
                                      onClick={() => handleUnassign(row.id)}
                                      className="rounded-full bg-coral/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-coral transition hover:bg-coral/25"
                                    >
                                      Quitar
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ pestaña: cursos y alumnos ════ */}
            {tab === "cursos" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="space-y-6">
                  {canOperate && (
                    <div className="glass p-7">
                      <h2 className="font-display text-lg uppercase text-white">Crear curso</h2>
                      <form onSubmit={handleCreateCourse} className="mt-4 space-y-4">
                        <div className="flex gap-3">
                          <label className="block flex-1">
                            <span className={labelClass}>Nombre</span>
                            <input
                              value={newCourseName}
                              onChange={(e) => setNewCourseName(e.target.value)}
                              placeholder="5°B"
                              className={inputClass}
                            />
                          </label>
                          <label className="block w-28">
                            <span className={labelClass}>Año</span>
                            <input
                              type="number"
                              value={newCourseYear}
                              onChange={(e) => setNewCourseYear(e.target.value)}
                              className={inputClass}
                            />
                          </label>
                        </div>
                        <button
                          type="submit"
                          disabled={creatingCourse || !newCourseName.trim()}
                          className={`w-full ${primaryBtnClass}`}
                        >
                          {creatingCourse ? "Creando…" : "Crear curso"}
                        </button>
                      </form>
                    </div>
                  )}

                  <div className="glass p-7">
                    <h2 className="font-display text-lg uppercase text-white">Cursos</h2>
                    {courses.length === 0 ? (
                      <p className="mt-4 text-sm text-white/50">Aún no hay cursos.</p>
                    ) : (
                      <ul className="mt-4 space-y-2">
                        {courses.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedCourseId(c.id)}
                              className={`flex w-full items-baseline justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                                selectedCourseId === c.id
                                  ? "border-gold/60 bg-gold/10"
                                  : "border-white/10 bg-white/5 hover:border-white/30"
                              }`}
                            >
                              <span className="text-sm text-white">
                                {c.name} <span className="text-white/50">· {c.year}</span>
                              </span>
                              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                                {studentCountByCourse.get(c.id) ?? 0} alumnos
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedCourseId("none")}
                      className={`mt-3 flex w-full items-baseline justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selectedCourseId === "none"
                          ? "border-gold/60 bg-gold/10"
                          : "border-white/10 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <span className="text-sm text-white">Sin curso</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                        {studentCountByCourse.get("none") ?? 0} alumnos
                      </span>
                    </button>
                  </div>
                </div>

                <div className="glass p-7">
                  {selectedCourseId === null ? (
                    <p className="text-sm text-white/50">Selecciona un curso para ver sus alumnos.</p>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between gap-4">
                        <h2 className="font-display text-lg uppercase text-white">
                          {selectedCourseId === "none" ? "Sin curso" : courseLabel(selectedCourseId)}
                        </h2>
                        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                          {selectedCourseStudents.length} alumno
                          {selectedCourseStudents.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {canOperate && (
                        <form onSubmit={handleAddStudent} className="mt-5 flex flex-wrap items-end gap-3">
                          <label className="block min-w-[180px] flex-1">
                            <span className={labelClass}>Nombre del alumno</span>
                            <input
                              value={newStudentName}
                              onChange={(e) => setNewStudentName(e.target.value)}
                              placeholder="María Pérez"
                              className={inputClass}
                            />
                          </label>
                          <label className="block w-40">
                            <span className={labelClass}>Identificador</span>
                            <input
                              value={newStudentIdentifier}
                              onChange={(e) => setNewStudentIdentifier(e.target.value)}
                              placeholder="Opcional"
                              className={inputClass}
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={addingStudent || !newStudentName.trim()}
                            className={`mb-0.5 shrink-0 ${secondaryBtnClass}`}
                          >
                            Agregar
                          </button>
                        </form>
                      )}

                      {selectedCourseStudents.length === 0 ? (
                        <p className="mt-6 text-sm text-white/50">No hay alumnos activos aquí.</p>
                      ) : (
                        <div className="mt-5 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                                <th className="pb-3 pr-4 font-medium">Alumno</th>
                                <th className="pb-3 pr-4 font-medium">Identificador</th>
                                {canOperate && (
                                  <>
                                    <th className="pb-3 pr-4 font-medium">Mover a</th>
                                    <th className="pb-3 font-medium" />
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedCourseStudents.map((s) => (
                                <tr key={s.id} className="border-b border-white/5">
                                  <td className="py-3 pr-4 text-white">{s.full_name}</td>
                                  <td className="py-3 pr-4 font-mono text-white/60">
                                    {s.identifier ?? "—"}
                                  </td>
                                  {canOperate && (
                                    <>
                                      <td className="py-3 pr-4">
                                        <select
                                          value={s.course_id ?? "none"}
                                          onChange={(e) => handleMoveStudent(s, e.target.value)}
                                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink"
                                        >
                                          <option value="none">Sin curso</option>
                                          {courses.map((c) => (
                                            <option key={c.id} value={c.id}>
                                              {c.name} · {c.year}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="py-3">
                                        <button
                                          type="button"
                                          onClick={() => handleDeactivateStudent(s)}
                                          className="rounded-full bg-coral/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-coral transition hover:bg-coral/25"
                                        >
                                          Desactivar
                                        </button>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {canOperate && (
                        <div className="mt-7 border-t border-white/10 pt-6">
                          <h3 className="font-display text-lg uppercase text-white">Carga masiva</h3>
                          <p className="mt-2 text-sm text-white/60">
                            Un alumno por línea. Identificador opcional separado por punto y coma:
                            {" "}
                            <span className="font-mono text-white/70">Nombre Apellido;12345678-9</span>
                          </p>
                          <textarea
                            value={bulkText}
                            onChange={(e) => setBulkText(e.target.value)}
                            rows={5}
                            placeholder={"María Pérez;22333444-5\nJuan Soto"}
                            className={inputClass}
                          />
                          <button
                            type="button"
                            onClick={handleBulkAdd}
                            disabled={bulkLoading || !bulkText.trim()}
                            className={`mt-3 ${secondaryBtnClass}`}
                          >
                            {bulkLoading ? "Cargando…" : "Cargar alumnos"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ════ pestaña: inventario ════ */}
            {tab === "inventario" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                {canManage && (
                  <div className="glass p-7">
                    <h2 className="font-display text-lg uppercase text-white">Registrar fundas</h2>
                    <p className="mt-2 text-sm text-white/60">
                      Un código por línea. Los códigos repetidos se ignoran.
                    </p>
                    <textarea
                      value={invText}
                      onChange={(e) => setInvText(e.target.value)}
                      rows={6}
                      placeholder={"BLK-0001\nBLK-0002"}
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />

                    <div className="mt-5">
                      <span className={labelClass}>Generar por rango</span>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <label className="block w-32">
                          <span className={labelClass}>Prefijo</span>
                          <input
                            value={rangePrefix}
                            onChange={(e) => setRangePrefix(e.target.value)}
                            placeholder="BLK-"
                            spellCheck={false}
                            className={`${inputClass} font-mono`}
                          />
                        </label>
                        <label className="block w-28">
                          <span className={labelClass}>Desde</span>
                          <input
                            value={rangeFrom}
                            onChange={(e) => setRangeFrom(e.target.value)}
                            placeholder="0001"
                            inputMode="numeric"
                            className={`${inputClass} font-mono`}
                          />
                        </label>
                        <label className="block w-28">
                          <span className={labelClass}>Hasta</span>
                          <input
                            value={rangeTo}
                            onChange={(e) => setRangeTo(e.target.value)}
                            placeholder="0050"
                            inputMode="numeric"
                            className={`${inputClass} font-mono`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleGenerateRange}
                          className={`mb-0.5 shrink-0 ${secondaryBtnClass}`}
                        >
                          Generar
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRegisterPouches}
                      disabled={registering || !invText.trim()}
                      className={`mt-6 w-full ${primaryBtnClass}`}
                    >
                      {registering ? "Registrando…" : "Registrar fundas"}
                    </button>
                  </div>
                )}

                <div className="glass p-7">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-lg uppercase text-white">Fundas</h2>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                      {pouchTotal} en total
                    </span>
                  </div>

                  <input
                    value={pouchSearch}
                    onChange={(e) => setPouchSearch(e.target.value)}
                    placeholder="Buscar por código…"
                    autoComplete="off"
                    spellCheck={false}
                    className={`${inputClass} mt-4 font-mono`}
                  />

                  {pouches.length === 0 ? (
                    <p className="mt-6 text-sm text-white/50">
                      {pouchSearch.trim() ? "Sin resultados." : "Aún no hay fundas registradas."}
                    </p>
                  ) : (
                    <>
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                              <th className="pb-3 pr-4 font-medium">Código</th>
                              <th className="pb-3 pr-4 font-medium">Estado</th>
                              {canManage && <th className="pb-3 font-medium" />}
                            </tr>
                          </thead>
                          <tbody>
                            {pouches.map((p) => (
                              <tr key={p.id} className="border-b border-white/5">
                                <td className="py-3 pr-4 font-mono text-white">{p.code}</td>
                                <td className="py-3 pr-4">
                                  <span
                                    className={`rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                                      p.status === "active"
                                        ? "text-gold"
                                        : p.status === "lost"
                                          ? "text-coral"
                                          : "text-white/50"
                                    }`}
                                  >
                                    {POUCH_STATUS_LABELS[p.status]}
                                  </span>
                                </td>
                                {canManage && (
                                  <td className="py-3">
                                    <div className="flex flex-wrap gap-2">
                                      {p.status === "active" ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handlePouchStatus(p, "lost")}
                                            className="rounded-full bg-coral/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-coral transition hover:bg-coral/25"
                                          >
                                            Perdida
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handlePouchStatus(p, "retired")}
                                            className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 transition hover:border-white/40 hover:text-white"
                                          >
                                            Dar de baja
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handlePouchStatus(p, "active")}
                                          className="rounded-full bg-gold/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-gold transition hover:bg-gold/25"
                                        >
                                          Reactivar
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {pouchTotal > pouches.length && (
                        <p className="mt-4 text-xs text-white/40">
                          Mostrando {pouches.length} de {pouchTotal}. Usa el buscador para acotar.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── overlay escáner QR ── */}
      {scanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-6">
          <div className="glass w-full max-w-md p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                Escaneando QR…
              </span>
              <button
                type="button"
                onClick={() => setScanning(false)}
                className="rounded-full border border-white/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white transition hover:border-gold hover:text-gold"
              >
                Cerrar
              </button>
            </div>
            <video ref={videoRef} muted playsInline className="mt-4 w-full rounded-xl bg-black/40" />
            <p className="mt-3 text-xs text-white/50">Apunta la cámara al código QR de la funda.</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
