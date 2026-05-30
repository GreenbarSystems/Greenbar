// AUD-1 integration test: exercise recordAudit() through the REAL withOrg()
// against live Supabase, proving the audit path works under RLS end-to-end.
//
// Skipped automatically when INTEGRATION_DATABASE_URL is unset.
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrg, disconnectDb } from "@/lib/db/with-org";
import { recordAudit } from "@/lib/audit/log";

const APP_URL = process.env.INTEGRATION_DATABASE_URL;
const ADMIN_URL = process.env.INTEGRATION_ADMIN_DATABASE_URL ?? APP_URL;
const describeIfDb = APP_URL ? describe : describe.skip;

describeIfDb("AUD-1: audit logging via withOrg under RLS", () => {
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  let orgId = "";
  const entityId = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    const rows = await admin.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), 'Audit Test Org') RETURNING id`
    );
    orgId = rows[0].id;
  });

  afterAll(async () => {
    if (orgId) {
      await withOrg(orgId, (tx) => tx.$executeRawUnsafe(`DELETE FROM audit_events`));
      await admin.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${orgId}'`);
    }
    await admin.$disconnect();
    await disconnectDb();
  });

  it("records an audit event and reads it back within the org scope", async () => {
    await withOrg(orgId, (tx) =>
      recordAudit(tx, {
        organizationId: orgId,
        actorType: "user",
        actorId: null,
        action: "invoice.approved",
        entityType: "extracted_invoice",
        entityId,
        before: { reviewStatus: "needs_review" },
        after: { reviewStatus: "approved" },
        metadata: { source: "aud-1-test" },
      })
    );

    const events = await withOrg(orgId, (tx) =>
      tx.auditEvent.findMany({ where: { entityId } })
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      organizationId: orgId,
      action: "invoice.approved",
      entityType: "extracted_invoice",
    });
    expect(events[0].beforeJson).toEqual({ reviewStatus: "needs_review" });
    expect(events[0].afterJson).toEqual({ reviewStatus: "approved" });
    expect(events[0].metadataJson).toEqual({ source: "aud-1-test" });
  });
});
