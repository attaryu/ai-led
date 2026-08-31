import { Outlet, useLocation, Navigate } from "react-router"

import { AppShell, type AppShellBreadcrumb } from "~/core/components/app-shell"
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
  "/dashboard/users": "Pengguna",
  "/dashboard/users/create": "Tambah pengguna",
  "/dashboard/users/:id/edit": "Edit pengguna",
  "/dashboard/study-programs": "Program Studi",
  "/dashboard/study-programs/create": "Tambah program studi",
  "/dashboard/study-programs/:id/edit": "Edit program studi",
  "/dashboard/led-projects": "Dokumen LED",
  "/dashboard/led-projects/create": "Tambah Dokumen LED",
  "/dashboard/led-projects/:id/edit": "Edit Dokumen LED",
  "/dashboard/evidence": "Bukti Dukung Universitas",
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

  if (guard.status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Memuat…
      </div>
    )
  }

  if (guard.status === "denied") {
    return <Navigate to={guard.redirectTo} replace />
  }

  return (
    <AppShell sidebar={sidebar} breadcrumbs={breadcrumbs}>
      <Outlet />
    </AppShell>
  )
}
