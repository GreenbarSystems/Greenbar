// Deterministic accounting validation (PRD "Validation Rules").
// Pure functions over an extracted invoice — no DB, no LLM. Duplicate detection
// (which needs prior invoices) is composed separately in the validation job.
import type { InvoiceExtractionResult } from "@/lib/llm/types";

export type Severity = "blocking" | "warning";

export interface ValidationIssue {
  code: string;
  severity: Severity;
  message: string;
}

const MATH_TOLERANCE = 0.02; // §"Tolerance Rules"
const LOW_TEXT_LENGTH = 100;

/** Blocking + warning rules that depend only on the extracted invoice itself. */
export function validateInvoice(inv: InvoiceExtractionResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ---- Blocking rules ----
  if (!inv.invoiceNumber) issues.push(block("missing_invoice_number", "Invoice number is missing"));
  if (!inv.vendorName) issues.push(block("missing_vendor_name", "Vendor name is missing"));
  if (!inv.invoiceDate) issues.push(block("missing_invoice_date", "Invoice date is missing"));
  if (inv.total == null) issues.push(block("missing_total", "Total is missing"));
  if (inv.invoiceDate && !isValidIsoDate(inv.invoiceDate))
    issues.push(block("invalid_invoice_date", "Invoice date is not a valid date"));
  if (inv.documentType !== "invoice" && inv.documentType !== "credit_memo")
    issues.push(block("not_an_invoice", `Document type is "${inv.documentType}"`));

  // ---- Warning rules ----
  if (!inv.dueDate) issues.push(warn("missing_due_date", "Due date is missing"));
  if (inv.dueDate && inv.invoiceDate && isValidIsoDate(inv.dueDate) && isValidIsoDate(inv.invoiceDate)) {
    if (inv.dueDate < inv.invoiceDate)
      issues.push(warn("due_before_invoice", "Due date is before invoice date"));
  }
  if (!inv.currency) issues.push(warn("missing_currency", "Currency is missing"));
  if (!inv.lineItems || inv.lineItems.length === 0)
    issues.push(warn("missing_line_items", "No line items were extracted"));

  const mathIssue = checkMath(inv);
  if (mathIssue) issues.push(mathIssue);

  return issues;
}

/** subtotal + tax + shipping - discount ≈ total, within tolerance. */
function checkMath(inv: InvoiceExtractionResult): ValidationIssue | null {
  const { subtotal, tax, shipping, discount, total } = inv;
  if (subtotal == null || total == null) return null;
  const computed = subtotal + (tax ?? 0) + (shipping ?? 0) - (discount ?? 0);
  if (Math.abs(computed - total) > MATH_TOLERANCE) {
    return warn(
      "math_mismatch",
      `Computed ${computed.toFixed(2)} does not match total ${total.toFixed(2)}`
    );
  }
  return null;
}

export function textQualityWarning(textLength: number): ValidationIssue | null {
  return textLength < LOW_TEXT_LENGTH
    ? warn("low_text_quality", `Only ${textLength} characters extracted`)
    : null;
}

export function hasBlocking(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "blocking");
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

const block = (code: string, message: string): ValidationIssue => ({ code, severity: "blocking", message });
const warn = (code: string, message: string): ValidationIssue => ({ code, severity: "warning", message });
