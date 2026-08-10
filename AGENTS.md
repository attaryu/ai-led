# AGENTS.md

Panduan untuk AI agent yang bekerja di repositori ini.

## Commit

- **Conventional Commits, bahasa Inggris.** Format: `type(scope): description`.
- **Subject satu baris**, huruf kecil, kalimat imperatif, tanpa titik di akhir.
- **Body boleh ada, tapi singkat.** Beberapa baris atau daftar poin sudah cukup — sebut *apa* yang berubah, bukan cerita panjang tentang kenapa. Lewati saja kalau subject-nya sudah jelas.
- **Jangan memecah perubahan terlalu kecil.** Satu perubahan yang utuh secara logis = satu commit, walau menyentuh banyak berkas atau beberapa fitur sekaligus. Pecah hanya kalau memang dua pekerjaan yang berbeda.
- `type` yang dipakai di repo ini: `feat`, `fix`, `refactor`, `chore`, `docs`.

Contoh:

```
refactor(sidebar): redesign sidebar with tenant name and user profile

- move tenant switcher to the top, above the nav list
- show user avatar, name, and role at the bottom
- drop the standalone header that duplicated the tenant name
```
