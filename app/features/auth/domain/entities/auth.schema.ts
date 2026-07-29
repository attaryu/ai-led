import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().min(1, "Email wajib diisi").email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
})

export const registerSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter"),
  email: z.string().min(1, "Email wajib diisi").email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  organizationName: z.string().min(1, "Nama organisasi wajib diisi"),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
