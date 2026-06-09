export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Kapso webhook placeholder", { status: 200 });
    }

    // Placeholder: validate and forward event to Supabase in a later phase.
    return new Response("ok", { status: 200 });
  }
};
