import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useSearchParams } from "react-router-dom";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useMyAccess } from "../../lib/access";

interface AdminQuotesProps {
  session: Session;
}

type QuoteStatus = "borrador" | "enviada" | "aceptada" | "rechazada" | "vencida";

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

interface TenantEmbed {
  name: string;
}

interface DealEmbed {
  id: string;
  prospect_name: string | null;
  tenants: TenantEmbed | TenantEmbed[] | null;
}

interface DealRow {
  id: string;
  prospect_name: string | null;
  stage: string;
  tenants: TenantEmbed | TenantEmbed[] | null;
}

interface QuoteRow {
  id: string;
  deal_id: string;
  quote_number: number;
  items: QuoteItem[] | null;
  net_total: number;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  deals: DealEmbed | DealEmbed[] | null;
}

const IVA_RATE = 0.19;

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

/** Los embeds de PostgREST llegan como objeto o array según la FK. */
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function dealName(deal: { prospect_name: string | null; tenants: TenantEmbed | TenantEmbed[] | null } | null): string {
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
  return cantidad * precio;
}

function friendlyError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe una cotización con ese número. Refresca e intenta de nuevo.";
  }
  return error.message;
}

export default function AdminQuotes(_props: AdminQuotesProps) {
  const access = useMyAccess();
  const [searchParams, setSearchParams] = useSearchParams();

  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuoteRow | null>(null);
  const [dealId, setDealId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [validUntil, setValidUntil] = useState(datePlusDays(15));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [q, d] = await Promise.all([
      supabase
        .from("quotes")
        .select(
          "id, deal_id, quote_number, items, net_total, status, valid_until, notes, deals(id, prospect_name, tenants(name))"
        )
        .order("quote_number", { ascending: false }),
      supabase
        .from("deals")
        .select("id, prospect_name, stage, tenants(name)")
        .order("created_at", { ascending: false }),
    ]);
    setQuotes((q.data as QuoteRow[]) ?? []);
    setDeals((d.data as DealRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openNew = useCallback((presetDealId?: string) => {
    setEditing(null);
    setDealId(presetDealId ?? "");
    setItems([emptyDraftItem()]);
    setValidUntil(datePlusDays(15));
    setNotes("");
    setEditorOpen(true);
  }, []);

  const openEdit = (quote: QuoteRow) => {
    setEditing(quote);
    setDealId(quote.deal_id);
    const loaded = (quote.items ?? []).map((it) => ({
      descripcion: it.descripcion ?? "",
      cantidad: String(it.cantidad ?? 1),
      precio_unitario: String(it.precio_unitario ?? ""),
    }));
    setItems(loaded.length > 0 ? loaded : [emptyDraftItem()]);
    setValidUntil(quote.valid_until ?? datePlusDays(15));
    setNotes(quote.notes ?? "");
    setEditorOpen(true);
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

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [emptyDraftItem()];
    });
  };

  const neto = items.reduce((sum, it) => sum + rowSubtotal(it), 0);
  const iva = neto * IVA_RATE;
  const total = neto + iva;

  const handleStatusChange = async (quote: QuoteRow, status: QuoteStatus) => {
    setNotice(null);
    const { error } = await supabase.from("quotes").update({ status }).eq("id", quote.id);
    if (error) {
      setNotice({ kind: "error", text: friendlyError(error) });
    } else {
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
        it.precio_unitario <= 0
    );
    if (invalid) {
      setNotice({
        kind: "error",
        text: "Cada ítem necesita cantidad (mínimo 1) y precio unitario mayor a 0.",
      });
      return;
    }

    const netTotal = Math.round(
      cleanItems.reduce((sum, it) => sum + it.cantidad * it.precio_unitario, 0)
    );
    const payload = {
      deal_id: dealId,
      items: cleanItems,
      net_total: netTotal,
      valid_until: validUntil || null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    const query = editing
      ? supabase.from("quotes").update(payload).eq("id", editing.id)
      : supabase.from("quotes").insert(payload);
    const { data, error } = await query.select("quote_number").single();

    if (error) {
      setNotice({ kind: "error", text: friendlyError(error) });
    } else {
      const num = (data as { quote_number: number } | null)?.quote_number;
      setNotice({
        kind: "ok",
        text: num != null ? `Cotización COT-${num} guardada.` : "Cotización guardada.",
      });
      closeEditor();
      await refresh();
    }
    setSaving(false);
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
        {/* ── Lista de cotizaciones ── */}
        <div className="glass p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <h2 className="font-display text-lg uppercase text-white">Cotizaciones</h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                {quotes.length} en total
              </span>
            </div>
            <button
              type="button"
              onClick={() => openNew()}
              className="rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
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
                    <th className="pb-3 pr-4 font-medium">IVA 19%</th>
                    <th className="pb-3 pr-4 font-medium">Total</th>
                    <th className="pb-3 pr-4 font-medium">Estado</th>
                    <th className="pb-3 pr-4 font-medium">Válida hasta</th>
                    <th className="pb-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const net = Number(q.net_total) || 0;
                    return (
                      <tr key={q.id} className="border-b border-white/5">
                        <td className="py-3 pr-4 font-mono text-[12px] text-white">
                          COT-{q.quote_number}
                        </td>
                        <td className="py-3 pr-4 text-white/80">{dealName(one(q.deals))}</td>
                        <td className="py-3 pr-4 text-white/80">{clp.format(net)}</td>
                        <td className="py-3 pr-4 text-white/60">{clp.format(net * IVA_RATE)}</td>
                        <td className="py-3 pr-4 text-white">{clp.format(net * (1 + IVA_RATE))}</td>
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
                          <button
                            type="button"
                            onClick={() => openEdit(q)}
                            className="rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

        {/* ── Editor ── */}
        {editorOpen && (
          <div className="glass p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-lg uppercase text-white">
                {editing ? `Editar cotización COT-${editing.quote_number}` : "Nueva cotización"}
              </h2>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-6">
              <label className="block max-w-xl">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                  Oportunidad
                </span>
                <select
                  required
                  value={dealId}
                  onChange={(e) => setDealId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 [&>option]:bg-ink"
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {dealName(d)} · {STAGE_LABELS[d.stage] ?? d.stage}
                    </option>
                  ))}
                </select>
              </label>

              {/* Ítems */}
              <div>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                  Ítems
                </span>
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
                      {items.map((it, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td className="py-2 pr-4">
                            <input
                              value={it.descripcion}
                              onChange={(e) => updateItem(i, { descripcion: e.target.value })}
                              placeholder="Funda BloKKit estándar"
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
                              placeholder="12500"
                              className="w-36 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                            />
                          </td>
                          <td className="py-2 pr-4 text-white/80">{clp.format(rowSubtotal(it))}</td>
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
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, emptyDraftItem()])}
                  className="mt-3 rounded-full border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-gold hover:text-gold"
                >
                  + Agregar ítem
                </button>

                {/* Pie en vivo: el IVA es presentación, se guarda solo net_total */}
                <div className="mt-5 ml-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between gap-8 text-white/70">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                      Neto
                    </span>
                    <span>{clp.format(neto)}</span>
                  </div>
                  <div className="flex justify-between gap-8 text-white/70">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                      IVA 19%
                    </span>
                    <span>{clp.format(iva)}</span>
                  </div>
                  <div className="flex justify-between gap-8 text-white">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
                      Total
                    </span>
                    <span className="font-semibold">{clp.format(total)}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                    Válida hasta
                  </span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                    Notas
                  </span>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Condiciones, despacho, observaciones…"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-gold px-4 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cotización"}
              </button>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}
