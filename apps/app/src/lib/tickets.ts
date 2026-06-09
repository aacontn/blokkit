export type TicketStatus = "new" | "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface Ticket {
  id: string;
  tenant_id: string;
  node_id: string | null;
  created_by: string;
  assigned_to: string | null;
  category: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string | null;
  source_channel: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketComment {
  id: string;
  tenant_id: string;
  ticket_id: string;
  author_user_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface TicketAttachment {
  id: string;
  tenant_id: string;
  ticket_id: string;
  owner_user_id: string;
  file_url: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export const ticketStatusOptions: TicketStatus[] = [
  "new",
  "open",
  "pending",
  "resolved",
  "closed"
];

export const ticketPriorityOptions: TicketPriority[] = [
  "low",
  "medium",
  "high",
  "urgent"
];

export const ticketStatusLabel: Record<TicketStatus, string> = {
  new: "New",
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed"
};

export const ticketPriorityLabel: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
};

export function statusBadgeClass(status: TicketStatus) {
  switch (status) {
    case "new":
      return "bg-cobalt/20 text-cobalt border border-cobalt/40";
    case "open":
      return "bg-mint/20 text-mint border border-mint/40";
    case "pending":
      return "bg-gold/20 text-gold border border-gold/40";
    case "resolved":
      return "bg-white/10 text-white/70 border border-white/20";
    case "closed":
      return "bg-white/5 text-white/50 border border-white/10";
  }
}

export function priorityBadgeClass(priority: TicketPriority) {
  switch (priority) {
    case "low":
      return "bg-white/5 text-white/60 border border-white/10";
    case "medium":
      return "bg-white/10 text-white/70 border border-white/20";
    case "high":
      return "bg-gold/20 text-gold border border-gold/40";
    case "urgent":
      return "bg-[#f07f65]/20 text-[#f07f65] border border-[#f07f65]/40";
  }
}

export function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
