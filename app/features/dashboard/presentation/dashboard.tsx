import { useNavigate } from "react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card"
import { Button } from "~/core/components/ui/button"

export function Dashboard() {
  const navigate = useNavigate()

  const handleLogout = () => {
    navigate("/login")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            Selamat datang di dashboard Anda (Halaman Kosongan)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Ini adalah tempat penampung halaman utama setelah Anda berhasil login atau mendaftar.
          </p>
          <Button variant="destructive" onClick={handleLogout}>
            Keluar (Logout)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
