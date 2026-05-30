import { describe, expect, it } from "vitest";
import { toCsv, toJson, type ExportableInvoice } from "./serialize";

const base: ExportableInvoice = {
  vendorName: "ABC Supplies LLC",
  invoiceNumber: "INV-10492",
  invoiceDate: "2026-05-12",
  dueDate: "2026-06-11",
  currency: "USD",
  subtotal: 1250.0,
  tax: 103.13,
  shipping: 0,
  discount: 0,
  total: 1353.13,
  reviewStatus: "approved",
  warnings: [],
  lineItems: [{ description: "Office supplies", quantity: 10, unitPrice: 125, amount: 1250 }],
};

describe("toCsv", () => {
  it("emits a header row + one CRLF-terminated row per invoice", () => {
    const csv = toCsv([base]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "vendor_name,invoice_number,invoice_date,due_date,currency,subtotal,tax,shipping,discount,total,review_status,warnings"
    );
    expect(lines[1]).toBe("ABC Supplies LLC,INV-10492,2026-05-12,2026-06-11,USD,1250.00,103.13,0.00,0.00,1353.13,approved,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes commas, quotes, and newlines per RFC 4180", () => {
    const tricky = toCsv([
      { ...base, vendorName: 'Acme, "The Co"', invoiceNumber: "line1\nline2", warnings: ["a; b"] },
    ]);
    const row = tricky.split("\r\n")[1];
    expect(row).toContain('"Acme, ""The Co"""'); // comma + doubled quotes
    expect(row).toContain('"line1\nline2"'); // embedded newline quoted
  });

  it("renders null money as empty, present money as 2dp", () => {
    const row = toCsv([{ ...base, tax: null, total: 5 }]).split("\r\n")[1];
    const cols = row.split(",");
    expect(cols[6]).toBe(""); // tax null
    expect(cols[9]).toBe("5.00"); // total
  });
});

describe("toJson", () => {
  it("produces the PRD normalized shape with snake_case keys + line items", () => {
    const parsed = JSON.parse(toJson([base]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      vendor_name: "ABC Supplies LLC",
      invoice_number: "INV-10492",
      total: 1353.13,
      currency: "USD",
      review_status: "approved",
    });
    expect(parsed[0].line_items[0]).toEqual({
      description: "Office supplies",
      quantity: 10,
      unit_price: 125,
      amount: 1250,
    });
  });
});
