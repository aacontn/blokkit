import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

type Tab = "facturas" | "cobranza" | "gastos" | "caja";

type DocType = "factura" | "boleta" | "nota_credito" | "otro";

type InvoiceStatus = "emitida" | "pagada" | "anulada";

type PaymentMethod = "transferencia" | "cheque" | "efectivo" | "otro";

type ExpenseCategory =
  | "produccion"
  | "logistica"
  | "marketing"
  | "software"
  | "oficina"
  | "impuestos"
  | "otros";

type OrderStatus = "confirmada" | "despachada" | "completada" | "anulada";

interface CustomerSnapshot {
  institucion?: string | null;
  rut?: string | null;
  contacto?: string | null;
  email?: string | null;
}

interface InvoiceRow {
  id: string;
  order_id: string | null;
  tenant_id: string | null;
  customer_snapshot: CustomerSnapshot | null;
  folio: string | null;
  doc_type: DocType;
  net_total: number | string;
  iva_total: number | string;
  grand_total: number | string;
  issued_at: string;
  due_date: string | null;
  status: InvoiceStatus;
  notes: string | null;
  paid_amount: number | string;
  balance: number | string;
  days_overdue: number | string;
}

interface OrderRow {
  id: string;
  tenant_id: string | null;
  customer_snapshot: CustomerSnapshot | null;
  net_total: number | string;
  iva_total: number | string;
  grand_total: number | string;
  status: OrderStatus;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface TenantRow {
  id: string;
  name: string;
}

interface PaymentRow {
  id: string;
  invoice_id: string;
  amount: number | string;
  paid_at: string;
  method: PaymentMethod;
  reference: string | null;
}

interface CashPaymentRow {
  amount: number | string;
  paid_at: string;
}

interface CashExpenseRow {
  amount: number | string;
  expense_date: string;
}

interface ExpenseRow {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  amount: number | string;
}

interface Notice {
  kind: "ok" | "error";
  text: string;
}

const DOC_TYPES: DocType[] = ["factura", "boleta", "nota_credito", "otro"];

const DOC_TYPE_LABELS: Record<DocType, string> = {
  factura: "Factura",
  boleta: "Boleta",
  nota_credito: "Nota de crédito",
  otro: "Otro",
};

const PAYMENT_METHODS: PaymentMethod[] = ["transferencia", "cheque", "efectivo", "otro"];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  transferencia: "Transferencia",
  cheque: "Cheque",
  efectivo: "Efectivo",
  otro: "Otro",
};

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "produccion",
  "logistica",
  "marketing",
  "software",
  "oficina",
  "impuestos",
  "otros",
];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  produccion: "Producción",
  logistica: "Logística",
  marketing: "Marketing",
  software: "Software",
  oficina: "Oficina",
  impuestos: "Impuestos",
  otros: "Otros",
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
const primaryBtnClass =
  "rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtnClass =
  "rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50";
const chipClass =
  "rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70";
const badgeClass =
  "rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]";

function one<T extends { name: string }>(value: T | T[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "—";
  return value?.name ?? "—";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, (d || 1) + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m || 1, 1); // m es 1-based: aquí ya es el mes siguiente
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function sixMonthsStartISO(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function monthLabel(d: Date): string {
  const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** fecha date-only sin corrimiento por zona horaria */
function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function invoiceStatusBadge(inv: InvoiceRow) {
  const overdue = Number(inv.days_overdue) || 0;
  if (inv.status === "pagada") {
    return <span className={`${badgeClass} font-semibold text-gold`}>Pagada</span>;
  }
  if (inv.status === "anulada") {
    return <span className={`${badgeClass} text-coral`}>Anulada</span>;
  }
  if (overdue > 0) {
    return <span className={`${badgeClass} text-coral`}>Vencida +{overdue}d</span>;
  }
  return <span className={`${badgeClass} text-white/60`}>Emitida</span>;
}

export default function AdminFinance({ session }: { session: Session }) {
  const access = useMyAccess();

  const [tab, setTab] = useState<Tab>("facturas");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── datos compartidos ── */
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [cashPayments, setCashPayments] = useState<CashPaymentRow[]>([]);
  const [cashExpenses, setCashExpenses] = useState<CashExpenseRow[]>([]);

  /* ── facturas: form de creación ── */
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invOrderId, setInvOrderId] = useState("");
  const [invClient, setInvClient] = useState("");
  const [invDocType, setInvDocType] = useState<DocType>("factura");
  const [invNet, setInvNet] = useState("");
  const [invIva, setInvIva] = useState("");
  const [invGrand, setInvGrand] = useState("");
  const [invFolio, setInvFolio] = useState("");
  const [invIssued, setInvIssued] = useState(todayISO());
  const [invDue, setInvDue] = useState(addDaysISO(todayISO(), 30));
  const [invNotes, setInvNotes] = useState("");
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  /* ── facturas: acciones por fila ── */
  const [payForId, setPayForId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState<PaymentMethod>("transferencia");
  const [payReference, setPayReference] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const [paymentsForId, setPaymentsForId] = useState<string | null>(null);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const [folioEditId, setFolioEditId] = useState<string | null>(null);
  const [folioDraft, setFolioDraft] = useState("");
  const [savingFolio, setSavingFolio] = useState(false);
  const [annullingId, setAnnullingId] = useState<string | null>(null);

  /* ── gastos ── */
  const [expenseMonth, setExpenseMonth] = useState(currentMonthKey());
  const [monthExpenses, setMonthExpenses] = useState<ExpenseRow[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expDate, setExpDate] = useState(todayISO());
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("produccion");
  const [expDescription, setExpDescription] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const since = sixMonthsStartISO();
    const [inv, ords, tens, pays, exps] = await Promise.all([
      supabase
        .from("invoice_balances")
        .select(
          "id, order_id, tenant_id, customer_snapshot, folio, doc_type, net_total, iva_total, grand_total, issued_at, due_date, status, notes, paid_amount, balance, days_overdue",
        )
        .order("issued_at", { ascending: false }),
      supabase
        .from("orders")
        .select(
          "id, tenant_id, customer_snapshot, net_total, iva_total, grand_total, status, created_at, tenants(name)",
        )
        .in("status", ["confirmada", "despachada", "completada"])
        .order("created_at", { ascending: false }),
      supabase.from("tenants").select("id, name"),
      supabase.from("payments").select("amount, paid_at").gte("paid_at", since),
      supabase.from("expenses").select("amount, expense_date").gte("expense_date", since),
    ]);
    setInvoices((inv.data as InvoiceRow[]) ?? []);
    setOrders((ords.data as OrderRow[]) ?? []);
    setTenants((tens.data as TenantRow[]) ?? []);
    setCashPayments((pays.data as CashPaymentRow[]) ?? []);
    setCashExpenses((exps.data as CashExpenseRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadMonthExpenses = useCallback(async (month: string) => {
    setLoadingExpenses(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("id, expense_date, category, description, amount")
      .gte("expense_date", `${month}-01`)
      .lt("expense_date", nextMonthStart(month))
      .order("expense_date", { ascending: false });
    if (!error) setMonthExpenses((data as ExpenseRow[]) ?? []);
    setLoadingExpenses(false);
  }, []);

  useEffect(() => {
    loadMonthExpenses(expenseMonth);
  }, [expenseMonth, loadMonthExpenses]);

  /* ── derivados ── */
  const tenantNameById = useMemo(
    () => new Map(tenants.map((t) => [t.id, t.name])),
    [tenants],
  );

  const clientLabel = useCallback(
    (inv: InvoiceRow): string => {
      const snapshot = inv.customer_snapshot?.institucion?.trim();
      if (snapshot) return snapshot;
      if (inv.tenant_id) return tenantNameById.get(inv.tenant_id) ?? "—";
      return "—";
    },
    [tenantNameById],
  );

  const orderClientLabel = useCallback((order: OrderRow): string => {
    const snapshot = order.customer_snapshot?.institucion?.trim();
    if (snapshot) return snapshot;
    return one(order.tenants);
  }, []);

  const invoicedOrderIds = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoices) {
      if (inv.order_id) set.add(inv.order_id);
    }
    return set;
  }, [invoices]);

  const availableOrders = useMemo(
    () => orders.filter((o) => !invoicedOrderIds.has(o.id)),
    [orders, invoicedOrderIds],
  );

  const receivables = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "emitida" && (Number(i.balance) || 0) > 0)
        .slice()
        .sort((a, b) => (Number(b.days_overdue) || 0) - (Number(a.days_overdue) || 0)),
    [invoices],
  );

  const aging = useMemo(() => {
    const make = () => ({ count: 0, sum: 0 });
    const buckets = { alDia: make(), d1a30: make(), d31a60: make(), d60: make() };
    let total = 0;
    for (const inv of receivables) {
      const balance = Number(inv.balance) || 0;
      const overdue = Number(inv.days_overdue) || 0;
      total += balance;
      const bucket =
        overdue <= 0
          ? buckets.alDia
          : overdue <= 30
            ? buckets.d1a30
            : overdue <= 60
              ? buckets.d31a60
              : buckets.d60;
      bucket.count += 1;
      bucket.sum += balance;
    }
    return { buckets, total };
  }, [receivables]);

  const cashMonths = useMemo(() => {
    const now = new Date();
    const rows: { key: string; label: string; ingresos: number; gastos: number; neto: number }[] =
      [];
    for (let i = 0; i < 6; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      const ingresos = cashPayments.reduce(
        (sum, p) => (p.paid_at?.startsWith(key) ? sum + (Number(p.amount) || 0) : sum),
        0,
      );
      const gastos = cashExpenses.reduce(
        (sum, e) => (e.expense_date?.startsWith(key) ? sum + (Number(e.amount) || 0) : sum),
        0,
      );
      rows.push({ key, label: monthLabel(d), ingresos, gastos, neto: ingresos - gastos });
    }
    return rows;
  }, [cashPayments, cashExpenses]);

  const currentMonth = cashMonths[0];

  const monthExpensesTotal = useMemo(
    () => monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [monthExpenses],
  );

  /* ════ facturas: form de creación ════ */
  const resetInvoiceForm = () => {
    setInvOrderId("");
    setInvClient("");
    setInvDocType("factura");
    setInvNet("");
    setInvIva("");
    setInvGrand("");
    setInvFolio("");
    setInvIssued(todayISO());
    setInvDue(addDaysISO(todayISO(), 30));
    setInvNotes("");
  };

  const applyOrderToForm = (orderId: string) => {
    setInvOrderId(orderId);
    if (!orderId) {
      setInvClient("");
      return;
    }
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setInvClient(orderClientLabel(order));
    setInvNet(String(Number(order.net_total) || 0));
    setInvIva(String(Number(order.iva_total) || 0));
    setInvGrand(String(Number(order.grand_total) || 0));
  };

  const handleNetChange = (value: string) => {
    setInvNet(value);
    const net = parseInt(value, 10);
    if (!Number.isInteger(net) || net < 0) return;
    if (invDocType === "factura") {
      const iva = Math.round(net * 0.19);
      setInvIva(String(iva));
      setInvGrand(String(net + iva));
    } else {
      const iva = parseInt(invIva, 10);
      setInvGrand(String(net + (Number.isInteger(iva) ? iva : 0)));
    }
  };

  const handleIvaChange = (value: string) => {
    setInvIva(value);
    const iva = parseInt(value, 10);
    const net = parseInt(invNet, 10);
    if (Number.isInteger(iva) && Number.isInteger(net)) {
      setInvGrand(String(net + iva));
    }
  };

  const handleDocTypeChange = (value: DocType) => {
    setInvDocType(value);
    if (value === "factura") {
      const net = parseInt(invNet, 10);
      if (Number.isInteger(net) && net >= 0) {
        const iva = Math.round(net * 0.19);
        setInvIva(String(iva));
        setInvGrand(String(net + iva));
      }
    }
  };

  const handleCreateInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const order = invOrderId ? (orders.find((o) => o.id === invOrderId) ?? null) : null;
    if (!order && !invClient.trim()) {
      setNotice({ kind: "error", text: "Indica el cliente o selecciona una orden." });
      return;
    }
    const net = parseInt(invNet, 10);
    const iva = parseInt(invIva, 10);
    const grand = parseInt(invGrand, 10);
    if (!Number.isInteger(net) || net < 0 || !Number.isInteger(iva) || iva < 0) {
      setNotice({ kind: "error", text: "Neto e IVA deben ser montos enteros válidos." });
      return;
    }
    if (!Number.isInteger(grand) || grand <= 0) {
      setNotice({ kind: "error", text: "El total debe ser un monto entero mayor a cero." });
      return;
    }
    if (!invIssued) {
      setNotice({ kind: "error", text: "Indica la fecha de emisión." });
      return;
    }

    setCreatingInvoice(true);
    const { error } = await supabase.from("invoices").insert({
      order_id: order ? order.id : null,
      tenant_id: order ? order.tenant_id : null,
      customer_snapshot: order
        ? (order.customer_snapshot ?? { institucion: orderClientLabel(order) })
        : { institucion: invClient.trim() },
      folio: invFolio.trim() || null,
      doc_type: invDocType,
      net_total: net,
      iva_total: iva,
      grand_total: grand,
      issued_at: invIssued,
      due_date: invDue || null,
      status: "emitida",
      notes: invNotes.trim() || null,
    });
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: "Factura creada." });
      resetInvoiceForm();
      setShowInvoiceForm(false);
      await refresh();
    }
    setCreatingInvoice(false);
  };

  /* ════ pagos ════ */
  const loadPayments = useCallback(async (invoiceId: string) => {
    setLoadingPayments(true);
    const { data, error } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, paid_at, method, reference")
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false });
    if (!error) setPaymentRows((data as PaymentRow[]) ?? []);
    setLoadingPayments(false);
  }, []);

  const openPayPanel = (inv: InvoiceRow) => {
    setNotice(null);
    setPayForId(inv.id);
    setPayAmount(String(Number(inv.balance) || 0));
    setPayDate(todayISO());
    setPayMethod("transferencia");
    setPayReference("");
  };

  const handleRegisterPayment = async (event: FormEvent<HTMLFormElement>, inv: InvoiceRow) => {
    event.preventDefault();
    setNotice(null);
    const amount = parseInt(payAmount, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      setNotice({ kind: "error", text: "El monto del pago debe ser un entero mayor a cero." });
      return;
    }
    if (!payDate) {
      setNotice({ kind: "error", text: "Indica la fecha del pago." });
      return;
    }
    setSavingPayment(true);
    const { error } = await supabase.from("payments").insert({
      invoice_id: inv.id,
      amount,
      paid_at: payDate,
      method: payMethod,
      reference: payReference.trim() || null,
    });
    if (error) {
      setNotice({ kind: "error", text: error.message });
      setSavingPayment(false);
      return;
    }
    // el trigger en BD actualiza el estado solo: consultamos cómo quedó
    const { data: after } = await supabase
      .from("invoice_balances")
      .select("status")
      .eq("id", inv.id)
      .maybeSingle();
    if ((after as { status?: InvoiceStatus } | null)?.status === "pagada") {
      setNotice({ kind: "ok", text: "Factura pagada completa." });
    } else {
      setNotice({ kind: "ok", text: "Pago registrado." });
    }
    setPayForId(null);
    if (paymentsForId === inv.id) await loadPayments(inv.id);
    await refresh();
    setSavingPayment(false);
  };

  const togglePayments = async (inv: InvoiceRow) => {
    if (paymentsForId === inv.id) {
      setPaymentsForId(null);
      setPaymentRows([]);
      return;
    }
    setPaymentsForId(inv.id);
    setPaymentRows([]);
    await loadPayments(inv.id);
  };

  const handleDeletePayment = async (payment: PaymentRow) => {
    if (!window.confirm("¿Eliminar este pago? La factura puede volver a quedar emitida.")) return;
    setDeletingPaymentId(payment.id);
    setNotice(null);
    const { error } = await supabase.from("payments").delete().eq("id", payment.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: "Pago eliminado." });
      await loadPayments(payment.invoice_id);
      await refresh();
    }
    setDeletingPaymentId(null);
  };

  /* ════ facturas: anular y folio ════ */
  const handleAnnul = async (inv: InvoiceRow) => {
    if (!window.confirm(`¿Anular la factura de ${clientLabel(inv)}?`)) return;
    setAnnullingId(inv.id);
    setNotice(null);
    const { error } = await supabase
      .from("invoices")
      .update({ status: "anulada" })
      .eq("id", inv.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: "Factura anulada." });
      await refresh();
    }
    setAnnullingId(null);
  };

  const startFolioEdit = (inv: InvoiceRow) => {
    setFolioEditId(inv.id);
    setFolioDraft(inv.folio ?? "");
  };

  const handleSaveFolio = async (inv: InvoiceRow) => {
    setSavingFolio(true);
    setNotice(null);
    const { error } = await supabase
      .from("invoices")
      .update({ folio: folioDraft.trim() || null })
      .eq("id", inv.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setFolioEditId(null);
      await refresh();
    }
    setSavingFolio(false);
  };

  /* ════ gastos ════ */
  const handleCreateExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!expDescription.trim()) {
      setNotice({ kind: "error", text: "Describe el gasto." });
      return;
    }
    const amount = parseInt(expAmount, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      setNotice({ kind: "error", text: "El monto debe ser un entero mayor a cero." });
      return;
    }
    if (!expDate) {
      setNotice({ kind: "error", text: "Indica la fecha del gasto." });
      return;
    }
    setCreatingExpense(true);
    const { error } = await supabase.from("expenses").insert({
      expense_date: expDate,
      category: expCategory,
      description: expDescription.trim(),
      amount,
    });
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: "Gasto registrado." });
      setExpDescription("");
      setExpAmount("");
      await Promise.all([loadMonthExpenses(expenseMonth), refresh()]);
    }
    setCreatingExpense(false);
  };

  const handleDeleteExpense = async (expense: ExpenseRow) => {
    if (!window.confirm(`¿Eliminar el gasto "${expense.description}"?`)) return;
    setDeletingExpenseId(expense.id);
    setNotice(null);
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      await Promise.all([loadMonthExpenses(expenseMonth), refresh()]);
    }
    setDeletingExpenseId(null);
  };

  /* ── panel de pago compartido (Facturas y Por cobrar) ── */
  const renderPayForm = (inv: InvoiceRow) => (
    <form
      onSubmit={(e) => handleRegisterPayment(e, inv)}
      className="rounded-xl border border-gold/30 bg-white/5 p-5"
    >
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
        Registrar pago · {clientLabel(inv)}
        {inv.folio ? ` · folio ${inv.folio}` : ""}
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={labelClass}>Monto (CLP)</span>
          <input
            type="number"
            min={1}
            step={1}
            required
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Fecha</span>
          <input
            type="date"
            required
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Medio</span>
          <select
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
            className={selectClass}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Referencia</span>
          <input
            value={payReference}
            onChange={(e) => setPayReference(e.target.value)}
            placeholder="N° de operación"
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={savingPayment} className={primaryBtnClass}>
          {savingPayment ? "Registrando…" : "Registrar pago"}
        </button>
        <button type="button" onClick={() => setPayForId(null)} className={secondaryBtnClass}>
          Cancelar
        </button>
      </div>
    </form>
  );

  const renderPaymentsHistory = (inv: InvoiceRow) => (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
        Pagos · {clientLabel(inv)}
      </h3>
      {loadingPayments ? (
        <p className="mt-4 text-sm text-white/50">Cargando…</p>
      ) : paymentRows.length === 0 ? (
        <p className="mt-4 text-sm text-white/50">Sin pagos registrados.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {paymentRows.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-white">
                  {clp.format(Number(p.amount) || 0)}
                </span>
                <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                  {formatDay(p.paid_at)} · {METHOD_LABELS[p.method]}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDeletePayment(p)}
                disabled={deletingPaymentId === p.id}
                className="rounded-full bg-coral/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-coral transition hover:bg-coral/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingPaymentId === p.id ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ════ guard ════ */
  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="Finanzas">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Finanzas">
      <div className="space-y-6">
        {/* ── pestañas ── */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["facturas", "Facturas"],
              ["cobranza", "Por cobrar"],
              ["gastos", "Gastos"],
              ["caja", "Caja"],
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

        {/* ════ pestaña: facturas ════ */}
        {tab === "facturas" && (
          <div className="space-y-6">
            <div className="glass p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="font-display text-lg uppercase text-white">Facturas</h2>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    if (showInvoiceForm) {
                      setShowInvoiceForm(false);
                    } else {
                      resetInvoiceForm();
                      setShowInvoiceForm(true);
                    }
                  }}
                  className={showInvoiceForm ? secondaryBtnClass : primaryBtnClass}
                >
                  {showInvoiceForm ? "Cerrar" : "Nueva factura"}
                </button>
              </div>

              {showInvoiceForm && (
                <form
                  onSubmit={handleCreateInvoice}
                  className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5"
                >
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                    Nueva factura
                  </h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block sm:col-span-2 lg:col-span-2">
                      <span className={labelClass}>Orden (opcional)</span>
                      <select
                        value={invOrderId}
                        onChange={(e) => applyOrderToForm(e.target.value)}
                        className={selectClass}
                      >
                        <option value="">— Sin orden (manual) —</option>
                        {availableOrders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {orderClientLabel(o)} · {clp.format(Number(o.grand_total) || 0)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelClass}>Cliente</span>
                      <input
                        value={invClient}
                        onChange={(e) => setInvClient(e.target.value)}
                        disabled={!!invOrderId}
                        placeholder="Colegio San Ejemplo"
                        className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Documento</span>
                      <select
                        value={invDocType}
                        onChange={(e) => handleDocTypeChange(e.target.value as DocType)}
                        className={selectClass}
                      >
                        {DOC_TYPES.map((d) => (
                          <option key={d} value={d}>
                            {DOC_TYPE_LABELS[d]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelClass}>Neto (CLP)</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={invNet}
                        onChange={(e) => handleNetChange(e.target.value)}
                        placeholder="2500000"
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>IVA (CLP)</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={invIva}
                        onChange={(e) => handleIvaChange(e.target.value)}
                        placeholder="475000"
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Total (CLP)</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={invGrand}
                        onChange={(e) => setInvGrand(e.target.value)}
                        placeholder="2975000"
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Folio SII (opcional)</span>
                      <input
                        value={invFolio}
                        onChange={(e) => setInvFolio(e.target.value)}
                        placeholder="Se puede completar después"
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Fecha emisión</span>
                      <input
                        type="date"
                        required
                        value={invIssued}
                        onChange={(e) => setInvIssued(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Vencimiento</span>
                      <input
                        type="date"
                        value={invDue}
                        onChange={(e) => setInvDue(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <label className="block sm:col-span-2 lg:col-span-3">
                      <span className={labelClass}>Notas</span>
                      <input
                        value={invNotes}
                        onChange={(e) => setInvNotes(e.target.value)}
                        placeholder="OC del cliente, condiciones de pago…"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="submit" disabled={creatingInvoice} className={primaryBtnClass}>
                      {creatingInvoice ? "Creando…" : "Crear factura"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInvoiceForm(false)}
                      className={secondaryBtnClass}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {loading ? (
                <p className="mt-6 text-sm text-white/50">Cargando…</p>
              ) : invoices.length === 0 ? (
                <p className="mt-6 text-sm text-white/50">Aún no hay facturas.</p>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                        <th className="pb-3 pr-4 font-medium">Folio</th>
                        <th className="pb-3 pr-4 font-medium">Cliente</th>
                        <th className="pb-3 pr-4 font-medium">Total</th>
                        <th className="pb-3 pr-4 font-medium">Pagado</th>
                        <th className="pb-3 pr-4 font-medium">Saldo</th>
                        <th className="pb-3 pr-4 font-medium">Estado</th>
                        <th className="pb-3 pr-4 font-medium">Vencimiento</th>
                        <th className="pb-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <Fragment key={inv.id}>
                          <tr className="border-b border-white/5">
                            <td className="py-3 pr-4">
                              {folioEditId === inv.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    value={folioDraft}
                                    onChange={(e) => setFolioDraft(e.target.value)}
                                    placeholder="N° SII"
                                    className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveFolio(inv)}
                                    disabled={savingFolio}
                                    className="font-mono text-[9px] uppercase tracking-[0.12em] text-gold transition hover:text-white disabled:opacity-50"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFolioEditId(null)}
                                    className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40 transition hover:text-white"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {inv.folio ? (
                                    <span className="font-mono text-white">{inv.folio}</span>
                                  ) : (
                                    <span className="text-white/40">s/folio</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => startFolioEdit(inv)}
                                    className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40 transition hover:text-gold"
                                  >
                                    Editar
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="text-white">{clientLabel(inv)}</div>
                              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                                {DOC_TYPE_LABELS[inv.doc_type]} · {formatDay(inv.issued_at)}
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-white/80">
                              {clp.format(Number(inv.grand_total) || 0)}
                            </td>
                            <td className="py-3 pr-4 text-white/80">
                              {clp.format(Number(inv.paid_amount) || 0)}
                            </td>
                            <td className="py-3 pr-4 font-semibold text-white">
                              {clp.format(Number(inv.balance) || 0)}
                            </td>
                            <td className="py-3 pr-4">{invoiceStatusBadge(inv)}</td>
                            <td className="py-3 pr-4 text-white/60">{formatDay(inv.due_date)}</td>
                            <td className="py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                {inv.status === "emitida" && (Number(inv.balance) || 0) > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openPayPanel(inv)}
                                    className="rounded-full bg-gold px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:-translate-y-0.5"
                                  >
                                    Pago
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => togglePayments(inv)}
                                  className="rounded-full border border-white/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 transition hover:border-gold hover:text-gold"
                                >
                                  {paymentsForId === inv.id ? "Cerrar" : "Pagos"}
                                </button>
                                {inv.status !== "anulada" && (
                                  <button
                                    type="button"
                                    onClick={() => handleAnnul(inv)}
                                    disabled={annullingId === inv.id}
                                    className="rounded-full bg-coral/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-coral transition hover:bg-coral/25 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Anular
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {payForId === inv.id && (
                            <tr className="border-b border-white/5">
                              <td colSpan={8} className="py-3">
                                {renderPayForm(inv)}
                              </td>
                            </tr>
                          )}
                          {paymentsForId === inv.id && (
                            <tr className="border-b border-white/5">
                              <td colSpan={8} className="py-3">
                                {renderPaymentsHistory(inv)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ pestaña: por cobrar ════ */}
        {tab === "cobranza" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                <span className={chipClass}>
                  Al día · {aging.buckets.alDia.count} ·{" "}
                  <span className="text-white">{clp.format(aging.buckets.alDia.sum)}</span>
                </span>
                <span className={chipClass}>
                  Vencida 1–30 · {aging.buckets.d1a30.count} ·{" "}
                  <span className="text-coral">{clp.format(aging.buckets.d1a30.sum)}</span>
                </span>
                <span className={chipClass}>
                  Vencida 31–60 · {aging.buckets.d31a60.count} ·{" "}
                  <span className="text-coral">{clp.format(aging.buckets.d31a60.sum)}</span>
                </span>
                <span className={chipClass}>
                  Vencida +60 · {aging.buckets.d60.count} ·{" "}
                  <span className="text-coral">{clp.format(aging.buckets.d60.sum)}</span>
                </span>
              </div>
              <div className="text-right">
                <span className={labelClass}>Total por cobrar</span>
                <div className="mt-1 text-2xl font-semibold text-gold">
                  {clp.format(aging.total)}
                </div>
              </div>
            </div>

            <div className="glass p-7">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg uppercase text-white">Cobranza</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                  {receivables.length} factura{receivables.length === 1 ? "" : "s"} con saldo
                </span>
              </div>

              {loading ? (
                <p className="mt-6 text-sm text-white/50">Cargando…</p>
              ) : receivables.length === 0 ? (
                <p className="mt-6 text-sm text-white/50">Nada pendiente de cobro.</p>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                        <th className="pb-3 pr-4 font-medium">Cliente</th>
                        <th className="pb-3 pr-4 font-medium">Folio</th>
                        <th className="pb-3 pr-4 font-medium">Saldo</th>
                        <th className="pb-3 pr-4 font-medium">Vencimiento</th>
                        <th className="pb-3 pr-4 font-medium">Días vencida</th>
                        <th className="pb-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {receivables.map((inv) => {
                        const overdue = Number(inv.days_overdue) || 0;
                        return (
                          <Fragment key={inv.id}>
                            <tr className="border-b border-white/5">
                              <td className="py-3 pr-4 text-white">{clientLabel(inv)}</td>
                              <td className="py-3 pr-4">
                                {inv.folio ? (
                                  <span className="font-mono text-white/80">{inv.folio}</span>
                                ) : (
                                  <span className="text-white/40">s/folio</span>
                                )}
                              </td>
                              <td className="py-3 pr-4 font-semibold text-white">
                                {clp.format(Number(inv.balance) || 0)}
                              </td>
                              <td className="py-3 pr-4 text-white/60">{formatDay(inv.due_date)}</td>
                              <td
                                className={`py-3 pr-4 ${overdue > 0 ? "text-coral" : "text-white/60"}`}
                              >
                                {overdue > 0 ? `+${overdue}d` : "Al día"}
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => openPayPanel(inv)}
                                  className="rounded-full bg-gold px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:-translate-y-0.5"
                                >
                                  Pago
                                </button>
                              </td>
                            </tr>
                            {payForId === inv.id && (
                              <tr className="border-b border-white/5">
                                <td colSpan={6} className="py-3">
                                  {renderPayForm(inv)}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ pestaña: gastos ════ */}
        {tab === "gastos" && (
          <div className="glass p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">Gastos</h2>
              <label className="block">
                <span className="sr-only">Mes</span>
                <input
                  type="month"
                  value={expenseMonth}
                  onChange={(e) => setExpenseMonth(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </label>
            </div>

            <form
              onSubmit={handleCreateExpense}
              className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            >
              <label className="block">
                <span className={labelClass}>Fecha</span>
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Categoría</span>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className={selectClass}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Descripción</span>
                <input
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  placeholder="Fletes a colegios, hosting…"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Monto (CLP)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="150000"
                  className={inputClass}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creatingExpense}
                  className={`w-full ${primaryBtnClass}`}
                >
                  {creatingExpense ? "Registrando…" : "Registrar"}
                </button>
              </div>
            </form>

            {loadingExpenses ? (
              <p className="mt-6 text-sm text-white/50">Cargando…</p>
            ) : monthExpenses.length === 0 ? (
              <p className="mt-6 text-sm text-white/50">Sin gastos registrados este mes.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                      <th className="pb-3 pr-4 font-medium">Fecha</th>
                      <th className="pb-3 pr-4 font-medium">Categoría</th>
                      <th className="pb-3 pr-4 font-medium">Descripción</th>
                      <th className="pb-3 pr-4 font-medium">Monto</th>
                      <th className="pb-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {monthExpenses.map((e) => (
                      <tr key={e.id} className="border-b border-white/5">
                        <td className="py-3 pr-4 text-white/60">{formatDay(e.expense_date)}</td>
                        <td className="py-3 pr-4">
                          <span className={`${badgeClass} text-white/70`}>
                            {CATEGORY_LABELS[e.category]}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-white">{e.description}</td>
                        <td className="py-3 pr-4 text-white/80">
                          {clp.format(Number(e.amount) || 0)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(e)}
                            disabled={deletingExpenseId === e.id}
                            className="rounded-full bg-coral/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-coral transition hover:bg-coral/25 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingExpenseId === e.id ? "Eliminando…" : "Eliminar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td
                        colSpan={3}
                        className="pt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50"
                      >
                        Total del mes
                      </td>
                      <td className="pt-4 font-semibold text-white">
                        {clp.format(monthExpensesTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════ pestaña: caja ════ */}
        {tab === "caja" && (
          <div className="space-y-6">
            {currentMonth && (
              <div className="flex flex-wrap gap-2">
                <span className={chipClass}>
                  Ingresos del mes ·{" "}
                  <span className="text-gold">{clp.format(currentMonth.ingresos)}</span>
                </span>
                <span className={chipClass}>
                  Gastos del mes ·{" "}
                  <span className="text-coral">{clp.format(currentMonth.gastos)}</span>
                </span>
                <span className={chipClass}>
                  Neto ·{" "}
                  <span className={currentMonth.neto >= 0 ? "text-gold" : "text-coral"}>
                    {clp.format(currentMonth.neto)}
                  </span>
                </span>
              </div>
            )}

            <div className="glass p-7">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg uppercase text-white">Caja</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                  Últimos 6 meses
                </span>
              </div>

              {loading ? (
                <p className="mt-6 text-sm text-white/50">Cargando…</p>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                        <th className="pb-3 pr-4 font-medium">Mes</th>
                        <th className="pb-3 pr-4 font-medium">Ingresos</th>
                        <th className="pb-3 pr-4 font-medium">Gastos</th>
                        <th className="pb-3 font-medium">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashMonths.map((m) => {
                        const isCurrent = m.key === currentMonthKey();
                        return (
                          <tr
                            key={m.key}
                            className={`border-b border-white/5 ${isCurrent ? "bg-gold/5" : ""}`}
                          >
                            <td className="py-3 pr-4">
                              <span className={isCurrent ? "font-medium text-gold" : "text-white"}>
                                {m.label}
                              </span>
                              {isCurrent && (
                                <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                                  En curso
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-white/80">{clp.format(m.ingresos)}</td>
                            <td className="py-3 pr-4 text-white/80">{clp.format(m.gastos)}</td>
                            <td
                              className={`py-3 font-semibold ${m.neto >= 0 ? "text-gold" : "text-coral"}`}
                            >
                              {clp.format(m.neto)}
                            </td>
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
      </div>
    </AppShell>
  );
}
