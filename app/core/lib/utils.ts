import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Membersihkan tujuan navigasi yang datang dari query string (`?returnTo=`).
 *
 * Hanya path internal yang diterima: nilai dari URL bisa dikarang siapa saja,
 * dan tanpa penyaringan ini sebuah tautan bisa memulangkan pengguna ke situs
 * lain seolah masih di dalam aplikasi. `//` ditolak karena peramban membacanya
 * sebagai alamat berskema-sama, bukan path.
 */
export function safeReturnTo(value: string | null, fallback: string): string {
  if (!value) return fallback
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback
}
