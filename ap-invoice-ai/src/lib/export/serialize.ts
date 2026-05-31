// Export serialization (EXP-2 core) — pure, no DB. Turns approved invoices into
// CSV (core header fields, RFC 4180-escaped) and normalized JSON matching the
// PRD "Primary MVP Output" shape. The export-invoices job feeds rows in; this
// module owns the byte-for-byte output format.

export interface ExportableLine {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export interface ExportableInvoice {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO YYYY-MM-DD
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  discount: number | null;
  total: number | null;
  reviewStatus: string;
  warnings: string[];
  lineItems: ExportableLine[];
}

// ---- CSV (core header-level fields; one row per invoice) --------------------

const CSV_COLUMNS = [
  "vendor_name",
  "invoice_number",
  "invoice_date",
  "due_date",
  "currency",
  "subtotal",
  "tax",
  "shipping",
  "discount",
  "total",
  "review_status",
  "warnings",
] as const;

export function toCsv(invoices: ExportableInvoice[]): string {
  const rows = invoices.map((inv) => [
    inv.vendorName,
    inv.invoiceNumber,
    inv.invoiceDate,
    inv.dueDate,
    inv.currency,
    money(inv.subtotal),
    money(inv.tax),
    money(inv.shipping),
    money(inv.discount),
    money(inv.total),
    inv.reviewStatus,
    inv.warnings.join("; "),
  ]);
  // RFC 4180: CRLF line endings.
  return [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Escape one CSV cell per RFC 4180: quote when it contains "," | '"' | CR | LF. */
function csvCell(value: string | null): string {
  if (value == null) return "";
  const needsQuoting = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/** Money → fixed 2dp string, or "" for null. Keeps CSV numeric columns consistent. */
function money(value: number | null): string {
  return value == null ? "" : value.toFixed(2);
}

// ---- JSON (normalized; PRD primary output shape) ----------------------------

export function toJson(invoices: ExportableInvoice[]): string {
  const normalized = invoices.map((inv) => ({
    vendor_name: inv.vendorName,
    invoice_number: inv.invoiceNumber,
    invoice_date: inv.invoiceDate,
    due_date: inv.dueDate,
    subtotal: inv.subtotal,
    tax: inv.tax,
    shipping: inv.shipping,
    discount: inv.discount,
    total: inv.total,
    currency: inv.currency,
    line_items: inv.lineItems.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      amount: l.amount,
    })),
    warnings: inv.warnings,
    review_status: inv.reviewStatus,
  }));
  return JSON.stringify(normalized, null, 2);
}
