"""Static catalog of standard Indonesian higher-ed accreditation document
types.

Ported verbatim from origin/led-wiriting(dimas) 332ab2f
(apps/ai/generation-prototype/api/lib/prompts.py::DOCUMENT_CATALOG).
REKOMENDASI_DOKUMEN (worker.py) used to find candidate documents by
semantic search over whatever a tenant had already uploaded
(vectorstore/document_registry_store.py) -- a brand-new tenant with
nothing uploaded yet got zero candidates and a useless recommendation.
Dimas's replacement: have the LLM pick a document TYPE from this closed,
canonical vocabulary instead -- works from day one regardless of what has
been uploaded, and the closed-set + exact no/label matching enforced by
parse_items() below prevents the model from inventing document names.

tier:
  L1 regulasi dan dasar kelembagaan
  L2 penetapan, isi atau substansi
  L3 tata cara, mekanisme, pedoman, panduan
  L4 perencanaan turunan
  L5 bukti pelaksanaan

parent_id menunjuk dokumen yang menjadi induk turunan, baik turunan tingkat
(institusi -> program studi) maupun turunan horizon (jangka panjang ->
tahunan). id/parent_id/aliases tidak dipakai oleh apps/ai saat ini (tidak
ada fitur resolve-by-alias di sini, beda dari generation-prototype) --
dipertahankan di data supaya tetap sinkron kalau diporting ulang nanti.
"""

from __future__ import annotations

import re as _re

DOCUMENT_CATALOG = [

    # ---------------------------------------------------------------- L1
    {
        "id": "statuta_institusi",
        "label": "Permendikbud tentang Statuta Institusi",
        "tier": "L1",
        "scope": "institusi",
        "purpose": "dasar regulasi dan statuta kelembagaan institusi",
        "aliases": [
            "Permendikbud tentang Status Institusi",
            "Statuta",
            "Statuta Institusi",
        ],
    },
    {
        "id": "sk_pendirian_institusi",
        "label": "SK Pendirian Institusi",
        "tier": "L1",
        "scope": "institusi",
        "purpose": "dasar legal pendirian institusi",
        "aliases": [],
    },

    # ---------------------------------------------------------------- L2
    {
        "id": "vm_institusi_penetapan",
        "label": "Surat penetapan visi misi institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan rumusan visi dan misi institusi",
        "aliases": [
            "Keputusan Direktur tentang Penetapan Visi dan Misi Institusi",
            "Surat Penetapan Visi dan Misi Institusi",
        ],
    },
    {
        "id": "vm_prodi_penetapan",
        "label": "Surat penetapan visi misi program studi",
        "tier": "L2",
        "scope": "program_studi",
        "parent_id": "vm_institusi_penetapan",
        "purpose": "penetapan rumusan visi keilmuan dan misi program studi",
        "aliases": [
            "Keputusan Direktur tentang Penetapan Visi Keilmuan dan Misi Program Studi",
            "Surat Penetapan Visi dan Misi Program Studi",
            "Visi Keilmuan Program Studi",
        ],
    },
    {
        "id": "struktur_organisasi_institusi",
        "label": "Peraturan Direktur/Rektor Tentang Struktur Organisasi Di Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "struktur organisasi dan hubungan kelembagaan institusi",
        "aliases": [],
    },
    {
        "id": "struktur_upm",
        "label": "Keputusan Direktur tentang Struktur Organisasi Unit Penjaminan Mutu Institusi",
        "tier": "L2",
        "scope": "institusi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "penetapan struktur organisasi unit penjaminan mutu",
        "aliases": [
            "Struktur Tentang Struktur Organisasi Unit Penjaminan Mutu institusi",
        ],
    },
    {
        "id": "tupoksi_pimpinan",
        "label": "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Direktur & Wakil Direktur",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "tugas dan fungsi pimpinan institusi",
        "aliases": [],
    },
    {
        "id": "tupoksi_unit_penunjang",
        "label": "Keputusan Direktur/Rektor Tentang Tugas dan Fungsi Unit Penunjang di Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "tugas dan fungsi unit penunjang institusi",
        "aliases": [
            "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Unit Penunjang",
        ],
    },
    {
        "id": "tupoksi_pengawas_internal",
        "label": "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Pengawas Internal",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "fungsi, tugas, dan wewenang pengawas internal",
        "aliases": [],
    },
    {
        "id": "tupoksi_unit_prodi",
        "label": "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "fungsi, tugas, dan wewenang program studi sebagai unit, bukan sebagai jabatan",
        "aliases": [],
    },
    {
        "id": "tupoksi_pejabat_prodi",
        "label": "Keputusan Direktur/Rektor tentang Fungsi, Tugas, dan Wewenang Kepala Departemen dan Ketua Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "parent_id": "struktur_organisasi_institusi",
        "purpose": "fungsi, tugas, dan wewenang pemangku jabatan kepala departemen dan ketua program studi",
        "aliases": [],
    },
    {
        "id": "tupoksi_jabatan_umum",
        "label": "Surat Keterangan atau Keputusan Tupoksi Jabatan",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "bukti tugas pokok dan fungsi suatu jabatan",
        "aliases": [],
    },
    {
        "id": "penunjukan_prodi",
        "label": "Keputusan Direktur/Rektor tentang Penunjukan Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "purpose": "penetapan atau pengakuan keberadaan program studi",
        "aliases": [
            "Keputusan Direktur/Rektor tentang Penunjukkan program studi",
        ],
    },
    {
        "id": "penetapan_tim_led",
        "label": "Penetapan Tim Penyusun LED atau akreditasi",
        "tier": "L2",
        "scope": "akreditasi_program_studi",
        "purpose": "penetapan tim penyusun, susunan keanggotaan, pembagian tugas, dan jadwal kerja dalam proses akreditasi",
        "aliases": [
            "SK Tim Penyusun LED",
            "SK Tim Akreditasi",
        ],
    },
    {
        "id": "penetapan_pusat_ppm",
        "label": "Surat Penetapan Pusat Penelitian dan Pengabdian kepada Masyarakat",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan kelembagaan pusat penelitian dan pengabdian kepada masyarakat",
        "aliases": [
            "Surat Penetapan Pusat Penelitian dan Pengabdian Masyarakat",
        ],
    },
    {
        "id": "penetapan_research_group",
        "label": "Penetapan Research Group",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan kelompok penelitian",
        "aliases": [],
    },
    {
        "id": "penetapan_research_center",
        "label": "Penetapan Research Center",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan pusat penelitian",
        "aliases": [],
    },
    {
        "id": "sk_industrial_advisory_board",
        "label": "SK Industrial Advisory Board",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan dan keberadaan Industrial Advisory Board",
        "aliases": [],
    },
    {
        "id": "penetapan_satuan_ppks",
        "label": "Keputusan Direktur/Rektor tentang Satuan Pencegahan dan Penanganan Kekerasan Seksual di Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan satuan pencegahan dan penanganan kekerasan seksual",
        "aliases": [],
    },
    {
        "id": "penetapan_tim_k3",
        "label": "Keputusan Direktur/Rektor tentang Tim Keamanan dan Keselamatan Kerja Lingkungan Institusi",
        "tier": "L2",
        "scope": "institusi",
        "purpose": "penetapan tim keamanan, keselamatan kerja, dan lingkungan",
        "aliases": [],
    },
    {
        "id": "kurikulum_prodi",
        "label": "Dokumen Kurikulum Program Studi",
        "tier": "L2",
        "scope": "program_studi",
        "purpose": "rumusan dan struktur kurikulum program studi",
        "aliases": [
            "Dokumen Kurikulum Program Studi, Evaluasi Pembelajaran",
        ],
    },

    # ---------------------------------------------------------------- L3
    {
        "id": "tata_cara_vm",
        "label": "Peraturan Direktur/Rektor tentang Tata Cara Penyusunan, Pemutakhiran, dan Penggunaan Visi dan Misi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "mekanisme penyusunan, pemutakhiran, dan penggunaan visi dan misi",
        "aliases": [
            "Peraturan Direktur/Rektor tentang Mekanisme Penyusunan, Pemutakhiran, dan Penggunaan Visi dan Misi",
        ],
    },
    {
        "id": "spmi",
        "label": "Peraturan Direktur/Rektor Tentang Sistem Penjaminan Mutu Internal",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan dan penyelenggaraan sistem penjaminan mutu internal",
        "aliases": [
            "Peraturan Direktur Tentang Sistem Penjaminan Mutu Internal Institusi",
            "SPMI",
        ],
    },
    {
        "id": "sistem_akuntansi",
        "label": "Peraturan Direktur/Rektor tentang Kebijakan dan Sistem Akuntansi Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan dan sistem akuntansi institusi",
        "aliases": [],
    },
    {
        "id": "pengelolaan_sumber_daya",
        "label": "Peraturan Direktur tentang Pengelolaan Sumber Daya di Lingkungan Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengelolaan sumber daya institusi",
        "aliases": [],
    },
    {
        "id": "penyelenggaraan_penelitian",
        "label": "Peraturan Penyelenggaraan Penelitian",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan penyelenggaraan penelitian",
        "aliases": [],
    },
    {
        "id": "penyelenggaraan_pkm",
        "label": "Peraturan Direktur/Rektor Tentang Penyelenggaraan Pengabdian Kepada Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan penyelenggaraan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "pedoman_kegiatan_anggaran",
        "label": "Peraturan Direktur/Rektor tentang Pedoman Implementasi Kegiatan dan Anggaran",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pelaksanaan kegiatan dan pengelolaan anggaran",
        "aliases": [],
    },
    {
        "id": "suasana_akademik",
        "label": "Peraturan Direktur/Rektor tentang Pengembangan Suasana Akademik",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengembangan suasana akademik",
        "aliases": [
            "Peraturan Direktur/Rektor Tentang pengembangan Suasana Akademik-Stamp",
        ],
    },
    {
        "id": "pengelolaan_sarpras",
        "label": "Peraturan Direktur/Rektor tentang Pengelolaan Sarana Prasarana Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengelolaan sarana dan prasarana",
        "aliases": [
            "Peraturan direktur/rektor tentang pengelolaan sarana dan prasarana",
        ],
    },
    {
        "id": "distribusi_dana_kerjasama",
        "label": "Peraturan Direktur/Rektor tentang Distribusi Dana Kontribusi Institusi Hasil Kerjasama Pendidikan, Penelitian, Layanan Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pengaturan distribusi dana hasil kerja sama pendidikan, penelitian, dan layanan masyarakat",
        "aliases": [],
    },
    {
        "id": "tik_institusi",
        "label": "Peraturan Direktur/Rektor tentang Teknologi Informasi dan Komunikasi Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pengelolaan teknologi informasi dan komunikasi",
        "aliases": [],
    },
    {
        "id": "pengelolaan_pendidikan",
        "label": "Peraturan Direktur/Rektor tentang Pengelolaan Pendidikan",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan dan mekanisme pengelolaan pendidikan",
        "aliases": [],
    },
    {
        "id": "peraturan_akademik",
        "label": "Peraturan Direktur/Rektor tentang Peraturan Akademik",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "ketentuan dan kebijakan akademik institusi",
        "aliases": [],
    },
    {
        "id": "peraturan_akademik_pjj",
        "label": "Peraturan Akademik PJJ",
        "tier": "L3",
        "scope": "program_studi",
        "parent_id": "peraturan_akademik",
        "purpose": "ketentuan akademik penyelenggaraan pendidikan jarak jauh",
        "aliases": [],
    },
    {
        "id": "dokumen_mutu_ppm",
        "label": "Dokumen Mutu Pusat Penelitian dan Pengabdian kepada Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "dokumen mutu unit penelitian dan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "manual_mutu_ppm",
        "label": "Dokumen Manual Mutu Pusat Penelitian dan Pengabdian Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "manual pelaksanaan sistem mutu unit penelitian dan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "juknis_seleksi_maba",
        "label": "Keputusan Direktur/Rektor Tentang Penetapan Petunjuk Teknis Pelaksanaan Seleksi Mahasiswa baru Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "penetapan petunjuk teknis seleksi mahasiswa baru",
        "aliases": [],
    },
    {
        "id": "panduan_penyusunan_kurikulum",
        "label": "Panduan Mekanisme Penyusunan Kurikulum di Lingkungan Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "mekanisme dan panduan penyusunan kurikulum",
        "aliases": [
            "Panduan MEKANISME DAN PANDUAN PENYUSUNAN KURIKULUM di Lingkungan Institusi",
        ],
    },
    {
        "id": "pedoman_kurikulum",
        "label": "Pedoman Kurikulum",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pengembangan dan pengelolaan kurikulum",
        "aliases": [],
    },
    {
        "id": "pedoman_capstone",
        "label": "Pedoman Capstone Project PENS FIN",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pelaksanaan Capstone Project",
        "aliases": [],
    },
    {
        "id": "pedoman_kerjasama",
        "label": "Pedoman Pengelolaan Kerjasama",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman pengelolaan kerja sama",
        "aliases": [],
    },
    {
        "id": "kebijakan_jejaring_kemitraan",
        "label": "Peraturan Direktur/Rektor Tentang Perencanaan Pengembangan Jejaring Dan Kemitraan",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan perencanaan pengembangan jejaring dan kemitraan",
        "aliases": [],
    },
    {
        "id": "panduan_pelaksanaan_ppm",
        "label": "Panduan Pelaksanaan Penelitian dan Pengabdian kepada Masyarakat",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "panduan pelaksanaan penelitian dan pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "kebijakan_ppks",
        "label": "Peraturan Direktur/Rektor tentang Pencegahan dan Penanganan Kekerasan Seksual di Lingkungan Institusi",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "kebijakan pencegahan dan penanganan kekerasan seksual",
        "aliases": [],
    },
    {
        "id": "pedoman_smk3",
        "label": "Pedoman Sistem Manajemen Keselamatan dan Kesehatan Kerja Serta Pengelolaan Lingkungan",
        "tier": "L3",
        "scope": "institusi",
        "purpose": "pedoman keselamatan dan kesehatan kerja serta pengelolaan lingkungan",
        "aliases": [],
    },

    # ---------------------------------------------------------------- L4
    {
        "id": "rip_pengembangan",
        "label": "Keputusan Direktur/Rektor tentang Penetapan Rencana Induk Pengembangan (RIP)",
        "tier": "L4",
        "scope": "institusi",
        "purpose": "rencana pengembangan institusi horizon jangka panjang",
        "aliases": [
            "Rencana Induk Pengembangan (RIP)",
            "Rencana Induk Pengembangan",
            "RIP",
        ],
    },
    {
        "id": "renstra_institusi",
        "label": "Rencana Strategis (Renstra) Institusi",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "rip_pengembangan",
        "purpose": "rencana pengembangan strategis institusi horizon jangka menengah",
        "aliases": [
            "Renstra",
            "Renstra Institusi",
        ],
    },
    {
        "id": "rkt_institusi",
        "label": "Dokumen Rencana Kinerja Tahunan (RKT)",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "renstra_institusi",
        "purpose": "rencana kerja dan program kegiatan institusi horizon tahunan",
        "aliases": [
            "Rencana Kerja Tahunan (RKT)",
            "Rencana Kerja Tahunan",
            "RKT",
        ],
    },
    {
        "id": "renstra_pkm",
        "label": "Surat Direktur/Rektor tentang Penetapan Rencana Strategis Pengabdian Kepada Masyarakat",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "renstra_institusi",
        "purpose": "arah dan rencana strategis pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "renduk_penelitian",
        "label": "Rencana Induk Penelitian Institusi",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "rip_pengembangan",
        "purpose": "arah dan rencana pengembangan penelitian jangka panjang",
        "aliases": [
            "Rencana Induk Penelitian (RIP) Institusi",
            "RIP Penelitian",
        ],
    },
    {
        "id": "iku",
        "label": "Dokumen Indikator Kinerja Utama",
        "tier": "L4",
        "scope": "institusi",
        "parent_id": "renstra_institusi",
        "purpose": "indikator dan target pengukuran kinerja utama",
        "aliases": ["IKU"],
    },
    {
        "id": "program_kerja_spi",
        "label": "Program Kerja Pengawasan Tahunan Satuan Pengawas Internal",
        "tier": "L4",
        "scope": "institusi",
        "purpose": "rencana pengawasan internal tahunan",
        "aliases": [],
    },

    # ---------------------------------------------------------------- L5
    {
        "id": "laporan_pkm",
        "label": "Laporan Pengabdian kepada Masyarakat",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "laporan pelaksanaan pengabdian kepada masyarakat",
        "aliases": [
            "Laporan Penganbidan & Surat Penetapan Pusat Penelitian dan Pengabdian Masyarakat",
        ],
    },
    {
        "id": "laporan_review_keuangan",
        "label": "Laporan Hasil Review Laporan Keuangan",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "hasil review dan evaluasi laporan keuangan",
        "aliases": [],
    },
    {
        "id": "evaluasi_pembelajaran_prodi",
        "label": "Dokumen Evaluasi Pembelajaran Program Studi",
        "tier": "L5",
        "scope": "program_studi",
        "parent_id": "kurikulum_prodi",
        "purpose": "hasil evaluasi pelaksanaan pembelajaran program studi",
        "aliases": [
            "Dokumen Kurikulum Program Studi, Evaluasi Pembelajaran",
        ],
    },
    {
        "id": "rps_prodi",
        "label": "Rencana Pembelajaran Semester Program Studi",
        "tier": "L5",
        "scope": "program_studi",
        "parent_id": "kurikulum_prodi",
        "purpose": "rencana pelaksanaan pembelajaran setiap mata kuliah",
        "aliases": ["RPS"],
    },
    {
        "id": "modul_ajar",
        "label": "Dokumen Modul Ajar",
        "tier": "L5",
        "scope": "program_studi",
        "purpose": "bukti modul atau bahan ajar pembelajaran",
        "aliases": [],
    },
    {
        "id": "inventaris_tefa",
        "label": "Daftar Inventaris Teaching Factory",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "inventaris sarana dan fasilitas Teaching Factory",
        "aliases": [],
    },
    {
        "id": "rekap_kunjungan_industri",
        "label": "Rekap Kunjungan Industri",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "rekap kegiatan kunjungan industri",
        "aliases": [],
    },
    {
        "id": "rekap_prestasi",
        "label": "Rekap Prestasi Institusi",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "rekap prestasi institusi",
        "aliases": [],
    },
    {
        "id": "mou_pendidikan",
        "label": "Laporan, Nota, Mou Kerjasama Institusi di bidang Pendidikan",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "bukti kerja sama institusi di bidang pendidikan",
        "aliases": [],
    },
    {
        "id": "mou_penelitian",
        "label": "Laporan, Nota, Mou Kerjasama Institusi di bidang Penelitian",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "bukti kerja sama institusi di bidang penelitian",
        "aliases": [],
    },
    {
        "id": "mou_pkm",
        "label": "Laporan, Nota, Mou Pengabdian kepada Masyarakat (PKM)",
        "tier": "L5",
        "scope": "institusi",
        "purpose": "bukti kerja sama institusi di bidang pengabdian kepada masyarakat",
        "aliases": [],
    },
    {
        "id": "kolaborasi_dosen_industri",
        "label": "Dokumen dan laporan kolaborasi dosen industri",
        "tier": "L5",
        "scope": "program_studi",
        "purpose": "bukti kolaborasi dosen dengan industri",
        "aliases": [],
    },
    {
        "id": "ijazah_s3_dosen",
        "label": "Ijazah Doktoral (S3) Dosen",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti kualifikasi pendidikan doktor dosen",
        "aliases": ["Ijasah Doktoral (S3) Dosen"],
    },
    {
        "id": "jafung_guru_besar",
        "label": "Dokumen Jabatan Fungsional (Guru Besar)",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti jabatan fungsional profesor atau guru besar",
        "aliases": [],
    },
    {
        "id": "jafung_dosen",
        "label": "Dokumen Jabatan Fungsional",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti jabatan fungsional dosen",
        "aliases": [],
    },
    {
        "id": "sertifikat_keinsinyuran",
        "label": "Sertifikat Keinsinyuran",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti sertifikasi atau kompetensi keinsinyuran dosen",
        "aliases": ["Sertifikat Keisyinyuran"],
    },
    {
        "id": "sertifikat_kompetensi_dosen",
        "label": "Sertifikat Kompetensi",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti sertifikasi kompetensi dosen",
        "aliases": [],
    },
    {
        "id": "sertifikat_serdos",
        "label": "Sertifikat Serdos",
        "tier": "L5",
        "scope": "dosen",
        "purpose": "bukti sertifikasi pendidik dosen",
        "aliases": [],
    },
    {
        "id": "lkps_3a2_integrasi_mk",
        "label": "Surat atau Dokumen Penetapan Daftar Mata Kuliah Hasil Integrasi Program Studi dan Bukti Sahih (Bukti dukung LKPS 3a2)",
        "tier": "L5",
        "scope": "program_studi",
        "purpose": "bukti penetapan dan pelaksanaan integrasi mata kuliah program studi",
        "aliases": ["LKPS 3a2"],
    },
    {
        "id": "lkps_3b_penelitian_dtps",
        "label": "Dokumen pendukung kegiatan penelitian DTPS (Bukti dukung LKPS 3b)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pendukung kegiatan penelitian dosen tetap program studi",
        "aliases": ["LKPS 3b"],
    },
    {
        "id": "lkps_3c_pkm_dtps",
        "label": "Dokumen pendukung pengabdian masyarakat DTPS (Bukti dukung LKPS 3C)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pendukung kegiatan pengabdian kepada masyarakat dosen tetap program studi",
        "aliases": ["LKPS 3c"],
    },
    {
        "id": "lkps_4b_sertifikasi_tendik",
        "label": "Dokumen Sertifikasi Tenaga Kependidikan (Bukti dukung LKPS 4B)",
        "tier": "L5",
        "scope": "tenaga_kependidikan",
        "purpose": "bukti sertifikasi tenaga kependidikan",
        "aliases": ["LKPS 4b"],
    },
    {
        "id": "lkps_4c_beban_kerja",
        "label": "Dokumen pendukung beban kerja dosen (Bukti dukung LKPS 4C)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pendukung beban kerja dosen",
        "aliases": ["LKPS 4c"],
    },
    {
        "id": "lkps_4e_pagelaran_dtps",
        "label": "Dokumen pendukung Pagelaran/Pameran/Presentasi/Publikasi Ilmiah DTPS (Bukti dukung LKPS 4e)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti kegiatan pagelaran, pameran, presentasi, atau publikasi ilmiah dosen tetap program studi",
        "aliases": ["LKPS 4e"],
    },
    {
        "id": "lkps_4f1_paten",
        "label": "Bukti dukung Luaran penelitian dan PkM berupa Paten, Paten Sederhana (Bukti dukung LKPS 4f-1)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa paten atau paten sederhana",
        "aliases": ["LKPS 4f-1"],
    },
    {
        "id": "lkps_4f2_hak_cipta",
        "label": "Bukti dukung penelitian dan PkM berupa Hak Cipta, Desain Produk Industri (Bukti dukung LKPS 4f-2)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa hak cipta atau desain produk industri",
        "aliases": ["LKPS 4f-2"],
    },
    {
        "id": "lkps_4f3_ttg",
        "label": "Bukti dukung penelitian dan PkM Bagian teknologi tepat guna (Bukti dukung LKPS 4f-3)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa teknologi tepat guna",
        "aliases": ["LKPS 4f-3"],
    },
    {
        "id": "lkps_4f4_buku_isbn",
        "label": "Bukti dukung penelitian dan PkM berupa buku ber ISBN (Bukti dukung LKPS 4f-4)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti luaran penelitian dan pengabdian kepada masyarakat berupa buku ber-ISBN",
        "aliases": ["LKPS 4f-4"],
    },
    {
        "id": "lkps_4g_produk_diadopsi_dtps",
        "label": "Dokumen Bukti dukung Produk/Jasa DTPS yang Diadopsi oleh Industri/Masyarakat (Bukti dukung LKPS 4g)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti produk atau jasa dosen tetap program studi yang diadopsi industri atau masyarakat",
        "aliases": ["LKPS 4g"],
    },
    {
        "id": "lkps_4h_karya_internasional",
        "label": "Dokumen Bukti dukung Karya ilmiah DTPS di jurnal internasional bereputasi atau publikasi dalam prosiding internasional ber-ISSN/ISBN terindeks Scopus / IEEE Explore / SPIE atau paten dalam 3 tahun terakhir (Bukti dukung LKPS 4h)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti karya ilmiah internasional bereputasi atau paten dosen tetap program studi",
        "aliases": ["LKPS 4h"],
    },
    {
        "id": "lkps_4i_sitasi",
        "label": "Dokumen Bukti dukung Karya Ilmiah DTPS yang Disitasi dalam 3 tahun terakhir (Bukti dukung LKPS 4i)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti sitasi karya ilmiah dosen tetap program studi",
        "aliases": ["LKPS 4i"],
    },
    {
        "id": "lkps_4j_rekognisi",
        "label": "Dokumen bukti pendukung Pengakuan/Rekognisi DTPS (Bukti dukung LKPS 4j)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pengakuan atau rekognisi dosen tetap program studi",
        "aliases": ["LKPS 4j"],
    },
    {
        "id": "lkps_6b_ipk",
        "label": "Dokumen bukti pendukung IPK Lulusan (Bukti dukung LKPS 6b)",
        "tier": "L5",
        "scope": "lulusan",
        "purpose": "bukti pendukung indeks prestasi kumulatif lulusan",
        "aliases": ["LKPS 6b"],
    },
    {
        "id": "lkps_6c_sertifikat_lulusan",
        "label": "Dokumen bukti pendukung Sertifikat kompetensi / microcredential (Bukti dukung LKPS 6c)",
        "tier": "L5",
        "scope": "lulusan",
        "purpose": "bukti sertifikat kompetensi atau microcredential lulusan",
        "aliases": ["LKPS 6c"],
    },
    {
        "id": "lkps_6d_masa_studi",
        "label": "Dokumen bukti pendukung masa studi lulusan (Bukti dukung LKPS 6d)",
        "tier": "L5",
        "scope": "lulusan",
        "purpose": "bukti pendukung masa studi lulusan",
        "aliases": ["LKPS 6d"],
    },
    {
        "id": "lkps_6e1_publikasi_mhs",
        "label": "Dokumen bukti pendukung Publikasi Ilmiah Mahasiswa (Bukti dukung LKPS 6e1)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti publikasi ilmiah mahasiswa",
        "aliases": ["LKPS 6e1"],
    },
    {
        "id": "lkps_6e2_pagelaran_mhs",
        "label": "Dokumen bukti pendukung Pagelaran/Pameran/Presentasi/Publikasi Ilmiah Mahasiswa (Bukti dukung LKPS 6e2)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti pagelaran, pameran, presentasi, atau publikasi ilmiah mahasiswa",
        "aliases": ["LKPS 6e2"],
    },
    {
        "id": "lkps_6e3_luaran_mhs",
        "label": "Dokumen bukti pendukung Luaran Penelitian/PkM yang Dihasilkan Mahasiswa (Bukti dukung LKPS 6e3)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti luaran penelitian atau pengabdian kepada masyarakat yang dihasilkan mahasiswa",
        "aliases": ["LKPS 6e3"],
    },
    {
        "id": "lkps_6e4_produk_mhs",
        "label": "Dokumen bukti pendukung produk/Jasa yang Dihasilkan Mahasiswa yang Diadopsi oleh Industri/Masyarakat (Bukti dukung LKPS 6e4)",
        "tier": "L5",
        "scope": "mahasiswa",
        "purpose": "bukti produk atau jasa mahasiswa yang diadopsi industri atau masyarakat",
        "aliases": ["LKPS 6e4"],
    },
    {
        "id": "lkps_6h_penelitian_dtps_mhs",
        "label": "Dokumen bukti pendukung Penelitian DTPS yang Melibatkan Mahasiswa (Bukti dukung LKPS 6h)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti penelitian dosen tetap program studi yang melibatkan mahasiswa",
        "aliases": ["LKPS 6h"],
    },
    {
        "id": "lkps_6i_pkm_dtps_mhs",
        "label": "Dokumen bukti pendukung PkM DTPS yang Melibatkan Mahasiswa (Bukti dukung LKPS 6i)",
        "tier": "L5",
        "scope": "dosen_tetap_program_studi",
        "purpose": "bukti pengabdian kepada masyarakat dosen tetap program studi yang melibatkan mahasiswa",
        "aliases": ["LKPS 6i"],
    },
]


def catalog_for_prompt() -> list[dict]:
    """Numbered, LLM-facing view of the catalog.

    id/parent_id/aliases are deliberately withheld -- only no/label/tier/
    scope/purpose are sent. If the model saw a snake_case id, it would
    sometimes echo something id-shaped into the label field instead of the
    real label, silently breaking the closed-set contract. Numbering it
    instead means a model that gets no/label out of sync is caught by
    parse_items(), not silently accepted.
    """
    return [
        {
            "no": i,
            "label": d["label"],
            "tier": d["tier"],
            "scope": d["scope"],
            "purpose": d["purpose"],
        }
        for i, d in enumerate(DOCUMENT_CATALOG, start=1)
    ]


def parse_items(items: list) -> tuple[list[dict], list[dict]]:
    """Validate the LLM's picks against the closed set.

    Each item's (no, label) must agree with the exact catalog entry at that
    number -- case/whitespace differences are tolerated (models sometimes
    "correct" capitalization without meaning to change the document), but
    a paraphrase or wrong number is dropped rather than guessed at.
    Returns (accepted, rejected); accepted entries are the real catalog
    entries (plus the validated `no` and the model's `reason`), not the
    model's raw label text.
    """
    accepted: list[dict] = []
    rejected: list[dict] = []
    for it in items or []:
        if not isinstance(it, dict):
            rejected.append({"raw": it, "why": "bukan object"})
            continue
        no, label = it.get("no"), (it.get("label") or "").strip()
        if not isinstance(no, int) or not 1 <= no <= len(DOCUMENT_CATALOG):
            rejected.append({"raw": it, "why": f"nomor di luar katalog: {no!r}"})
            continue
        entry = DOCUMENT_CATALOG[no - 1]
        if _re.sub(r"\s+", " ", label).casefold() != _re.sub(r"\s+", " ", entry["label"]).casefold():
            rejected.append({
                "raw": it,
                "why": "nomor dan label tidak cocok",
                "label_pada_nomor": entry["label"],
            })
            continue
        accepted.append({**entry, "no": no, "reason": it.get("reason", "")})
    return accepted, rejected
