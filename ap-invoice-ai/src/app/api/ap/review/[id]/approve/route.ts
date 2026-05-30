// POST /api/ap/review/:id/approve  (PRD "Approve Extracted Invoice")
// Blocks if validation has unresolved blocking issues. Requires approve_reject
// permission + Idempotency-Key. Task RVW-3.
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  // TODO(RVW-3): assertCan("approve_reject"); ensure no blocking validation;
  // set review_status='approved', reviewed_by/at; audit event.
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
