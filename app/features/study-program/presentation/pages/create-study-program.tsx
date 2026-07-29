import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router"
import { ArrowLeftIcon } from "@phosphor-icons/react"

import { Button } from "~/core/components/ui/button"
import { Input } from "~/core/components/ui/input"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/core/components/ui/field"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/core/components/ui/card"
import {
  createStudyProgramSchema,
  type CreateStudyProgramInput,
  type StudyProgram,
} from "../../domain/schemas"

export function CreateStudyProgram() {
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateStudyProgramInput>({
    resolver: zodResolver(createStudyProgramSchema),
    defaultValues: {
      studyProgramName: "",
    },
  })

  const onSubmit = (data: CreateStudyProgramInput) => {
    const newProgram: StudyProgram = {
      id: Date.now().toString(),
      studyProgramName: data.studyProgramName,
      createdAt: new Date().toISOString(),
    }

    const storedPrograms = localStorage.getItem("study_program_data")
    let programsList: StudyProgram[] = []
    if (storedPrograms) {
      try {
        programsList = JSON.parse(storedPrograms)
      } catch (e) {
        console.error(e)
      }
    }

    programsList.push(newProgram)
    localStorage.setItem("study_program_data", JSON.stringify(programsList))
    navigate("/dashboard/study-programs")
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/dashboard/study-programs")}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">Tambah Program Studi Baru</h2>
          <p className="text-sm text-muted-foreground">Masukkan nama Program Studi baru.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Formulir Program Studi</CardTitle>
          <CardDescription>Masukkan nama Program Studi baru. Tekan simpan jika sudah selesai.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FieldGroup>
              <Field data-invalid={!!errors.studyProgramName}>
                <FieldLabel htmlFor="studyProgramName">Nama Program Studi</FieldLabel>
                <Input
                  id="studyProgramName"
                  placeholder="Contoh: Teknik Informatika"
                  disabled={isSubmitting}
                  {...register("studyProgramName")}
                />
                {errors.studyProgramName && (
                  <FieldError>{errors.studyProgramName.message}</FieldError>
                )}
              </Field>
            </FieldGroup>

            <div className="pt-4 border-t border-border flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard/study-programs")}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
