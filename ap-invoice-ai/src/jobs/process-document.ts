// process-document (PRD Background Jobs; idempotent per addendum §4.5).
// Trigger: document/created. Native text -> score -> OCR fallback -> store raw
// text -> append document_extractions -> compare-and-set documents.status ->
// enqueue invoice extraction. Implementation is task PDOC-1.
import { inngest, type DocumentCreated } from "@/lib/queue/inngest";

export const processDocument = inngest.createFunction(
  { id: "process-document", retries: 4, triggers: [{ event: "document/created" }] },
  async ({ event, step }) => {
    const { organizationId, documentId } = event.data as DocumentCreated;
    // TODO(PDOC-1): withOrgWorker(organizationId, ...) for all DB access.
    //   1. fetch original file from storage
    //   2. native extract -> scoreTextQuality -> OCR fallback if low
    //   3. store raw text (rawTextStorage); append document_extractions (Pattern A)
    //   4. compare-and-set documents.status 'received'|'processing' -> 'text_extracted'
    //   5. step.sendEvent('document/text-extracted', { organizationId, documentId })
    void step;
    return { organizationId, documentId, status: "not_implemented" };
  }
);
