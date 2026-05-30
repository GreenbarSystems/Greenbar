// GET    /api/ap/review/:id   -> review detail (PRD "Get Review Detail")
// PATCH  /api/ap/review/:id   -> edit extracted fields (PRD "Update Extracted Invoice")
//
// PATCH requires If-Match: <updated_at ISO> for optimistic concurrency
// (addendum §4.7); a stale match returns 409 Conflict. Every saved edit writes
// an audit_events row. Wiring is task RVW-2.
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  // TODO(RVW-1): return { document, extractedInvoice, lineItems, validationResults, vendorMatch, auditEvents }
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}

export async function PATCH(): Promise<NextResponse> {
  // TODO(RVW-2): assertCan("edit_extracted_fields"); If-Match compare-and-set on updated_at;
  // 0 rows -> 409. Write audit event.
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
