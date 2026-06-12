import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Acceso por rol del usuario actual (via memberships activas).
 * - isSysAdmin: administración global BloKKit (SYS_ADMIN / SYS_ADMIN_GENERAL)
 * - isStaff: ve el menú Admin (sys admin, roles INTERNAL_* o CLIENT_ADMIN)
 * - memberships: rol por tenant, para autorización fina en páginas de colegio
 * Cache a nivel de módulo: el nav no parpadea entre páginas.
 */

export interface TenantMembership {
  tenantId: string;
  role: string;
}

export interface MyAccess {
  isSysAdmin: boolean;
  isStaff: boolean;
  roleNames: string[];
  memberships: TenantMembership[];
}

/** dirección del colegio/institución */
export const MANAGE_ROLES = ["CLIENT_ADMIN", "CLIENT_SUPERVISOR"];
/** operación diaria (incluye profesores) */
export const OPERATE_ROLES = [...MANAGE_ROLES, "CLIENT_TEACHER"];

const NO_ACCESS: MyAccess = { isSysAdmin: false, isStaff: false, roleNames: [], memberships: [] };

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
    .select("tenant_id, active, roles(name)")
    .eq("user_id", uid)
    .eq("active", true);

  if (error) return NO_ACCESS;

  const memberships: TenantMembership[] = (data ?? [])
    .map((m) => ({ tenantId: m.tenant_id as string, role: roleName(m.roles) ?? "" }))
    .filter((m) => m.role);

  const roleNames = memberships.map((m) => m.role);
  const isSysAdmin = roleNames.some((r) => r === "SYS_ADMIN" || r === "SYS_ADMIN_GENERAL");
  const isStaff =
    isSysAdmin || roleNames.some((r) => r.startsWith("INTERNAL_") || r === "CLIENT_ADMIN");

  cached = { isSysAdmin, isStaff, roleNames, memberships };
  cachedFor = uid;
  return cached;
}

export function roleInTenant(access: MyAccess, tenantId: string): string | null {
  return access.memberships.find((m) => m.tenantId === tenantId)?.role ?? null;
}

export function canOperateTenant(access: MyAccess, tenantId: string): boolean {
  if (access.isSysAdmin) return true;
  const role = roleInTenant(access, tenantId);
  return !!role && (OPERATE_ROLES.includes(role) || role.startsWith("INTERNAL_"));
}

export function canManageTenant(access: MyAccess, tenantId: string): boolean {
  if (access.isSysAdmin) return true;
  const role = roleInTenant(access, tenantId);
  return !!role && (MANAGE_ROLES.includes(role) || role.startsWith("INTERNAL_"));
}

/** gate del nav "Fundas": BloKKit o cualquier rol operativo en algún tenant */
export function hasFundasAccess(access: MyAccess): boolean {
  return (
    access.isSysAdmin ||
    access.memberships.some((m) => OPERATE_ROLES.includes(m.role) || m.role.startsWith("INTERNAL_"))
  );
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
