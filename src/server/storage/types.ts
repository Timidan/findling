export interface PresignedUpload {
  /** Signed URL the browser PUTs the file to. */
  uploadUrl: string;
  token: string;
  /** Object path within the bucket. */
  storageKey: string;
}

export interface StorageService {
  createUploadTarget(input: { storageKey: string }): Promise<PresignedUpload>;
  /** Server-side upload (used by the clip worker to store cut clips/posters). */
  uploadObject(input: {
    storageKey: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<void>;
  /** Real, server-observed metadata of a stored object (null if it doesn't exist). */
  getObjectInfo(
    storageKey: string,
  ): Promise<{ sizeBytes: number; contentType: string } | null>;
  /** Short-lived signed URL to download a stored object — released ONLY after payment. */
  createSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds: number,
  ): Promise<string>;
  /**
   * Batch variant: sign many keys in ONE provider round-trip. Returns a map from
   * storageKey → signed URL, or null for any key that failed to sign (so a single
   * bad key never rejects the whole batch). Used by read-models that would
   * otherwise fan out one network call per row.
   */
  createSignedDownloadUrls(
    storageKeys: string[],
    expiresInSeconds: number,
  ): Promise<Map<string, string | null>>;
  /** First `bytes` of a stored object, for server-side magic-byte sniffing. */
  readObjectHead(storageKey: string, bytes: number): Promise<Buffer>;
  removeObject(storageKey: string): Promise<void>;
}
