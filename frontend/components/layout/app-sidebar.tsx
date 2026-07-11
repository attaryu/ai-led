// ami-assessment/frontend/components/layout/app-sidebar.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { ClipboardCheck, FlaskConical, History, Moon, Sun } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const NAV_ITEMS = [
  { href: '/', label: 'Assessment', icon: ClipboardCheck },
  { href: '/riwayat', label: 'Riwayat', icon: History },
  { href: '/evaluasi', label: 'Evaluasi RAGAS', icon: FlaskConical },
]

function ThemeToggleMenuItem() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        disabled={!mounted}
        tooltip={isDark ? 'Mode Terang' : 'Mode Gelap'}
      >
        {isDark ? <Sun /> : <Moon />}
        <span>{isDark ? 'Mode Terang' : 'Mode Gelap'}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="font-heading truncate text-base font-bold group-data-[collapsible=icon]:hidden">
            AMI Assessment
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={pathname === item.href}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <ThemeToggleMenuItem />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
