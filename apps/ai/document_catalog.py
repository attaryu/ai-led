"""Closed-set catalog of document types the LLM picks from for REKOMENDASI_DOKUMEN.

Verbatim copy of origin/led-wiriting(dimas) 140d8ae api/lib/prompts.py::DOCUMENT_CATALOG -- 116 plain
label strings (each one folds in its own scope description). Kept identical on purpose, typos included
("terrmasuk"): edit it by re-syncing with Dimas, not by hand.

The LLM is shown `catalog_for_prompt()` (numbered) and must copy number and label back; parse_items()
drops anything that disagrees, so the model cannot invent a document name.
"""

from __future__ import annotations

import re as _re

DOCUMENT_CATALOG: list[str] = [
   "Keputusan Direktur/Rektor tentang Penetapan Tim Penyusun Dokumen Akreditasi, termasuk susunan tim penyusunan dokumen akreditasi.",
    "Keputusan Direktur/Rektor tentang Struktur Organisasi Unit Penjaminan Mutu, termasuk struktur unit, pembagian tugas dan tanggung jawab, fungsi audit dan evaluasi mutu, pengembangan sistem, serta koordinasi.",
    "Peraturan Direktur/Rektor tentang Tata Cara Penyusunan, Penetapan, Pemutakhiran, dan Implementasi Visi dan Misi Institusi, termasuk tahapan, pihak terlibat, evaluasi, dan tindak lanjut.",
    "Rencana Strategis (Renstra) Institusi, termasuk visi, misi, tujuan, sasaran, strategi, kebijakan, program kerja, indikator kinerja, target, dan prioritas pengembangan institusi.",
    "Surat penetapan visi misi institusi, termasuk rumusan visi dan misi, dasar penetapan, pihak yang menetapkan, serta ketentuan pemberlakuannya.",
    "Surat penerapan visi misi program studi, termasuk rumusan visi dan misi, dasar penerapan, pihak yang menetapkan, serta ketentuan pemberlakuannya.",
    "Rencana Induk Penelitian (RIP) Institusi, termasuk arah, prioritas, roadmap, sasaran strategis, program penelitian, indikator kinerja, target, serta pengembangan penelitian institusi.",
    "Rencana Strategis Pengabdian kepada Masyarakat (Renstra PkM), termasuk tujuan, sasaran, strategi, prioritas program, indikator kinerja, target, serta arah pengembangan kegiatan PkM selama lima tahun.",
    "Penetapan Research Center, termasuk pusat riset yang ditetapkan, struktur pengelola, ketua, anggota, tugas, fungsi, kewenangan, kegiatan, serta mekanisme pelaporan penelitian.",
    "Peraturan Menteri Pendidikan tentang Statuta Institusi, termasuk dasar penyelenggaraan, organisasi, tata kelola, pendidikan, pengelolaan sumber daya, serta ketentuan operasional institusi.",
    "Surat Keputusan Menteri Pendidikan tentang Pendirian dan Penyelenggaraan Institusi, termasuk dasar pendirian, status kelembagaan, bentuk penyelenggaraan, kewenangan, serta ketentuan operasional institusi.",
    "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Program Studi, termasuk pengelolaan akademik, pendidikan, sumber daya, penjaminan mutu, pelaporan, dan pelaksanaan kegiatan program studi.",
    "Keputusan Direktur/Rektor tentang Fungsi, Tugas, dan Wewenang Kepala Departemen dan Ketua Program Studi, termasuk pengelolaan pendidikan, sumber daya, penjaminan mutu, akreditasi, dan koordinasi kegiatan.",
    "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Unit Penunjang di Lingkungan Institusi, termasuk tugas, tanggung jawab, kewenangan, koordinasi, layanan pendukung, pelaksanaan kegiatan, dan pelaporan.",
    "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Unit Penunjang, termasuk pembagian tugas, tanggung jawab, koordinasi, pengelolaan kegiatan, evaluasi, layanan, dan pelaporan unit pendukung institusi.",
    "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Direktur & Wakil Direktur, termasuk pembagian kewenangan, tanggung jawab, bidang tugas, koordinasi, pengambilan keputusan, dan pengelolaan institusi.",
    "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Pengawas Internal, termasuk audit internal, pengawasan risiko, evaluasi kinerja, tindak lanjut pemeriksaan, koordinasi, dan pelaporan hasil audit.",
    "Peraturan Direktur/Rektor tentang Distribusi Dana Kontribusi Institusi Hasil Kerjasama Pendidikan, Penelitian, Layanan Masyarakat, termasuk alokasi, penggunaan, pencairan, pertanggungjawaban, dan pengendalian dana kerja sama.",
    "Peraturan Direktur/Rektor tentang Teknologi Informasi, aplikasi, data, layanan TIK, keamanan informasi, pengembangan, pemanfaatan, dan pengawasan.",
    "Peraturan Direktur/Rektor tentang Pengelolaan Pendidikan, termasuk perencanaan, penerimaan mahasiswa, kurikulum, pembelajaran, penilaian, kelulusan, administrasi akademik, sumber daya, dan penjaminan mutu pendidikan.",
    "Pedoman Pengelolaan Kerjasama, termasuk kriteria mitra, bentuk kerja sama, mekanisme pengajuan, pengesahan, pelaksanaan, monitoring, evaluasi, pengembangan, perpanjangan, dan penghentian kerja sama.",
    "Peraturan Direktur/Rektor Tentang Perencanaan Pengembangan Jejaring Kemitraan, termasuk pemetaan mitra, sasaran, bentuk kemitraan, perencanaan, pelaksanaan, monitoring, evaluasi, dan pengembangan.",
    "Dokumen Pendukung Kerjasama di bidang Pendidikan, termasuk mitra, bentuk kerja sama, kegiatan, tujuan, pelaksanaan, hasil, evaluasi, dan bukti implementasi kerja sama pendidikan.",
    "Dokumen Pendukung Kerjasama di bidang Penelitian, termasuk mitra, bentuk kolaborasi, kegiatan penelitian, tujuan, hasil, evaluasi, dan bukti pelaksanaan kerja sama penelitian.",
    "Dokumen Pendukung Kerjasama di bidang Pengabdian kepada Masyarakat (PKM), termasuk mitra, bentuk kerja sama, kegiatan PkM, tujuan, pelaksanaan, hasil, evaluasi, dan bukti implementasi.",
    "DOkumen Rencana Kinerja Tahunan (RKT), termasuk sasaran kinerja, program kerja, kegiatan, indikator capaian, target tahunan, kebutuhan anggaran, dan rencana pendanaan institusi.",
    "Surat Keterangan kerja sama industri terrmasuk fungsi, peran, kewenangan, serta keterlibatan dalam memberikan masukan terhadap pendidikan, penelitian, PkM, dan hubungan industri.",
    "Laporan Hasil Review Laporan Keuangan, termasuk hasil pemeriksaan, temuan, kesesuaian laporan, rekomendasi, pengendalian keuangan, serta tindak lanjut perbaikan pengelolaan keuangan.",
    "Peraturan Direktur/Rektor tentang Pengelolaan Pendidikan, termasuk perencanaan, penerimaan mahasiswa, kurikulum, pembelajaran, penilaian, kelulusan, sumber daya, administrasi akademik, dan penjaminan mutu pendidikan.",
    "Pedoman Kurikulum, termasuk profil lulusan, capaian pembelajaran, bahan kajian, mata kuliah, struktur kurikulum, proses pembelajaran, penilaian, evaluasi, dan pemutakhiran kurikulum.",
    "Peraturan Akademik Program Studi, termasuk kurikulum, pembelajaran, registrasi, beban studi, penilaian, ujian, kelulusan, hak dan kewajiban mahasiswa, tata tertib, serta sanksi akademik.",
    "Peraturan Direktur/Rektor tentang Peraturan Akademik, termasuk kurikulum, pembelajaran, registrasi, beban studi, penilaian, ujian, kelulusan, hak, kewajiban, serta ketentuan akademik mahasiswa.",
    "Dokumen Kurikulum Program Studi, Evaluasi Pembelajaran, termasuk struktur kurikulum, mata kuliah, capaian pembelajaran, pelaksanaan pembelajaran, penilaian, hasil evaluasi, dan tindak lanjut perbaikan.",
    "Rencana Pembelajaran Semester Program Studi, termasuk capaian pembelajaran, materi, metode, bentuk pembelajaran, penugasan, penilaian, sumber belajar, dan jadwal kegiatan setiap pertemuan.",
    "Dokumen Modul Ajar, termasuk capaian pembelajaran, materi, metode, kegiatan pembelajaran, sumber belajar, penugasan, evaluasi, dan referensi yang digunakan dalam pembelajaran.",
    "Peraturan Direktur/Rektor tentang Pengembangan Suasana Akademik, termasuk kebebasan akademik, interaksi sivitas akademika, kegiatan ilmiah, fasilitas akademik, budaya akademik, dan evaluasi suasana akademik.",
    "Dokumen dan laoran kolaborasi dosen industri, termasuk mitra industri, bentuk kolaborasi, kegiatan, peran dosen, hasil kerja sama, manfaat, serta bukti pelaksanaan kolaborasi.",
    "Dokumen Mutu Pusat Penelitian dan Pengabdian kepada Masyarakat, termasuk sasaran mutu, tata kelola, standar layanan, prosedur, manajemen risiko, serta pengelolaan penelitian dan PkM.",
    "Dokumen Manual Mutu Pusat Penelitian dan Pengabdian Masyarakat, termasuk struktur, tugas, standar layanan, prosedur penelitian dan PkM, sasaran mutu, pengendalian dokumen, dan rekaman.",
    "Keputusan Direktur/Rektor tentang Penetapan Research Center, termasuk pusat riset, struktur pengelola, ketua, anggota, fungsi, tugas, kewenangan, kegiatan, dan mekanisme pelaporan penelitian.",
    "Laporan Institusi tentang Pelaksanaan, Capaian, dan Evaluasi Kegiatan Pengabdian kepada Masyarakat, termasuk program, sasaran, pelaksanaan, capaian, kendala, evaluasi, hasil, dan tindak lanjut perbaikan.",
    "Peraturan Direktur/Rektor tentang Kebijakan, Tata Kelola, dan Penyelenggaraan Kegiatan Penelitian, termasuk perencanaan, pelaksanaan, pengelolaan, evaluasi, luaran, pelaporan, pendanaan, dan pengembangan penelitian.",
    "Keputusan Direktur/Rektor tentang Penetapan Rencana Strategis Pengabdian kepada Masyarakat, termasuk tujuan, sasaran, strategi, program, prioritas, indikator, target, dan arah pengembangan kegiatan PkM.",
    "Ijasah Dosen, termasuk bukti pendidikan doktor, perguruan tinggi, program studi, bidang keilmuan, identitas dosen, tahun kelulusan, dan kualifikasi akademik.",
    "Dokumen Jabatan Fungsional (Guru Besar), termasuk bukti penetapan, jenjang jabatan, bidang keahlian, identitas dosen, nomor keputusan, serta status jabatan fungsional.",
    "Dokumen Jabatan Fungsional, termasuk bukti penetapan, jenjang jabatan, bidang keahlian, identitas dosen, nomor keputusan, status, dan periode berlakunya.",
    "Kumpulan Bukti Sertifikat Keisyinyuran, termasuk sertifikat keinsinyuran, bidang keahlian, identitas pemegang, lembaga penerbit, nomor sertifikat, dan masa berlaku.",
    "Kumpulan Bukti Sertifikat Kompetensi, termasuk sertifikat kompetensi, bidang keahlian, pemegang sertifikat, lembaga penerbit, nomor sertifikat, dan masa berlaku.",
    "Kumpulan Bukti Sertifikat Serdos, termasuk sertifikat pendidik, identitas dosen, nomor sertifikat, bidang keahlian, lembaga penerbit, dan status sertifikasi.",
    "Peraturan Direktur/Rektor tentang Pengelolaan Sarana Prasarana Institusi, termasuk perencanaan, pengadaan, penggunaan, pemanfaatan, pemeliharaan, inventarisasi, penghapusan, pelaporan, monitoring, dan evaluasi fasilitas.",
    "Daftar Inventaris Teaching Factory, termasuk daftar peralatan, jumlah, spesifikasi, lokasi, kondisi, status kepemilikan, penggunaan, dan pemanfaatan fasilitas untuk kegiatan pendidikan.",
    "Keputusan Direktur/Rektor tentang Tim Keamanan dan Keselamatan Kerja Lingkungan Institusi, termasuk struktur tim, tugas, identifikasi risiko, prosedur keselamatan, pelatihan, inspeksi, dan pelaporan.",
    "Pedoman Sistem Manajemen Keselamatan dan Kesehatan Kerja Serta Pengelolaan Lingkungan, termasuk kebijakan K3L, identifikasi risiko, pengendalian, pelatihan, monitoring, audit, evaluasi, dan perbaikan berkelanjutan.",
    "Peraturan Direktur/Rektor tentang Pencegahan dan Penanganan Kekerasan Seksual di Lingkungan Institusi, termasuk pencegahan, pelaporan, pemeriksaan, perlindungan korban, penanganan pelaku, sanksi, pemulihan, dan evaluasi.",
    "Keputusan Direktur/Rektor tentang Penetapan Petunjuk Teknis Pelaksanaan Seleksi Mahasiswa baru Institusi, termasuk jalur seleksi, persyaratan, kriteria, mekanisme, tahapan, penilaian, penetapan kelulusan, dan penerimaan.",
    "Rekap Kunjungan Industri, termasuk kegiatan, waktu, tempat, mitra industri, peserta, tujuan, bentuk aktivitas, hasil kunjungan, dan dokumentasi pelaksanaan.",
    "Rekap Prestasi Institusi, termasuk daftar prestasi, bidang, tingkat pencapaian, waktu, pihak yang memperoleh prestasi, jenis penghargaan, dan bukti dokumentasi.",
    "Peraturan Direktur/Rektor Tentang Sistem Penjaminan Mutu Internal Institusi, termasuk kebijakan mutu, standar, struktur, siklus PPEPP, audit, evaluasi, pengendalian, dan tindak lanjut peningkatan mutu.",
    "Peraturan Direktur Tentang Sistem Penjaminan Mutu Internal Institusi, termasuk kebijakan, standar mutu, pelaksanaan PPEPP, evaluasi, audit mutu internal, pengendalian, peningkatan, dan tindak lanjut perbaikan.",
    "Keputusan Direktur/Rektor tentang Struktur organisasi Unit Penjaminan Mutu Institusi, termasuk struktur unit, tugas, tanggung jawab, fungsi audit, evaluasi mutu, pengembangan sistem, dan koordinasi.",
    "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Pengawas Internal, termasuk audit internal, evaluasi, pengawasan risiko, pemeriksaan, tindak lanjut, koordinasi, dan pelaporan hasil pengawasan.",
    "Program Kerja Pengawasan Tahunan Satuan Pengawas Internal, termasuk rencana pengawasan, ruang lingkup pemeriksaan, jadwal kegiatan, mekanisme pelaksanaan, pelaporan, anggaran, dan tindak lanjut hasil pengawasan.",
    "Dokumen Mutu Pusat Penelitian dan Pengabdian kepada Masyarakat, termasuk sasaran mutu, standar layanan, prosedur, tata kelola, pengendalian, evaluasi, dan peningkatan mutu kegiatan penelitian serta PkM.",
    "Dokumen Manual Mutu Pusat Penelitian dan Pengabdian Masyarakat, termasuk prosedur mutu, struktur pengelola, standar layanan, pengendalian dokumen, rekaman, evaluasi, dan peningkatan mutu penelitian serta PkM.",
        # C.2 Akuntabilitas
    "Dokumen bukti pendukung Kerjasama Pendidikan, termasuk surat penugasan, perjanjian kerja sama, mitra, tingkat, masa berlaku, dan bukti pelaksanaan kerja sama.",
    "Dokumen bukti pendukung Kerjasama Penelitian, termasuk surat penugasan, perjanjian kerja sama, mitra, tingkat, masa berlaku, dan bukti pelaksanaan kerja sama.",
    "Dokumen bukti pendukung Kerjasama Pengabdian kepada Masyarakat, termasuk surat penugasan, perjanjian kerja sama, mitra, tingkat, masa berlaku, dan bukti pelaksanaan kerja sama.",
    "Dokumen bukti pendukung Penggunaan Dana UPPS dan Program Studi, termasuk laporan realisasi anggaran, rincian biaya operasional, dana penelitian, dana PkM, dan biaya investasi tiga tahun terakhir.",

    # C.3 Relevansi Pendidikan, Penelitian, dan PkM
    "Dokumen bukti pendukung Kurikulum dan Rencana Pembelajaran, termasuk struktur kurikulum, kode dan nama mata kuliah, bobot sks, konversi jam, dan dokumen RPS.",
    "Dokumen bukti pendukung Mata Kuliah dan Dokumen Pembelajaran, termasuk RPS, bobot sks, konversi kredit ke jam, dan kelengkapan komponen RPS.",
    "Dokumen bukti pendukung Integrasi Penelitian/PkM dalam Pembelajaran, termasuk judul penelitian atau PkM, mata kuliah terkait, bentuk integrasi, RPS yang memuat integrasi, dan bukti sahih.",
    "Dokumen bukti pendukung Mata Kuliah Basic Science dan Matematika, termasuk daftar mata kuliah, semester, jumlah sks, dan RPS mata kuliah tersebut.",
    "Dokumen bukti pendukung Capstone Design/Project, termasuk panduan pelaksanaan, mata kuliah capstone dan pendukung, cakupan bahasan, dan bukti hasil proyek mahasiswa.",
    "Dokumen pendukung kegiatan penelitian DTPS, termasuk surat tugas, kontrak penelitian, sumber pembiayaan, judul, tahun, dan laporan akhir penelitian.",
    "Dokumen pendukung pengabdian masyarakat DTPS, termasuk surat tugas, kontrak PkM, sumber pembiayaan, judul, tahun, mitra, dan laporan akhir PkM.",

    # C.4 Sumber Daya Manusia
    "Dokumen bukti pendukung Profil Dosen, termasuk ijazah, SK jabatan akademik, sertifikat pendidik, sertifikat kompetensi atau profesi, dan SK penugasan dosen.",
    "Dokumen bukti pendukung Tenaga Kependidikan, termasuk daftar tenaga kependidikan, ijazah terakhir, sertifikat kompetensi, dan unit kerja.",
    "Dokumen pendukung beban kerja dosen, termasuk laporan BKD, SK mengajar, surat tugas penelitian, PkM, dan tugas tambahan pada tahun TS.",
    "Dokumen bukti pendukung Publikasi Ilmiah DTPS, termasuk judul artikel, jenis dan nama media publikasi, tahun, dan tautan atau salinan artikel.",
    "Dokumen bukti pendukung Pagelaran/Pameran/Presentasi/Publikasi Ilmiah DTPS, termasuk jenis kegiatan, judul karya, tahun, sertifikat, dan dokumentasi pelaksanaan.",
    "Bukti dukung Luaran penelitian dan PkM DTPS berupa Paten dan Paten Sederhana, termasuk judul, tanggal, nomor paten granted, dan sertifikat paten.",
    "Bukti dukung Luaran penelitian dan PkM DTPS berupa Hak Cipta dan Desain Produk Industri, termasuk judul, tanggal, dan nomor sertifikat HKI.",
    "Bukti dukung Luaran penelitian dan PkM DTPS berupa Teknologi Tepat Guna dan Produk, termasuk nama luaran, tanggal, tingkat kesiapan teknologi, dan nomor sertifikat TKT.",
    "Bukti dukung Luaran penelitian dan PkM DTPS berupa Buku ber-ISBN dan Book Chapter, termasuk judul, tanggal terbit, nomor ISBN, dan halaman identitas buku.",
    "Dokumen bukti pendukung Produk/Jasa DTPS yang Diadopsi Industri/Masyarakat, termasuk nama produk atau jasa, deskripsi, pengguna, dan surat keterangan adopsi.",
    "Dokumen bukti pendukung Kinerja DTPS dalam Keunggulan Kompetitif, termasuk artikel jurnal internasional bereputasi atau prosiding terindeks, posisi penulis, indeks, dan tautan publikasi.",
    "Dokumen bukti pendukung Karya Ilmiah DTPS yang Disitasi, termasuk judul artikel, jumlah sitasi, dan tangkapan layar basis data pengindeks.",
    "Dokumen bukti pendukung Pengakuan/Rekognisi DTPS, termasuk surat undangan atau penugasan, sertifikat, bidang keahlian, tingkat, dan tahun rekognisi.",
    "Dokumen bukti pendukung Pembimbing Lapangan, termasuk identitas pembimbing, industri, pengalaman kerja, pendidikan, dan surat izin praktik keinsinyuran.",

    # C.5 Sarana, Prasarana, dan K3L
    "Dokumen bukti pendukung Prasarana dan Peralatan Utama, termasuk daftar inventaris, jumlah, kepemilikan, kondisi, logbook penggunaan, dan dokumentasi fasilitas.",
    "Dokumen bukti pendukung Dokumen K3L, termasuk jenis dokumen K3L, jumlah, dan riwayat pengesahan.",
    "Dokumen bukti pendukung Fasilitas K3L, termasuk daftar sarana K3L, fungsi, jumlah unit, kondisi, dan dokumentasi fasilitas.",

    # C.6 Mahasiswa dan Luaran Mahasiswa
    "Dokumen bukti pendukung Jumlah Mahasiswa, termasuk rekap mahasiswa aktif per program studi, mahasiswa asing, dan data PDDikti.",
    "Dokumen bukti pendukung IPK Lulusan, termasuk data IPK, periode kelulusan, jumlah lulusan, dan rekapitulasi IPK.",
    "Dokumen bukti pendukung Prestasi Akademik Mahasiswa, termasuk nama kegiatan, tanggal, tingkat, prestasi, sertifikat atau piagam, dan surat tugas.",
    "Dokumen bukti pendukung Prestasi Non-akademik Mahasiswa, termasuk nama kegiatan, tanggal, tingkat, prestasi, sertifikat atau piagam, dan surat tugas.",
    "Dokumen bukti pendukung masa studi lulusan, termasuk data lama studi, periode masuk dan lulus, identitas lulusan, serta rekapitulasi masa studi.",
    "Dokumen bukti pendukung Publikasi Ilmiah Mahasiswa, termasuk judul, penulis, media publikasi, tahun, status publikasi, dan bukti artikel mahasiswa.",
    "Dokumen bukti pendukung Pagelaran/Pameran/Presentasi/Publikasi Ilmiah Mahasiswa, termasuk jenis kegiatan, judul karya, tahun, sertifikat, dan dokumentasi pelaksanaan.",
    "Dokumen bukti pendukung Luaran Mahasiswa berupa Paten dan Paten Sederhana, termasuk judul, tanggal, status registered atau granted, dan nomor paten.",
    "Dokumen bukti pendukung Luaran Mahasiswa berupa HKI, termasuk judul, tanggal, dan nomor sertifikat HKI.",
    "Dokumen bukti pendukung Luaran Mahasiswa berupa Teknologi Tepat Guna dan Produk, termasuk nama luaran, tanggal, tingkat kesiapan teknologi, dan nomor sertifikat TKT.",
    "Dokumen bukti pendukung Luaran Mahasiswa berupa Buku ber-ISBN, termasuk judul, tanggal terbit, nomor ISBN, dan halaman identitas buku.",
    "Dokumen bukti pendukung Produk/Jasa Mahasiswa yang Diadopsi Industri/Masyarakat, termasuk nama mahasiswa, produk atau jasa, deskripsi, dan surat keterangan adopsi.",
    "Dokumen bukti pendukung Waktu Tunggu Lulusan, termasuk laporan tracer study, jumlah lulusan terlacak, dan rekap waktu tunggu per tahun lulus.",
    "Dokumen bukti pendukung Kesesuaian Bidang Kerja Lulusan, termasuk laporan tracer study, jumlah lulusan terlacak, dan rekap kesesuaian bidang kerja.",
    "Dokumen bukti pendukung Tempat Kerja Lulusan, termasuk laporan tracer study dan rekap tingkat serta ukuran tempat kerja atau wirausaha lulusan.",
    "Dokumen bukti pendukung Kepuasan Pengguna Lulusan, termasuk instrumen survei, rekap tingkat kepuasan per aspek, daftar responden pengguna, dan rencana tindak lanjut.",
    "Dokumen bukti pendukung Penelitian DTPS yang Melibatkan Mahasiswa, termasuk judul penelitian, tema peta jalan, nama dosen dan mahasiswa, tahun, dan surat tugas.",
    "Dokumen bukti pendukung Penelitian DTPS yang Menjadi Rujukan Tesis/Disertasi, termasuk tema penelitian, nama mahasiswa, judul tesis atau disertasi, dan tahun.",
    "Dokumen bukti pendukung PkM DTPS yang Melibatkan Mahasiswa, termasuk judul PkM, tema peta jalan, nama dosen dan mahasiswa, tahun, dan surat tugas.",

    # C.7 Sistem Penjaminan Mutu
    "Dokumen bukti pendukung Ketersediaan Dokumen SPMI, termasuk kebijakan SPMI, manual PPEPP, standar mutu, formulir, nomor, dan tanggal dokumen.",
    "Dokumen bukti pendukung Pelaksanaan SPMI, termasuk laporan hasil audit mutu internal, laporan RTM, dan dokumen tindak lanjut peningkatan standar.",
    "Peraturan Direktur/Rektor tentang rencana atau program pengembangan kemahasiswaan dan alumni"
]


# ponytail: tiap entri DOCUMENT_CATALOG menggabung NAMA dokumen dengan uraian
# cakupannya (", termasuk <daftar bidang>"). Uraian itu memperpanjang prompt
# (116 entri, ~40k char total) tanpa menambah daya pilah -- kata-katanya
# generik dan berulang antar entri, justru menarik LLM ke dokumen yang cuma
# "bersinggungan topik". Dipotong di sini, BUKAN di DOCUMENT_CATALOG, supaya
# daftar mentahnya tetap salinan verbatim dari dimas (lihat docstring modul).
_LABEL_SEPARATORS = (", termasuk ", " terrmasuk ", ", meliputi ")


def label_only(entry: str) -> str:
    """Nama dokumennya saja, tanpa uraian cakupan."""
    for sep in _LABEL_SEPARATORS:
        if sep in entry:
            return entry.split(sep)[0].strip().rstrip(".,")
    return entry.strip().rstrip(".")


def catalog_for_prompt() -> list[str]:
    """Label pendek, unik, urut -- tanpa nomor (dimas: model menyalin label apa
    adanya; parse_items mencocokkan teks, bukan indeks).

    Empat pasang entri ternyata dokumen yang SAMA dengan uraian yang cuma beda
    urutan kata (mis. #17/#63, #20/#29) -- begitu uraiannya dibuang, keduanya
    menyatu jadi satu pilihan, bukan dua yang membingungkan."""
    urut: list[str] = []
    terlihat: set[str] = set()
    for entry in DOCUMENT_CATALOG:
        lab = label_only(entry)
        if lab.casefold() not in terlihat:
            terlihat.add(lab.casefold())
            urut.append(lab)
    return urut


def _norm(s: str) -> str:
    return _re.sub(r"\s+", " ", s or "").strip().casefold()


# ponytail: dikunci ke LABEL PENDEK -- itu yang ditawarkan ke LLM sekarang
# (catalog_for_prompt), jadi itu pula yang harus tervalidasi dan tersimpan.
# Entri panjang tetap diterima (baris lama / model yang menyalin uraiannya
# ikut) dan dinormalkan ke label pendek yang sama.
_CATALOG_LOOKUP: dict[str, str] = {}
for _entry in DOCUMENT_CATALOG:
    _lab = label_only(_entry)
    _CATALOG_LOOKUP.setdefault(_norm(_lab), _lab)
    _CATALOG_LOOKUP.setdefault(_norm(_entry), _lab)


def parse_items(items: list) -> tuple[list[dict], list[dict]]:
    """dimas parse_items: match the model's label TEXT against the catalog (case/whitespace tolerant, never
    fuzzy). Returns (accepted, rejected); accepted carries the real catalog label, not the model's text."""
    accepted: list[dict] = []
    rejected: list[dict] = []
    for it in items or []:
        if not isinstance(it, dict):
            rejected.append({"raw": it, "why": "bukan object"})
            continue
        label = (it.get("label") or "").strip()
        if not label:
            rejected.append({"raw": it, "why": "label kosong"})
            continue
        canonical = _CATALOG_LOOKUP.get(_norm(label))
        if canonical is None:
            rejected.append({"raw": it, "why": "label tidak ditemukan di katalog"})
            continue
        accepted.append({"label": canonical, "reason": it.get("reason", "")})
    return accepted, rejected
