// withOrg — the ONLY sanctioned entry point to tenant data (addendum §1.4).
//
// It opens a transaction, sets the per-transaction GUC `app.current_org_id`
// (so Postgres RLS scopes every query to this org), runs the caller's work,
// and commits. `SET LOCAL` guarantees the GUC cannot leak across pooled
// connections (addendum §1.3).
//
// Usage:
//   const docs = await withOrg(orgId, (tx) => tx.document.findMany());
//
// The callback receives a transactional Prisma client. Never capture the
// outer `prisma` instance inside the callback — use the passed `tx`.
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function withOrg<T>(
  orgId: string,
  fn: (tx: TxClient) => Promise<T>,
  options?: { timeout?: number }
): Promise<T> {
  if (!isUuid(orgId)) {
    throw new Error(`withOrg: invalid organization id "${orgId}"`);
  }

  return prisma.$transaction(
    async (tx) => {
      // First statement in the transaction (addendum §1.3).
      // Parameterized via Prisma.sql to avoid injection on the org id.
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
      return fn(tx as unknown as TxClient);
    },
    { timeout: options?.timeout ?? 15_000 }
  );
}

// Worker variant: identical contract, named for clarity at call sites where the
// org comes from a job payload rather than an authenticated session (§1.3).
export const withOrgWorker = withOrg;

/** Close the shared connection. For graceful shutdown / test teardown. */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export type { Prisma };
