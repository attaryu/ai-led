import { NavLink } from "react-router"
import { UsersIcon, GraduationCapIcon, HouseIcon, FileIcon, SignOutIcon } from "@phosphor-icons/react"
import { useNavigate } from "react-router"

import { useSession } from "~/features/auth/presentation/hooks/use-session"
import type { UserRole } from "~/features/users/domain/entities/user.entity"

/**
 * Menu yang boleh dilihat tiap role, mengikuti docs/application_flow.md §4.
 *
 * Prinsipnya: menu yang tidak boleh diakses disembunyikan sepenuhnya, bukan
 * sekadar dinonaktifkan (§1).
 */
const menuItems: {
  name: string
  path: string
  icon: typeof HouseIcon
  end: boolean
  roles: UserRole[]
}[] = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: HouseIcon,
    end: true,
    // Penyusun mendarat langsung di Dashboard Prodi dan tidak pernah melihat
    // Dashboard Utama (§4).
    roles: ["Admin", "Pimpinan", "Penjamin Mutu"],
  },
  {
    name: "Proyek LED",
    path: "/dashboard/led-projects",
    icon: FileIcon,
    end: false,
    // Admin murni back office — tidak punya akses ke dashboard progres LED,
    // editor bab, maupun bukti dukung (database.md → USER, tabel role).
    roles: ["Pimpinan", "Penjamin Mutu", "Penyusun"],
  },
  {
    name: "Program Studi",
    path: "/dashboard/study-programs",
    icon: GraduationCapIcon,
    end: false,
    // Penjamin Mutu tidak punya menu ini sama sekali (§4.1).
    roles: ["Admin", "Pimpinan"],
  },
  {
    name: "User",
    path: "/dashboard/users",
    icon: UsersIcon,
    end: false,
    // Membuat user hanya Admin; Pimpinan yang meng-assign user ke prodi (§4.2).
    // Keduanya masuk lewat menu yang sama, jadi keduanya melihatnya.
    roles: ["Admin", "Pimpinan"],
  },
]

export function Sidebar() {
  const navigate = useNavigate()
  const session = useSession()

  const handleLogout = () => {
    navigate("/login")
  }

  const visibleMenuItems = session
    ? menuItems.filter((item) => item.roles.includes(session.role))
    : []

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
        <h1 className="font-heading text-lg font-bold tracking-tight text-sidebar-primary">
          LED AI Admin
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-4 py-6">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`
              }
            >
              <Icon className="size-5" />
              {item.name}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <SignOutIcon className="size-5" />
          Keluar (Logout)
        </button>
      </div>
    </aside>
  )
}
