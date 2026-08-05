import { TenantEvidenceLibrary } from "~/features/evidence/presentation/pages/tenant-evidence-library"

/**
 * Perpustakaan Bukti Dukung level tenant (docs/application_flow.md §4.4).
 *
 * Isinya milik fitur `evidence` karena kedua lapis (tenant & prodi) memakai
 * badan halaman yang sama; berkas ini tinggal jadi titik pasang rutenya.
 */
export function DashboardEvidence() {
  return <TenantEvidenceLibrary />
}
