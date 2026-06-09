export type TenantStatus = "active" | "inactive" | "trial";

export interface Tenant {
  id: string;
  name: string;
  type: string;
  status: TenantStatus;
  createdAt: string;
}

export type OrgNodeType =
  | "ORG_ROOT"
  | "AREA"
  | "DEPARTMENT"
  | "TEAM"
  | "BRANCH"
  | "UNIT"
  | "PROJECT"
  | "GROUP"
  | "SCHOOL"
  | "LEVEL"
  | "COURSE";

export interface OrgNode {
  id: string;
  tenantId: string;
  parentId: string | null;
  nodeType: OrgNodeType;
  name: string;
  code?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  scope: "tenant" | "node" | "system";
}

export interface Membership {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  nodeId: string | null;
  active: boolean;
  createdAt: string;
}
