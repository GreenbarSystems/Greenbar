// POST /api/ap/exports  (PRD "Export Approved Invoices")
// Body: { clientId?, format: "csv"|"json", extractedInvoiceIds[] }.
// Creates the exports row up-front (so the job is idempotent on export_id,
// addendum §4.5), enqueues export-invoices, returns a signed downloadUrl when
// ready. Requires export permission + Idempotency-Key. Task EXP-1.
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  // TODO(EXP-1): assertCan("export"); confirm all targets approved; create exports row;
  // enqueue export-invoices; return { exportId, status:'created' }.
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
