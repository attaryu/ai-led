import { PlaceholderPage } from "~/core/components/placeholder-page"

/**
 * Perpustakaan Bukti Dukung level tenant (docs/application_flow.md §4.4).
 *
 * Kosong karena entitas `BUKTI_DUKUNG` belum ada. Admin tidak punya akses ke
 * bukti dukung sama sekali, jadi menunya disembunyikan di sidebar.
 */
export function DashboardEvidence() {
  return (
    <PlaceholderPage
      title="Bukti Dukung Tenant"
      description="Bukti dukung milik universitas yang bisa dipakai seluruh prodi. Entitas BUKTI_DUKUNG belum tersedia."
      links={[
        { label: "Daftar Program Studi", to: "/dashboard/study-programs" },
        { label: "Dokumen LED lintas prodi", to: "/dashboard/led-projects" },
      ]}
    />
  )
}
