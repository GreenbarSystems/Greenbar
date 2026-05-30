// GET /api/ap/review?status=&clientId=  (PRD "Get Review Queue")
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  // TODO(RVW-1): withOrg(orgId, tx => list extracted_invoices by status/client,
  // joined to documents, sorted by received date). Return { items: [...] }.
  return NextResponse.json({ items: [] });
}
