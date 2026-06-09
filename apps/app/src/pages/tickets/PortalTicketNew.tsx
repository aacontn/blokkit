import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useProfile } from "../../lib/profile";
import {
  ticketPriorityLabel,
  ticketPriorityOptions,
  type TicketPriority
} from "../../lib/tickets";
import { uploadTicketAttachment } from "../../lib/upload";

interface PortalTicketNewProps {
  session: Session;
}

export default function PortalTicketNew({ session }: PortalTicketNewProps) {
  const navigate = useNavigate();
  const { profile, loading: profileLoading, error: profileError } = useProfile(session.user.id);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile) {
      setStatus(profileError ?? "Profile not found.");
      return;
    }

    setSubmitting(true);
    setStatus(null);

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        tenant_id: profile.tenant_id,
        created_by: session.user.id,
        category: category || null,
        priority,
        status: "new",
        subject,
        description: description || null,
        source_channel: "portal"
      })
      .select()
      .single();

    if (error || !data) {
      setStatus(error?.message ?? "Unable to create ticket.");
      setSubmitting(false);
      return;
    }

    if (attachment) {
      const uploadResult = await uploadTicketAttachment({
        ticketId: data.id as string,
        tenantId: profile.tenant_id,
        userId: session.user.id,
        file: attachment
      });

      if (uploadResult.error) {
        setStatus(`Ticket created. Attachment failed: ${uploadResult.error}`);
      }
    }

    setSubmitting(false);
    navigate(`/tickets/${data.id}`);
  };

  return (
    <AppShell title="Nuevo Ticket">
      <div className="glass max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-white">Nuevo ticket</h1>
        <p className="mt-2 text-sm text-white/70">
          Describe tu solicitud y adjunta evidencia si es necesario.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-white/70">
            Asunto
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
              placeholder="Ej: Incidente con acceso"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-white/70">
              Categoria
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                placeholder="Ej: Soporte"
              />
            </label>
            <label className="block text-sm text-white/70">
              Prioridad
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TicketPriority)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
              >
                {ticketPriorityOptions.map((value) => (
                  <option key={value} value={value}>
                    {ticketPriorityLabel[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm text-white/70">
            Descripcion
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
              placeholder="Detalla el problema o solicitud"
            />
          </label>

          <label className="block text-sm text-white/70">
            Adjuntar archivo
            <input
              type="file"
              onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            />
          </label>

          {status && <div className="text-sm text-[#f07f65]">{status}</div>}

          <button
            type="submit"
            disabled={submitting || profileLoading}
            className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-ink disabled:opacity-70"
          >
            {submitting ? "Creando..." : "Crear ticket"}
          </button>

          {profileError && !status && (
            <p className="text-xs text-[#f07f65]">{profileError}</p>
          )}
        </form>
      </div>
    </AppShell>
  );
}
