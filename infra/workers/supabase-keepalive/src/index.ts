/**
 * Supabase keepalive — evita que el proyecto free de BloKKit entre en pausa
 * por inactividad (Supabase pausa tras ~7 días sin requests al API gateway).
 *
 * El cron (cada 8h) ejecuta una consulta mínima vía PostgREST con la
 * publishable key: el rol anon no ve filas (RLS), pero la query SÍ llega
 * a Postgres y cuenta como actividad. El handler fetch expone el mismo
 * ping para verificar el worker a mano desde su URL.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

interface PingResult {
  ok: boolean;
  status: number;
}

async function pingSupabase(env: Env): Promise<PingResult> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?select=id&limit=1`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  await res.text(); // consumir el body para cerrar la request
  return { ok: res.ok, status: res.status };
}

export default {
  async scheduled(controller, env, _ctx) {
    const result = await pingSupabase(env);
    console.log(
      `supabase-keepalive cron=${controller.cron} status=${result.status} ok=${result.ok}`
    );
    if (!result.ok) {
      // marcar la ejecución como fallida para que quede visible en observabilidad
      throw new Error(`Supabase keepalive failed with status ${result.status}`);
    }
  },

  async fetch(_req, env) {
    const result = await pingSupabase(env);
    return Response.json({
      worker: "blokkit-supabase-keepalive",
      supabase: result.ok ? "activo" : "error",
      status: result.status,
      at: new Date().toISOString(),
    });
  },
} satisfies ExportedHandler<Env>;
