// validate-extracted-invoice (PRD Background Jobs; idempotent per addendum §4.5).
// Trigger: invoice/llm-extracted. Runs deterministic checks (rules.ts) + duplicate
// + vendor match, replaces validation_results for the entity, sets review status.
// Implementation is task VAL-1.
import { inngest, type InvoiceLlmExtracted } from "@/lib/queue/inngest";

export const validateExtractedInvoice = inngest.createFunction(
  { id: "validate-extracted-invoice", retries: 2, triggers: [{ event: "invoice/llm-extracted" }] },
  async ({ event, step }) => {
    const { organizationId, extractedInvoiceId } = event.data as InvoiceLlmExtracted;
    // TODO(VAL-1): withOrgWorker(organizationId, ...):
    //   1. validateInvoice() (required/date/math) + duplicate check + vendor match
    //   2. delete prior validation_results for (entity_type,entity_id); insert new
    //   3. review_status -> 'needs_review' (blocking/warnings) or 'pending'
    void step;
    return { organizationId, extractedInvoiceId, status: "not_implemented" };
  }
);
