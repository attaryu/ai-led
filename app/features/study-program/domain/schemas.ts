import { z } from "zod";

export const createStudyProgramSchema = z.object({
  studyProgramName: z.string().min(1, "Nama prodi wajib diisi"),
});

export type CreateStudyProgramInput = z.infer<typeof createStudyProgramSchema>;

export interface StudyProgram {
  id: string;
  studyProgramName: string;
  createdAt: string;
}
