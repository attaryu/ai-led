/** Object key format: `{tenantId}/uploads/{uuid}-{fileName}` (built by StorageController.presignedUpload), shared so every confirming module parses it the same way. */

/** Keeps R2 keys boring/URL-safe instead of trusting arbitrary filename characters. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_');
}

// Fixed length, not indexOf('-') — a UUID is itself full of hyphens.
const UUID_PREFIX_LENGTH = 36 + 1; // uuid + '-'

export function extractFileNameFromKey(key: string): string {
  const afterSlash = key.slice(key.lastIndexOf('/') + 1);
  return afterSlash.length > UUID_PREFIX_LENGTH
    ? afterSlash.slice(UUID_PREFIX_LENGTH)
    : afterSlash;
}
