import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

type ActiveStage = "lead" | "contactado" | "propuesta" | "negociacion";

const ACTIVE_STAGES: ActiveStage[] = ["lead", "contactado", "propuesta", "negociacion"];

const STAGE_LABELS: Record<ActiveStage, string> = {
  lead: "Lead",
  contactado: "Contactado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
};

const SOURCES = ["web", "whatsapp", "feria", "referido", "manual", "otro"] as const;

const SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  feria: "Feria",
  referido: "Referido",
  manual: "Manual",
  otro: "Otro",
};

interface BalanceRow {
  balance: number | string | null;
  days_overdue: number | null;
}

interface StageAmountRow {
  stage: ActiveStage;
  amount: number | string | null;
}

interface AmountRow {
  amount: number | string | null;
}

interface SourceRow {
  source: string | null;
}

interface ActiveImplRow {
  id: string;
  status: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface MilestoneRow {
  implementation_id: string;
  done: boolean;
}

interface ImplProgress {
  id: string;
  name: string;
  status: string;
  done: number;
  total: number;
}

interface DashData {
  // alertas
  webLeads: number;
  overdueCount: number;
  overdueAmount: number;
  quotesSent: number;
  ordersToShip: number;
  // ventas
  pipelineActive: number;
  stageCounts: Record<ActiveStage, number>;
  wonMonth: number;
  leadsBySource: Record<string, number>;
  leadsMonth: number;
  // finanzas
  receivableTotal: number;
  incomeMonth: number;
  expensesMonth: number;
  // operación
  warehouse: number;
  installed: number;
  assignedToday: number;
  lost: number;
  // clientes
  operating: number;
  customers: number;
  activeImpls: ImplProgress[];
}

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const labelClass = "font-mono text-[11px] uppercase tracking-[0.16em] text-white/50";
const subClass = "font-mono text-[10px] uppercase tracking-[0.12em] text-white/40";
const chipClass =
  "rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60";

function one<T extends { name: string }>(value: T | T[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "—";
  return value?.name ?? "—";
}

function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function num(value: number | string | null): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumAmounts(rows: AmountRow[] | null): number {
  return (rows ?? []).reduce((sum, r) => sum + num(r.amount), 0);
}

/** KPI clickeable: número grande que navega a su sección */
function Kpi({
  to,
  label,
  value,
  sub,
  tone = "text-white",
}: {
  to: string;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <Link to={to} className="group block min-w-0">
      <span className={labelClass}>{label}</span>
      <div className={`mt-1 truncate font-display text-2xl ${tone} transition group-hover:opacity-75`}>
        {value}
      </div>
      {sub && <div className={`mt-0.5 ${subClass}`}>{sub}</div>}
    </Link>
  );
}

/** Tarjeta de alerta: solo se renderiza si aplica */
function Alert({
  to,
  label,
  value,
  sub,
  tone,
}: {
  to: string;
  label: string;
  value: string;
  sub: string;
  tone: "gold" | "coral";
}) {
  return (
    <Link
      to={to}
      className={`glass block p-5 transition hover:-translate-y-0.5 ${
        tone === "coral" ? "border-coral/30" : "border-gold/30"
      }`}
    >
      <span className={labelClass}>{label}</span>
      <div className={`mt-1 font-display text-2xl ${tone === "coral" ? "text-coral" : "text-gold"}`}>
        {value}
      </div>
      <div className={`mt-0.5 ${subClass}`}>{sub}</div>
    </Link>
  );
}

export default function AdminDashboard({ session: _session }: { session: Session }) {
  const access = useMyAccess();

  const [data, setData] = useState<DashData | null>(null);

  const refresh = useCallback(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartISO = monthStart.toISOString();
    const monthStartDay = localDay(monthStart);
    const today = localDay(now);

    const [
      webLeadsRes,
      balancesRes,
      quotesSentRes,
      ordersToShipRes,
      pipelineRes,
      wonRes,
      leadsMonthRes,
      paymentsRes,
      expensesRes,
      warehouseRes,
      installedRes,
      assignedTodayRes,
      lostRes,
      operatingRes,
      activeImplsRes,
      milestonesRes,
      customersRes,
    ] = await Promise.all([
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("stage", "lead")
        .eq("source", "web"),
      supabase.from("invoice_balances").select("balance, days_overdue").eq("status", "emitida"),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("status", "enviada"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmada"),
      supabase.from("deals").select("stage, amount").in("stage", ACTIVE_STAGES),
      supabase.from("deals").select("amount").eq("stage", "ganado").gte("updated_at", monthStartISO),
      supabase.from("deals").select("source").gte("created_at", monthStartISO),
      supabase.from("payments").select("amount").gte("paid_at", monthStartDay),
      supabase.from("expenses").select("amount").gte("expense_date", monthStartDay),
      supabase
        .from("pouches")
        .select("id", { count: "exact", head: true })
        .is("tenant_id", null)
        .eq("status", "active"),
      supabase
        .from("pouches")
        .select("id", { count: "exact", head: true })
        .not("tenant_id", "is", null)
        .eq("status", "active"),
      supabase
        .from("pouch_assignments")
        .select("id", { count: "exact", head: true })
        .eq("assigned_on", today),
      supabase.from("pouches").select("id", { count: "exact", head: true }).eq("status", "lost"),
      supabase
        .from("implementations")
        .select("id", { count: "exact", head: true })
        .eq("status", "operando"),
      supabase
        .from("implementations")
        .select("id, status, tenants(name)")
        .not("status", "in", "(operando,pausado)"),
      supabase.from("implementation_milestones").select("implementation_id, done"),
      supabase
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("is_customer", true),
    ]);

    // por cobrar y vencido desde la vista invoice_balances
    const balances = (balancesRes.data as BalanceRow[]) ?? [];
    let receivableTotal = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    for (const row of balances) {
      const balance = num(row.balance);
      receivableTotal += balance;
      if ((row.days_overdue ?? 0) > 0) {
        overdueCount += 1;
        overdueAmount += balance;
      }
    }

    // pipeline activo + desglose por etapa
    const pipelineRows = (pipelineRes.data as StageAmountRow[]) ?? [];
    const stageCounts: Record<ActiveStage, number> = {
      lead: 0,
      contactado: 0,
      propuesta: 0,
      negociacion: 0,
    };
    let pipelineActive = 0;
    for (const row of pipelineRows) {
      pipelineActive += num(row.amount);
      if (row.stage in stageCounts) stageCounts[row.stage] += 1;
    }

    // leads del mes agrupados por fuente
    const leadRows = (leadsMonthRes.data as SourceRow[]) ?? [];
    const leadsBySource: Record<string, number> = {};
    for (const row of leadRows) {
      const source = row.source && SOURCE_LABELS[row.source] ? row.source : "otro";
      leadsBySource[source] = (leadsBySource[source] ?? 0) + 1;
    }

    // progreso de hitos por implementación activa
    const milestones = (milestonesRes.data as MilestoneRow[]) ?? [];
    const progress = new Map<string, { done: number; total: number }>();
    for (const m of milestones) {
      const entry = progress.get(m.implementation_id) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (m.done) entry.done += 1;
      progress.set(m.implementation_id, entry);
    }
    const activeImpls: ImplProgress[] = (((activeImplsRes.data as ActiveImplRow[]) ?? []).map(
      (impl) => ({
        id: impl.id,
        name: one(impl.tenants),
        status: impl.status,
        done: progress.get(impl.id)?.done ?? 0,
        total: progress.get(impl.id)?.total ?? 0,
      }),
    )).sort((a, b) => a.name.localeCompare(b.name));

    setData({
      webLeads: webLeadsRes.count ?? 0,
      overdueCount,
      overdueAmount,
      quotesSent: quotesSentRes.count ?? 0,
      ordersToShip: ordersToShipRes.count ?? 0,
      pipelineActive,
      stageCounts,
      wonMonth: sumAmounts(wonRes.data as AmountRow[]),
      leadsBySource,
      leadsMonth: leadRows.length,
      receivableTotal,
      incomeMonth: sumAmounts(paymentsRes.data as AmountRow[]),
      expensesMonth: sumAmounts(expensesRes.data as AmountRow[]),
      warehouse: warehouseRes.count ?? 0,
      installed: installedRes.count ?? 0,
      assignedToday: assignedTodayRes.count ?? 0,
      lost: lostRes.count ?? 0,
      operating: operatingRes.count ?? 0,
      customers: customersRes.count ?? 0,
      activeImpls,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="Dashboard">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Dashboard">
        <div className="glass p-7">
          <p className="text-sm text-white/50">Cargando…</p>
        </div>
      </AppShell>
    );
  }

  const netMonth = data.incomeMonth - data.expensesMonth;
  const hasAlerts =
    data.webLeads > 0 || data.overdueCount > 0 || data.quotesSent > 0 || data.ordersToShip > 0;

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        {/* ── alertas ── */}
        {hasAlerts && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.webLeads > 0 && (
              <Alert
                to="/admin/crm"
                label="Leads sin atender"
                value={String(data.webLeads)}
                sub="Llegaron desde el sitio"
                tone="gold"
              />
            )}
            {data.overdueCount > 0 && (
              <Alert
                to="/admin/finanzas"
                label="Facturas vencidas"
                value={`${data.overdueCount} · ${clp.format(data.overdueAmount)}`}
                sub="Cobranza pendiente"
                tone="coral"
              />
            )}
            {data.quotesSent > 0 && (
              <Alert
                to="/admin/cotizaciones"
                label="Cotizaciones sin respuesta"
                value={String(data.quotesSent)}
                sub="Enviadas, sin decisión"
                tone="gold"
              />
            )}
            {data.ordersToShip > 0 && (
              <Alert
                to="/admin/operaciones"
                label="Órdenes por despachar"
                value={String(data.ordersToShip)}
                sub="Confirmadas, sin despacho"
                tone="gold"
              />
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── ventas ── */}
          <div className="glass p-7">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">Ventas</h2>
              <Link
                to="/admin/crm"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40 transition hover:text-gold"
              >
                CRM →
              </Link>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Kpi
                to="/admin/crm"
                label="Pipeline activo"
                value={clp.format(data.pipelineActive)}
              />
              <Kpi
                to="/admin/crm"
                label="Ganado del mes"
                value={clp.format(data.wonMonth)}
                tone="text-gold"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {ACTIVE_STAGES.map((stage) => (
                <span key={stage} className={chipClass}>
                  {STAGE_LABELS[stage]} ·{" "}
                  <span className="text-white">{data.stageCounts[stage]}</span>
                </span>
              ))}
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <span className={labelClass}>
                Leads del mes · {data.leadsMonth === 0 ? "—" : data.leadsMonth}
              </span>
              {data.leadsMonth > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SOURCES.filter((s) => (data.leadsBySource[s] ?? 0) > 0).map((s) => (
                    <span key={s} className={chipClass}>
                      {SOURCE_LABELS[s]} ·{" "}
                      <span className="text-gold">{data.leadsBySource[s]}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── finanzas ── */}
          <div className="glass p-7">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">Finanzas</h2>
              <Link
                to="/admin/finanzas"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40 transition hover:text-gold"
              >
                Finanzas →
              </Link>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Kpi
                to="/admin/finanzas"
                label="Por cobrar"
                value={clp.format(data.receivableTotal)}
              />
              <Kpi
                to="/admin/finanzas"
                label="De eso, vencido"
                value={data.overdueAmount > 0 ? clp.format(data.overdueAmount) : "—"}
                sub={
                  data.overdueCount > 0
                    ? `${data.overdueCount} factura${data.overdueCount === 1 ? "" : "s"}`
                    : "Sin facturas vencidas"
                }
                tone={data.overdueAmount > 0 ? "text-coral" : "text-white/40"}
              />
            </div>

            <div className="mt-5 grid gap-5 border-t border-white/10 pt-4 sm:grid-cols-3">
              <Kpi
                to="/admin/finanzas"
                label="Ingresos del mes"
                value={clp.format(data.incomeMonth)}
              />
              <Kpi
                to="/admin/finanzas"
                label="Gastos del mes"
                value={clp.format(data.expensesMonth)}
              />
              <Kpi
                to="/admin/finanzas"
                label="Neto del mes"
                value={clp.format(netMonth)}
                tone={netMonth < 0 ? "text-coral" : "text-gold"}
              />
            </div>
          </div>

          {/* ── operación ── */}
          <div className="glass p-7">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">Operación</h2>
              <Link
                to="/admin/operaciones"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40 transition hover:text-gold"
              >
                Operaciones →
              </Link>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                to="/admin/operaciones"
                label="En bodega"
                value={String(data.warehouse)}
                sub="Fundas disponibles"
              />
              <Kpi
                to="/admin/operaciones"
                label="Instaladas"
                value={String(data.installed)}
                sub="En colegios"
              />
              <Kpi
                to="/fundas"
                label="Asignaciones hoy"
                value={String(data.assignedToday)}
                sub="Fundas entregadas"
              />
              <Kpi
                to="/admin/operaciones"
                label="Pérdidas"
                value={String(data.lost)}
                sub="Total histórico"
                tone={data.lost > 0 ? "text-coral" : "text-white"}
              />
            </div>
          </div>

          {/* ── clientes ── */}
          <div className="glass p-7">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">Clientes</h2>
              <Link
                to="/admin/implementaciones"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40 transition hover:text-gold"
              >
                Implementaciones →
              </Link>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Kpi
                to="/admin/implementaciones"
                label="Colegios operando"
                value={String(data.operating)}
                tone="text-gold"
              />
              <Kpi
                to="/admin/crm"
                label="Clientes operativos"
                value={String(data.customers)}
                sub="Cuentas activas"
              />
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <span className={labelClass}>
                Implementaciones activas · {data.activeImpls.length === 0 ? "—" : data.activeImpls.length}
              </span>
              {data.activeImpls.length > 0 && (
                <div className="mt-3 space-y-2">
                  {data.activeImpls.map((impl) => (
                    <Link
                      key={impl.id}
                      to="/admin/implementaciones"
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 transition hover:border-gold/40"
                    >
                      <span className="truncate text-sm text-white">{impl.name}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
                        Hitos{" "}
                        <span className={impl.total > 0 && impl.done === impl.total ? "text-gold" : "text-white"}>
                          {impl.done}/{impl.total}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── accesos rápidos ── */}
        <div className="glass p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className={labelClass}>Accesos rápidos</span>
            {(
              [
                ["/admin/crm", "CRM"],
                ["/admin/cotizaciones", "Cotizador"],
                ["/admin/operaciones", "Operaciones"],
                ["/admin/implementaciones", "Implementaciones"],
                ["/admin/finanzas", "Finanzas"],
                ["/admin/users", "Usuarios"],
              ] as [string, string][]
            ).map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 transition hover:text-gold"
              >
                {label} →
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
