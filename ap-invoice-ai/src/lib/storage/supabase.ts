// Supabase Storage adapter implementing StorageProvider (FILE-1).
// Private buckets only; reads go through time-limited signed URLs (PRD NFR Security).
// Uses the service-role key — server-side only, never shipped to the client.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./index";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export class SupabaseStorage implements StorageProvider {
  constructor(private readonly bucket: string) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const { error } = await supabase()
      .storage.from(this.bucket)
      .upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`storage put failed for ${key}: ${error.message}`);
  }

  async get(key: string): Promise<Uint8Array> {
    const { data, error } = await supabase().storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`storage get failed for ${key}: ${error?.message}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await supabase()
      .storage.from(this.bucket)
      .createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw new Error(`signed url failed for ${key}: ${error?.message}`);
    return data.signedUrl;
  }

  async delete(key: string): Promise<void> {
    const { error } = await supabase().storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`storage delete failed for ${key}: ${error.message}`);
  }
}

// Configured singletons for the app's buckets.
export const documentStorage = () => new SupabaseStorage(requireEnv("SUPABASE_DOCUMENTS_BUCKET"));
export const rawTextStorage = () => new SupabaseStorage(requireEnv("SUPABASE_RAW_TEXT_BUCKET"));
export const inboundStorage = () => new SupabaseStorage(requireEnv("SUPABASE_INBOUND_BUCKET"));
