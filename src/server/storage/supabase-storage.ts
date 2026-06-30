import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PresignedUpload, StorageService } from "./types";

export const MOMENTS_BUCKET = "moments";

let cached: SupabaseClient | null = null;

// Lazy: never touches env at import time (keeps build/static generation safe);
// throws only when actually used without config.
function admin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase storage not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export const supabaseStorage: StorageService = {
  async createUploadTarget({ storageKey }): Promise<PresignedUpload> {
    const { data, error } = await admin()
      .storage.from(MOMENTS_BUCKET)
      .createSignedUploadUrl(storageKey);
    if (error || !data) throw error ?? new Error("Failed to create upload URL");
    return { uploadUrl: data.signedUrl, token: data.token, storageKey };
  },

  async uploadObject({ storageKey, body, contentType }) {
    const { error } = await admin()
      .storage.from(MOMENTS_BUCKET)
      .upload(storageKey, body, { contentType, upsert: true });
    if (error) throw error;
  },

  async getObjectInfo(storageKey) {
    const slash = storageKey.lastIndexOf("/");
    const prefix = storageKey.slice(0, slash);
    const name = storageKey.slice(slash + 1);
    const { data, error } = await admin()
      .storage.from(MOMENTS_BUCKET)
      .list(prefix, { search: name, limit: 100 });
    if (error) throw error;
    const obj = data?.find((o) => o.name === name);
    if (!obj) return null;
    const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
    return { sizeBytes: meta.size ?? 0, contentType: meta.mimetype ?? "" };
  },

  async createSignedDownloadUrl(storageKey, expiresInSeconds) {
    const { data, error } = await admin()
      .storage.from(MOMENTS_BUCKET)
      .createSignedUrl(storageKey, expiresInSeconds);
    if (error || !data) throw error ?? new Error("Failed to create download URL");
    return data.signedUrl;
  },

  async createSignedDownloadUrls(storageKeys, expiresInSeconds) {
    const out = new Map<string, string | null>();
    if (storageKeys.length === 0) return out;
    // De-dupe so repeated keys cost one slot in the single batch round-trip.
    const unique = [...new Set(storageKeys)];
    const { data, error } = await admin()
      .storage.from(MOMENTS_BUCKET)
      .createSignedUrls(unique, expiresInSeconds);
    if (error || !data) {
      // Whole-batch failure: degrade to null URLs rather than throwing, matching
      // the per-key `.catch(() => null)` the single-URL callers used.
      for (const key of unique) out.set(key, null);
      return out;
    }
    for (const row of data) {
      if (row.path) out.set(row.path, row.error ? null : row.signedUrl ?? null);
    }
    // Any key the provider omitted from the response stays null.
    for (const key of unique) if (!out.has(key)) out.set(key, null);
    return out;
  },

  async readObjectHead(storageKey, bytes) {
    // Range-fetch only the first bytes via a short-lived signed URL — enough to
    // sniff the container magic without downloading the whole object.
    const { data, error } = await admin()
      .storage.from(MOMENTS_BUCKET)
      .createSignedUrl(storageKey, 60);
    if (error || !data) throw error ?? new Error("Failed to sign download URL");
    const res = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${Math.max(0, bytes - 1)}` },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`readObjectHead: fetch failed (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  },

  async removeObject(storageKey) {
    const { error } = await admin()
      .storage.from(MOMENTS_BUCKET)
      .remove([storageKey]);
    if (error) throw error;
  },
};
