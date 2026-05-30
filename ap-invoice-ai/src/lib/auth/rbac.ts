// RBAC permission matrix (addendum §1.5).
// Effective permission = max(users.role, user_client_access.role for the client).
import type { UserRole } from "@prisma/client";

export type Permission =
  | "manage_users_billing"
  | "manage_clients_connectors"
  | "upload_invoice"
  | "edit_extracted_fields"
  | "approve_reject"
  | "export"
  | "read";

const MATRIX: Record<UserRole, Permission[]> = {
  owner: [
    "manage_users_billing",
    "manage_clients_connectors",
    "upload_invoice",
    "edit_extracted_fields",
    "approve_reject",
    "export",
    "read",
  ],
  admin: [
    "manage_clients_connectors",
    "upload_invoice",
    "edit_extracted_fields",
    "approve_reject",
    "export",
    "read",
  ],
  reviewer: ["upload_invoice", "edit_extracted_fields", "approve_reject", "export", "read"],
  clerk: ["upload_invoice", "edit_extracted_fields", "read"],
  viewer: ["read"],
};

const RANK: Record<UserRole, number> = {
  viewer: 0,
  clerk: 1,
  reviewer: 2,
  admin: 3,
  owner: 4,
};

/** Highest-privilege role between the org-level role and an optional client-scoped role. */
export function effectiveRole(orgRole: UserRole, clientRole?: UserRole | null): UserRole {
  if (!clientRole) return orgRole;
  return RANK[clientRole] > RANK[orgRole] ? clientRole : orgRole;
}

export function can(role: UserRole, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

/** Throws if the role lacks the permission. Use in route handlers / server actions. */
export function assertCan(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError(`role "${role}" lacks permission "${permission}"`);
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
}
