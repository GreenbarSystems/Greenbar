// All Inngest job functions, registered with the /api/inngest serve handler.
import { processDocument } from "./process-document";
import { extractInvoiceData } from "./extract-invoice-data";
import { validateExtractedInvoice } from "./validate-extracted-invoice";
import { exportInvoices } from "./export-invoices";

export const functions = [
  processDocument,
  extractInvoiceData,
  validateExtractedInvoice,
  exportInvoices,
];
