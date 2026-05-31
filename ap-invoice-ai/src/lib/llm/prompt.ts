// buildExtractionPrompt — the ONLY entry point for constructing LLM payloads
// (addendum §2.3). Direct string concatenation into LLM calls is forbidden by
// lint rule; everything funnels through here so prompt inputs stay auditable.
//
// Inputs are strictly limited to: the current document's text, the static
// template + schema, and the document's MIME type / page count. No other org's
// data, no other document, no vendor lists, no email subject/body.

export const PROMPT_NAME = "invoice-extraction";
export const PROMPT_VERSION = "v1";

const SYSTEM_CONTRACT = `You extract structured data from a single accounts-payable document.
Rules:
- Return ONLY valid JSON matching the provided schema.
- Do NOT invent missing values. Use null when a field is unavailable.
- Use ISO date format YYYY-MM-DD.
- Use numeric values for money fields. Preserve the currency shown on the document.
- Add a warning string for any ambiguity.
- If the document is not an invoice, set documentType accordingly.
- If subtotal + tax + shipping - discount does not reconcile with total, add a warning.`;

export interface PromptMeta {
  mimeType: string;
  pageCount: number;
}

export function buildExtractionPrompt(
  documentText: string,
  meta: PromptMeta
): { prompt: string; promptName: string; promptVersion: string } {
  const prompt = [
    SYSTEM_CONTRACT,
    `Document MIME type: ${meta.mimeType}`,
    `Document page count: ${meta.pageCount}`,
    "----- BEGIN DOCUMENT TEXT -----",
    documentText,
    "----- END DOCUMENT TEXT -----",
  ].join("\n\n");

  return { prompt, promptName: PROMPT_NAME, promptVersion: PROMPT_VERSION };
}
