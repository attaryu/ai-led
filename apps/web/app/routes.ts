import { type RouteConfig, route, index } from "@react-router/dev/routes";

/**
 * Empat lapis ruang kerja (docs/application_flow.md §3), masing-masing berdiri
 * sebagai root URL sendiri dengan layout dan navigasi yang berbeda total:
 *
 *   /dashboard                     → level TENANT (semua isinya lintas prodi)
 *   /study-programs/:id            → level PROGRAM_STUDI
 *   /led-projects/:id              → level DOKUMEN_LED
 *   /editor/:projectId/:chapterId  → level BAB_DOKUMEN (Editor Bab)
 *
 * Konteks prodi sengaja hidup di URL, bukan di session: Pimpinan/Penjamin Mutu
 * memilih prodi lewat navigasi (§5), sehingga tidak bisa diturunkan dari
 * `session.studyProgramId` yang hanya terisi untuk Penyusun.
 *
 * `/dashboard/study-programs/:programId/edit` (manajemen) dan
 * `/study-programs/:programId` (ruang kerja) tidak bertabrakan karena berada di
 * root yang berbeda.
 *
 * Catatan desain — Editor Bab menyimpang dari sketsa §3, yang menggambarkannya
 * sebagai `/led-projects/:projectId/chapters/:babId`, yaitu anak lapis 3. Di
 * sini ia jadi root keempat dengan alasan yang sama seperti tiga lapis pertama
 * berdiri sendiri: tampilannya nol chrome, tiga kolom penuh layar, tanpa satu
 * pun bagian `AppShell` lapis 3 — sehingga bersarang hanya menyisakan induk yang
 * merender `<Outlet/>` telanjang plus sidebar yang harus disembunyikan sendiri.
 * Diagram §3 sudah ikut diperbarui; kalau salah satunya berubah lagi, keduanya
 * harus ikut.
 */
export default [
  // Landing page publik — satu-satunya halaman yang tidak mengandaikan pengguna
  // sudah masuk, sekaligus jalan masuk resmi ke `/login` dan `/register`.
  index("routes/home.tsx"),

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

  // LAPIS 3 — dokumen LED
  route("led-projects/:projectId", "routes/led-project-workspace-layout.tsx", [
    index("routes/led-project-workspace-home.tsx"),
  ]),

  // LAPIS 4 — Editor Bab. Dua rute sejajar, bukan induk + index(): keduanya
  // tidak berbagi chrome apa pun, jadi layout tanpa path hanya akan jadi berkas
  // berisi <Outlet/>. `/editor/:projectId` tanpa bab adalah jalan masuk resmi
  // yang dipakai sidebar lapis 3, dan langsung meneruskan ke bab default.
  route("editor/:projectId", "routes/editor-default-chapter.tsx"),
  route("editor/:projectId/:chapterId", "routes/editor-chapter.tsx"),
] satisfies RouteConfig;
