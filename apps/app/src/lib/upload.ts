import { supabase } from "./supabase";
import type { TicketAttachment } from "./tickets";

interface UploadTicketAttachmentInput {
  ticketId: string;
  tenantId: string;
  userId: string;
  file: File;
}

interface UploadResult {
  data: TicketAttachment | null;
  error: string | null;
}

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function uploadTicketAttachment({
  ticketId,
  tenantId,
  userId,
  file
}: UploadTicketAttachmentInput): Promise<UploadResult> {
  const safeName = sanitizeFileName(file.name);
  const path = `${tenantId}/${ticketId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("ticket-attachments")
    .upload(path, file);

  if (uploadError) {
    return { data: null, error: uploadError.message };
  }

  const publicUrl = supabase.storage.from("ticket-attachments").getPublicUrl(path).data.publicUrl;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      tenant_id: tenantId,
      ticket_id: ticketId,
      owner_user_id: userId,
      file_url: publicUrl,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as TicketAttachment, error: null };
}
