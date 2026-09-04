# AGENTS.md

Panduan untuk AI agent yang bekerja di repositori ini.

## Dokumen privat

Catatan yang tidak boleh ikut ter-commit ditaruh di `docs/` dengan **prefix titik**. Pola itu sudah diabaikan `.gitignore`, jadi berkas semacam ini aman ditulis tanpa mengotori working tree.

- **Selalu periksa dokumen privat lebih dulu** sebelum mulai mengerjakan sesuatu. Isinya sering memuat konteks yang tidak ada di kode maupun riwayat git — rencana kerja, keputusan yang sudah diambil beserta alasannya, dan pekerjaan yang sedang berjalan.
- **Jangan menghapus catatan lama** saat memperbaruinya. Jejak kenapa sebuah keputusan berubah lebih berharga daripada barisnya hilang.
- **Jangan menyalin isinya ke berkas yang ikut ter-commit**, termasuk ke AGENTS.md ini. Berkas apa saja yang ada di sana dan apa isinya sama-sama privat. Sebaliknya, rancangan sistem yang memang publik jangan ditulis di berkas bertitik.

## Commit

- **Conventional Commits, bahasa Inggris.** Format: `type(scope): description`.
- **Subject satu baris**, huruf kecil, kalimat imperatif, tanpa titik di akhir.
- **Body boleh ada, tapi singkat.** Beberapa baris atau daftar poin sudah cukup — sebut *apa* yang berubah, bukan cerita panjang tentang kenapa. Lewati saja kalau subject-nya sudah jelas.
- **Jangan memecah perubahan terlalu kecil.** Satu perubahan yang utuh secara logis = satu commit, walau menyentuh banyak berkas atau beberapa fitur sekaligus. Pecah hanya kalau memang dua pekerjaan yang berbeda.
- **Jangan menyertakan tautan session** di pesan commit. Trailer `Co-Authored-By` boleh tetap ada, tapi tautan ke sesi percakapan tidak — ia menunjuk ke tempat yang tidak bisa dibuka siapa pun selain pembuatnya, dan tidak berumur panjang.
- `type` yang dipakai di repo ini: `feat`, `fix`, `refactor`, `chore`, `docs`.

Contoh:

```
refactor(sidebar): redesign sidebar with tenant name and user profile

- move tenant switcher to the top, above the nav list
- show user avatar, name, and role at the bottom
- drop the standalone header that duplicated the tenant name
```
