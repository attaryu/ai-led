import { type RouteConfig, route, index } from "@react-router/dev/routes";

/**
 * Tiga lapis ruang kerja (docs/application_flow.md §3), masing-masing berdiri
 * sebagai root URL sendiri dengan layout dan navigasi yang berbeda total:
 *
 *   /dashboard              → level TENANT (semua isinya lintas prodi)
 *   /study-programs/:id     → level PROGRAM_STUDI
 *   /led-projects/:id       → level DOKUMEN_LED
 *
 * Konteks prodi sengaja hidup di URL, bukan di session: Pimpinan/Penjamin Mutu
 * memilih prodi lewat navigasi (§5), sehingga tidak bisa diturunkan dari
 * `session.studyProgramId` yang hanya terisi untuk Penyusun.
 *
 * `/dashboard/study-programs/:programId/edit` (manajemen) dan
 * `/study-programs/:programId` (ruang kerja) tidak bertabrakan karena berada di
 * root yang berbeda.
 */
export default [
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),

  // LAPIS 1 — tenant: Admin, Pimpinan, Penjamin Mutu
  route("dashboard", "routes/dashboard-layout.tsx", [
    index("routes/dashboard-home.tsx"),
    route("users", "routes/dashboard-users.tsx"),
    route("users/create", "routes/dashboard-users-create.tsx"),
    route("users/:userId/edit", "routes/dashboard-users-edit.tsx"),
    route("study-programs", "routes/dashboard-study-program.tsx"),
    route("study-programs/create", "routes/dashboard-study-program-create.tsx"),
    route("study-programs/:programId/edit", "routes/dashboard-study-program-edit.tsx"),
    route("led-projects", "routes/dashboard-led-project.tsx"),
    route("led-projects/create", "routes/dashboard-led-project-create.tsx"),
    route("led-projects/:projectId/edit", "routes/dashboard-led-project-edit.tsx"),
    route("evidence", "routes/dashboard-evidence.tsx"),
  ]),

  // LAPIS 2 — prodi: Pimpinan, Penjamin Mutu (lintas prodi), Penyusun (prodinya)
  route("study-programs/:programId", "routes/study-program-workspace-layout.tsx", [
    index("routes/study-program-workspace-home.tsx"),
    route("led-projects", "routes/study-program-workspace-led-projects.tsx"),
    route("evidence", "routes/study-program-workspace-evidence.tsx"),
  ]),

  // LAPIS 3 — dokumen LED; Editor Bab (Lapis 4) menyusul sebagai anak di sini
  route("led-projects/:projectId", "routes/led-project-workspace-layout.tsx", [
    index("routes/led-project-workspace-home.tsx"),
  ]),
] satisfies RouteConfig;
