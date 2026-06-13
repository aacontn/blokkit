import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

interface AdminOpsProps {
  session: Session;
}

type Tab = "bodega" | "ordenes" | "despachos";

type OrderStatus = "confirmada" | "despachada" | "completada" | "anulada";

type ShipmentStatus = "preparacion" | "despachado" | "recibido" | "anulado";

type PouchStatus = "active" | "lost" | "retired";

interface TenantRow {
  id: string;
  name: string;
}

interface ProductRow {
  id: string;
  name: string;
  unit_price: number | string;
}

interface OrderItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

interface OrderRow {
  id: string;
  tenant_id: string | null;
  customer_snapshot: { institucion?: string | null } | null;
  items: OrderItem[] | null;
  grand_total: number | string;
  status: OrderStatus;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface ShipmentItem {
  descripcion: string;
  qty: number;
  codes?: string[];
}

interface ShipmentRow {
  id: string;
  order_id: string | null;
  tenant_id: string;
  status: ShipmentStatus;
  items: ShipmentItem[] | null;
  carrier: string | null;
  tracking: string | null;
  shipped_at: string | null;
  received_at: string | null;
  received_by: string | null;
  notes: string | null;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface LostPouchRow {
  id: string;
  tenant_id: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface SearchPouchRow {
  id: string;
  code: string;
  status: PouchStatus;
  tenant_id: string | null;
  tenants: { name: string } | { name: string }[] | null;
}

interface Notice {
  kind: "ok" | "error";
  text: string;
}

interface ShipRowDraft {
  descripcion: string;
  qty: string;
}

const ORDER_STATUSES: OrderStatus[] = ["confirmada", "despachada", "completada", "anulada"];

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  confirmada: "Confirmada",
  despachada: "Despachada",
  completada: "Completada",
  anulada: "Anulada",
};

const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  confirmada: "text-white/60",
  despachada: "text-gold",
  completada: "text-gold font-semibold",
  anulada: "text-coral",
};

const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  preparacion: "Preparación",
  despachado: "Despachado",
  recibido: "Recibido",
  anulado: "Anulado",
};

const SHIPMENT_STATUS_CLASS: Record<ShipmentStatus, string> = {
  preparacion: "text-white/60",
  despachado: "text-gold",
  recibido: "text-gold font-semibold",
  anulado: "text-coral",
};

const POUCH_STATUS_LABELS: Record<PouchStatus, string> = {
  active: "Activa",
  lost: "Perdida",
  retired: "De baja",
};

const POUCH_STATUS_CLASS: Record<PouchStatus, string> = {
  active: "text-gold",
  lost: "text-coral",
  retired: "text-white/50",
};

const FALLBACK_POUCH_PRICE = 14990;

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

function formatDate(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseCodes(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  );
}

function clientLabel(order: OrderRow): string {
  const tenantName = one(order.tenants);
  if (tenantName !== "—") return tenantName;
  return order.customer_snapshot?.institucion?.trim() || "—";
}

function shipmentQty(shipment: ShipmentRow): number {
  return (shipment.items ?? []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
}

const EMPTY_SHIP_ROW: ShipRowDraft = { descripcion: "", qty: "1" };

export default function AdminOps({ session }: AdminOpsProps) {
  const access = useMyAccess();

  const [tab, setTab] = useState<Tab>("bodega");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── datos compartidos ── */
  const [counts, setCounts] = useState<{ warehouse: number; installed: number; lost: number } | null>(
    null,
  );
  const [lostRows, setLostRows] = useState<LostPouchRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  /* ── bodega: registro masivo ── */
  const [invText, setInvText] = useState("");
  const [rangePrefix, setRangePrefix] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [registering, setRegistering] = useState(false);

  /* ── bodega: buscador global ── */
  const [searchCode, setSearchCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchPouchRow[]>([]);

  /* ── despachos: form ── */
  const [shipOrderId, setShipOrderId] = useState("");
  const [shipTenantId, setShipTenantId] = useState("");
  const [shipRows, setShipRows] = useState<ShipRowDraft[]>([EMPTY_SHIP_ROW]);
  const [codesText, setCodesText] = useState("");
  const [takeN, setTakeN] = useState("");
  const [taking, setTaking] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [shipNotes, setShipNotes] = useState("");
  const [creatingShipment, setCreatingShipment] = useState(false);

  /* ── despachos: lista ── */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [wh, inst, lost, lostList, prods, ords, ships, tens] = await Promise.all([
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
      supabase.from("pouches").select("id", { count: "exact", head: true }).eq("status", "lost"),
      supabase
        .from("pouches")
        .select("id, tenant_id, tenants(name)")
        .eq("status", "lost")
        .not("tenant_id", "is", null),
      supabase.from("products").select("id, name, unit_price").eq("active", true).order("sort"),
      supabase
        .from("orders")
        .select(
          "id, tenant_id, customer_snapshot, items, grand_total, status, created_at, tenants(name)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("shipments")
        .select(
          "id, order_id, tenant_id, status, items, carrier, tracking, shipped_at, received_at, received_by, notes, created_at, tenants(name)",
        )
        .order("created_at", { ascending: false }),
      supabase.from("tenants").select("id, name").eq("is_customer", true).order("name"),
    ]);
    setCounts({ warehouse: wh.count ?? 0, installed: inst.count ?? 0, lost: lost.count ?? 0 });
    setLostRows((lostList.data as LostPouchRow[]) ?? []);
    setProducts((prods.data as ProductRow[]) ?? []);
    setOrders((ords.data as OrderRow[]) ?? []);
    setShipments((ships.data as ShipmentRow[]) ?? []);
    setTenants((tens.data as TenantRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* ── producto funda: nombre y precio de reposición ── */
  const fundaProduct = useMemo(
    () => products.find((p) => p.name.toLowerCase().startsWith("funda")) ?? null,
    [products],
  );

  const fundaPrice = useMemo(() => {
    const price = fundaProduct ? Number(fundaProduct.unit_price) : NaN;
    return Number.isFinite(price) && price > 0 ? price : FALLBACK_POUCH_PRICE;
  }, [fundaProduct]);

  const lostByTenant = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const row of lostRows) {
      const entry = map.get(row.tenant_id) ?? { name: one(row.tenants), count: 0 };
      entry.count += 1;
      map.set(row.tenant_id, entry);
    }
    return Array.from(map.entries())
      .map(([tenantId, value]) => ({ tenantId, ...value }))
      .sort((a, b) => b.count - a.count);
  }, [lostRows]);

  const selectableOrders = useMemo(
    () => orders.filter((o) => o.status !== "anulada"),
    [orders],
  );

  const shipCodes = useMemo(() => parseCodes(codesText), [codesText]);

  /* ════ bodega: registro masivo ════ */
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

  const handleRegisterWarehouse = async () => {
    const codes = parseCodes(invText);
    if (codes.length === 0) {
      setNotice({ kind: "error", text: "Ingresa al menos un código." });
      return;
    }
    setRegistering(true);
    setNotice(null);
    // el unique de pouches es (tenant_id, code) y NULL no conflictúa en Postgres:
    // consultamos primero los códigos ya existentes en bodega y filtramos
    const { data: existing, error: existingError } = await supabase
      .from("pouches")
      .select("code")
      .is("tenant_id", null)
      .in("code", codes);
    if (existingError) {
      setNotice({ kind: "error", text: existingError.message });
      setRegistering(false);
      return;
    }
    const existingSet = new Set(((existing as { code: string }[]) ?? []).map((r) => r.code));
    const fresh = codes.filter((c) => !existingSet.has(c));
    if (fresh.length > 0) {
      const { error } = await supabase
        .from("pouches")
        .insert(fresh.map((code) => ({ tenant_id: null, code, status: "active" })));
      if (error) {
        setNotice({ kind: "error", text: error.message });
        setRegistering(false);
        return;
      }
    }
    const duplicated = codes.length - fresh.length;
    setNotice({
      kind: "ok",
      text: `${fresh.length} funda${fresh.length === 1 ? "" : "s"} registrada${fresh.length === 1 ? "" : "s"} en bodega${
        duplicated > 0 ? ` (${duplicated} ya existía${duplicated === 1 ? "" : "n"})` : ""
      }.`,
    });
    setInvText("");
    await refresh();
    setRegistering(false);
  };

  /* ════ bodega: buscador global ════ */
  const handleSearchPouch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = searchCode.trim();
    if (!q) return;
    setSearching(true);
    setNotice(null);
    const { data, error } = await supabase
      .from("pouches")
      .select("id, code, status, tenant_id, tenants(name)")
      .ilike("code", `%${q}%`)
      .order("code")
      .limit(50);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setSearchResults((data as SearchPouchRow[]) ?? []);
      setSearched(true);
    }
    setSearching(false);
  };

  /* ════ órdenes ════ */
  const handleOrderStatus = async (order: OrderRow, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    const { error } = await supabase.from("orders").update({ status }).eq("id", order.id);
    if (error) {
      setNotice({ kind: "error", text: `No se pudo actualizar la orden: ${error.message}` });
      await refresh();
    }
  };

  const applyOrderToForm = (orderId: string) => {
    setShipOrderId(orderId);
    if (!orderId) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.tenant_id) setShipTenantId(order.tenant_id);
    const suggested = (order.items ?? [])
      .filter((it) => it.descripcion)
      .map((it) => ({ descripcion: it.descripcion, qty: String(it.cantidad ?? 1) }));
    if (suggested.length > 0) setShipRows(suggested);
  };

  const startShipmentFromOrder = (order: OrderRow) => {
    setNotice(null);
    applyOrderToForm(order.id);
    setTab("despachos");
  };

  /* ════ despachos: form ════ */
  const updateShipRow = (index: number, patch: Partial<ShipRowDraft>) => {
    setShipRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addShipRow = () => {
    setShipRows((prev) => [...prev, { ...EMPTY_SHIP_ROW }]);
  };

  const removeShipRow = (index: number) => {
    setShipRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleTakeFromWarehouse = async () => {
    const n = parseInt(takeN, 10);
    if (!Number.isInteger(n) || n <= 0) {
      setNotice({ kind: "error", text: "Indica cuántas fundas tomar de bodega." });
      return;
    }
    setTaking(true);
    setNotice(null);
    const { data, error } = await supabase
      .from("pouches")
      .select("code")
      .is("tenant_id", null)
      .eq("status", "active")
      .order("code")
      .limit(n);
    if (error) {
      setNotice({ kind: "error", text: error.message });
      setTaking(false);
      return;
    }
    const codes = ((data as { code: string }[]) ?? []).map((r) => r.code);
    if (codes.length === 0) {
      setNotice({ kind: "error", text: "No hay fundas disponibles en bodega." });
      setTaking(false);
      return;
    }
    setCodesText(codes.join("\n"));
    if (codes.length < n) {
      setNotice({
        kind: "error",
        text: `Solo hay ${codes.length} funda${codes.length === 1 ? "" : "s"} disponible${codes.length === 1 ? "" : "s"} en bodega (pediste ${n}).`,
      });
    } else {
      setNotice({ kind: "ok", text: `${codes.length} códigos tomados de bodega.` });
    }
    setTaking(false);
  };

  const resetShipmentForm = () => {
    setShipOrderId("");
    setShipTenantId("");
    setShipRows([{ ...EMPTY_SHIP_ROW }]);
    setCodesText("");
    setTakeN("");
    setCarrier("");
    setTracking("");
    setShipNotes("");
  };

  const handleCreateShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shipTenantId) {
      setNotice({ kind: "error", text: "Selecciona el colegio destino." });
      return;
    }
    const items: ShipmentItem[] = [];
    for (const row of shipRows) {
      const descripcion = row.descripcion.trim();
      if (!descripcion) continue;
      const qty = parseInt(row.qty, 10);
      if (!Number.isInteger(qty) || qty <= 0) {
        setNotice({ kind: "error", text: `Cantidad inválida en "${descripcion}".` });
        return;
      }
      items.push({ descripcion, qty });
    }
    if (shipCodes.length > 0) {
      items.push({
        descripcion: fundaProduct?.name ?? "Fundas BloKKit",
        qty: shipCodes.length,
        codes: shipCodes,
      });
    }
    if (items.length === 0) {
      setNotice({ kind: "error", text: "Agrega al menos un ítem o códigos de fundas." });
      return;
    }
    setCreatingShipment(true);
    setNotice(null);
    const { error } = await supabase.from("shipments").insert({
      order_id: shipOrderId || null,
      tenant_id: shipTenantId,
      status: "preparacion",
      items,
      carrier: carrier.trim() || null,
      tracking: tracking.trim() || null,
      notes: shipNotes.trim() || null,
      created_by: session.user.id,
    });
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: "Despacho creado en preparación." });
      resetShipmentForm();
      await refresh();
    }
    setCreatingShipment(false);
  };

  /* ════ despachos: acciones de estado ════ */
  const handleMarkShipped = async (shipment: ShipmentRow) => {
    setActingId(shipment.id);
    setNotice(null);
    const codes = (shipment.items ?? []).flatMap((it) => it.codes ?? []);
    if (codes.length > 0) {
      // mueve las fundas de bodega central al colegio destino
      const { data, error } = await supabase
        .from("pouches")
        .update({ tenant_id: shipment.tenant_id })
        .in("code", codes)
        .is("tenant_id", null)
        .select("id");
      if (error) {
        setNotice({ kind: "error", text: error.message });
        setActingId(null);
        return;
      }
      const moved = ((data as { id: string }[]) ?? []).length;
      if (moved !== codes.length) {
        const missing = codes.length - moved;
        setNotice({
          kind: "error",
          text: `${missing} de ${codes.length} código${codes.length === 1 ? "" : "s"} no estaba${missing === 1 ? "" : "n"} en bodega. El despacho sigue en preparación: revisa los códigos.`,
        });
        await refresh();
        setActingId(null);
        return;
      }
    }
    const { error: shipError } = await supabase
      .from("shipments")
      .update({ status: "despachado", shipped_at: new Date().toISOString() })
      .eq("id", shipment.id);
    if (shipError) {
      setNotice({ kind: "error", text: shipError.message });
      setActingId(null);
      return;
    }
    if (shipment.order_id) {
      await supabase.from("orders").update({ status: "despachada" }).eq("id", shipment.order_id);
    }
    setNotice({ kind: "ok", text: "Despacho marcado como despachado." });
    await refresh();
    setActingId(null);
  };

  const handleMarkReceived = async (shipment: ShipmentRow) => {
    const answer = window.prompt("¿Quién recibe?");
    if (answer === null) return;
    const receivedBy = answer.trim();
    if (!receivedBy) {
      setNotice({ kind: "error", text: "Indica quién recibe el despacho." });
      return;
    }
    setActingId(shipment.id);
    setNotice(null);
    const { error } = await supabase
      .from("shipments")
      .update({ status: "recibido", received_by: receivedBy, received_at: new Date().toISOString() })
      .eq("id", shipment.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
      setActingId(null);
      return;
    }
    if (shipment.order_id) {
      await supabase.from("orders").update({ status: "completada" }).eq("id", shipment.order_id);
    }
    setNotice({ kind: "ok", text: `Despacho recibido por ${receivedBy}.` });
    await refresh();
    setActingId(null);
  };

  const handleCancelShipment = async (shipment: ShipmentRow) => {
    setActingId(shipment.id);
    setNotice(null);
    const { error } = await supabase
      .from("shipments")
      .update({ status: "anulado" })
      .eq("id", shipment.id);
    if (error) {
      setNotice({ kind: "error", text: error.message });
    } else {
      setNotice({ kind: "ok", text: "Despacho anulado." });
      await refresh();
    }
    setActingId(null);
  };

  /* ════ guard ════ */
  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="Operaciones">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Operaciones">
      <div className="space-y-6">
        {/* ── pestañas ── */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["bodega", "Bodega"],
              ["ordenes", "Órdenes"],
              ["despachos", "Despachos"],
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

        {/* ════ pestaña: bodega ════ */}
        {tab === "bodega" && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={chipClass}>
                En bodega · <span className="text-gold">{counts ? counts.warehouse : "…"}</span>
              </span>
              <span className={chipClass}>
                Instaladas en colegios ·{" "}
                <span className="text-gold">{counts ? counts.installed : "…"}</span>
              </span>
              <span className={chipClass}>
                Perdidas · <span className="text-coral">{counts ? counts.lost : "…"}</span>
              </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* ── registro masivo a bodega ── */}
              <div className="glass p-7">
                <h2 className="font-display text-lg uppercase text-white">Registrar en bodega</h2>
                <p className="mt-2 text-sm text-white/60">
                  Un código por línea. Las fundas quedan en la bodega central BloKKit hasta que se
                  despachen a un colegio.
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
                  onClick={handleRegisterWarehouse}
                  disabled={registering || !invText.trim()}
                  className={`mt-6 w-full ${primaryBtnClass}`}
                >
                  {registering ? "Registrando…" : "Registrar en bodega"}
                </button>
              </div>

              <div className="space-y-6">
                {/* ── buscador global ── */}
                <div className="glass p-7">
                  <h2 className="font-display text-lg uppercase text-white">
                    ¿Dónde está esta funda?
                  </h2>
                  <form onSubmit={handleSearchPouch} className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="block min-w-[200px] flex-1">
                      <span className={labelClass}>Código</span>
                      <input
                        value={searchCode}
                        onChange={(e) => setSearchCode(e.target.value)}
                        placeholder="BLK-0001"
                        autoComplete="off"
                        spellCheck={false}
                        className={`${inputClass} font-mono`}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={searching || !searchCode.trim()}
                      className={`mb-0.5 shrink-0 ${secondaryBtnClass}`}
                    >
                      {searching ? "Buscando…" : "Buscar"}
                    </button>
                  </form>

                  {searched &&
                    (searchResults.length === 0 ? (
                      <p className="mt-5 text-sm text-white/50">
                        Ninguna funda registrada con ese código.
                      </p>
                    ) : (
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                              <th className="pb-3 pr-4 font-medium">Código</th>
                              <th className="pb-3 pr-4 font-medium">Ubicación</th>
                              <th className="pb-3 font-medium">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchResults.map((p) => (
                              <tr key={p.id} className="border-b border-white/5">
                                <td className="py-3 pr-4 font-mono text-white">{p.code}</td>
                                <td className="py-3 pr-4 text-white/80">
                                  {p.tenant_id ? one(p.tenants) : "Bodega central"}
                                </td>
                                <td className="py-3">
                                  <span className={`${badgeClass} ${POUCH_STATUS_CLASS[p.status]}`}>
                                    {POUCH_STATUS_LABELS[p.status]}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                </div>

                {/* ── pérdidas por colegio ── */}
                <div className="glass p-7">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-lg uppercase text-white">
                      Pérdidas por colegio
                    </h2>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                      {lostByTenant.reduce((sum, t) => sum + t.count, 0)} fundas
                    </span>
                  </div>

                  {loading ? (
                    <p className="mt-6 text-sm text-white/50">Cargando…</p>
                  ) : lostByTenant.length === 0 ? (
                    <p className="mt-6 text-sm text-white/50">
                      No hay fundas perdidas en colegios.
                    </p>
                  ) : (
                    <>
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                              <th className="pb-3 pr-4 font-medium">Colegio</th>
                              <th className="pb-3 pr-4 font-medium">Cantidad</th>
                              <th className="pb-3 pr-4 font-medium">Reposición</th>
                              <th className="pb-3 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {lostByTenant.map((t) => (
                              <tr key={t.tenantId} className="border-b border-white/5">
                                <td className="py-3 pr-4 text-white">{t.name}</td>
                                <td className="py-3 pr-4 text-coral">{t.count}</td>
                                <td className="py-3 pr-4 text-white/80">
                                  {clp.format(t.count * fundaPrice)}
                                </td>
                                <td className="py-3 text-right">
                                  <Link
                                    to="/admin/cotizaciones"
                                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold transition hover:text-white"
                                  >
                                    Cotizar reposición →
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-4 text-xs text-white/40">
                        Valor de reposición: {clp.format(fundaPrice)} por funda
                        {fundaProduct ? ` (${fundaProduct.name})` : " (valor de referencia)"}.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════ pestaña: órdenes ════ */}
        {tab === "ordenes" && (
          <div className="glass p-7">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">Órdenes</h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                {orders.length} orden{orders.length === 1 ? "" : "es"}
              </span>
            </div>

            {loading ? (
              <p className="mt-6 text-sm text-white/50">Cargando…</p>
            ) : orders.length === 0 ? (
              <p className="mt-6 text-sm text-white/50">
                Las órdenes nacen al aceptar una cotización.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                      <th className="pb-3 pr-4 font-medium">Fecha</th>
                      <th className="pb-3 pr-4 font-medium">Cliente</th>
                      <th className="pb-3 pr-4 font-medium">Total</th>
                      <th className="pb-3 pr-4 font-medium">Estado</th>
                      <th className="pb-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-white/5">
                        <td className="py-3 pr-4 text-white/60">{formatDate(order.created_at)}</td>
                        <td className="py-3 pr-4 text-white">{clientLabel(order)}</td>
                        <td className="py-3 pr-4 text-white/80">
                          {clp.format(Number(order.grand_total) || 0)}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={order.status}
                            onChange={(e) =>
                              handleOrderStatus(order, e.target.value as OrderStatus)
                            }
                            className={`rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink [&>option]:text-white ${ORDER_STATUS_CLASS[order.status]}`}
                            aria-label="Cambiar estado de la orden"
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {ORDER_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 text-right">
                          {(order.status === "confirmada" || order.status === "despachada") && (
                            <button
                              type="button"
                              onClick={() => startShipmentFromOrder(order)}
                              className="rounded-full border border-white/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white transition hover:border-gold hover:text-gold"
                            >
                              Despachar →
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════ pestaña: despachos ════ */}
        {tab === "despachos" && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* ── crear despacho ── */}
            <div className="glass p-7">
              <h2 className="font-display text-lg uppercase text-white">Nuevo despacho</h2>
              <p className="mt-2 text-sm text-white/60">
                Asócialo a una orden para prellenar destino e ítems, o crea uno suelto.
              </p>

              <form onSubmit={handleCreateShipment} className="mt-5 space-y-4">
                <label className="block">
                  <span className={labelClass}>Orden (opcional)</span>
                  <select
                    value={shipOrderId}
                    onChange={(e) => applyOrderToForm(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">— Sin orden —</option>
                    {selectableOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {formatDate(o.created_at)} · {clientLabel(o)} ·{" "}
                        {clp.format(Number(o.grand_total) || 0)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelClass}>Colegio destino</span>
                  <select
                    required
                    value={shipTenantId}
                    onChange={(e) => setShipTenantId(e.target.value)}
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

                <div>
                  <span className={labelClass}>Ítems</span>
                  <div className="mt-2 space-y-3">
                    {shipRows.map((row, index) => (
                      <div key={index} className="flex items-end gap-3">
                        <div className="min-w-0 flex-1">
                          <input
                            list="ops-products"
                            value={row.descripcion}
                            onChange={(e) => updateShipRow(index, { descripcion: e.target.value })}
                            placeholder="Descripción o producto del catálogo"
                            autoComplete="off"
                            className={inputClass}
                          />
                        </div>
                        <div className="w-24">
                          <input
                            value={row.qty}
                            onChange={(e) => updateShipRow(index, { qty: e.target.value })}
                            placeholder="1"
                            inputMode="numeric"
                            aria-label="Cantidad"
                            className={inputClass}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeShipRow(index)}
                          disabled={shipRows.length === 1}
                          className="mb-0.5 shrink-0 rounded-full border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 transition hover:border-coral/60 hover:text-coral disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                  <datalist id="ops-products">
                    {products.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                  <button type="button" onClick={addShipRow} className={`mt-3 ${secondaryBtnClass}`}>
                    Agregar ítem
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <span className={labelClass}>Códigos de fundas a despachar</span>
                  <p className="mt-1 text-xs text-white/50">
                    Un código por línea. Al marcar el despacho como despachado, estas fundas pasan
                    de la bodega central al colegio destino.
                  </p>
                  <textarea
                    value={codesText}
                    onChange={(e) => setCodesText(e.target.value)}
                    rows={4}
                    placeholder={"BLK-0001\nBLK-0002"}
                    spellCheck={false}
                    className={`${inputClass} font-mono`}
                  />
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="block w-28">
                      <span className={labelClass}>Cantidad</span>
                      <input
                        value={takeN}
                        onChange={(e) => setTakeN(e.target.value)}
                        placeholder="50"
                        inputMode="numeric"
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleTakeFromWarehouse}
                      disabled={taking}
                      className={`mb-0.5 shrink-0 ${secondaryBtnClass}`}
                    >
                      {taking ? "Tomando…" : "Tomar N de bodega"}
                    </button>
                    {shipCodes.length > 0 && (
                      <span className={`mb-2 ${chipClass}`}>
                        {shipCodes.length} código{shipCodes.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Transporte (opcional)</span>
                    <input
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="Starken, Chilexpress…"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Tracking (opcional)</span>
                    <input
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      placeholder="N° de seguimiento"
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className={labelClass}>Notas (opcional)</span>
                  <textarea
                    value={shipNotes}
                    onChange={(e) => setShipNotes(e.target.value)}
                    rows={2}
                    placeholder="Indicaciones de entrega, contacto en portería…"
                    className={inputClass}
                  />
                </label>

                <button
                  type="submit"
                  disabled={creatingShipment}
                  className={`w-full ${primaryBtnClass}`}
                >
                  {creatingShipment ? "Creando…" : "Crear despacho"}
                </button>
              </form>
            </div>

            {/* ── lista de despachos ── */}
            <div className="glass p-7">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg uppercase text-white">Despachos</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                  {shipments.length} despacho{shipments.length === 1 ? "" : "s"}
                </span>
              </div>

              {loading ? (
                <p className="mt-6 text-sm text-white/50">Cargando…</p>
              ) : shipments.length === 0 ? (
                <p className="mt-6 text-sm text-white/50">Aún no hay despachos.</p>
              ) : (
                <div className="mt-5 space-y-3">
                  {shipments.map((s) => {
                    const qty = shipmentQty(s);
                    const expanded = expandedId === s.id;
                    const acting = actingId === s.id;
                    return (
                      <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-white">
                                {one(s.tenants)}
                              </span>
                              <span className={`${badgeClass} ${SHIPMENT_STATUS_CLASS[s.status]}`}>
                                {SHIPMENT_STATUS_LABELS[s.status]}
                              </span>
                            </div>
                            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                              {formatDate(s.created_at)} · {qty} unidad{qty === 1 ? "" : "es"}
                              {s.order_id ? " · con orden" : ""}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : s.id)}
                              className="rounded-full border border-white/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 transition hover:border-gold hover:text-gold"
                            >
                              {expanded ? "Cerrar" : "Detalle"}
                            </button>
                            {s.status === "preparacion" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleMarkShipped(s)}
                                  disabled={acting}
                                  className="rounded-full bg-gold px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {acting ? "Procesando…" : "Marcar despachado"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelShipment(s)}
                                  disabled={acting}
                                  className="rounded-full bg-coral/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-coral transition hover:bg-coral/25 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Anular
                                </button>
                              </>
                            )}
                            {s.status === "despachado" && (
                              <button
                                type="button"
                                onClick={() => handleMarkReceived(s)}
                                disabled={acting}
                                className="rounded-full bg-gold px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {acting ? "Procesando…" : "Marcar recibido"}
                              </button>
                            )}
                          </div>
                        </div>

                        {expanded && (
                          <div className="mt-4 border-t border-white/10 pt-4">
                            <div className="space-y-2">
                              {(s.items ?? []).map((it, i) => (
                                <div
                                  key={i}
                                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                                >
                                  <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm text-white">{it.descripcion}</span>
                                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
                                      × {it.qty}
                                    </span>
                                  </div>
                                  {it.codes && it.codes.length > 0 && (
                                    <p className="mt-2 break-words font-mono text-xs leading-relaxed text-white/60">
                                      {it.codes.join(" · ")}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                              <div>
                                <span className={labelClass}>Transporte</span>
                                <p className="mt-1 text-white/70">
                                  {s.carrier ?? "—"}
                                  {s.tracking ? ` · ${s.tracking}` : ""}
                                </p>
                              </div>
                              <div>
                                <span className={labelClass}>Fechas</span>
                                <p className="mt-1 text-white/70">
                                  Creado {formatDateTime(s.created_at)}
                                  {s.shipped_at ? ` · Despachado ${formatDateTime(s.shipped_at)}` : ""}
                                  {s.received_at
                                    ? ` · Recibido ${formatDateTime(s.received_at)}${
                                        s.received_by ? ` por ${s.received_by}` : ""
                                      }`
                                    : ""}
                                </p>
                              </div>
                              {s.notes && (
                                <div className="sm:col-span-2">
                                  <span className={labelClass}>Notas</span>
                                  <p className="mt-1 whitespace-pre-line leading-relaxed text-white/70">
                                    {s.notes}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
