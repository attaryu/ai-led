import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router"
import { ArrowLeft } from "@phosphor-icons/react"

import { Button } from "~/core/components/ui/button"
import { Input } from "~/core/components/ui/input"
import { Select } from "~/core/components/ui/select"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/core/components/ui/field"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/core/components/ui/card"
import {
  createUserSchema,
  type CreateUserInput,
  type User,
} from "../../domain/schemas"
import type { StudyProgram } from "../../../study-program/domain/schemas"

export function CreateUser() {
  const navigate = useNavigate()
  const [studyPrograms, setStudyPrograms] = React.useState<StudyProgram[]>([])

  React.useEffect(() => {
    const stored = localStorage.getItem("study_program_data")
    if (stored) {
      try {
        setStudyPrograms(JSON.parse(stored))
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      namaLengkap: "",
      email: "",
      password: "",
      role: "Penjamin Mutu",
      studyProgramId: "",
    },
  })

  const selectedRole = useWatch({
    control,
    name: "role",
  })

  React.useEffect(() => {
    if (selectedRole !== "Penyusun") {
      setValue("studyProgramId", null)
    } else if (studyPrograms.length > 0) {
      setValue("studyProgramId", studyPrograms[0].id)
    }
  }, [selectedRole, studyPrograms, setValue])

  const onSubmit = (data: CreateUserInput) => {
    const selectedProgramObj =
      data.role === "Penyusun" && data.studyProgramId
        ? studyPrograms.find((p) => p.id === data.studyProgramId)
        : null

    const newUser: User = {
      id: Date.now().toString(),
      namaLengkap: data.namaLengkap,
      email: data.email,
      role: data.role,
      studyProgramId: data.role === "Penyusun" ? data.studyProgramId : null,
      studyProgramName: selectedProgramObj ? selectedProgramObj.studyProgramName : null,
      createdAt: new Date().toISOString(),
    }

    const storedUsers = localStorage.getItem("user_data")
    let usersList: User[] = []
    if (storedUsers) {
      try {
        usersList = JSON.parse(storedUsers)
      } catch (e) {
        console.error(e)
      }
    }
    
    usersList.push(newUser)
    localStorage.setItem("user_data", JSON.stringify(usersList))
    navigate("/dashboard/users")
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/dashboard/users")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">Tambah Pengguna Baru</h2>
          <p className="text-sm text-muted-foreground">Isi data lengkap pengguna baru di bawah ini.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Formulir Pengguna</CardTitle>
          <CardDescription>Seluruh kolom wajib diisi sesuai dengan data pengguna.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FieldGroup>
              <Field data-invalid={!!errors.namaLengkap}>
                <FieldLabel htmlFor="namaLengkap">Nama Lengkap</FieldLabel>
                <Input
                  id="namaLengkap"
                  placeholder="Contoh: John Doe"
                  disabled={isSubmitting}
                  {...register("namaLengkap")}
                />
                {errors.namaLengkap && (
                  <FieldError>{errors.namaLengkap.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="johndoe@univ.ac.id"
                  disabled={isSubmitting}
                  {...register("email")}
                />
                {errors.email && (
                  <FieldError>{errors.email.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••"
                  disabled={isSubmitting}
                  {...register("password")}
                />
                {errors.password && (
                  <FieldError>{errors.password.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.role}>
                <FieldLabel htmlFor="role">Role</FieldLabel>
                <Select
                  id="role"
                  disabled={isSubmitting}
                  {...register("role")}
                >
                  <option value="Penjamin Mutu">Penjamin Mutu</option>
                  <option value="Penyusun">Penyusun</option>
                  <option value="Pimpinan">Pimpinan</option>
                </Select>
                {errors.role && <FieldError>{errors.role.message}</FieldError>}
              </Field>

              {/* Conditional Study Program select dropdown */}
              {selectedRole === "Penyusun" && (
                <Field data-invalid={!!errors.studyProgramId}>
                  <FieldLabel htmlFor="studyProgramId">Program Studi</FieldLabel>
                  {studyPrograms.length === 0 ? (
                    <div className="text-sm text-destructive py-1.5 px-3 bg-destructive/10 border border-destructive/20 rounded-md">
                      Belum ada data Prodi. Silakan buat Prodi terlebih dahulu di menu Manajemen Prodi.
                    </div>
                  ) : (
                    <Select
                      id="studyProgramId"
                      disabled={isSubmitting}
                      {...register("studyProgramId")}
                    >
                      {studyPrograms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.studyProgramName}
                        </option>
                      ))}
                    </Select>
                  )}
                  {errors.studyProgramId && (
                    <FieldError>{errors.studyProgramId.message}</FieldError>
                  )}
                </Field>
              )}
            </FieldGroup>

            <div className="pt-4 border-t border-border flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard/users")}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || (selectedRole === "Penyusun" && studyPrograms.length === 0)}
              >
                {isSubmitting ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
