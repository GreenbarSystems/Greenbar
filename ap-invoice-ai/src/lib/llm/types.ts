// Invoice extraction contract (PRD "LLM Extraction Schema") + provider model
// registry shape (addendum §2.2).
import { z } from "zod";

// Strict output schema enforced before any DB write (PRD NFR "Schema enforcement").
export const invoiceLineSchema = z.object({
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
});

export const invoiceExtractionSchema = z.object({
  documentType: z.enum(["invoice", "credit_memo", "statement", "receipt", "unknown"]),
  vendorName: z.string().nullable(),
  vendorAddress: z.string().nullable(),
  remitToName: z.string().nullable(),
  remitToAddress: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(), // ISO YYYY-MM-DD
  dueDate: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  purchaseOrderNumber: z.string().nullable(),
  currency: z.string().nullable(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  shipping: z.number().nullable(),
  discount: z.number().nullable(),
  total: z.number().nullable(),
  lineItems: z.array(invoiceLineSchema),
  warnings: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});

export type InvoiceExtractionResult = z.infer<typeof invoiceExtractionSchema>;

// Compliance is tracked per MODEL, not per provider (addendum §2.2).
export interface LlmModel {
  id: string; // e.g. "anthropic:claude-sonnet-4-6"
  endpoint: string;
  allowsCustomerData: boolean; // false => blocked for invoice traffic
  retentionDays: number; // must be 0 for production invoice traffic
  region: "us" | "eu";
}

export interface LlmRequest {
  model: LlmModel;
  promptName: string;
  promptVersion: string;
  prompt: string;
}

export interface LlmResponse {
  rawOutput: string;
  provider: string;
  model: string;
}
