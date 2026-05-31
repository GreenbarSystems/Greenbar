// LLM gateway — the single choke point for provider calls (PRD "LLM Gateway").
// Enforces the data-handling guarantees from addendum §2.2 in CODE, not docs:
// it refuses to dispatch invoice payloads to non-compliant models.
//
// Provider SDK calls are intentionally stubbed (TODO markers) — wiring real
// OpenAI/Anthropic clients is task LLM-2 in TASKS.md.
import { invoiceExtractionSchema, type InvoiceExtractionResult, type LlmModel } from "./types";
import { buildExtractionPrompt } from "./prompt";

export class LlmComplianceError extends Error {}
export class LlmSchemaError extends Error {}

/** Hard gate: only zero-retention, customer-data-approved models may see invoices (§2.2). */
export function assertModelAllowedForInvoices(model: LlmModel): void {
  if (!model.allowsCustomerData) {
    throw new LlmComplianceError(`model ${model.id} is not approved for customer data`);
  }
  if (model.retentionDays > 0) {
    throw new LlmComplianceError(`model ${model.id} has retentionDays=${model.retentionDays}; must be 0`);
  }
}

export interface ExtractInput {
  model: LlmModel;
  documentText: string;
  mimeType: string;
  pageCount: number;
}

export interface ExtractOutput {
  result: InvoiceExtractionResult;
  rawOutput: string;
  inputHash: string;
  promptName: string;
  promptVersion: string;
}

/**
 * Extract structured invoice JSON. Validates against the strict schema before
 * returning; retries once with a correction prompt on malformed JSON (PRD P1
 * "Retry malformed JSON"). Throws LlmSchemaError if still invalid.
 */
export async function extractInvoice(input: ExtractInput): Promise<ExtractOutput> {
  assertModelAllowedForInvoices(input.model);

  const { prompt, promptName, promptVersion } = buildExtractionPrompt(
    input.documentText,
    { mimeType: input.mimeType, pageCount: input.pageCount }
  );

  // TODO(LLM-2): dispatch to the provider SDK based on input.model.id prefix.
  // const raw = await dispatch(input.model, prompt);
  const raw = "{}"; // placeholder until provider wiring lands
  const inputHash = await sha256(prompt);

  const parsed = safeParse(raw);
  if (!parsed.ok) {
    // TODO(LLM-2): one correction-prompt retry before failing.
    throw new LlmSchemaError(parsed.error);
  }

  return {
    result: parsed.value,
    rawOutput: raw,
    inputHash,
    promptName,
    promptVersion,
  };
}

function safeParse(raw: string):
  | { ok: true; value: InvoiceExtractionResult }
  | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "model returned non-JSON output" };
  }
  const result = invoiceExtractionSchema.safeParse(json);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.message };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
