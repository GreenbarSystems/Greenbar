// Text extraction provider abstraction (PRD "Document Processing Module").
// Native PDF text first; OCR fallback when native extraction scores poorly.
// Concrete adapters (pdf-parse + Tesseract/cloud) are tasks OCR-1 / OCR-2.

export type ExtractionMethod = "native_pdf" | "ocr";

export interface TextExtractionResult {
  method: ExtractionMethod;
  provider?: string;
  text: string;
  textLength: number;
  qualityScore: number; // 0..1
  averageConfidence?: number;
  pageCount?: number;
  metadata: Record<string, unknown>;
}

export interface TextExtractor {
  /** Attempt native embedded-text extraction. Returns null if not applicable/low quality. */
  extractNative(file: Uint8Array, mimeType: string): Promise<TextExtractionResult | null>;
  /** OCR fallback for scans/images. */
  extractOcr(file: Uint8Array, mimeType: string): Promise<TextExtractionResult>;
}

// Text quality scoring (PRD "Text quality scoring"; tolerance: <100 chars = low, §"Tolerance Rules").
export function scoreTextQuality(text: string): { textLength: number; qualityScore: number } {
  const textLength = text.trim().length;
  const keywords = ["invoice", "total", "due", "date", "amount", "qty", "bill", "tax"];
  const lower = text.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k)).length;
  const lengthScore = Math.min(textLength / 500, 1);
  const keywordScore = hits / keywords.length;
  const qualityScore = Number((0.6 * lengthScore + 0.4 * keywordScore).toFixed(4));
  return { textLength, qualityScore };
}
