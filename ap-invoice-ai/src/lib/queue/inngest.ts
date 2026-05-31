// Inngest client + event payload contracts (QUE-1).
// Every job payload carries organizationId so the worker can scope queries via
// withOrgWorker() before touching tenant data (addendum §1.3).
//
// NOTE: Inngest v4 replaced the EventSchemas class with a trigger-typing DSL.
// We keep payload shapes as plain TS types here and cast in handlers; wiring the
// fully-typed v4 schemas is a QUE-1 hardening follow-up.
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "ap-invoice-ai" });

export type WithOrg<T> = T & { organizationId: string };

export type DocumentCreated = WithOrg<{ documentId: string }>;
export type DocumentTextExtracted = WithOrg<{ documentId: string }>;
export type InvoiceLlmExtracted = WithOrg<{ extractedInvoiceId: string; documentId: string }>;
export type ExportCreated = WithOrg<{ exportId: string }>;

export const EVENTS = {
  documentCreated: "document/created",
  documentTextExtracted: "document/text-extracted",
  invoiceLlmExtracted: "invoice/llm-extracted",
  exportCreated: "export/created",
} as const;
