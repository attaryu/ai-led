import { z } from "zod";

export const userRoleEnum = z.enum(["Penjamin Mutu", "Penyusun", "Pimpinan"]);
export type UserRole = z.infer<typeof userRoleEnum>;

export const createUserSchema = z.object({
  namaLengkap: z.string().min(3, "Nama lengkap minimal 3 karakter"),
  email: z.string().min(1, "Email wajib diisi").email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  role: userRoleEnum,
  studyProgramId: z.string().optional().nullable(),
}).refine((data) => {
  if (data.role === "Penyusun" && (!data.studyProgramId || data.studyProgramId.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Prodi wajib dipilih jika role adalah Penyusun",
  path: ["studyProgramId"],
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export interface User {
  id: string;
  namaLengkap: string;
  email: string;
  role: UserRole;
  studyProgramId?: string | null;
  studyProgramName?: string | null;
  createdAt: string;
}
