/**
 * Object key format: `{tenantId}/uploads/{uuid}-{fileName}` (built by
 * StorageController.presignedUpload). Shared here so every module that
 * confirms an upload (bukti-dukung, dokumen-led LED upload) parses it the
 * same way instead of each re-deriving its own convention.
 */

// Keeps R2 object keys readable and collision-free without leaking the
// original filename's exact characters into the key itself (spaces,
// unicode, etc. all fine in an R2 key, but keeping it boring avoids any
// surprises with tools that assume URL-safe keys).
export function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_');
}

// randomUUID() is always 36 characters — cut with a fixed length, not
// indexOf('-'), because a UUID is itself full of hyphens.
const UUID_PREFIX_LENGTH = 36 + 1; // uuid + '-'

export function extractFileNameFromKey(key: string): string {
  const afterSlash = key.slice(key.lastIndexOf('/') + 1);
  return afterSlash.length > UUID_PREFIX_LENGTH
    ? afterSlash.slice(UUID_PREFIX_LENGTH)
    : afterSlash;
}
