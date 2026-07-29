# Dokumentasi Arsitektur Frontend

- **Framework Utama**: React Router v7 (Framework Mode)
- **Pola Arsitektur**: Feature-Sliced Clean Architecture

## Latar Belakang

Aplikasi ini memiliki tingkat kompleksitas yang tinggi, mencakup fitur-fitur berat seperti Server-Sent Events (SSE) untuk AI Chat, pengelolaan Rich Text Editor, serta manajemen state dan query data yang kompleks.

Untuk memastikan aplikasi tetap terukur (scalable), mudah di-maintain, dan performanya terjaga, mengadopsi gabungan antara Clean Architecture (pemisahan batas tanggung jawab) dan Feature-Based Structure (pengelompokan kode berdasarkan domain fitur bisnis).

---

## Tech Stack

Selain React Router sebagai fondasi utama aplikasi dan routing, arsitektur ini didukung oleh:

- **TanStack Query (React Query)**: Sebagai Server-State Management dan sinkronisasi data (caching, background fetching). Ditempatkan di layer Presentation.

- **Zustand**: Sebagai Client-State Management murni untuk interaksi UI (misal: toggle sidebar, status tema, state UI sementara).

- **Tiptap**: Headless Rich Text Editor untuk performa maksimal dan kustomisasi tinggi.

- **React Hook Form & Zod:** Kombinasi standar untuk pengelolaan _form_ dan validasi data (_schema-based validation_) yang menjamin _end-to-end type safety_.

---

## Struktur Direktori Utama

Struktur aplikasi memisahkan kode global (di bawah `app/`) dengan kode spesifik fitur (di bawah `app/features/`).

```
led-ai-frontend/
├── app/
│   ├── routes/                 # Thin Routing (Hanya mendefinisikan URL/Path)
│   ├── components/ui/          # Global Reusable Components (Shadcn UI, Button, dll)
│   ├── lib/                    # Global Utilities
│   └── features/               # Domain Bisnis Aplikasi (Inti Arsitektur)
│       ├── auth/
│       ├── document-editor/
│       ├── ...
```

---

## Anatomi Layer per Fitur

Setiap fitur di dalam folder `app/features/[nama-fitur]/` dibagi menjadi tiga layer utama (`presentation`, `domain`, `data`) untuk memastikan Separation of Concerns (pemisahan tanggung jawab).

---

### 1. Layer `presentation` (UI & Reaktivitas)

Bertanggung jawab atas semua hal yang berkaitan dengan React, tampilan, dan interaksi pengguna. Layer ini tidak tahu bagaimana data diambil, ia hanya tahu cara menampilkan data.

- `pages/`: Komponen halaman utama yang akan dipanggil oleh Thin Routing di `app/routes/`.

- `components/`: Komponen visual spesifik untuk fitur tersebut (misal: ChatBubble.tsx, EditorToolbar.tsx).

- `hooks/`: Tempat disimpannya integrasi TanStack Query (useQuery, useMutation) atau hooks UI lainnya.

- `stores/`: Slice dari Zustand jika fitur membutuhkan local state management.

> **Catatan Fleksibilitas Struktur:**
> Arsitektur sub-folder di layer presentasi ini bersifat adaptif dan tidak kaku (_not strictly dogmatic_). Sangat diizinkan untuk menambahkan direktori pendukung baru jika fitur berkembang menjadi lebih kompleks, misalnya:
>
> - **`contexts/`**: Jika fitur membutuhkan _React Context_ (misal: untuk mengelola konfigurasi tema spesifik fitur, _Dependency Injection_ khusus UI, atau form bertingkat yang berat).
>
> - **`utils/`**: Untuk fungsi bantuan (_helper functions_) murni yang hanya bertugas melayani UI dan tidak ada hubungannya dengan aturan bisnis (misal: memformat objek tanggal menjadi _string_ tampilan "2 jam lalu", atau kalkulasi posisi elemen visual).

---

### 2. Layer `domain` (Business Rules)

Merupakan pusat kebenaran (_Single Source of Truth_) dari bentuk data dan aturan validasi. Tidak bergantung pada React maupun komponen UI.

- **`entities/`**: Tempat mendefinisikan skema validasi menggunakan **Zod** (misal: `auth.schema.ts`). Tipe data TypeScript tidak ditulis manual menggunakan `interface`, melainkan di- _infer_ otomatis dari skema Zod (menggunakan `z.infer`). Ini menjadi acuan bentuk data mutlak bagi layer `presentation` (UI form) maupun `data` (Repository API).

**Catatan Keputusan:** Layer `models` (DTO) dilewati/dihapus untuk menghindari duplikasi (_boilerplate_), karena pengembangan _frontend_ dan _backend_ dikendalikan oleh tim yang sama.

---

### 3. Layer `data` (Infrastruktur & Jaringan)

Bertanggung jawab untuk berkomunikasi dengan dunia luar (API, WebSockets, SSE, atau Local Storage). Tidak ada elemen React (seperti Hooks) di layer ini.

- `sources/remote/`: Konfigurasi koneksi jaringan (misal: Axios, Fetch API, implementasi EventSource untuk SSE).

- `sources/local/`: Koneksi ke penyimpanan lokal seperti IndexedDB, localStorage, atau sessionStorage.

- `repositories/`: Berisi fungsi-fungsi murni (pure functions) asinkron yang mengatur alur pengambilan data dari sources dan mengembalikannya dalam bentuk entities yang siap dikonsumsi oleh layer presentation.

## Keputusan Arsitektural Utama (Key Decisions)

1. **Pola Thin Routing**:
   Folder `app/routes/` hanya bertugas mendaftarkan URL path dan menangani fungsi spesifik framework (`loader/action`). Komponen UI dirender dengan memanggil `<Page/>` dari `features/.../presentation/pages/`.

2. **Reposisi TanStack Query**:
   TanStack Query diposisikan murni sebagai jembatan UI / State Adapter di dalam layer presentation, bukan sebagai alat fetching utama. Pengambilan data murni tetap dilakukan oleh Repository di layer data.

3. **Strategi Validasi Data (Zod + React Hook Form):**
   Aturan validasi form (seperti _required_, batas karakter, format email) dianggap sebagai aturan bisnis (_Business Rules_), sehingga skemanya didefinisikan secara murni di layer `domain/entities/` menggunakan **Zod**. Layer UI (React Hook Form) di `presentation` murni hanya bertugas sebagai konsumen (_consumer_) dari skema tersebut melalui resolver. Hal ini mencegah bercampurnya aturan validasi dengan elemen TSX dan memungkinkan skema digunakan ulang (dibagikan) ke sisi backend jika dibutuhkan.

## Alur Komunikasi Data (Data Flow)

Alur komunikasi data bersifat satu arah (Unidirectional) dari luar ke dalam UI:

1. **Pengambilan (Data Layer)**: repositories memanggil API melalui `sources/remote`.
2. **Pembentukan (Domain Layer)**: Respons dari API dipastikan sesuai dengan bentuk entities.
3. **Manajemen State (Presentation Layer)**: Custom hook berbasis TanStack Query di folder `hooks/` memanggil repository, lalu menangani proses caching, loading, dan error.
4. **Render (Presentation Layer)**: Komponen UI di folder `pages/` atau `components/` mengkonsumsi data dari custom hook dan me-rendernya ke layar pengguna.
