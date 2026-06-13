import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

/**
 * send-quote — envía una cotización por correo con el formato de marca.
 * Solo usuarios CRM (sys admin / ventas internas). Requiere RESEND_API_KEY.
 * Body: { quote_id, to }. Efecto: correo + quote.sent_at/sent_to + status
 * borrador→enviada + registro en email_log (kind='quote').
 * v3: adjunta el PDF de la cotización (builder pdf-lib validado visualmente).
 * (Deployada vía MCP 2026-06-12, verify_jwt: true. Espejo de referencia.)
 */

const ALLOWED_ORIGINS = new Set([
  "https://app.blokkit.cl",
  "https://blokkit-app.pages.dev",
  "http://localhost:4173",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://app.blokkit.cl";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

interface QuoteItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}


/* ── builder del PDF de cotización (validado visualmente) ── */
const A4: [number, number] = [595.28, 841.89];
const PM = 50;
const PDF_CHARCOAL = rgb(0.12, 0.12, 0.12);
const PDF_GRAY = rgb(0.42, 0.42, 0.44);
const PDF_LIGHTGRAY = rgb(0.62, 0.62, 0.64);
const PDF_CYAN = rgb(0.247, 0.659, 0.878);
const PDF_LINE = rgb(0.88, 0.88, 0.87);

function pdfSafe(s: unknown): string {
  return String(s ?? "")
    .replace(/\u2212/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022]/g, "");
}

function pdfClp(n: number): string {
  const v = Math.round(Number(n) || 0);
  return "$" + v.toLocaleString("es-CL").replace(/,/g, ".");
}

interface QuotePdfData {
  bk: string;
  fecha: string;
  validUntil: string | null;
  snap: Record<string, string>;
  items: QuoteItem[];
  totals: { subtotal: number; discount: number; neto: number; iva: number; total: number };
  conditions: string | null;
}

let cachedLogo: Uint8Array | null = null;
async function fetchLogo(): Promise<Uint8Array | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch("https://blokkit.cl/images/Logo-Blokkit-white.png");
    if (!res.ok) return null;
    cachedLogo = new Uint8Array(await res.arrayBuffer());
    return cachedLogo;
  } catch {
    return null;
  }
}

async function buildQuotePdf(data: QuotePdfData, logoBytes: Uint8Array | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;

  let page = pdf.addPage(A4);
  const W = A4[0] - PM * 2;
  let y = A4[1] - PM;

  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - PM;
  };
  const ensure = (space: number) => {
    if (y - space < PM + 24) newPage();
  };
  const wrap = (text: string, font: typeof helv, size: number, maxW: number): string[] => {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };
  const text = (s: string, x: number, size: number, font: typeof helv, color: ReturnType<typeof rgb>, opts: { alignRight?: boolean } = {}) => {
    const str = pdfSafe(s);
    let tx = x;
    if (opts.alignRight) tx = x - font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: tx, y, size, font, color });
  };

  // encabezado: logo blanco sobre pastilla charcoal + título
  const headH = 34;
  if (logo) {
    const lw = (logo.width / logo.height) * 22;
    page.drawRectangle({ x: PM, y: y - headH + 4, width: lw + 24, height: headH, color: PDF_CHARCOAL });
    page.drawImage(logo, { x: PM + 12, y: y - headH + 4 + (headH - 22) / 2, width: lw, height: 22 });
  }
  y -= 6;
  text(`COTIZACIÓN ${data.bk}`, PM + W, 16, bold, PDF_CHARCOAL, { alignRight: true });
  y -= 14;
  text(data.fecha + (data.validUntil ? `  ·  Válida hasta ${data.validUntil}` : ""), PM + W, 8.5, helv, PDF_GRAY, { alignRight: true });
  y -= headH - 14 + 14;

  page.drawLine({ start: { x: PM, y }, end: { x: PM + W, y }, thickness: 1.2, color: PDF_CYAN });
  y -= 22;

  // datos del cliente
  const snapPairs: [string, string][] = ([
    ["Institución", data.snap.institucion],
    ["RUT", data.snap.rut],
    ["Contacto", data.snap.contacto],
    ["Cargo", data.snap.cargo],
    ["Email", data.snap.email],
    ["Teléfono", data.snap.telefono],
    ["Dirección", data.snap.direccion],
    ["Comuna", data.snap.comuna],
    ["Región", data.snap.region],
  ] as [string, string][]).filter(([, v]) => v);

  if (snapPairs.length) {
    ensure(20 + Math.ceil(snapPairs.length / 2) * 14 + 16);
    text("CLIENTE", PM, 8, bold, PDF_CYAN);
    y -= 14;
    const colW = W / 2;
    const startY = y;
    snapPairs.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const px = PM + col * colW;
      const py = startY - row * 14;
      page.drawText(pdfSafe(k + ":"), { x: px, y: py, size: 8.5, font: bold, color: PDF_GRAY });
      page.drawText(pdfSafe(String(v)).slice(0, 60), { x: px + 52, y: py, size: 8.5, font: helv, color: PDF_CHARCOAL });
    });
    y = startY - Math.ceil(snapPairs.length / 2) * 14 - 10;
  }

  // tabla de ítems
  const cDesc = PM;
  const cCant = PM + W * 0.62;
  const cUnit = PM + W * 0.8;
  const cSub = PM + W;

  ensure(40);
  page.drawRectangle({ x: PM - 6, y: y - 5, width: W + 12, height: 18, color: rgb(0.949, 0.949, 0.949) });
  text("DETALLE", cDesc, 8, bold, PDF_GRAY);
  text("CANT.", cCant, 8, bold, PDF_GRAY, { alignRight: true });
  text("P. UNITARIO", cUnit, 8, bold, PDF_GRAY, { alignRight: true });
  text("SUBTOTAL", cSub, 8, bold, PDF_GRAY, { alignRight: true });
  y -= 20;

  for (const it of data.items) {
    const lines = wrap(it.descripcion, helv, 9.5, W * 0.55);
    ensure(lines.length * 12 + 10);
    const rowTop = y;
    lines.forEach((ln, i) => {
      page.drawText(pdfSafe(ln), { x: cDesc, y: rowTop - i * 12, size: 9.5, font: helv, color: PDF_CHARCOAL });
    });
    text(String(it.cantidad), cCant, 9.5, helv, PDF_CHARCOAL, { alignRight: true });
    if (Number(it.precio_unitario) === 0) {
      text("Incluido", cUnit, 9.5, helv, PDF_GRAY, { alignRight: true });
      text("—", cSub, 9.5, helv, PDF_GRAY, { alignRight: true });
    } else {
      text(pdfClp(it.precio_unitario), cUnit, 9.5, helv, PDF_CHARCOAL, { alignRight: true });
      text(pdfClp(it.precio_unitario * it.cantidad), cSub, 9.5, helv, PDF_CHARCOAL, { alignRight: true });
    }
    y = rowTop - (lines.length - 1) * 12 - 8;
    page.drawLine({ start: { x: PM, y: y + 2 }, end: { x: PM + W, y: y + 2 }, thickness: 0.5, color: PDF_LINE });
    y -= 10;
  }

  // totales
  const totRows: [string, string, boolean][] = [];
  if (data.totals.discount > 0) {
    totRows.push(["Subtotal", pdfClp(data.totals.subtotal), false]);
    totRows.push(["Descuento", "-" + pdfClp(data.totals.discount), false]);
  }
  totRows.push(["Neto", pdfClp(data.totals.neto), false]);
  if (data.totals.iva > 0) totRows.push(["IVA (19%)", pdfClp(data.totals.iva), false]);
  totRows.push(["TOTAL", pdfClp(data.totals.total), true]);

  ensure(totRows.length * 16 + 14);
  for (const [label, value, strong] of totRows) {
    const f = strong ? bold : helv;
    const size = strong ? 12 : 9.5;
    text(label, cUnit, size, f, strong ? PDF_CHARCOAL : PDF_GRAY, { alignRight: true });
    text(value, cSub, size, f, PDF_CHARCOAL, { alignRight: true });
    y -= strong ? 18 : 15;
  }
  y -= 8;

  // condiciones — split ANTES de pdfSafe (que borraría los \n)
  if (data.conditions) {
    ensure(30);
    text("CONDICIONES", PM, 8, bold, PDF_CYAN);
    y -= 13;
    const rawLines = String(data.conditions).split("\n").map((l) => l.trim()).filter(Boolean);
    for (const raw of rawLines) {
      const lines = wrap(raw, helv, 8.5, W - 10);
      for (const ln of lines) {
        ensure(11);
        page.drawText(pdfSafe(ln), { x: PM, y, size: 8.5, font: helv, color: PDF_GRAY });
        y -= 11;
      }
      y -= 2;
    }
  }

  // pie
  const footer = "BloKKit · Ambientes libres de distracciones · blokkit.cl · hola@blokkit.cl";
  const fw = helv.widthOfTextAtSize(footer, 7.5);
  page.drawText(footer, { x: (A4[0] - fw) / 2, y: PM - 18, size: 7.5, font: helv, color: PDF_LIGHTGRAY });

  return await pdf.save();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // autenticación + rol CRM
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Sin autorización" }, 401, origin);
  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401, origin);

  const { data: callerRoles } = await svc
    .from("memberships")
    .select("active, roles(name)")
    .eq("user_id", userData.user.id)
    .eq("active", true);
  const isCrm = (callerRoles ?? []).some((m: { roles: { name: string } | { name: string }[] | null }) => {
    const r = m.roles;
    const name = Array.isArray(r) ? r[0]?.name : r?.name;
    return name === "SYS_ADMIN" || name === "SYS_ADMIN_GENERAL" || name === "INTERNAL_SALES" || name === "INTERNAL_ADMIN_ERP";
  });
  if (!isCrm) return json({ error: "Solo el equipo BloKKit puede enviar cotizaciones" }, 403, origin);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return json({ error: "RESEND_API_KEY no configurada — agrégala en Supabase → Edge Functions → Secrets" }, 400, origin);
  }

  let body: { quote_id?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, origin);
  }
  const to = body.to?.trim().toLowerCase() ?? "";
  if (!body.quote_id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return json({ error: "Falta quote_id o el email destino es inválido" }, 400, origin);
  }

  const { data: quote } = await svc
    .from("quotes")
    .select("*, deals(prospect_name, tenants(name))")
    .eq("id", body.quote_id)
    .maybeSingle();
  if (!quote) return json({ error: "Cotización no encontrada" }, 404, origin);

  const snap = (quote.client_snapshot ?? {}) as Record<string, string>;
  const dealRel = quote.deals as { prospect_name: string | null; tenants: { name: string } | { name: string }[] | null } | null;
  const tenantName = Array.isArray(dealRel?.tenants) ? dealRel?.tenants[0]?.name : dealRel?.tenants?.name;
  const clientName = snap.institucion || tenantName || dealRel?.prospect_name || "Cliente";

  const items = (quote.items ?? []) as QuoteItem[];
  const subtotal = items.reduce((acc, it) => acc + Math.round(it.precio_unitario) * it.cantidad, 0);
  const discount =
    quote.discount_type === "percent"
      ? Math.round((subtotal * Number(quote.discount_value)) / 100)
      : quote.discount_type === "amount"
        ? Math.round(Number(quote.discount_value))
        : 0;
  const neto = Number(quote.net_total);
  const iva = quote.include_iva ? Math.round(neto * 0.19) : 0;
  const total = neto + iva;
  const bk = `BK${quote.quote_number}`;
  const fecha = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });

  const itemRows = items
    .map(
      (it) => `<tr>
        <td style=\"padding:10px 12px;border-bottom:1px solid #ECECEA;font-size:14px;color:#1F1F1F;\">${esc(it.descripcion)}</td>
        <td align=\"center\" style=\"padding:10px 12px;border-bottom:1px solid #ECECEA;font-size:14px;color:#55565A;\">${it.cantidad}</td>
        <td align=\"right\" style=\"padding:10px 12px;border-bottom:1px solid #ECECEA;font-size:14px;color:#55565A;\">${it.precio_unitario === 0 ? "Incluido" : esc(clp(it.precio_unitario))}</td>
        <td align=\"right\" style=\"padding:10px 12px;border-bottom:1px solid #ECECEA;font-size:14px;color:#1F1F1F;\">${it.precio_unitario === 0 ? "—" : esc(clp(it.precio_unitario * it.cantidad))}</td>
      </tr>`
    )
    .join("");

  const totalRow = (label: string, value: string, strong = false) =>
    `<tr><td colspan=\"3\" align=\"right\" style=\"padding:6px 12px;font-size:13px;color:${strong ? "#1F1F1F" : "#55565A"};${strong ? "font-weight:700;" : ""}\">${label}</td><td align=\"right\" style=\"padding:6px 12px;font-size:${strong ? "16px" : "13px"};color:#1F1F1F;${strong ? "font-weight:800;" : ""}\">${value}</td></tr>`;

  const conditionsHtml = quote.conditions
    ? `<div style=\"margin-top:24px;padding:16px 20px;background:#FFFFFF;border:1px solid rgba(31,31,31,0.08);border-radius:14px;\"><p style=\"margin:0 0 8px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#3FA8E0;\">Condiciones</p><p style=\"margin:0;font-size:12px;line-height:1.7;color:#55565A;white-space:pre-line;\">${esc(quote.conditions)}</p></div>`
    : "";

  const html = `<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" style=\"background-color:#F2F2F2;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;\"><tr><td align=\"center\"><table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" style=\"max-width:600px;\">
    <tr><td align=\"center\" style=\"padding:8px 0 24px;\"><img src=\"https://blokkit.cl/images/Logo-Blokkit.png\" alt=\"BloKKit\" width=\"132\" style=\"display:block;width:132px;height:auto;\" /></td></tr>
    <tr><td style=\"background-color:#FFFFFF;border:1px solid rgba(31,31,31,0.08);border-radius:20px;padding:32px;\">
      <p style=\"margin:0;font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3FA8E0;\">&middot; Cotización ${bk}</p>
      <h1 style=\"margin:12px 0 0;font-size:22px;line-height:1.2;font-weight:800;text-transform:uppercase;color:#1F1F1F;\">${esc(clientName)}</h1>
      <p style=\"margin:6px 0 0;font-size:13px;color:#8A8D93;\">${esc(fecha)}${quote.valid_until ? ` · válida hasta ${esc(new Date(quote.valid_until + "T12:00:00").toLocaleDateString("es-CL"))}` : ""}${snap.contacto ? ` · Atn: ${esc(snap.contacto)}` : ""}</p>
      <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:20px;border-collapse:collapse;\">
        <tr style=\"background:#F2F2F2;\"><td style=\"padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#55565A;\">Detalle</td><td align=\"center\" style=\"padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#55565A;\">Cant.</td><td align=\"right\" style=\"padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#55565A;\">P. Unit.</td><td align=\"right\" style=\"padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#55565A;\">Subtotal</td></tr>
        ${itemRows}
        ${discount > 0 ? totalRow("Subtotal", clp(subtotal)) + totalRow("Descuento", "−" + clp(discount)) : ""}
        ${totalRow("Neto", clp(neto))}
        ${quote.include_iva ? totalRow("IVA (19%)", clp(iva)) : ""}
        ${totalRow("TOTAL", clp(total), true)}
      </table>
      ${conditionsHtml}
      <p style=\"margin:24px 0 0;font-size:13px;line-height:1.6;color:#55565A;\">Cualquier duda o ajuste, responde este correo o escríbenos a <a href=\"mailto:hola@blokkit.cl\" style=\"color:#3FA8E0;text-decoration:none;\">hola@blokkit.cl</a>.</p>
    </td></tr>
    <tr><td align=\"center\" style=\"padding:22px 12px 0;\"><p style=\"margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9A9A98;\">BloKKit &middot; Ambientes libres de distracciones<br /><a href=\"https://blokkit.cl\" style=\"color:#3FA8E0;text-decoration:none;\">blokkit.cl</a></p></td></tr>
  </table></td></tr></table>`;

  // PDF adjunto
  let attachments: { filename: string; content: string }[] = [];
  try {
    const logoBytes = await fetchLogo();
    const pdfBytes = await buildQuotePdf(
      {
        bk,
        fecha,
        validUntil: quote.valid_until
          ? new Date(quote.valid_until + "T12:00:00").toLocaleDateString("es-CL")
          : null,
        snap,
        items,
        totals: { subtotal, discount, neto, iva, total },
        conditions: quote.conditions ?? null,
      },
      logoBytes
    );
    attachments = [{ filename: `Cotizacion-${bk}-BloKKit.pdf`, content: encodeBase64(pdfBytes) }];
  } catch (e) {
    console.error("send-quote pdf error (se envía sin adjunto)", e);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "BloKKit <hola@blokkit.cl>",
      to: [to],
      reply_to: "hola@blokkit.cl",
      subject: `Cotización ${bk} — BloKKit`,
      attachments,
      html,
      text: `Cotización ${bk} — BloKKit\n${clientName}\nNeto: ${clp(neto)}${quote.include_iva ? ` · IVA: ${clp(iva)}` : ""} · Total: ${clp(total)}\n\n${quote.conditions ?? ""}\n\nblokkit.cl · hola@blokkit.cl`,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return json({ error: `Resend rechazó el envío (${res.status})`, detail }, 502, origin);
  }

  const patch: Record<string, unknown> = { sent_at: new Date().toISOString(), sent_to: to };
  if (quote.status === "borrador") patch.status = "enviada";
  await svc.from("quotes").update(patch).eq("id", quote.id);
  await svc.from("email_log").insert({ provider: "resend", kind: "quote", recipient: to, detail: bk });

  return json({ ok: true, message: `Cotización ${bk} enviada a ${to}.` }, 200, origin);
});
