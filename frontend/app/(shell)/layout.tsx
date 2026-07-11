// ami-assessment/frontend/app/(shell)/layout.tsx
import { AppShell } from '@/components/layout/app-shell'

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
