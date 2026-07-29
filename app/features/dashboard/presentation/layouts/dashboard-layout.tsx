import { Outlet } from "react-router"
import { Sidebar } from "../components/sidebar"

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar Component */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="pl-64">
        {/* Top Navbar Placeholder */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-8">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              Halaman Administrasi
            </span>
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
