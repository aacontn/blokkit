import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import { useProfile } from "../../lib/profile";
import {
  formatDateTime,
  priorityBadgeClass,
  statusBadgeClass,
  ticketPriorityLabel,
  ticketPriorityOptions,
  ticketStatusLabel,
  ticketStatusOptions,
  type Ticket,
  type TicketAttachment,
  type TicketComment,
  type TicketPriority,
  type TicketStatus
} from "../../lib/tickets";
import { uploadTicketAttachment } from "../../lib/upload";

interface AdminTicketDetailProps {
  session: Session;
}

interface AssigneeOption {
  id: string;
  label: string;
}

export default function AdminTicketDetail({ session }: AdminTicketDetailProps) {
  const { id } = useParams();
  const { profile } = useProfile(session.user.id);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [isInternal, setIsInternal] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [statusValue, setStatusValue] = useState<TicketStatus>("new");
  const [priorityValue, setPriorityValue] = useState<TicketPriority>("medium");
  const [assigneeValue, setAssigneeValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const assigneeOptions = useMemo(() => {
    const base = [{ id: "", label: "Unassigned" }];
    const combined = [{ id: session.user.id, label: "Me" }, ...assignees].filter(
      (option, index, list) => list.findIndex((item) => item.id === option.id) === index
    );
    return base.concat(combined);
  }, [assignees, session.user.id]);

  useEffect(() => {
    let mounted = true;

    const fetchTicket = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);

      const { data: ticketData, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", id)
        .single();

      if (!mounted) return;

      if (ticketError) {
        setError(ticketError.message);
        setLoading(false);
        return;
      }

      const { data: commentData } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });

      const { data: attachmentData } = await supabase
        .from("attachments")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });

      if (!mounted) return;

      const parsedTicket = ticketData as Ticket;
      setTicket(parsedTicket);
      setStatusValue(parsedTicket.status);
      setPriorityValue(parsedTicket.priority);
      setAssigneeValue(parsedTicket.assigned_to ?? "");
      setComments((commentData as TicketComment[]) ?? []);
      setAttachments((attachmentData as TicketAttachment[]) ?? []);
      setLoading(false);
    };

    fetchTicket();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    let mounted = true;

    const fetchAssignees = async () => {
      if (!profile) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("tenant_id", profile.tenant_id)
        .order("full_name");

      if (!mounted) return;

      const mapped = (data ?? []).map((item) => ({
        id: item.id as string,
        label: item.full_name || item.email || item.id
      }));
      setAssignees(mapped);
    };

    fetchAssignees();

    return () => {
      mounted = false;
    };
  }, [profile]);

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket || !profile) return;

    setCommentStatus(null);

    const { data, error: commentError } = await supabase
      .from("ticket_comments")
      .insert({
        tenant_id: profile.tenant_id,
        ticket_id: ticket.id,
        author_user_id: session.user.id,
        body: commentBody,
        is_internal: isInternal
      })
      .select()
      .single();

    if (commentError) {
      setCommentStatus(commentError.message);
      return;
    }

    setComments((prev) => [...prev, data as TicketComment]);
    setCommentBody("");
  };

  const handleAttachmentUpload = async () => {
    if (!ticket || !profile || !attachment) return;

    setCommentStatus(null);
    const result = await uploadTicketAttachment({
      ticketId: ticket.id,
      tenantId: profile.tenant_id,
      userId: session.user.id,
      file: attachment
    });

    if (result.error) {
      setCommentStatus(result.error);
      return;
    }

    if (result.data) {
      setAttachments((prev) => [...prev, result.data as TicketAttachment]);
      setAttachment(null);
    }
  };

  const handleSave = async () => {
    if (!ticket) return;
    setCommentStatus(null);
    setSaving(true);

    const { data, error: updateError } = await supabase
      .from("tickets")
      .update({
        status: statusValue,
        priority: priorityValue,
        assigned_to: assigneeValue || null
      })
      .eq("id", ticket.id)
      .select()
      .single();

    if (updateError) {
      setCommentStatus(updateError.message);
      setSaving(false);
      return;
    }

    setTicket(data as Ticket);
    setSaving(false);
  };

  return (
    <AppShell title="Admin Ticket">
      {loading ? (
        <div className="text-sm text-white/70">Cargando ticket...</div>
      ) : error ? (
        <div className="text-sm text-[#f07f65]">{error}</div>
      ) : ticket ? (
        <div className="space-y-6">
          <div className="glass p-6">
            <Link to="/admin/tickets" className="text-xs uppercase tracking-[0.2em] text-white/50">
              Volver
            </Link>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">{ticket.subject}</h1>
                <p className="mt-2 text-sm text-white/60">
                  Ticket {ticket.id} - creado {formatDateTime(ticket.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-3 py-1 ${statusBadgeClass(ticket.status)}`}>
                  {ticketStatusLabel[ticket.status]}
                </span>
                <span className={`rounded-full px-3 py-1 ${priorityBadgeClass(ticket.priority)}`}>
                  {ticketPriorityLabel[ticket.priority]}
                </span>
              </div>
            </div>
            {ticket.description && (
              <p className="mt-4 text-sm text-white/70">{ticket.description}</p>
            )}
          </div>

          <div className="glass p-6">
            <h2 className="text-lg font-semibold text-white">Estado y asignacion</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="text-xs uppercase tracking-[0.2em] text-white/50">
                Status
                <select
                  value={statusValue}
                  onChange={(event) => setStatusValue(event.target.value as TicketStatus)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {ticketStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {ticketStatusLabel[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs uppercase tracking-[0.2em] text-white/50">
                Prioridad
                <select
                  value={priorityValue}
                  onChange={(event) => setPriorityValue(event.target.value as TicketPriority)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {ticketPriorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {ticketPriorityLabel[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs uppercase tracking-[0.2em] text-white/50">
                Asignado
                <select
                  value={assigneeValue}
                  onChange={(event) => setAssigneeValue(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {assigneeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setAssigneeValue(session.user.id)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70"
              >
                Assign to me
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink disabled:opacity-70"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>

          <div className="glass p-6">
            <h2 className="text-lg font-semibold text-white">Adjuntos</h2>
            <div className="mt-4 space-y-2 text-sm text-white/70">
              {attachments.length === 0 ? (
                <p>No hay adjuntos.</p>
              ) : (
                attachments.map((file) => (
                  <a
                    key={file.id}
                    href={file.file_url}
                    className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 hover:bg-white/5"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{file.file_name}</span>
                    <span className="text-xs text-white/50">
                      {file.size_bytes ? `${Math.round(file.size_bytes / 1024)} KB` : ""}
                    </span>
                  </a>
                ))
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <input
                type="file"
                onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAttachmentUpload}
                disabled={!attachment}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Subir
              </button>
            </div>
          </div>

          <div className="glass p-6">
            <h2 className="text-lg font-semibold text-white">Comentarios</h2>
            <div className="mt-4 space-y-4">
              {comments.length === 0 ? (
                <p className="text-sm text-white/60">Aun no hay comentarios.</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span>
                        {comment.author_user_id === session.user.id ? "Tu" : "Usuario"}
                      </span>
                      <span>{formatDateTime(comment.created_at)}</span>
                    </div>
                    {comment.is_internal && (
                      <span className="mt-2 inline-flex rounded-full border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/50">
                        Interno
                      </span>
                    )}
                    <p className="mt-2 text-sm text-white/70">{comment.body}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleCommentSubmit} className="mt-6 space-y-3">
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                rows={4}
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                placeholder="Agregar comentario"
              />
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(event) => setIsInternal(event.target.checked)}
                />
                Internal note
              </label>
              {commentStatus && <p className="text-sm text-[#f07f65]">{commentStatus}</p>}
              <button
                type="submit"
                className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink"
              >
                Enviar comentario
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
