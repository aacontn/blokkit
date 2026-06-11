import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Acceso por rol del usuario actual (via memberships activas).
 * - isSysAdmin: administración global BloKKit (SYS_ADMIN / SYS_ADMIN_GENERAL)
 * - isStaff: ve el menú Admin (sys admin, roles INTERNAL_* o CLIENT_ADMIN)
 * Cache a nivel de módulo: el nav no parpadea entre páginas.
 */

export interface MyAccess {
  isSysAdmin: boolean;
  isStaff: boolean;
  roleNames: string[];
}

const NO_ACCESS: MyAccess = { isSysAdmin: false, isStaff: false, roleNames: [] };

let cached: MyAccess | null = null;
let cachedFor: string | null = null;

function roleName(roles: unknown): string | null {
  if (Array.isArray(roles)) return (roles[0] as { name?: string } | undefined)?.name ?? null;
  return (roles as { name?: string } | null)?.name ?? null;
}

export async function fetchMyAccess(): Promise<MyAccess> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return NO_ACCESS;
  if (cached && cachedFor === uid) return cached;

  const { data, error } = await supabase
    .from("memberships")
    .select("active, roles(name)")
    .eq("user_id", uid)
    .eq("active", true);

  if (error) return NO_ACCESS;

  const roleNames = (data ?? [])
    .map((m) => roleName(m.roles))
    .filter((n): n is string => Boolean(n));

  const isSysAdmin = roleNames.some((r) => r === "SYS_ADMIN" || r === "SYS_ADMIN_GENERAL");
  const isStaff =
    isSysAdmin || roleNames.some((r) => r.startsWith("INTERNAL_") || r === "CLIENT_ADMIN");

  cached = { isSysAdmin, isStaff, roleNames };
  cachedFor = uid;
  return cached;
}

export function useMyAccess(): MyAccess | null {
  const [access, setAccess] = useState<MyAccess | null>(cached);

  useEffect(() => {
    let mounted = true;
    fetchMyAccess().then((a) => {
      if (mounted) setAccess(a);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return access;
}
