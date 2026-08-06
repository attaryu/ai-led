import { Outlet, useLocation, Navigate } from "react-router"

import { AppShell, type AppShellBreadcrumb } from "~/core/components/app-shell"
import { RoleSwitcher } from "~/features/auth/presentation/components/role-switcher"
import { useRoleGuard } from "~/features/auth/presentation/hooks/use-role-guard"
import { useDashboardSidebar } from "../components/sidebar"

/**
 * Segmen yang merupakan bagian tetap dari pola rute. Segmen di luar daftar ini
 * dianggap parameter dinamis (`:userId`, `:programId`, `:projectId`) dan
 * dinormalkan jadi `:id` sebelum dicocokkan ke label.
 */
const staticSegments = new Set([
  "dashboard",
  "users",
  "study-programs",
  "led-projects",
  "evidence",
  "create",
  "edit",
])

const breadcrumbNameMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/users": "Manajemen User",
  "/dashboard/users/create": "Tambah User",
  "/dashboard/users/:id/edit": "Edit User",
  "/dashboard/study-programs": "Manajemen Program Studi",
  "/dashboard/study-programs/create": "Tambah Program Studi",
  "/dashboard/study-programs/:id/edit": "Edit Program Studi",
  "/dashboard/led-projects": "Manajemen Proyek LED",
  "/dashboard/led-projects/create": "Tambah Proyek LED",
  "/dashboard/led-projects/:id/edit": "Edit Proyek LED",
  "/dashboard/evidence": "Bukti Dukung Tenant",
}

/**
 * Lapis 1 — Dashboard Utama, level tenant (docs/application_flow.md §4).
 *
 * Satu-satunya lapis yang label breadcrumb-nya murni statis, karena seluruh
 * segmennya bagian dari pola rute. Lapis 2 & 3 merakit breadcrumb dari data.
 */
export function DashboardLayout() {
  const location = useLocation()
  const guard = useRoleGuard("tenant")
  const sidebar = useDashboardSidebar()
  const pathnames = location.pathname.split("/").filter((x) => x)

  const breadcrumbs: AppShellBreadcrumb[] = pathnames.flatMap((_, index) => {
    const segments = pathnames.slice(0, index + 1)
    // Segmen id sendiri tidak punya halaman, jadi ia tidak menghasilkan label —
    // tapi pola yang memuatnya (…/:id/edit) tetap dikenali.
    const pattern = `/${segments
      .map((segment) => (staticSegments.has(segment) ? segment : ":id"))
      .join("/")}`
    const label = breadcrumbNameMap[pattern]
    return label ? [{ to: `/${segments.join("/")}`, label }] : []
  })

  if (guard.status === "denied") {
    return <Navigate to={guard.redirectTo} replace />
  }

  return (
    <AppShell
      sidebar={sidebar}
      breadcrumbs={breadcrumbs}
      // Sementara: alat uji hak akses, dihapus begitu autentikasi jalan.
      headerAction={<RoleSwitcher />}
    >
      <Outlet />
    </AppShell>
  )
}
