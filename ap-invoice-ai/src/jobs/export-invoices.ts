// export-invoices (PRD Background Jobs; idempotent on export_id per addendum §4.5).
// Trigger: export/created. Confirms targets approved, generates CSV/JSON, stores
// the file, compare-and-set exports.status, flips invoices to 'exported', audits.
// Implementation is task EXP-2.
import { inngest, type ExportCreated } from "@/lib/queue/inngest";

export const exportInvoices = inngest.createFunction(
  { id: "export-invoices", retries: 2, triggers: [{ event: "export/created" }] },
  async ({ event, step }) => {
    const { organizationId, exportId } = event.data as ExportCreated;
    // TODO(EXP-2): withOrgWorker(organizationId, ...):
    //   1. confirm all export_items' invoices are 'approved'
    //   2. serialize CSV + JSON; store via documentStorage/exports bucket
    //   3. compare-and-set exports.status; flip invoices -> 'exported'; audit events
    void step;
    return { organizationId, exportId, status: "not_implemented" };
  }
);
