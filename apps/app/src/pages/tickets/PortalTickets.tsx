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

interface PortalTicketsProps {
  session: Session;
}

export default function PortalTickets({ session }: PortalTicketsProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchTickets = async () => {
      setLoading(true);
      setError(null);

      let request = supabase
        .from("tickets")
        .select("id, subject, status, priority, updated_at, created_at, assigned_to")
        .eq("created_by", session.user.id)
        .order("updated_at", { ascending: false });

      if (statusFilter !== "all") {
        request = request.eq("status", statusFilter);
      }

      if (priorityFilter !== "all") {
        request = request.eq("priority", priorityFilter);
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
  }, [session.user.id, statusFilter, priorityFilter, query]);

  return (
    <AppShell title="Portal Tickets">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tus tickets</h1>
          <p className="mt-2 text-sm text-white/70">Gestiona solicitudes y adjuntos.</p>
        </div>
        <Link
          to="/tickets/new"
          className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink"
        >
          Nuevo ticket
        </Link>
      </div>

      <div className="glass mb-6 grid gap-4 p-4 md:grid-cols-4">
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
        <label className="text-xs uppercase tracking-[0.2em] text-white/50 md:col-span-2">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            placeholder="Busca por asunto"
          />
        </label>
      </div>

      {loading ? (
        <div className="text-sm text-white/70">Cargando tickets...</div>
      ) : error ? (
        <div className="text-sm text-[#f07f65]">{error}</div>
      ) : tickets.length === 0 ? (
        <div className="text-sm text-white/70">No hay tickets todavia.</div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/tickets/${ticket.id}`}
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
                <span>
                  {ticket.assigned_to ? "Asignado" : "Sin asignar"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
