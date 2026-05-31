// POST /api/ap/review/:id/reject  (PRD "Reject Document")
// Body: { reason }. Requires approve_reject permission + Idempotency-Key. Task RVW-3.
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  // TODO(RVW-3): assertCan("approve_reject"); set review_status='rejected',
  // document status='rejected'; log reason to audit event.
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
