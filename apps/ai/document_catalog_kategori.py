"""Katalog dokumen REKOMENDASI_DOKUMEN yang DIKELOMPOKKAN per bidang LED.

Sumber: catatan pengguna (catatan.txt). Pengelompokan ini hanya konteks untuk LLM
supaya lebih mudah mencari dokumen yang relevan; kontrak keluarannya tidak berubah
-- model tetap menyalin LABEL dokumen (bukan nama kategori) dan parse_items menolak
apa pun yang tidak ada di katalog.

`document_catalog.py` (salinan verbatim dimas) TIDAK diubah dan tetap dipakai sebagai
cadangan pencocokan label lama (baris rekomendasi yang sudah tersimpan).
"""

from __future__ import annotations

import document_catalog as _lama
from document_catalog import label_only

DOCUMENT_CATALOG_BY_CATEGORY: dict[str, list[str]] = {
    # Peraturan Kementrian Pendidikan (2 dokumen)
    "Peraturan Kementrian Pendidikan": [
        "Peraturan Menteri Pendidikan tentang Statuta Institusi, termasuk dasar penyelenggaraan, organisasi, tata kelola, pendidikan, pengelolaan sumber daya, serta ketentuan operasional institusi.",
        "Surat Keputusan Menteri Pendidikan tentang Pendirian dan Penyelenggaraan Institusi, termasuk dasar pendirian, status kelembagaan, bentuk penyelenggaraan, kewenangan, serta ketentuan operasional institusi.",
    ],
    # Tim penyusun laporan evalkuasi diri (1 dokumen)
    "Tim penyusun laporan evalkuasi diri": [
        "Keputusan Direktur/Rektor tentang Penetapan Tim Penyusun Dokumen Akreditasi, termasuk susunan tim penyusunan dokumen akreditasi.",
    ],
    # Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi) (4 dokumen)
    "Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi)": [
        "Peraturan Direktur/Rektor tentang Tata Cara Penyusunan, Penetapan, Pemutakhiran, dan Implementasi Visi dan Misi Institusi, termasuk tahapan, pihak terlibat, evaluasi, dan tindak lanjut.",
        "Rencana Strategis (Renstra) Institusi, termasuk visi, misi, tujuan, sasaran, strategi, kebijakan, program kerja, indikator kinerja, target, dan prioritas pengembangan institusi.",
        "Surat penetapan visi dan misi institusi, termasuk rumusan visi dan misi, dasar penetapan, pihak yang menetapkan, serta ketentuan pemberlakuannya.",
        "Surat penerapan visi keilmuan program studi, termasuk rumusan visi dan misi, dasar penerapan, pihak yang menetapkan, serta ketentuan pemberlakuannya.",
    ],
    # Akuntabilitas (22 dokumen)
    "Akuntabilitas": [
        "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Program Studi, termasuk pengelolaan akademik, pendidikan, sumber daya, penjaminan mutu, pelaporan, dan pelaksanaan kegiatan program studi.",
        "Keputusan Direktur/Rektor tentang Fungsi, Tugas, dan Wewenang Kepala Departemen dan Ketua Program Studi, termasuk pengelolaan pendidikan, sumber daya, penjaminan mutu, akreditasi, dan koordinasi kegiatan.",
        "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Unit Penunjang di Lingkungan Institusi, termasuk tugas, tanggung jawab, kewenangan, koordinasi, layanan pendukung, pelaksanaan kegiatan, dan pelaporan.",
        "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Unit Penunjang, termasuk pembagian tugas, tanggung jawab, koordinasi, pengelolaan kegiatan, evaluasi, layanan, dan pelaporan unit pendukung institusi.",
        "Keputusan Direktur/Rektor tentang Tugas dan Fungsi Direktur & Wakil Direktur, termasuk pembagian kewenangan, tanggung jawab, bidang tugas, koordinasi, pengambilan keputusan, dan pengelolaan institusi.",
        "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Pengawas Internal, termasuk audit internal, pengawasan risiko, evaluasi kinerja, tindak lanjut pemeriksaan, koordinasi, dan pelaporan hasil audit.",
        "Peraturan Direktur/Rektor tentang Distribusi Dana Kontribusi Institusi Hasil Kerjasama Pendidikan, Penelitian, Layanan Masyarakat, termasuk alokasi, penggunaan, pencairan, pertanggungjawaban, dan pengendalian dana kerja sama.",
        "Peraturan Direktur/Rektor tentang Teknologi Informasi, aplikasi, data, layanan TIK, keamanan informasi, pengembangan, pemanfaatan, dan pengawasan.",
        "Pedoman Pengelolaan Kerjasama, termasuk kriteria mitra, bentuk kerja sama, mekanisme pengajuan, pengesahan, pelaksanaan, monitoring, evaluasi, pengembangan, perpanjangan, dan penghentian kerja sama.",
        "Peraturan Direktur/Rektor Tentang Perencanaan Pengembangan Jejaring Kemitraan, termasuk pemetaan mitra, sasaran, bentuk kemitraan, perencanaan, pelaksanaan, monitoring, evaluasi, dan pengembangan.",
        "Dokumen Pendukung Kerjasama di bidang Pendidikan, termasuk mitra, bentuk kerja sama, kegiatan, tujuan, pelaksanaan, hasil, evaluasi, dan bukti implementasi kerja sama pendidikan.",
        "Dokumen Pendukung Kerjasama di bidang Penelitian, termasuk mitra, bentuk kolaborasi, kegiatan penelitian, tujuan, hasil, evaluasi, dan bukti pelaksanaan kerja sama penelitian.",
        "Dokumen Pendukung Kerjasama di bidang Pengabdian kepada Masyarakat (PKM), termasuk mitra, bentuk kerja sama, kegiatan PkM, tujuan, pelaksanaan, hasil, evaluasi, dan bukti implementasi.",
        "DOkumen Rencana Kinerja Tahunan (RKT), termasuk sasaran kinerja, program kerja, kegiatan, indikator capaian, target tahunan, kebutuhan anggaran, dan rencana pendanaan institusi.",
        "Surat Keterangan kerja sama industri terrmasuk fungsi, peran, kewenangan, serta keterlibatan dalam memberikan masukan terhadap pendidikan, penelitian, PkM, dan hubungan industri.",
        "Laporan Hasil Review Laporan Keuangan, termasuk hasil pemeriksaan, temuan, kesesuaian laporan, rekomendasi, pengendalian keuangan, serta tindak lanjut perbaikan pengelolaan keuangan.",
        "Keputusan Direktur/Rektor tentang Fungsi, Tugas dan Wewenang Pengawas Internal, termasuk audit internal, evaluasi, pengawasan risiko, pemeriksaan, tindak lanjut, koordinasi, dan pelaporan hasil pengawasan.",
        "Program Kerja Pengawasan Tahunan Satuan Pengawas Internal, termasuk rencana pengawasan, ruang lingkup pemeriksaan, jadwal kegiatan, mekanisme pelaksanaan, pelaporan, anggaran, dan tindak lanjut hasil pengawasan.",
        "Dokumen bukti pendukung Kerjasama Pendidikan, termasuk surat penugasan, perjanjian kerja sama, mitra, tingkat, masa berlaku, dan bukti pelaksanaan kerja sama.",
        "Dokumen bukti pendukung Kerjasama Penelitian, termasuk surat penugasan, perjanjian kerja sama, mitra, tingkat, masa berlaku, dan bukti pelaksanaan kerja sama.",
        "Dokumen bukti pendukung Kerjasama Pengabdian kepada Masyarakat, termasuk surat penugasan, perjanjian kerja sama, mitra, tingkat, masa berlaku, dan bukti pelaksanaan kerja sama.",
        "Dokumen bukti pendukung Penggunaan Dana UPPS dan Program Studi, termasuk laporan realisasi anggaran, rincian biaya operasional, dana penelitian, dana PkM, dan biaya investasi tiga tahun terakhir.",
    ],
    # Relevansi Pendidikan (15 dokumen)
    "Relevansi Pendidikan": [
        "Peraturan Direktur/Rektor tentang Pengelolaan Pendidikan, termasuk perencanaan, penerimaan mahasiswa, kurikulum, pembelajaran, penilaian, kelulusan, administrasi akademik, sumber daya, dan penjaminan mutu pendidikan.",
        "Peraturan Direktur/Rektor tentang Pengelolaan Pendidikan, termasuk perencanaan, penerimaan mahasiswa, kurikulum, pembelajaran, penilaian, kelulusan, sumber daya, administrasi akademik, dan penjaminan mutu pendidikan.",
        "Pedoman Kurikulum, termasuk profil lulusan, capaian pembelajaran, bahan kajian, mata kuliah, struktur kurikulum, proses pembelajaran, penilaian, evaluasi, dan pemutakhiran kurikulum.",
        "Peraturan Akademik Program Studi, termasuk kurikulum, pembelajaran, registrasi, beban studi, penilaian, ujian, kelulusan, hak dan kewajiban mahasiswa, tata tertib, serta sanksi akademik.",
        "Peraturan Direktur/Rektor tentang Peraturan Akademik, termasuk kurikulum, pembelajaran, registrasi, beban studi, penilaian, ujian, kelulusan, hak, kewajiban, serta ketentuan akademik mahasiswa.",
        "Dokumen Kurikulum Program Studi, Evaluasi Pembelajaran, termasuk struktur kurikulum, mata kuliah, capaian pembelajaran, pelaksanaan pembelajaran, penilaian, hasil evaluasi, dan tindak lanjut perbaikan.",
        "Rencana Pembelajaran Semester Program Studi, termasuk capaian pembelajaran, materi, metode, bentuk pembelajaran, penugasan, penilaian, sumber belajar, dan jadwal kegiatan setiap pertemuan.",
        "Dokumen Modul Ajar, termasuk capaian pembelajaran, materi, metode, kegiatan pembelajaran, sumber belajar, penugasan, evaluasi, dan referensi yang digunakan dalam pembelajaran.",
        "Peraturan Direktur/Rektor tentang Pengembangan Suasana Akademik, termasuk kebebasan akademik, interaksi sivitas akademika, kegiatan ilmiah, fasilitas akademik, budaya akademik, dan evaluasi suasana akademik.",
        "Dokumen dan laoran kolaborasi dosen industri, termasuk mitra industri, bentuk kolaborasi, kegiatan, peran dosen, hasil kerja sama, manfaat, serta bukti pelaksanaan kolaborasi.",
        "Dokumen bukti pendukung Kurikulum dan Rencana Pembelajaran, termasuk struktur kurikulum, kode dan nama mata kuliah, bobot sks, konversi jam, dan dokumen RPS.",
        "Dokumen bukti pendukung Mata Kuliah dan Dokumen Pembelajaran, termasuk RPS, bobot sks, konversi kredit ke jam, dan kelengkapan komponen RPS.",
        "Dokumen bukti pendukung Integrasi Penelitian/PkM dalam Pembelajaran, termasuk judul penelitian atau PkM, mata kuliah terkait, bentuk integrasi, RPS yang memuat integrasi, dan bukti sahih.",
        "Dokumen bukti pendukung Mata Kuliah Basic Science dan Matematika, termasuk daftar mata kuliah, semester, jumlah sks, dan RPS mata kuliah tersebut.",
        "Dokumen bukti pendukung Capstone Design/Project, termasuk panduan pelaksanaan, mata kuliah capstone dan pendukung, cakupan bahasan, dan bukti hasil proyek mahasiswa.",
    ],
    # Penelitian (5 dokumen)
    "Penelitian": [
        "Rencana Induk Penelitian (RIP) Institusi, termasuk arah, prioritas, roadmap, sasaran strategis, program penelitian, indikator kinerja, target, serta pengembangan penelitian institusi.",
        "Penetapan Research Center, termasuk pusat riset yang ditetapkan, struktur pengelola, ketua, anggota, tugas, fungsi, kewenangan, kegiatan, serta mekanisme pelaporan penelitian.",
        "Keputusan Direktur/Rektor tentang Penetapan Research Center, termasuk pusat riset, struktur pengelola, ketua, anggota, fungsi, tugas, kewenangan, kegiatan, dan mekanisme pelaporan penelitian.",
        "Peraturan Direktur/Rektor tentang Kebijakan, Tata Kelola, dan Penyelenggaraan Kegiatan Penelitian, termasuk perencanaan, pelaksanaan, pengelolaan, evaluasi, luaran, pelaporan, pendanaan, dan pengembangan penelitian.",
        "Dokumen pendukung kegiatan penelitian DTPS, termasuk surat tugas, kontrak penelitian, sumber pembiayaan, judul, tahun, dan laporan akhir penelitian.",
    ],
    # Pengabdian pada Masyarakat (PkM) (4 dokumen)
    "Pengabdian pada Masyarakat (PkM)": [
        "Rencana Strategis Pengabdian kepada Masyarakat (Renstra PkM), termasuk tujuan, sasaran, strategi, prioritas program, indikator kinerja, target, serta arah pengembangan kegiatan PkM selama lima tahun.",
        "Laporan Institusi tentang Pelaksanaan, Capaian, dan Evaluasi Kegiatan Pengabdian kepada Masyarakat, termasuk program, sasaran, pelaksanaan, capaian, kendala, evaluasi, hasil, dan tindak lanjut perbaikan.",
        "Keputusan Direktur/Rektor tentang Penetapan Rencana Strategis Pengabdian kepada Masyarakat, termasuk tujuan, sasaran, strategi, program, prioritas, indikator, target, dan arah pengembangan kegiatan PkM.",
        "Dokumen pendukung pengabdian masyarakat DTPS, termasuk surat tugas, kontrak PkM, sumber pembiayaan, judul, tahun, mitra, dan laporan akhir PkM.",
    ],
    # Sumber Daya Manusia (20 dokumen)
    "Sumber Daya Manusia": [
        "Dokumen bukti pendukung Ijasah Dosen, termasuk bukti pendidikan doktor, perguruan tinggi, program studi, bidang keilmuan, identitas dosen, tahun kelulusan, dan kualifikasi akademik.",
        "Dokumen Jabatan Fungsional (Guru Besar), termasuk bukti penetapan, jenjang jabatan, bidang keahlian, identitas dosen, nomor keputusan, serta status jabatan fungsional.",
        "Dokumen Jabatan Fungsional, termasuk bukti penetapan, jenjang jabatan, bidang keahlian, identitas dosen, nomor keputusan, status, dan periode berlakunya.",
        "Kumpulan Bukti Sertifikat Keisyinyuran, termasuk sertifikat keinsinyuran, bidang keahlian, identitas pemegang, lembaga penerbit, nomor sertifikat, dan masa berlaku.",
        "Kumpulan Bukti Sertifikat Kompetensi, termasuk sertifikat kompetensi, bidang keahlian, pemegang sertifikat, lembaga penerbit, nomor sertifikat, dan masa berlaku.",
        "Kumpulan Bukti Sertifikat Serdos, termasuk sertifikat pendidik, identitas dosen, nomor sertifikat, bidang keahlian, lembaga penerbit, dan status sertifikasi.",
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
    ],
    # Sarana dan Prasarana (3 dokumen)
    "Sarana dan Prasarana": [
        "Peraturan Direktur/Rektor tentang Pengelolaan Sarana Prasarana Institusi, termasuk perencanaan, pengadaan, penggunaan, pemanfaatan, pemeliharaan, inventarisasi, penghapusan, pelaporan, monitoring, dan evaluasi fasilitas.",
        "Daftar Inventaris Teaching Factory, termasuk daftar peralatan, jumlah, spesifikasi, lokasi, kondisi, status kepemilikan, penggunaan, dan pemanfaatan fasilitas untuk kegiatan pendidikan.",
        "Dokumen bukti pendukung Prasarana dan Peralatan Utama, termasuk daftar inventaris, jumlah, kepemilikan, kondisi, logbook penggunaan, dan dokumentasi fasilitas.",
    ],
    # Keselamatan Kesehatan Kerja dan Lingkungan (K3L) (5 dokumen)
    "Keselamatan Kesehatan Kerja dan Lingkungan (K3L)": [
        "Keputusan Direktur/Rektor tentang Tim Keamanan dan Keselamatan Kerja Lingkungan Institusi, termasuk struktur tim, tugas, identifikasi risiko, prosedur keselamatan, pelatihan, inspeksi, dan pelaporan.",
        "Pedoman Sistem Manajemen Keselamatan dan Kesehatan Kerja Serta Pengelolaan Lingkungan, termasuk kebijakan K3L, identifikasi risiko, pengendalian, pelatihan, monitoring, audit, evaluasi, dan perbaikan berkelanjutan.",
        "Peraturan Direktur/Rektor tentang Pencegahan dan Penanganan Kekerasan Seksual di Lingkungan Institusi, termasuk pencegahan, pelaporan, pemeriksaan, perlindungan korban, penanganan pelaku, sanksi, pemulihan, dan evaluasi.",
        "Dokumen bukti pendukung Dokumen K3L, termasuk jenis dokumen K3L, jumlah, dan riwayat pengesahan.",
        "Dokumen bukti pendukung Fasilitas K3L, termasuk daftar sarana K3L, fungsi, jumlah unit, kondisi, dan dokumentasi fasilitas.",
    ],
    # Mahasiswa dan Luaran Mahasiswa (23 dokumen)
    "Mahasiswa dan Luaran Mahasiswa": [
        "Peraturan Direktur/Rektor tentang rencana atau program pengembangan kemahasiswaan dan alumni",
        "Peraturan Direktur/Rektor tentang Penetapan Petunjuk Teknis Pelaksanaan Seleksi Mahasiswa baru Institusi, termasuk jalur seleksi, persyaratan, kriteria, mekanisme, tahapan, penilaian, penetapan kelulusan, dan penerimaan.",
        "Rekap Kunjungan Industri, termasuk kegiatan, waktu, tempat, mitra industri, peserta, tujuan, bentuk aktivitas, hasil kunjungan, dan dokumentasi pelaksanaan.",
        "Rekap Prestasi Institusi, termasuk daftar prestasi, bidang, tingkat pencapaian, waktu, pihak yang memperoleh prestasi, jenis penghargaan, dan bukti dokumentasi.",
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
    ],
    # Sistem Penjaminan Mutu (10 dokumen)
    "Sistem Penjaminan Mutu": [
        "Keputusan Direktur/Rektor tentang Struktur Organisasi Unit Penjaminan Mutu, termasuk struktur unit, pembagian tugas dan tanggung jawab, fungsi audit dan evaluasi mutu, pengembangan sistem, serta koordinasi.",
        "Dokumen Mutu Pusat Penelitian dan Pengabdian kepada Masyarakat, termasuk sasaran mutu, tata kelola, standar layanan, prosedur, manajemen risiko, serta pengelolaan penelitian dan PkM.",
        "Dokumen Manual Mutu Pusat Penelitian dan Pengabdian Masyarakat, termasuk struktur, tugas, standar layanan, prosedur penelitian dan PkM, sasaran mutu, pengendalian dokumen, dan rekaman.",
        "Peraturan Direktur/Rektor Tentang Sistem Penjaminan Mutu Internal Institusi, termasuk kebijakan mutu, standar, struktur, siklus PPEPP, audit, evaluasi, pengendalian, dan tindak lanjut peningkatan mutu.",
        "Peraturan Direktur Tentang Sistem Penjaminan Mutu Internal Institusi, termasuk kebijakan, standar mutu, pelaksanaan PPEPP, evaluasi, audit mutu internal, pengendalian, peningkatan, dan tindak lanjut perbaikan.",
        "Keputusan Direktur/Rektor tentang Struktur organisasi Unit Penjaminan Mutu Institusi, termasuk struktur unit, tugas, tanggung jawab, fungsi audit, evaluasi mutu, pengembangan sistem, dan koordinasi.",
        "Dokumen Mutu Pusat Penelitian dan Pengabdian kepada Masyarakat, termasuk sasaran mutu, standar layanan, prosedur, tata kelola, pengendalian, evaluasi, dan peningkatan mutu kegiatan penelitian serta PkM.",
        "Dokumen Manual Mutu Pusat Penelitian dan Pengabdian Masyarakat, termasuk prosedur mutu, struktur pengelola, standar layanan, pengendalian dokumen, rekaman, evaluasi, dan peningkatan mutu penelitian serta PkM.",
        "Dokumen bukti pendukung Ketersediaan Dokumen SPMI, termasuk kebijakan SPMI, manual PPEPP, standar mutu, formulir, nomor, dan tanggal dokumen.",
        "Dokumen bukti pendukung Pelaksanaan SPMI, termasuk laporan hasil audit mutu internal, laporan RTM, dan dokumen tindak lanjut peningkatan standar.",
    ],
}


# True  = label = TEKS ENTRI LENGKAP persis seperti di katalog ("Nama, termasuk uraian ...").
# False = label pendek (nama saja), perilaku sebelumnya.
# ponytail: dulu selalu pendek (label_only). Pengguna ingin yang tampil & tersimpan sama
# persis dengan entri katalog, termasuk uraian cakupannya.
LABEL_PENUH = False


def _label(entry: str) -> str:
    return entry.strip() if LABEL_PENUH else label_only(entry)


def catalog_by_category() -> dict[str, list[str]]:
    """{kategori: [label, ...]} -- label unik GLOBAL (entri kembar antar/dalam kategori
    hanya muncul di kategori pertamanya; kembar = nama pendek sama), urutan sesuai
    katalog. Label = entri lengkap bila LABEL_PENUH, selain itu nama pendek saja."""
    hasil: dict[str, list[str]] = {}
    terlihat: set[str] = set()
    for kategori, entri in DOCUMENT_CATALOG_BY_CATEGORY.items():
        for e in entri:
            kunci = label_only(e).casefold()
            if kunci in terlihat:
                continue
            terlihat.add(kunci)
            hasil.setdefault(kategori, []).append(_label(e))
    return hasil


def catalog_lines_for_prompt(quote: bool = True) -> list[str]:
    """Baris siap pakai untuk prompt: judul kategori, lalu labelnya (diapit kutip bila
    `quote`, selain itu diawali '- '), satu baris kosong antar kategori."""
    baris: list[str] = []
    for kategori, labels in catalog_by_category().items():
        baris.append(f"[{kategori}]")
        baris += [f'"{lab}"' if quote else f"- {lab}" for lab in labels]
        baris.append("")
    return baris


_LOOKUP: dict[str, str] = {}
# Entri lengkap, nama pendeknya, dan entri kembar -- semuanya dinormalkan ke label kanonik
# (yang ditawarkan ke LLM), jadi baris lama berlabel pendek pun tetap dikenali.
_PENDEK_KE_KANONIK = {label_only(l).casefold(): l for ls in catalog_by_category().values() for l in ls}
for _kat, _entri in DOCUMENT_CATALOG_BY_CATEGORY.items():
    for _e in _entri:
        _kanon = _PENDEK_KE_KANONIK[label_only(_e).casefold()]
        _LOOKUP.setdefault(_lama._norm(_e), _kanon)
        _LOOKUP.setdefault(_lama._norm(label_only(_e)), _kanon)


def category_of(label: str) -> str | None:
    """Kategori tempat label ini berada (None bila bukan label katalog baru)."""
    kanon = _LOOKUP.get(_lama._norm(label))
    for kategori, labels in catalog_by_category().items():
        if kanon in labels:
            return kategori
    return None


def parse_items(items: list) -> tuple[list[dict], list[dict]]:
    """Seperti document_catalog.parse_items (cocok teks label, tanpa fuzzy), tetapi
    memakai katalog berkategori; label lama yang masih ada di katalog dimas juga
    diterima sebagai cadangan."""
    diterima: list[dict] = []
    ditolak: list[dict] = []
    for it in items or []:
        label = (it.get("label") or "").strip().strip('"').strip() if isinstance(it, dict) else ""
        kanon = _LOOKUP.get(_lama._norm(label)) if label else None
        if kanon is None:
            ok, no = _lama.parse_items([it])
            diterima += ok
            ditolak += no
            continue
        diterima.append({"label": kanon, "reason": it.get("reason", "")})
    return diterima, ditolak
