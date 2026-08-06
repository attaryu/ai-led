import * as React from "react"
import { ArrowLeftIcon, type Icon } from "@phosphor-icons/react"
import { Link, NavLink } from "react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/core/components/ui/breadcrumb"

export type AppShellNavItem = {
  name: string
  path: string
  icon: Icon
  /** Cocokkan persis, dipakai untuk item index agar tidak ikut aktif di anaknya. */
  end?: boolean
}

export type AppShellSidebar = {
  /** `null` → tombol kembali tidak dirender (role tanpa lapis di atasnya, §2). */
  backTo?: string | null
  backLabel?: string
  /** Label kecil di atas nama, mis. "DASHBOARD PRODI". */
  eyebrow?: string
  brand: string
  /** Sudah tersaring per role oleh pemanggil. */
  items: AppShellNavItem[]
  footer?: React.ReactNode
}

export type AppShellBreadcrumb = {
  /** Tanpa `to` → dirender sebagai halaman aktif, bukan tautan. */
  to?: string
  label: string
}

/**
 * Chrome bersama ketiga lapis ruang kerja (docs/application_flow.md §3).
 *
 * Bentuknya sengaja sama di semua lapis — yang berganti total adalah isi
 * sidebar dan breadcrumb, dan itulah yang dimaksud §3 dengan "navigasi berbeda
 * total": prodi bukan sub-tab di dalam Dashboard Utama, melainkan ruang kerja
 * sendiri dengan daftar menunya sendiri.
 */
export function AppShell({
  sidebar,
  breadcrumbs,
  headerAction,
  children,
}: {
  sidebar: AppShellSidebar
  breadcrumbs: AppShellBreadcrumb[]
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex min-h-16 flex-col justify-center gap-1 border-b border-sidebar-border px-6 py-3">
          {sidebar.backTo && (
            <Link
              to={sidebar.backTo}
              className="flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
            >
              <ArrowLeftIcon className="size-3.5" />
              {sidebar.backLabel ?? "Kembali"}
            </Link>
          )}
          {sidebar.eyebrow && (
            <p className="text-[10px] font-medium tracking-wide text-sidebar-foreground/60 uppercase">
              {sidebar.eyebrow}
            </p>
          )}
          <h1 className="truncate font-heading text-lg font-bold tracking-tight text-sidebar-primary">
            {sidebar.brand}
          </h1>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-6">
          {sidebar.items.map((item) => {
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

        {sidebar.footer && (
          <div className="border-t border-sidebar-border p-4">{sidebar.footer}</div>
        )}
      </aside>

      <div className="pl-64">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-8">
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((breadcrumb, index) => (
                <React.Fragment key={`${breadcrumb.to ?? "current"}-${breadcrumb.label}`}>
                  <BreadcrumbItem>
                    {breadcrumb.to && index < breadcrumbs.length - 1 ? (
                      <BreadcrumbLink render={<Link to={breadcrumb.to} />}>
                        {breadcrumb.label}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>

          {headerAction}
        </header>

        <main className="p-8">{children}</main>
      </div>
    </div>
  )
}
