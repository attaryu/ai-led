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
    <div className="flex flex-col gap-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            Selamat datang di dashboard Anda (Halaman Utama)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Ini adalah dashboard utama. Silakan gunakan menu di sidebar untuk mengelola User dan Program Studi (StudyProgram).
          </p>
          <div>
            <Button variant="destructive" onClick={handleLogout}>
              Keluar (Logout)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
