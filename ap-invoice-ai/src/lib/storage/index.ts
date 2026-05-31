// Storage provider abstraction (PRD NFR "Extensibility"). Files live in private
// object storage with signed access URLs only (PRD NFR "Security").
// Concrete S3/R2/MinIO adapter is task FILE-1.

export interface StorageProvider {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  /** Time-limited signed URL for reads. Never expose raw bucket URLs. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

// TODO(FILE-1): export a configured singleton based on env (S3 vs MinIO).
