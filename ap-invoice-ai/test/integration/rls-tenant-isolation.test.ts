// SEC-3 (addendum §1.6 CI gate): prove Postgres RLS isolates tenants.
//
// Requires:
//   INTEGRATION_DATABASE_URL        -> connects as app_user (RLS ENFORCED)
//   INTEGRATION_ADMIN_DATABASE_URL  -> connects as app_admin (BYPASSRLS) for seeding
// with the schema + prisma/migrations/manual/0001_rls_and_constraints.sql applied.
//
// Skipped automatically when INTEGRATION_DATABASE_URL is unset.
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_URL = process.env.INTEGRATION_DATABASE_URL;
const ADMIN_URL = process.env.INTEGRATION_ADMIN_DATABASE_URL ?? APP_URL;

const describeIfDb = APP_URL ? describe : describe.skip;

describeIfDb("SEC-3: Postgres RLS tenant isolation", () => {
  const app = new PrismaClient({ datasourceUrl: APP_URL });
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });

  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    // Seed two orgs as admin (organizations is the tenant root; not RLS-scoped).
    orgA = await createOrg(admin, "Org A");
    orgB = await createOrg(admin, "Org B");

    // Insert one document per org through the app role, scoped via the GUC.
    await asOrg(app, orgA, (tx) => insertDoc(tx, orgA, "a.pdf"));
    await asOrg(app, orgB, (tx) => insertDoc(tx, orgB, "b.pdf"));
  });

  afterAll(async () => {
    // Delete child rows scoped through app_user (RLS), then the orgs as admin.
    // (organizations isn't RLS-scoped; its children are, and have no FK cascade.)
    for (const org of [orgA, orgB].filter(Boolean)) {
      await asOrg(app, org, (tx) => tx.$executeRawUnsafe(`DELETE FROM documents`));
    }
    if (orgA) await admin.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${orgA}'`);
    if (orgB) await admin.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${orgB}'`);
    await app.$disconnect();
    await admin.$disconnect();
  });

  it("sees only its own org's rows when scoped to org A", async () => {
    const docs = await asOrg(app, orgA, (tx) => tx.document.findMany());
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((d) => d.organizationId === orgA)).toBe(true);
  });

  it("sees a disjoint set when scoped to org B", async () => {
    const docs = await asOrg(app, orgB, (tx) => tx.document.findMany());
    expect(docs.every((d) => d.organizationId === orgB)).toBe(true);
    expect(docs.some((d) => d.organizationId === orgA)).toBe(false);
  });

  it("cannot read another org's row even by its exact id", async () => {
    const bDocId = (await asOrg(app, orgB, (tx) => tx.document.findFirst()))!.id;
    const stolen = await asOrg(app, orgA, (tx) =>
      tx.document.findUnique({ where: { id: bDocId } })
    );
    expect(stolen).toBeNull();
  });

  it("cannot INSERT a row for another org (WITH CHECK)", async () => {
    await expect(
      asOrg(app, orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO documents (id, organization_id, source, original_filename, storage_key, status)
           VALUES (gen_random_uuid(), '${orgB}', 'upload', 'evil.pdf', 'k', 'received')`
        )
      )
    ).rejects.toThrow();
  });

  it("fails closed when no org GUC is set (app_user cannot bypass)", async () => {
    // The tenant policy references current_setting('app.current_org_id'); with no
    // GUC and FORCE RLS, the query must error rather than leak all rows.
    await expect(app.document.findMany()).rejects.toThrow();
  });
});

// Mirror of withOrg() for the test's explicit client (src withOrg binds to the
// DATABASE_URL singleton; here we drive an app_user client directly).
async function asOrg<T>(
  client: PrismaClient,
  orgId: string,
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${orgId}', true)`);
    return fn(tx as unknown as PrismaClient);
  });
}

async function createOrg(admin: PrismaClient, name: string): Promise<string> {
  const rows = await admin.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), '${name}') RETURNING id`
  );
  return rows[0].id;
}

async function insertDoc(tx: PrismaClient, orgId: string, filename: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO documents (id, organization_id, source, original_filename, storage_key, status)
     VALUES (gen_random_uuid(), '${orgId}', 'upload', '${filename}', 'key/${filename}', 'received')`
  );
}
