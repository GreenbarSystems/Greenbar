// extract-invoice-data (PRD Background Jobs; idempotent per addendum §4.2/§4.5).
// Trigger: document/text-extracted. Calls the LLM gateway, appends an llm_runs
// row, supersedes any prior pending extraction, inserts the new extracted_invoice
// + lines, then enqueues validation. Implementation is task EXT-1.
import { inngest, type DocumentTextExtracted } from "@/lib/queue/inngest";

export const extractInvoiceData = inngest.createFunction(
  { id: "extract-invoice-data", retries: 2, triggers: [{ event: "document/text-extracted" }] },
  async ({ event, step }) => {
    const { organizationId, documentId } = event.data as DocumentTextExtracted;
    // TODO(EXT-1): withOrgWorker(organizationId, ...):
    //   1. load latest raw text for documentId
    //   2. extractInvoice() via gateway (compliance-gated, schema-validated)
    //   3. append llm_runs (Pattern A): raw output, prompt version, input hash
    //   4. supersede prior pending extracted_invoices; insert new + lines (Pattern B)
    //   5. status -> 'llm_extracted'; sendEvent('invoice/llm-extracted', ...)
    void step;
    return { organizationId, documentId, status: "not_implemented" };
  }
);
