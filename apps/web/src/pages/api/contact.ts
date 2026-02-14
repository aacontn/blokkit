import type { APIRoute } from "astro";

type ContactRequest = {
  name?: string;
  role?: string;
  email?: string;
  institution?: string;
  sector?: string;
  message?: string;
  website?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitize(value: unknown, maxLength = 500): string {
  if (typeof value !== "string") {
    return "";
  }

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

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let payload: ContactRequest;

  try {
    payload = (await request.json()) as ContactRequest;
  } catch {
    return jsonResponse(400, { message: "Solicitud invalida." });
  }

  const website = sanitize(payload.website, 200);
  if (website) {
    return jsonResponse(200, { ok: true });
  }

  const name = sanitize(payload.name, 120);
  const role = sanitize(payload.role, 120);
  const email = sanitize(payload.email, 180).toLowerCase();
  const institution = sanitize(payload.institution, 180);
  const sector = sanitize(payload.sector, 80);
  const message = sanitize(payload.message, 3500);

  if (!name || !email || !message) {
    return jsonResponse(400, { message: "Completa nombre, email y contexto." });
  }

  if (!EMAIL_RE.test(email)) {
    return jsonResponse(400, { message: "El email no es valido." });
  }

  const apiBaseUrl = (import.meta.env.MAILRELAY_API_BASE_URL ?? "https://blokkit.ipzmarketing.com/api/v1").replace(/\/$/, "");
  const apiToken = import.meta.env.MAILRELAY_API_TOKEN;
  const fromEmail = import.meta.env.MAILRELAY_FROM_EMAIL;
  const fromName = import.meta.env.MAILRELAY_FROM_NAME ?? "BloKKit Web";
  const destination = import.meta.env.CONTACT_FORM_TO_EMAIL ?? "hola@blokkit.cl";

  if (!apiToken || !fromEmail) {
    return jsonResponse(500, {
      message: "Falta configurar MAILRELAY_API_TOKEN y MAILRELAY_FROM_EMAIL.",
    });
  }

  const lines = [
    `Nombre: ${name}`,
    `Cargo: ${role || "-"}`,
    `Email: ${email}`,
    `Institucion/empresa: ${institution || "-"}`,
    `Sector: ${sector || "-"}`,
    "",
    "Contexto y objetivo:",
    message,
  ];

  const textPart = lines.join("\n");
  const htmlPart = `
    <h2>Nuevo contacto desde blokkit.cl</h2>
    <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
    <p><strong>Cargo:</strong> ${escapeHtml(role || "-")}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Institucion/empresa:</strong> ${escapeHtml(institution || "-")}</p>
    <p><strong>Sector:</strong> ${escapeHtml(sector || "-")}</p>
    <p><strong>Contexto y objetivo:</strong><br/>${escapeHtml(message).replaceAll("\n", "<br/>")}</p>
  `;

  const mailRelayPayload = {
    from: {
      email: fromEmail,
      name: fromName,
    },
    to: [
      {
        email: destination,
      },
    ],
    subject: `Nuevo contacto web BloKKit - ${name}`,
    html_part: htmlPart,
    text_part: textPart,
    headers: {
      "Reply-To": email,
    },
    smtp_tags: ["web-contacto"],
  };

  try {
    const response = await fetch(`${apiBaseUrl}/send_emails`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-token": apiToken,
      },
      body: JSON.stringify(mailRelayPayload),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Mail Relay error:", response.status, details);
      return jsonResponse(502, { message: "No pudimos enviar el correo. Intenta de nuevo." });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("Mail Relay request failed:", error);
    return jsonResponse(502, { message: "No pudimos enviar el correo. Intenta de nuevo." });
  }
};

