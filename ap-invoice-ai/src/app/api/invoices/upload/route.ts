// POST /api/invoices/upload  (PRD "Upload Invoice")
// Accepts multipart/form-data { file, clientId? }. Enforces file-safety controls
// (§2.6) at the boundary BEFORE creating a documents row, dedupes by content
// hash, stores the original, and enqueues process-document.
//
// Requires Idempotency-Key header (addendum §4.6) and `upload_invoice`
// permission (§1.5). Wiring is task INTK-1.
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  // TODO(INTK-1):
  //  1. Resolve session -> { orgId, userId, role }; assertCan(role, "upload_invoice").
  //  2. Enforce/replay Idempotency-Key (api_idempotency_keys).
  //  3. Read multipart file; sniff MIME (not header), check size/pages (§2.6); AV scan.
  //  4. Hash content; withOrg(orgId, ...) upsert documents on (organization_id, content_hash).
  //  5. Store original in object storage; enqueue process-document.
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
