// Audit logging (AUD-1) — append an audit_events row for every mutation
// (edit / approve / reject / export), per PRD NFR "Auditability".
//
// Always called inside withOrg(orgId, tx => ...) so the insert is covered by RLS
// (organizationId must match the active org GUC). The caller passes the tx client.
import { Prisma } from "@prisma/client";

export type ActorType = "user" | "system" | "admin";

export interface AuditParams {
  organizationId: string;
  actorType: ActorType;
  actorId?: string | null;
  action: string; // e.g. "invoice.approved", "invoice.field_edited"
  entityType: string; // e.g. "extracted_invoice"
  entityId: string;
  before?: unknown; // prior state (omit if not applicable)
  after?: unknown; // new state
  metadata?: Record<string, unknown>;
}

export async function recordAudit(tx: Prisma.TransactionClient, p: AuditParams): Promise<void> {
  await tx.auditEvent.create({
    data: {
      organizationId: p.organizationId,
      actorType: p.actorType,
      actorId: p.actorId ?? null,
      action: p.action,
      entityType: p.entityType,
      entityId: p.entityId,
      beforeJson: toJson(p.before),
      afterJson: toJson(p.after),
      metadataJson: (p.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/** Map a JS value to Prisma's Json input: omit when undefined, DB NULL when null. */
function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}
