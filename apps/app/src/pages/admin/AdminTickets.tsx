import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  priorityBadgeClass,
  statusBadgeClass,
  ticketPriorityLabel,
  ticketPriorityOptions,
  ticketStatusLabel,
  ticketStatusOptions,
  type Ticket,
  type TicketPriority,
  type TicketStatus
} from "../../lib/tickets";

interface AdminTicketsProps {
  session: Session;
}

type AssigneeFilter = "all" | "me" | "unassigned";

export default function AdminTickets({ session }: AdminTicketsProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchTickets = async () => {
      setLoading(true);
      setError(null);

      let request = supabase
        .from("tickets")
        .select("id, subject, status, priority, updated_at, created_at, assigned_to, created_by")
        .order("updated_at", { ascending: false });

      if (statusFilter !== "all") {
        request = request.eq("status", statusFilter);
      }

      if (priorityFilter !== "all") {
        request = request.eq("priority", priorityFilter);
      }

      if (assigneeFilter === "me") {
        request = request.eq("assigned_to", session.user.id);
      }

      if (assigneeFilter === "unassigned") {
        request = request.is("assigned_to", null);
      }

      if (query.trim()) {
        request = request.ilike("subject", `%${query.trim()}%`);
      }

      const { data, error: fetchError } = await request;

      if (!mounted) return;

      if (fetchError) {
        setError(fetchError.message);
        setTickets([]);
      } else {
        setTickets((data as Ticket[]) ?? []);
      }

      setLoading(false);
    };

    fetchTickets();

    return () => {
      mounted = false;
    };
  }, [session.user.id, statusFilter, priorityFilter, assigneeFilter, query]);

  return (
    <AppShell title="Admin Tickets">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Bandeja de soporte</h1>
          <p className="mt-2 text-sm text-white/70">Gestiona tickets del tenant.</p>
        </div>
        <Link
          to="/tickets/new"
          className="rounded-full border border-white/20 px-5 py-2 text-xs uppercase tracking-[0.2em] text-white/70"
        >
          Crear ticket
        </Link>
      </div>

      <div className="glass mb-6 grid gap-4 p-4 md:grid-cols-5">
        <label className="text-xs uppercase tracking-[0.2em] text-white/50">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TicketStatus | "all")}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="all">All</option>
            {ticketStatusOptions.map((status) => (
              <option key={status} value={status}>
                {ticketStatusLabel[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs uppercase tracking-[0.2em] text-white/50">
          Priority
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TicketPriority | "all")}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="all">All</option>
            {ticketPriorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                {ticketPriorityLabel[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs uppercase tracking-[0.2em] text-white/50">
          Assignment
          <select
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value as AssigneeFilter)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="all">All</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <label className="text-xs uppercase tracking-[0.2em] text-white/50 md:col-span-2">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            placeholder="Buscar por asunto"
          />
        </label>
      </div>

      {loading ? (
        <div className="text-sm text-white/70">Cargando tickets...</div>
      ) : error ? (
        <div className="text-sm text-[#f07f65]">{error}</div>
      ) : tickets.length === 0 ? (
        <div className="text-sm text-white/70">No hay tickets.</div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/admin/tickets/${ticket.id}`}
              className="glass flex flex-col gap-4 p-6 transition hover:-translate-y-0.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">{ticket.id}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{ticket.subject}</h3>
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
              <div className="flex flex-wrap items-center justify-between text-xs text-white/60">
                <span>Actualizado: {formatDateTime(ticket.updated_at)}</span>
                <span>{ticket.assigned_to ? "Asignado" : "Sin asignar"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
