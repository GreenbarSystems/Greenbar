// Session resolution (AUTH-1). Bridges Clerk identity -> our internal tenant
// identity { organizationId, userId, role } used by withOrg() and the RBAC matrix.
//
// Clerk Organizations/users are synced into our `organizations`/`users` tables by
// the Clerk webhook (AUTH-2 / task: add clerk_org_id + clerk_user_id columns and
// a /api/webhooks/clerk handler). Until that sync lands, the internal lookup is a
// TODO and this throws if it cannot resolve.
import { auth } from "@clerk/nextjs/server";
import type { UserRole } from "@prisma/client";

export interface SessionContext {
  organizationId: string; // our internal org id (NOT the Clerk org id)
  userId: string; // our internal user id
  role: UserRole;
  clerkOrgId: string;
  clerkUserId: string;
}

export class UnauthenticatedError extends Error {
  readonly status = 401;
}

export class NoActiveOrgError extends Error {
  readonly status = 400;
}

/** Resolve the current request's tenant identity, or throw 401/400. */
export async function resolveSession(): Promise<SessionContext> {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();
  if (!clerkUserId) throw new UnauthenticatedError("no authenticated user");
  if (!clerkOrgId) throw new NoActiveOrgError("no active organization selected");

  // TODO(AUTH-2): map (clerkOrgId, clerkUserId) -> internal { organizationId, userId, role }
  // via the synced columns. Use the ADMIN connection for this lookup since it
  // precedes establishing the org scope.
  throw new Error("resolveSession: Clerk->internal mapping not implemented (AUTH-2)");
}
