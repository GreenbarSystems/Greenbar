import { describe, expect, it } from "vitest";
import { validateInvoice, hasBlocking } from "./rules";
import type { InvoiceExtractionResult } from "@/lib/llm/types";

const base: InvoiceExtractionResult = {
  documentType: "invoice",
  vendorName: "ABC Supplies LLC",
  vendorAddress: null,
  remitToName: null,
  remitToAddress: null,
  invoiceNumber: "INV-10492",
  invoiceDate: "2026-05-12",
  dueDate: "2026-06-11",
  paymentTerms: null,
  purchaseOrderNumber: null,
  currency: "USD",
  subtotal: 1250.0,
  tax: 103.13,
  shipping: 0,
  discount: 0,
  total: 1353.13,
  lineItems: [{ description: "Office supplies", quantity: 10, unitPrice: 125, amount: 1250 }],
  warnings: [],
  confidence: "high",
};

describe("validateInvoice", () => {
  it("passes a clean, reconciling invoice", () => {
    const issues = validateInvoice(base);
    expect(hasBlocking(issues)).toBe(false);
    expect(issues).toHaveLength(0);
  });

  it("blocks on missing required fields", () => {
    const issues = validateInvoice({ ...base, vendorName: null, total: null });
    expect(hasBlocking(issues)).toBe(true);
    expect(issues.map((i) => i.code)).toContain("missing_vendor_name");
    expect(issues.map((i) => i.code)).toContain("missing_total");
  });

  it("warns when totals do not reconcile", () => {
    const issues = validateInvoice({ ...base, total: 9999.99 });
    expect(issues.map((i) => i.code)).toContain("math_mismatch");
  });

  it("warns when due date precedes invoice date", () => {
    const issues = validateInvoice({ ...base, dueDate: "2026-05-01" });
    expect(issues.map((i) => i.code)).toContain("due_before_invoice");
  });
});
