import { UsersIcon, GraduationCapIcon, HouseIcon, FileIcon, ArchiveIcon, CertificateIcon } from "@phosphor-icons/react"

import type { AppShellSidebar, AppShellNavItem } from "~/core/components/app-shell"
import { useSession } from "~/features/auth/presentation/hooks/use-session"
import { useActiveTenant } from "~/features/tenant/presentation/hooks/use-active-tenant"
import type { UserRole } from "~/features/users/domain/entities/user.entity"

/**
 * Menu yang boleh dilihat tiap role, mengikuti docs/application_flow.md §4.
 *
 * Prinsipnya: menu yang tidak boleh diakses disembunyikan sepenuhnya, bukan
 * sekadar dinonaktifkan (§1).
 */
const menuItems: (AppShellNavItem & { roles: UserRole[] })[] = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: HouseIcon,
    end: true,
    // Penyusun mendarat langsung di Dashboard Program Studi dan tidak pernah melihat
    // Dashboard Utama (§4).
    roles: ["Admin", "Pimpinan", "Penjamin Mutu"],
  },
  {
    name: "Dokumen LED",
    path: "/dashboard/led-projects",
    icon: FileIcon,
    end: false,
    // Admin murni back office — tidak punya akses ke dashboard progres LED,
    // editor bab, maupun bukti dukung (database.md → USER, tabel role).
    // Penyusun tidak pernah masuk lapis tenant; ia mendarat di Dashboard Program Studi
    // miliknya (§2), jadi menu ini bukan miliknya.
    roles: ["Pimpinan", "Penjamin Mutu"],
  },
  {
    name: "Bukti Dukung",
    path: "/dashboard/evidence",
    icon: ArchiveIcon,
    end: false,
    // Admin tidak punya akses ke bukti dukung sama sekali (§4.4).
    roles: ["Pimpinan", "Penjamin Mutu"],
  },
  {
    name: "Instrumen Akreditasi",
    path: "/dashboard/accreditation-sets",
    icon: CertificateIcon,
    end: false,
    // Acuan penilaian adalah konten akreditasi, bukan urusan back office, jadi
    // Admin tidak melihatnya — sama seperti Dokumen LED dan Bukti Dukung.
    // Pimpinan melihat acuan yang berlaku; hanya Penjamin Mutu yang mengelola,
    // dan pembatasan itu ada di dalam halamannya.
    roles: ["Pimpinan", "Penjamin Mutu"],
  },
  {
    name: "Program Studi",
    path: "/dashboard/study-programs",
    icon: GraduationCapIcon,
    end: false,
    // §4.1 memisahkan menu manajemen prodi (Admin, Pimpinan) dari daftar prodi
    // untuk navigasi (§4.3, termasuk Penjamin Mutu). Keduanya digabung ke satu
    // halaman: Penjamin Mutu ikut melihat daftarnya sebagai jalan masuk ke
    // Dashboard Program Studi, tapi tombol tambah dan kolom aksi disembunyikan untuknya.
    roles: ["Admin", "Pimpinan", "Penjamin Mutu"],
  },
  {
    name: "Pengguna",
    path: "/dashboard/users",
    icon: UsersIcon,
    end: false,
    // Membuat user hanya Admin; Pimpinan yang meng-assign user ke prodi (§4.2).
    // Keduanya masuk lewat menu yang sama, jadi keduanya melihatnya.
    roles: ["Admin", "Pimpinan"],
  },
]

/**
 * Konfigurasi sidebar Lapis 1 untuk `AppShell`. Markup-nya sendiri milik
 * `AppShell` supaya ketiga lapis memakai chrome yang sama persis.
 */
export function useDashboardSidebar(): AppShellSidebar {
  const session = useSession()
  const tenant = useActiveTenant()

  const items = session
    ? menuItems.filter((item) => item.roles.includes(session.role))
    : []

  // Tanpa `contextTitle`: lapis tenant tidak punya subjek di bawah nama
  // aplikasi, jadi sidebar-nya langsung dari brand ke daftar menu.
  return { universityName: tenant.universityName, items }
}
