import { Outlet, useLocation, Link } from "react-router"
import * as React from "react"
import { Sidebar } from "../components/sidebar"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/core/components/ui/breadcrumb"

const breadcrumbNameMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/users": "Manajemen User",
  "/dashboard/users/create": "Tambah User",
  "/dashboard/study-programs": "Manajemen Program Studi",
  "/dashboard/study-programs/create": "Tambah Program Studi",
}

export function DashboardLayout() {
  const location = useLocation()
  const pathnames = location.pathname.split("/").filter((x) => x)

  const allBreadcrumbs = pathnames.map((_, index) => {
    const to = `/${pathnames.slice(0, index + 1).join("/")}`
    const label = breadcrumbNameMap[to]
    return { to, label }
  })

  const breadcrumbs = allBreadcrumbs
    .filter((b): b is { to: string; label: string } => !!b.label)
    .map((b, index, arr) => ({
      ...b,
      isLast: index === arr.length - 1,
    }))

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar Component */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="pl-64">
        {/* Top Navbar with shadcn Breadcrumb */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-8">
          <div className="flex items-center gap-4">
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((breadcrumb, index) => (
                  <React.Fragment key={breadcrumb.to}>
                    <BreadcrumbItem>
                      {breadcrumb.isLast ? (
                        <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink render={<Link to={breadcrumb.to} />}>
                          {breadcrumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        {/* Content Wrapper */}
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
