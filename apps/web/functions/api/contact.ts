/**
 * /api/contact — Cloudflare Pages Function del formulario de contacto de blokkit.cl.
 *
 * Reemplaza el endpoint Supabase muerto (elzneskmoftedmyfhkgi.supabase.co, NXDOMAIN):
 * el form ahora postea aquí, mismo origen, sin CORS. Defensas propias: honeypot,
 * validación estricta y límites de largo. Notifica el lead vía Mailrelay (transaccional)
 * a CONTACT_FORM_TO_EMAIL, con Reply-To del interesado.
 *
 * Variables (configurar en Cloudflare Pages → Settings → Environment variables,
 * Production y Preview; los valores viven en apps/web/.env solo para dev local):
 *   MAILRELAY_API_BASE_URL  (default https://blokkit.ipzmarketing.com/api/v1)
 *   MAILRELAY_API_TOKEN     (secreto, obligatorio)
 *   MAILRELAY_FROM_EMAIL    (obligatorio, dominio verificado en Mailrelay)
 *   MAILRELAY_FROM_NAME     (default "BloKKit Web")
 *   CONTACT_FORM_TO_EMAIL   (default hola@blokkit.cl)
 */

interface Env {
  MAILRELAY_API_BASE_URL?: string;
  MAILRELAY_API_TOKEN?: string;
  MAILRELAY_FROM_EMAIL?: string;
  MAILRELAY_FROM_NAME?: string;
  CONTACT_FORM_TO_EMAIL?: string;
}

type ContactRequest = {
  name?: string;
  role?: string;
  email?: string;
  institution?: string;
  sector?: string;
  message?: string;
  website?: string;
  utm?: Record<string, unknown> | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitize(value: unknown, maxLength = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// atribución de campaña: whitelist de llaves, valores acotados
function cleanUtm(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer"];
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const value = sanitize((raw as Record<string, unknown>)[key], 200);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  let payload: ContactRequest;
  try {
    payload = (await request.json()) as ContactRequest;
  } catch {
    return jsonResponse(400, { message: "Solicitud inválida." });
  }

  // honeypot: los bots llenan el campo oculto — responder 200 sin hacer nada
  if (sanitize(payload.website, 200)) {
    return jsonResponse(200, { ok: true });
  }

  const name = sanitize(payload.name, 120);
  const role = sanitize(payload.role, 120);
  const email = sanitize(payload.email, 180).toLowerCase();
  const institution = sanitize(payload.institution, 180);
  const sector = sanitize(payload.sector, 80);
  const message = sanitize(payload.message, 3500);
  const utm = cleanUtm(payload.utm);

  if (!name || !email || !message) {
    return jsonResponse(400, { message: "Completa nombre, email y contexto." });
  }
  if (!EMAIL_RE.test(email)) {
    return jsonResponse(400, { message: "El email no es válido." });
  }

  const apiBaseUrl = (env.MAILRELAY_API_BASE_URL ?? "https://blokkit.ipzmarketing.com/api/v1").replace(/\/$/, "");
  const apiToken = env.MAILRELAY_API_TOKEN;
  const fromEmail = env.MAILRELAY_FROM_EMAIL;
  const fromName = env.MAILRELAY_FROM_NAME ?? "BloKKit Web";
  const destination = env.CONTACT_FORM_TO_EMAIL ?? "hola@blokkit.cl";

  if (!apiToken || !fromEmail) {
    console.error("contact: faltan MAILRELAY_API_TOKEN / MAILRELAY_FROM_EMAIL en el entorno de Pages");
    return jsonResponse(500, { message: "No pudimos enviar la solicitud. Escríbenos a hola@blokkit.cl" });
  }

  const utmText = utm ? "\n\nAtribución:\n" + Object.entries(utm).map(([k, v]) => `${k}: ${v}`).join("\n") : "";
  const utmHtml = utm
    ? `<p><strong>Atribución:</strong><br/>${Object.entries(utm).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join("<br/>")}</p>`
    : "";

  const textPart = [
    `Nombre: ${name}`,
    `Cargo: ${role || "-"}`,
    `Email: ${email}`,
    `Institución/empresa: ${institution || "-"}`,
    `Sector: ${sector || "-"}`,
    "",
    "Contexto y objetivo:",
    message,
  ].join("\n") + utmText;

  const htmlPart = `
    <h2>Nuevo contacto desde blokkit.cl</h2>
    <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
    <p><strong>Cargo:</strong> ${escapeHtml(role || "-")}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Institución/empresa:</strong> ${escapeHtml(institution || "-")}</p>
    <p><strong>Sector:</strong> ${escapeHtml(sector || "-")}</p>
    <p><strong>Contexto y objetivo:</strong><br/>${escapeHtml(message).replaceAll("\n", "<br/>")}</p>
    ${utmHtml}
  `;

  const mailRelayPayload = {
    from: { email: fromEmail, name: fromName },
    to: [{ email: destination }],
    subject: `Nuevo contacto web BloKKit - ${name}`,
    html_part: htmlPart,
    text_part: textPart,
    headers: { "Reply-To": email },
    smtp_tags: ["web-contacto"],
  };

  try {
    const response = await fetch(`${apiBaseUrl}/send_emails`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-auth-token": apiToken },
      body: JSON.stringify(mailRelayPayload),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("Mailrelay error:", response.status, details);
      return jsonResponse(502, { message: "No pudimos enviar la solicitud. Intenta de nuevo." });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("Mailrelay request failed:", error);
    return jsonResponse(502, { message: "No pudimos enviar la solicitud. Intenta de nuevo." });
  }
};
