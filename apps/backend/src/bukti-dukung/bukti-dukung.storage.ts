import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Local disk for now — tracker row (Cloudflare R2 Storage Module) swaps this
// for a presigned-URL upload later. Kept as one narrow save/delete seam so
// that swap doesn't touch the rest of the module.
const STORAGE_DIR = process.env.BUKTI_DUKUNG_DIR ?? 'uploads/bukti-dukung';

/** Saves under {tenantId}/{scope}/{id}-{originalname}, returns that relative path. */
export async function saveBuktiDukungFile(
  buffer: Buffer,
  tenantId: string,
  scope: string,
  id: string,
  originalName: string,
): Promise<string> {
  const dir = join(STORAGE_DIR, tenantId, scope);
  await mkdir(dir, { recursive: true });
  const relativePath = join(tenantId, scope, `${id}-${originalName}`);
  await writeFile(join(STORAGE_DIR, tenantId, scope, `${id}-${originalName}`), buffer);
  return relativePath;
}

export async function deleteBuktiDukungFile(relativePath: string): Promise<void> {
  try {
    await unlink(join(STORAGE_DIR, relativePath));
  } catch {
    // Already gone (or never written) — not a reason to fail the delete.
  }
}
