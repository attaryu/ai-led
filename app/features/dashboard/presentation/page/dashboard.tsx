import { Link } from "react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card"
import { useSession } from "~/features/auth/presentation/hooks/use-session"
import type { UserRole } from "~/features/users/domain/entities/user.entity"

/**
 * Jalan masuk ke tiap bagian level tenant (docs/application_flow.md §4).
 * Isinya masih sebatas penaut; ringkasan progres lintas prodi menyusul.
 */
const sections: {
  title: string
  description: string
  to: string
  roles: UserRole[]
}[] = [
  {
    title: "Program Studi",
    description:
      "Daftar seluruh prodi. Klik salah satu untuk masuk ke Dashboard Prodi-nya.",
    to: "/dashboard/study-programs",
    roles: ["Admin", "Pimpinan", "Penjamin Mutu"],
  },
  {
    title: "Dokumen LED",
    description:
      "Seluruh Dokumen LED lintas prodi beserta statusnya, sebagai pintasan langsung ke dokumennya.",
    to: "/dashboard/led-projects",
    roles: ["Pimpinan", "Penjamin Mutu"],
  },
  {
    title: "User",
    description:
      "Buat akun baru dan tempatkan Penyusun ke prodi tertentu (§4.2).",
    to: "/dashboard/users",
    roles: ["Admin", "Pimpinan"],
  },
  {
    title: "Bukti Dukung Tenant",
    description:
      "Perpustakaan bukti dukung level universitas yang bisa dipakai seluruh prodi (§4.4).",
    to: "/dashboard/evidence",
    roles: ["Pimpinan", "Penjamin Mutu"],
  },
]

export function Dashboard() {
  const session = useSession()

  const visibleSections = session
    ? sections.filter((section) => section.roles.includes(session.role))
    : []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          Dashboard Utama
        </h2>
        <p className="text-sm text-muted-foreground">
          Level universitas (tenant){session && ` · masuk sebagai ${session.role}`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {visibleSections.map((section) => (
          <Link key={section.to} to={section.to} className="group">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {visibleSections.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tidak ada menu yang tersedia</CardTitle>
            <CardDescription>
              Role ini tidak punya akses ke level tenant.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}
    </div>
  )
}
