import { NavLink } from "react-router"
import { UsersIcon, GraduationCapIcon, HouseIcon, SignOutIcon } from "@phosphor-icons/react"
import { useNavigate } from "react-router"

export function Sidebar() {
  const navigate = useNavigate()

  const handleLogout = () => {
    navigate("/login")
  }

  const menuItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: HouseIcon,
      end: true,
    },
    {
      name: "Manajemen User",
      path: "/dashboard/users",
      icon: UsersIcon,
      end: false,
    },
    {
      name: "Manajemen Program Studi",
      path: "/dashboard/study-programs",
      icon: GraduationCapIcon,
      end: false,
    },
  ]

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
        {menuItems.map((item) => {
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
