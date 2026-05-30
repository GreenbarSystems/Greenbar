# Background jobs

Async pipeline (PRD "Background Jobs"). Each job is idempotent per addendum §4.5.
The queue adapter (Inngest / Trigger.dev / BullMQ) is selected in task QUE-1; these
files define the job contracts independent of the runner.

| File | Trigger | Idempotency key | Pattern |
|---|---|---|---|
| `process-document.ts` | `document.created` | `document_id` | Append `document_extractions`; compare-and-set `documents.status` |
| `extract-invoice-data.ts` | `document.text_extracted` | `document_id` | Append `llm_runs`; supersede+insert `extracted_invoices` |
| `validate-extracted-invoice.ts` | `invoice.llm_extracted` | `extracted_invoice_id` | Replace `validation_results` for the entity |
| `export-invoices.ts` | `export.created` | `export_id` | Compare-and-set `exports.status` |

Workers run as the `app_worker` DB role and MUST call `withOrgWorker(orgId, ...)`
with the org from the job payload before any query (addendum §1.3).
