import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useSearchParams } from "react-router-dom";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

interface AdminQuotesProps {
  session: Session;
}

type QuoteStatus = "borrador" | "enviada" | "aceptada" | "rechazada" | "vencida";
type DiscountType = "none" | "percent" | "amount";

interface QuoteItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

/** Fila editable del editor: los inputs numéricos se manejan como string. */
interface DraftItem {
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
}

/** Datos del cliente congelados en la cotización (client_snapshot jsonb). */
interface ClientSnapshot {
  institucion: string;
  rut: string;
  contacto: string;
  cargo: string;
  email: string;
  telefono: string;
  direccion: string;
  comuna: string;
  region: string;
}

interface TenantEmbed {
  name: string;
  comuna: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

interface DealRow {
  id: string;
  tenant_id: string | null;
  prospect_name: string | null;
  stage: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  tenants: TenantEmbed | TenantEmbed[] | null;
}

interface QuoteDealEmbed {
  id: string;
  prospect_name: string | null;
  tenants: { name: string } | { name: string }[] | null;
}

interface QuoteRow {
  id: string;
  deal_id: string;
  quote_number: number;
  items: QuoteItem[] | null;
  net_total: number | string;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  discount_type: DiscountType | null;
  discount_value: number | string | null;
  include_iva: boolean | null;
  client_snapshot: Partial<ClientSnapshot> | null;
  conditions: string | null;
  sent_at: string | null;
  sent_to: string | null;
  deals: QuoteDealEmbed | QuoteDealEmbed[] | null;
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  unit_price: number | string;
  footnote: string | null;
  sort: number | null;
  active: boolean;
}

/** Cotización lista para el documento de marca (de la lista o del formulario). */
interface PrintableQuote {
  quote_number: number | null;
  items: QuoteItem[];
  snapshot: Partial<ClientSnapshot>;
  conditions: string;
  valid_until: string | null;
  discount_type: DiscountType;
  discount_value: number;
  include_iva: boolean;
}

const IVA_RATE = 0.19;

/** Condiciones default EXACTAS del cotizador original del dueño. */
const DEFAULT_CONDITIONS = `• Precios en pesos chilenos (CLP), valores netos.
• Validez de la cotización: 15 días corridos.
• Plazo de entrega: 15-20 días hábiles tras confirmación de orden de compra.
• Incluye personalización con logo institucional mediante estampado DTF.
• Garantía: 12 meses por defectos de fabricación.
• Forma de pago: 50% anticipo + 50% contra entrega, o según convenio marco.

Datos bancarios: Banco Scotiabank · Cuenta Corriente N° 992264780 · pagos@blokkit.cl`;

const DEFAULT_BANK_LINE = "Banco Scotiabank · Cuenta Corriente N° 992264780 · pagos@blokkit.cl";

const REGIONES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Región Metropolitana",
  "O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén",
  "Magallanes",
];

const EMPTY_SNAPSHOT: ClientSnapshot = {
  institucion: "",
  rut: "",
  contacto: "",
  cargo: "",
  email: "",
  telefono: "",
  direccion: "",
  comuna: "",
  region: "Región Metropolitana",
};

const STATUS_OPTIONS: { value: QuoteStatus; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Enviada" },
  { value: "aceptada", label: "Aceptada" },
  { value: "rechazada", label: "Rechazada" },
  { value: "vencida", label: "Vencida" },
];

const STATUS_CLASS: Record<QuoteStatus, string> = {
  borrador: "text-white/60",
  enviada: "text-gold",
  aceptada: "text-gold font-semibold",
  rechazada: "text-coral",
  vencida: "text-coral",
};

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  contactado: "Contactado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
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
const btnPrimary =
  "rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60";
const btnSecondary =
  "rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50";

/** Los embeds de PostgREST llegan como objeto o array según la FK. */
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function dealName(
  deal: { prospect_name: string | null; tenants: { name: string } | { name: string }[] | null } | null
): string {
  if (!deal) return "—";
  return one(deal.tenants)?.name ?? deal.prospect_name ?? "Sin nombre";
}

function emptyDraftItem(): DraftItem {
  return { descripcion: "", cantidad: "1", precio_unitario: "" };
}

/** Fecha local YYYY-MM-DD a +N días (default válida hasta: +15). */
function datePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("es-CL");
}

function rowSubtotal(item: DraftItem): number {
  const cantidad = Number(item.cantidad);
  const precio = Number(item.precio_unitario);
  if (!Number.isFinite(cantidad) || !Number.isFinite(precio)) return 0;
  return Math.round(cantidad * precio);
}

function computeDiscount(subtotal: number, type: DiscountType, value: number): number {
  let discount = 0;
  if (type === "percent") discount = Math.round((subtotal * value) / 100);
  else if (type === "amount") discount = Math.round(value);
  return Math.min(Math.max(discount, 0), subtotal);
}

function friendlyError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe una cotización con ese número. Refresca e intenta de nuevo.";
  }
  return error.message;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** CLP del documento impreso: $ 1.234.567 (entero). */
function docClp(n: number): string {
  return "$ " + Math.round(n).toLocaleString("es-CL");
}

/**
 * Documento de marca listo para imprimir / guardar PDF.
 * Clona el formato del cotizador original del dueño: encabezado oscuro con logo,
 * caja de cliente, tabla de ítems ("Incluido" si precio 0), pie de totales,
 * condiciones en lista y datos bancarios destacados. Papelería clara, NO portal oscuro.
 */
function buildPrintHtml(q: PrintableQuote): string {
  const numberLabel = q.quote_number != null ? `BK${q.quote_number}` : "BK----";
  const dateStr = new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const s = { ...EMPTY_SNAPSHOT, ...q.snapshot };

  const subtotal = q.items.reduce(
    (sum, it) => sum + Math.round((Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0)),
    0
  );
  const discount = computeDiscount(subtotal, q.discount_type, q.discount_value);
  const neto = subtotal - discount;
  const iva = q.include_iva ? Math.round(neto * IVA_RATE) : 0;
  const total = neto + iva;

  const itemRows = q.items
    .map((it) => {
      const price = Number(it.precio_unitario) || 0;
      const qty = Number(it.cantidad) || 0;
      const unitCell = price === 0 ? '<span class="included">Incluido</span>' : docClp(price);
      const totalCell =
        price === 0 ? '<span class="included">Incluido</span>' : docClp(Math.round(price * qty));
      return `<tr><td class="desc">${esc(it.descripcion)}</td><td class="num">${qty}</td><td class="num">${unitCell}</td><td class="num row-total">${totalCell}</td></tr>`;
    })
    .join("");

  // Condiciones parseadas: • → lista, "Datos bancarios" → caja destacada, (* → notas al pie
  const lines = q.conditions
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const bullets = lines.filter((l) => /^[•\-•]/.test(l));
  const bankLines = lines.filter((l) => /datos bancarios/i.test(l));
  const footnotes = lines.filter((l) => /^\(?\*/.test(l));
  const others = lines.filter(
    (l) => !bullets.includes(l) && !bankLines.includes(l) && !footnotes.includes(l)
  );

  const bulletsHtml = bullets
    .map((b) => `<li>${esc(b.replace(/^[•\-•]\s*/, ""))}</li>`)
    .join("");
  const othersHtml = others.map((o) => `<p class="cond-extra">${esc(o)}</p>`).join("");
  const footnotesHtml =
    footnotes.length > 0
      ? `<div class="footnotes">${footnotes.map((f) => `<p>${esc(f)}</p>`).join("")}</div>`
      : "";
  const bankText =
    bankLines.length > 0
      ? bankLines.map((b) => esc(b.replace(/^datos bancarios:\s*/i, ""))).join(" · ")
      : esc(DEFAULT_BANK_LINE);

  const clientLines: string[] = [`<strong>${esc(s.institucion) || "—"}</strong>`];
  if (s.rut) clientLines.push(`RUT: ${esc(s.rut)}`);
  if (s.contacto) clientLines.push(esc(s.contacto) + (s.cargo ? ` — ${esc(s.cargo)}` : ""));
  if (s.email || s.telefono)
    clientLines.push([esc(s.email), esc(s.telefono)].filter(Boolean).join(" · "));
  if (s.direccion) clientLines.push(esc(s.direccion));
  if (s.comuna || s.region)
    clientLines.push([esc(s.comuna), esc(s.region)].filter(Boolean).join(", "));

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cotización ${numberLabel} — BloKKit</title>
<style>
@page { size: letter; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #F2F2F2;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #1F1F1F;
  font-size: 12px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page {
  width: 216mm; min-height: 279mm; margin: 18px auto; background: #FFFFFF;
  box-shadow: 0 10px 40px rgba(31,31,31,0.16);
  display: flex; flex-direction: column; overflow: hidden;
}
.doc-header {
  background: #1F1F1F; color: #fff; padding: 26px 40px;
  display: flex; justify-content: space-between; align-items: center;
}
.doc-header img { height: 36px; width: auto; display: block; }
.doc-id { text-align: right; }
.doc-id .label { font-size: 10px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #3FA8E0; }
.doc-id .num { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
.meta-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 40px; border-bottom: 1px solid #E4E4E4; background: #fff;
  font-size: 11.5px; color: #6B6B6B;
}
.meta-bar strong { color: #1F1F1F; font-size: 12.5px; }
.doc-body { padding: 20px 40px 26px; flex: 1; }
.client-box {
  display: flex; gap: 28px; border: 1px solid #E4E4E4; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 18px; background: #fff;
}
.client-box .col { flex: 1; }
.sec-label {
  font-size: 9px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase;
  color: #3FA8E0; margin-bottom: 6px;
}
.client-box p { font-size: 11.5px; color: #444; }
.client-box p strong { color: #1F1F1F; font-size: 12.5px; }
.table-wrap { border: 1px solid #1F1F1F; border-radius: 10px; overflow: hidden; background: #fff; }
table.items { width: 100%; border-collapse: collapse; font-size: 11.5px; }
table.items thead tr { background: #1F1F1F; }
table.items th {
  color: #fff; text-align: left; padding: 9px 14px; font-weight: 600;
  font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; white-space: nowrap;
}
table.items th.num { text-align: right; }
table.items td { padding: 9px 14px; border-top: 1px solid #EFEFEF; vertical-align: top; color: #333; }
table.items tbody tr:first-child td { border-top: none; }
table.items td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.items td.row-total { font-weight: 700; color: #1F1F1F; }
.included { color: #9A9A9A; font-style: italic; font-weight: 400; }
.totals { display: flex; justify-content: flex-end; border-top: 1px solid #EFEFEF; }
.totals table { border-collapse: collapse; min-width: 290px; font-size: 11.5px; }
.totals td { padding: 6px 14px; text-align: right; font-variant-numeric: tabular-nums; }
.totals td.lbl { color: #8A8A8A; font-size: 11px; letter-spacing: 0.4px; }
.totals td.discount { color: #C0392B; }
.totals tr.total-row td { background: #1F1F1F; color: #fff; font-weight: 800; font-size: 14px; padding: 10px 14px; border-top: 2px solid #3FA8E0; }
.totals tr.total-row td.value { color: #3FA8E0; font-size: 16px; }
.footnotes { padding: 8px 4px 0; }
.footnotes p { font-size: 9.5px; color: #9A9A9A; line-height: 1.5; }
.cards-row { display: flex; gap: 12px; margin-top: 14px; align-items: stretch; }
.info-card { flex: 2; border: 1px solid #E4E4E4; border-radius: 10px; padding: 14px 18px; background: #fff; }
.info-card ul { list-style: none; }
.info-card li { position: relative; padding-left: 14px; font-size: 10.8px; color: #333; line-height: 1.6; }
.info-card li::before { content: ""; width: 5px; height: 5px; background: #3FA8E0; border-radius: 50%; position: absolute; left: 0; top: 7px; }
.cond-extra { font-size: 10.8px; color: #555; margin-top: 4px; }
.bank-card { flex: 1; background: #E9F5FC; border: 1px solid #3FA8E0; border-radius: 10px; padding: 14px 18px; }
.bank-card .sec-label { color: #1F1F1F; }
.bank-card p { font-size: 11.5px; font-weight: 600; color: #1F1F1F; line-height: 1.6; }
.doc-footer {
  background: #1F1F1F; color: rgba(255,255,255,0.75); padding: 12px 40px;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 10.5px; letter-spacing: 1px;
}
.doc-footer .accent { color: #3FA8E0; font-weight: 700; }
.print-btn {
  position: fixed; top: 16px; right: 16px; z-index: 50;
  background: #1F1F1F; color: #fff; border: 1px solid #3FA8E0; border-radius: 999px;
  padding: 10px 20px; font-family: inherit; font-size: 12px; font-weight: 600;
  letter-spacing: 0.5px; cursor: pointer;
}
.print-btn:hover { background: #3FA8E0; color: #1F1F1F; }
@media print {
  body { background: #fff; }
  .print-btn { display: none !important; }
  .page { margin: 0; box-shadow: none; width: auto; min-height: 0; }
}
</style>
</head>
<body>

<button type="button" class="print-btn" onclick="window.print()">Imprimir / guardar PDF</button>

<div class="page">
  <div class="doc-header">
    <img src="https://blokkit.cl/images/Logo-Blokkit.png" alt="BloKKit">
    <div class="doc-id">
      <div class="label">Cotización</div>
      <div class="num">${numberLabel}</div>
    </div>
  </div>

  <div class="meta-bar">
    <div><strong>Blokkit SpA</strong> · RUT 78.203.591-6</div>
    <div>${esc(dateStr)}</div>
  </div>

  <div class="doc-body">
    <div class="client-box">
      <div class="col">
        <div class="sec-label">Cliente</div>
        ${clientLines.map((l) => `<p>${l}</p>`).join("")}
      </div>
      <div class="col">
        <div class="sec-label">Detalles</div>
        <p>Válida hasta: <strong>${esc(formatDate(q.valid_until))}</strong></p>
        <p>Precios en CLP, valores netos${q.include_iva ? " · IVA 19% incluido en el total" : ""}.</p>
      </div>
    </div>

    <div class="table-wrap">
      <table class="items">
        <thead>
          <tr>
            <th style="width:52%;">Descripción</th>
            <th class="num" style="width:10%;">Cant.</th>
            <th class="num" style="width:19%;">P. Unitario</th>
            <th class="num" style="width:19%;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="totals">
        <table>
          <tr><td class="lbl">Subtotal</td><td>${docClp(subtotal)}</td></tr>
          ${
            discount > 0
              ? `<tr><td class="lbl discount">Descuento${
                  q.discount_type === "percent" ? ` (${q.discount_value}%)` : ""
                }</td><td class="discount">-${docClp(discount)}</td></tr>`
              : ""
          }
          <tr><td class="lbl">Subtotal neto</td><td>${docClp(neto)}</td></tr>
          ${q.include_iva ? `<tr><td class="lbl">IVA 19%</td><td>${docClp(iva)}</td></tr>` : ""}
          <tr class="total-row"><td>TOTAL</td><td class="value">${docClp(total)}</td></tr>
        </table>
      </div>
    </div>

    ${footnotesHtml}

    <div class="cards-row">
      <div class="info-card">
        <div class="sec-label">Condiciones</div>
        ${bulletsHtml ? `<ul>${bulletsHtml}</ul>` : "<p class='cond-extra'>Sin condiciones adicionales.</p>"}
        ${othersHtml}
      </div>
      <div class="bank-card">
        <div class="sec-label">Datos Bancarios</div>
        <p>${bankText}</p>
      </div>
    </div>
  </div>

  <div class="doc-footer">
    <span class="accent">blokkit.cl</span>
    <span>+56 9 9039 9130</span>
    <span>hola@blokkit.cl</span>
  </div>
</div>

</body>
</html>`;
}

export default function AdminQuotes(_props: AdminQuotesProps) {
  const access = useMyAccess();
  const [searchParams, setSearchParams] = useSearchParams();

  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuoteRow | null>(null);
  const [dealId, setDealId] = useState("");
  const [client, setClient] = useState<ClientSnapshot>({ ...EMPTY_SNAPSHOT });
  const [items, setItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountValue, setDiscountValue] = useState("");
  const [includeIva, setIncludeIva] = useState(true);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [validUntil, setValidUntil] = useState(datePlusDays(15));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingPrefillId, setPendingPrefillId] = useState<string | null>(null);

  // catálogo colapsable
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    const [q, d, p] = await Promise.all([
      supabase
        .from("quotes")
        .select(
          "id, deal_id, quote_number, items, net_total, status, valid_until, notes, discount_type, discount_value, include_iva, client_snapshot, conditions, sent_at, sent_to, deals(id, prospect_name, tenants(name))"
        )
        .order("quote_number", { ascending: false }),
      supabase
        .from("deals")
        .select(
          "id, tenant_id, prospect_name, stage, contact_name, contact_email, contact_phone, created_at, tenants(name, comuna, contact_name, contact_email, contact_phone)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("id, name, description, unit, unit_price, footnote, sort, active")
        .order("sort"),
    ]);
    setQuotes((q.data as QuoteRow[]) ?? []);
    setDeals((d.data as DealRow[]) ?? []);
    setProducts((p.data as ProductRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // oportunidades abiertas primero, ganadas/perdidas al final
  const sortedDeals = useMemo(() => {
    const open = deals.filter((d) => d.stage !== "ganado" && d.stage !== "perdido");
    const closed = deals.filter((d) => d.stage === "ganado" || d.stage === "perdido");
    return [...open, ...closed];
  }, [deals]);

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);

  const applyDealPrefill = useCallback((deal: DealRow) => {
    const tenant = one(deal.tenants);
    setClient((prev) => ({
      ...prev,
      institucion: tenant?.name ?? deal.prospect_name ?? "",
      contacto: deal.contact_name ?? tenant?.contact_name ?? "",
      email: deal.contact_email ?? tenant?.contact_email ?? "",
      telefono: deal.contact_phone ?? tenant?.contact_phone ?? "",
      comuna: tenant?.comuna ?? prev.comuna,
    }));
  }, []);

  const openNew = useCallback((presetDealId?: string) => {
    setEditing(null);
    setDealId(presetDealId ?? "");
    setClient({ ...EMPTY_SNAPSHOT });
    setItems([emptyDraftItem()]);
    setDiscountType("none");
    setDiscountValue("");
    setIncludeIva(true);
    setConditions(DEFAULT_CONDITIONS);
    setValidUntil(datePlusDays(15));
    setNotes("");
    setPendingPrefillId(presetDealId ?? null);
    setEditorOpen(true);
  }, []);

  const openEdit = (quote: QuoteRow) => {
    setEditing(quote);
    setDealId(quote.deal_id);
    setClient({ ...EMPTY_SNAPSHOT, ...(quote.client_snapshot ?? {}) });
    const loaded = (quote.items ?? []).map((it) => ({
      descripcion: it.descripcion ?? "",
      cantidad: String(it.cantidad ?? 1),
      precio_unitario: String(it.precio_unitario ?? 0),
    }));
    setItems(loaded.length > 0 ? loaded : [emptyDraftItem()]);
    setDiscountType((quote.discount_type as DiscountType) ?? "none");
    setDiscountValue(
      quote.discount_value != null && Number(quote.discount_value) !== 0
        ? String(Number(quote.discount_value))
        : ""
    );
    setIncludeIva(quote.include_iva ?? true);
    setConditions(quote.conditions ?? DEFAULT_CONDITIONS);
    setValidUntil(quote.valid_until ?? datePlusDays(15));
    setNotes(quote.notes ?? "");
    setPendingPrefillId(null);
    setEditorOpen(true);
    setNotice(null);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
  };

  // ?deal=<id> → preselecciona la oportunidad y abre el editor en modo nueva
  const consumedDealParam = useRef(false);
  useEffect(() => {
    if (consumedDealParam.current) return;
    const dealParam = searchParams.get("deal");
    if (!dealParam) return;
    consumedDealParam.current = true;
    openNew(dealParam);
    const next = new URLSearchParams(searchParams);
    next.delete("deal");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, openNew]);

  // prefill diferido: espera a que las oportunidades estén cargadas
  useEffect(() => {
    if (!pendingPrefillId || deals.length === 0) return;
    const deal = deals.find((d) => d.id === pendingPrefillId);
    if (deal) applyDealPrefill(deal);
    setPendingPrefillId(null);
  }, [pendingPrefillId, deals, applyDealPrefill]);

  const handleDealChange = (id: string) => {
    setDealId(id);
    const deal = deals.find((d) => d.id === id);
    if (deal) applyDealPrefill(deal);
  };

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [emptyDraftItem()];
    });
  };

  const addProductItem = (product: ProductRow) => {
    const row: DraftItem = {
      descripcion: product.name,
      cantidad: "1",
      precio_unitario: String(Math.round(Number(product.unit_price) || 0)),
    };
    setItems((prev) => {
      // si la única fila está vacía, la reemplaza
      if (prev.length === 1 && !prev[0].descripcion.trim() && !prev[0].precio_unitario.trim()) {
        return [row];
      }
      return [...prev, row];
    });
  };

  // pie en vivo
  const subtotal = items.reduce((sum, it) => sum + rowSubtotal(it), 0);
  const discountNum = Number(discountValue) || 0;
  const discount = computeDiscount(subtotal, discountType, discountNum);
  const neto = subtotal - discount;
  const iva = includeIva ? Math.round(neto * IVA_RATE) : 0;
  const total = neto + iva;

  const printableFromRow = (q: QuoteRow): PrintableQuote => ({
    quote_number: q.quote_number,
    items: q.items ?? [],
    snapshot: q.client_snapshot ?? {},
    conditions: q.conditions ?? DEFAULT_CONDITIONS,
    valid_until: q.valid_until,
    discount_type: (q.discount_type as DiscountType) ?? "none",
    discount_value: Number(q.discount_value) || 0,
    include_iva: q.include_iva ?? true,
  });

  const openDocument = (q: PrintableQuote) => {
    const win = window.open("", "_blank");
    if (!win) {
      setNotice({ kind: "error", text: "Permite ventanas emergentes para ver el documento." });
      return;
    }
    win.document.write(buildPrintHtml(q));
    win.document.close();
  };

  const openEditorDocument = () => {
    const printItems: QuoteItem[] = items
      .filter((it) => it.descripcion.trim() !== "")
      .map((it) => ({
        descripcion: it.descripcion.trim(),
        cantidad: Number(it.cantidad) || 0,
        precio_unitario: Number(it.precio_unitario) || 0,
      }));
    if (printItems.length === 0) {
      setNotice({ kind: "error", text: "Agrega al menos un ítem para ver el documento." });
      return;
    }
    openDocument({
      quote_number: editing?.quote_number ?? null,
      items: printItems,
      snapshot: client,
      conditions,
      valid_until: validUntil || null,
      discount_type: discountType,
      discount_value: discountNum,
      include_iva: includeIva,
    });
  };

  const handleStatusChange = async (quote: QuoteRow, status: QuoteStatus) => {
    setNotice(null);
    if (status === "aceptada") {
      const ok = window.confirm(
        "Al marcar esta cotización como ACEPTADA se creará automáticamente la orden de venta, la oportunidad se moverá a Ganado y la cuenta quedará marcada como cliente. ¿Continuar?"
      );
      if (!ok) return;
    }
    const { error } = await supabase.from("quotes").update({ status }).eq("id", quote.id);
    if (error) {
      setNotice({ kind: "error", text: friendlyError(error) });
    } else {
      if (status === "aceptada") {
        setNotice({ kind: "ok", text: "Orden creada — deal movido a Ganado." });
      }
      await refresh();
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    if (!dealId) {
      setNotice({ kind: "error", text: "Selecciona una oportunidad." });
      return;
    }

    const cleanItems: QuoteItem[] = items
      .map((it) => ({
        descripcion: it.descripcion.trim(),
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
      }))
      .filter((it) => it.descripcion !== "");

    if (cleanItems.length === 0) {
      setNotice({ kind: "error", text: "Agrega al menos un ítem con descripción." });
      return;
    }
    const invalid = cleanItems.some(
      (it) =>
        !Number.isFinite(it.cantidad) ||
        it.cantidad < 1 ||
        !Number.isFinite(it.precio_unitario) ||
        it.precio_unitario < 0
    );
    if (invalid) {
      setNotice({
        kind: "error",
        text: "Cada ítem necesita cantidad (mínimo 1) y precio unitario de 0 o más (0 = Incluido).",
      });
      return;
    }

    const saveSubtotal = cleanItems.reduce(
      (sum, it) => sum + Math.round(it.cantidad * it.precio_unitario),
      0
    );
    const saveDiscount = computeDiscount(saveSubtotal, discountType, discountNum);
    const saveNeto = saveSubtotal - saveDiscount;

    const snapshotPayload: ClientSnapshot = {
      institucion: client.institucion.trim(),
      rut: client.rut.trim(),
      contacto: client.contacto.trim(),
      cargo: client.cargo.trim(),
      email: client.email.trim(),
      telefono: client.telefono.trim(),
      direccion: client.direccion.trim(),
      comuna: client.comuna.trim(),
      region: client.region.trim(),
    };

    const payload = {
      deal_id: dealId,
      items: cleanItems,
      net_total: saveNeto,
      valid_until: validUntil || null,
      notes: notes.trim() || null,
      discount_type: discountType,
      discount_value: discountType === "none" ? 0 : discountNum,
      include_iva: includeIva,
      client_snapshot: snapshotPayload,
      conditions: conditions.trim() === "" ? null : conditions,
    };

    setSaving(true);
    const query = editing
      ? supabase.from("quotes").update(payload).eq("id", editing.id)
      : supabase.from("quotes").insert({ ...payload, status: "borrador" });
    const { data, error } = await query.select("quote_number").single();

    if (error) {
      setNotice({ kind: "error", text: friendlyError(error) });
    } else {
      const num = (data as { quote_number: number } | null)?.quote_number;
      setNotice({
        kind: "ok",
        text: num != null ? `Cotización BK${num} guardada.` : "Cotización guardada.",
      });
      closeEditor();
      await refresh();
    }
    setSaving(false);
  };

  const handleSendEmail = async () => {
    if (!editing) return;
    const suggested = client.email.trim() || editing.sent_to || "";
    const to = window.prompt("Confirma el email de destino:", suggested);
    if (to == null) return;
    const target = to.trim();
    if (!target) {
      setNotice({ kind: "error", text: "Ingresa un email de destino." });
      return;
    }

    setSending(true);
    setNotice(null);
    const { error } = await supabase.functions.invoke("send-quote", {
      body: { quote_id: editing.id, to: target },
    });

    if (error) {
      let message = error.message;
      try {
        const ctx = await (error as { context?: Response }).context?.json();
        if (ctx?.error) message = ctx.error;
      } catch {
        /* sin body json */
      }
      if (/RESEND_API_KEY/i.test(message)) {
        message = "Falta configurar RESEND_API_KEY en Supabase → Edge Functions → Secrets";
      }
      setNotice({ kind: "error", text: message });
    } else {
      setNotice({
        kind: "ok",
        text: `Cotización BK${editing.quote_number} enviada a ${target}.`,
      });
      closeEditor();
      await refresh();
    }
    setSending(false);
  };

  // catálogo: edición inline de precio + toggle activo
  const commitPrice = async (product: ProductRow) => {
    const draft = priceDrafts[product.id];
    if (draft == null) return;
    const clearDraft = () =>
      setPriceDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });

    const value = Math.round(Number(draft));
    if (!Number.isFinite(value) || value < 0) {
      setNotice({ kind: "error", text: "El precio debe ser un número de 0 o más (CLP entero)." });
      clearDraft();
      return;
    }
    if (value === Math.round(Number(product.unit_price) || 0)) {
      clearDraft();
      return;
    }
    const { error } = await supabase
      .from("products")
      .update({ unit_price: value })
      .eq("id", product.id);
    if (error) {
      setNotice({ kind: "error", text: friendlyError(error) });
    } else {
      setNotice({ kind: "ok", text: `Precio de "${product.name}" actualizado a ${clp.format(value)}.` });
      await refresh();
    }
    clearDraft();
  };

  const toggleProductActive = async (product: ProductRow) => {
    const { error } = await supabase
      .from("products")
      .update({ active: !product.active })
      .eq("id", product.id);
    if (error) {
      setNotice({ kind: "error", text: friendlyError(error) });
    } else {
      await refresh();
    }
  };

  if (access && !access.isSysAdmin) {
    return (
      <AppShell title="Cotizador">
        <div className="glass max-w-xl p-8">
          <p className="text-sm text-white/70">
            Esta sección es solo para la administración de BloKKit.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Cotizador">
      <div className="space-y-6">
        {notice && (
          <p
            role="status"
            className={`text-sm leading-relaxed ${notice.kind === "error" ? "text-coral" : "text-gold"}`}
          >
            {notice.text}
          </p>
        )}

        {/* ── Lista de cotizaciones ── */}
        <div className="glass p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <h2 className="font-display text-lg uppercase text-white">Cotizaciones</h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                {quotes.length} en total
              </span>
            </div>
            <button type="button" onClick={() => openNew()} className={btnPrimary}>
              Nueva cotización
            </button>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-white/50">Cargando…</p>
          ) : quotes.length === 0 ? (
            <p className="mt-6 text-sm text-white/50">Aún no hay cotizaciones.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    <th className="pb-3 pr-4 font-medium">N°</th>
                    <th className="pb-3 pr-4 font-medium">Oportunidad</th>
                    <th className="pb-3 pr-4 font-medium">Neto</th>
                    <th className="pb-3 pr-4 font-medium">Total</th>
                    <th className="pb-3 pr-4 font-medium">Estado</th>
                    <th className="pb-3 pr-4 font-medium">Válida hasta</th>
                    <th className="pb-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const net = Math.round(Number(q.net_total) || 0);
                    const withIva = q.include_iva !== false;
                    const rowTotal = withIva ? net + Math.round(net * IVA_RATE) : net;
                    return (
                      <tr key={q.id} className="border-b border-white/5">
                        <td className="py-3 pr-4 font-mono text-[12px] text-white">
                          BK{q.quote_number}
                        </td>
                        <td className="py-3 pr-4 text-white/80">{dealName(one(q.deals))}</td>
                        <td className="py-3 pr-4 text-white/80">{clp.format(net)}</td>
                        <td className="py-3 pr-4 text-white">
                          {clp.format(rowTotal)}
                          {!withIva && (
                            <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                              sin IVA
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={q.status}
                            onChange={(e) => handleStatusChange(q, e.target.value as QuoteStatus)}
                            className={`rounded-full border border-white/15 bg-transparent px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink [&>option]:text-white ${STATUS_CLASS[q.status]}`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-4 text-white/60">{formatDate(q.valid_until)}</td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(q)}
                              className={btnSecondary}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => openDocument(printableFromRow(q))}
                              className={btnSecondary}
                            >
                              Documento
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Editor ── */}
        {editorOpen && (
          <div className="glass p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">
                {editing ? `Editar cotización BK${editing.quote_number}` : "Nueva cotización"}
              </h2>
              <button type="button" onClick={closeEditor} className={btnSecondary}>
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-6">
              <label className="block max-w-xl">
                <span className={labelClass}>Oportunidad</span>
                <select
                  required
                  value={dealId}
                  onChange={(e) => handleDealChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {sortedDeals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {dealName(d)} · {STAGE_LABELS[d.stage] ?? d.stage}
                    </option>
                  ))}
                </select>
              </label>

              {/* Datos del cliente (snapshot congelado en la cotización) */}
              <div>
                <span className={labelClass}>Datos del cliente</span>
                <p className="mt-1 text-xs text-white/45">
                  Se prellenan al elegir la oportunidad y quedan congelados en la cotización.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block">
                    <span className={labelClass}>Institución / empresa</span>
                    <input
                      value={client.institucion}
                      onChange={(e) => setClient((c) => ({ ...c, institucion: e.target.value }))}
                      placeholder="Liceo Bicentenario Los Andes"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>RUT</span>
                    <input
                      value={client.rut}
                      onChange={(e) => setClient((c) => ({ ...c, rut: e.target.value }))}
                      placeholder="70.100.200-3"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Contacto</span>
                    <input
                      value={client.contacto}
                      onChange={(e) => setClient((c) => ({ ...c, contacto: e.target.value }))}
                      placeholder="Nombre del contacto"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Cargo</span>
                    <input
                      value={client.cargo}
                      onChange={(e) => setClient((c) => ({ ...c, cargo: e.target.value }))}
                      placeholder="Director(a)"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Email</span>
                    <input
                      type="email"
                      value={client.email}
                      onChange={(e) => setClient((c) => ({ ...c, email: e.target.value }))}
                      placeholder="correo@institucion.cl"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Teléfono</span>
                    <input
                      value={client.telefono}
                      onChange={(e) => setClient((c) => ({ ...c, telefono: e.target.value }))}
                      placeholder="+56 9 XXXX XXXX"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Dirección</span>
                    <input
                      value={client.direccion}
                      onChange={(e) => setClient((c) => ({ ...c, direccion: e.target.value }))}
                      placeholder="Dirección de la institución"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Comuna</span>
                    <input
                      value={client.comuna}
                      onChange={(e) => setClient((c) => ({ ...c, comuna: e.target.value }))}
                      placeholder="Providencia"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Región</span>
                    <select
                      value={client.region}
                      onChange={(e) => setClient((c) => ({ ...c, region: e.target.value }))}
                      className={selectClass}
                    >
                      {client.region !== "" && !REGIONES.includes(client.region) && (
                        <option value={client.region}>{client.region}</option>
                      )}
                      {REGIONES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Ítems */}
              <div>
                <span className={labelClass}>Ítems</span>
                {activeProducts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeProducts.map((p) => {
                      const price = Math.round(Number(p.unit_price) || 0);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProductItem(p)}
                          className="rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 transition hover:border-gold hover:text-gold"
                        >
                          + {p.name} · {price > 0 ? clp.format(price) : "Incluido"}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setItems((prev) => [...prev, emptyDraftItem()])}
                      className="rounded-full border border-gold/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gold transition hover:border-gold hover:bg-gold/10"
                    >
                      + Ítem libre
                    </button>
                  </div>
                )}

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                        <th className="pb-3 pr-4 font-medium">Descripción</th>
                        <th className="pb-3 pr-4 font-medium">Cantidad</th>
                        <th className="pb-3 pr-4 font-medium">Precio unitario</th>
                        <th className="pb-3 pr-4 font-medium">Subtotal</th>
                        <th className="pb-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => {
                        const priceFilled = it.precio_unitario.trim() !== "";
                        const isIncluded = priceFilled && Number(it.precio_unitario) === 0;
                        return (
                          <tr key={i} className="border-b border-white/5">
                            <td className="py-2 pr-4">
                              <input
                                value={it.descripcion}
                                onChange={(e) => updateItem(i, { descripcion: e.target.value })}
                                placeholder="Funda BloKKit con bloqueo de señal"
                                className="w-full min-w-[220px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                              />
                            </td>
                            <td className="py-2 pr-4">
                              <input
                                type="number"
                                min={1}
                                value={it.cantidad}
                                onChange={(e) => updateItem(i, { cantidad: e.target.value })}
                                className="w-24 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                              />
                            </td>
                            <td className="py-2 pr-4">
                              <input
                                type="number"
                                min={0}
                                value={it.precio_unitario}
                                onChange={(e) => updateItem(i, { precio_unitario: e.target.value })}
                                placeholder="6500"
                                className="w-36 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                              />
                            </td>
                            <td className="py-2 pr-4 text-white/80">
                              {isIncluded ? (
                                <span className="italic text-white/45">Incluido</span>
                              ) : (
                                clp.format(rowSubtotal(it))
                              )}
                            </td>
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={() => removeItem(i)}
                                className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 transition hover:border-coral hover:text-coral"
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Descuento global + IVA */}
                <div className="mt-5 flex flex-wrap items-end gap-4">
                  <label className="block w-48">
                    <span className={labelClass}>Descuento</span>
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                      className={selectClass}
                    >
                      <option value="none">Sin descuento</option>
                      <option value="percent">Porcentaje (%)</option>
                      <option value="amount">Monto (CLP)</option>
                    </select>
                  </label>
                  {discountType !== "none" && (
                    <label className="block w-40">
                      <span className={labelClass}>
                        {discountType === "percent" ? "Valor (%)" : "Valor (CLP)"}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={discountType === "percent" ? 0.5 : 1}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountType === "percent" ? "10" : "100000"}
                        className={inputClass}
                      />
                    </label>
                  )}
                  <label className="flex items-center gap-3 pb-3">
                    <input
                      type="checkbox"
                      checked={includeIva}
                      onChange={(e) => setIncludeIva(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#7FCEEC]"
                    />
                    <span className="text-sm text-white/80">Incluir IVA (19%)</span>
                  </label>
                </div>

                {/* Pie en vivo */}
                <div className="mt-5 ml-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between gap-8 text-white/70">
                    <span className={labelClass}>Subtotal</span>
                    <span>{clp.format(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between gap-8 text-coral">
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-coral">
                        Descuento{discountType === "percent" ? ` (${discountNum}%)` : ""}
                      </span>
                      <span>-{clp.format(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-8 text-white/70">
                    <span className={labelClass}>Neto</span>
                    <span>{clp.format(neto)}</span>
                  </div>
                  {includeIva && (
                    <div className="flex justify-between gap-8 text-white/70">
                      <span className={labelClass}>IVA 19%</span>
                      <span>{clp.format(iva)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-8 text-white">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                      Total
                    </span>
                    <span className="font-semibold">{clp.format(total)}</span>
                  </div>
                </div>
              </div>

              {/* Condiciones del documento */}
              <label className="block">
                <span className={labelClass}>Condiciones (van al documento)</span>
                <textarea
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  rows={9}
                  className={inputClass}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Válida hasta</span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Notas internas (no van al documento)</span>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contexto comercial, despacho, observaciones…"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={saving} className={btnPrimary}>
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cotización"}
                </button>
                <button type="button" onClick={openEditorDocument} className={btnSecondary}>
                  Ver documento
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={sending}
                    className={btnSecondary}
                  >
                    {sending ? "Enviando…" : "Enviar por correo"}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* ── Catálogo de productos ── */}
        <div className="glass p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <h2 className="font-display text-lg uppercase text-white">Catálogo</h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                {products.length} producto{products.length === 1 ? "" : "s"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCatalogOpen((o) => !o)}
              className={btnSecondary}
            >
              {catalogOpen ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          {catalogOpen &&
            (products.length === 0 ? (
              <p className="mt-6 text-sm text-white/50">Aún no hay productos en el catálogo.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                      <th className="pb-3 pr-4 font-medium">Producto</th>
                      <th className="pb-3 pr-4 font-medium">Unidad</th>
                      <th className="pb-3 pr-4 font-medium">Precio (CLP neto)</th>
                      <th className="pb-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const price = Math.round(Number(p.unit_price) || 0);
                      return (
                        <tr key={p.id} className="border-b border-white/5">
                          <td className="py-3 pr-4">
                            <div className="text-white">{p.name}</div>
                            {p.footnote && (
                              <div className="text-xs text-white/50">{p.footnote}</div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-white/60">{p.unit ?? "—"}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={priceDrafts[p.id] ?? String(price)}
                                onChange={(e) =>
                                  setPriceDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                                onBlur={() => commitPrice(p)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                className="w-36 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                              />
                              {price === 0 && (
                                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                                  Incluido
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3">
                            <button
                              type="button"
                              onClick={() => toggleProductActive(p)}
                              className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                                p.active
                                  ? "bg-gold/15 text-gold hover:bg-gold/25"
                                  : "bg-coral/15 text-coral hover:bg-coral/25"
                              }`}
                              title={p.active ? "Click para desactivar" : "Click para activar"}
                            >
                              {p.active ? "Activo" : "Inactivo"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      </div>
    </AppShell>
  );
}
