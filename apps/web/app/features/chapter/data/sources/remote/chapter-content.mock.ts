/**
 * Isi bab contoh berbentuk prosa LED. Dipakai nyata oleh
 * `led-project.repository.ts` (isi awal 14 bab saat dokumen dibuat) dan masih
 * mock untuk `chapter-generation.mock.ts` (keluaran generate AI).
 *
 * **Kenapa panjang, dan kenapa selalu menyebut nama berkas.** Bukan selera
 * menulis: `nilaiKriteria()` di `chapter-scoring.mock.ts` menurunkan skor dari
 * panjang teks polos (`floor(panjang / 320)`, mentok di 3) dan dari apakah
 * tulisannya menyebut berkas berekstensi (`menyebutBerkas()`). Isi sepanjang
 * satu kalimat membuat **seluruh** indikator jatuh ke skor 0–1 dengan
 * justifikasi "belum memuat uraian" — tab Kualitas AI, Penilaian AMI, dan
 * Kualitas Penilaian jadi merah semua tanpa ada yang salah pada produknya.
 * Karena itu tiap entri dijaga di atas ~1.000 karakter teks polos dan selalu
 * menyebut sekurangnya satu bukti dukung.
 *
 * **Susunannya mengikuti `POIN_PEDOMAN`** di `guidance-point.entity.ts`: latar
 * belakang dan mekanisme penetapan, dasar kebijakan formal, capaian terukur,
 * analisis faktor pendukung dan penghambat, lalu rencana tindak lanjut yang
 * bertanggung jawab dan bertenggat. Jadi yang terbaca di kanvas dan yang
 * terbaca di panel Panduan saling mencerminkan, bukan dua karangan lepas.
 *
 * **Berkas yang boleh disebut hanya dokumen tingkat universitas plus LKPS
 * prodinya sendiri.** Bukti dukung milik prodi lain — `SK_Kurikulum_Prodi_TI.pdf`
 * di dalam dokumen Sistem Informasi, misalnya — akan langsung terbaca salah
 * oleh siapa pun yang mengenal dokumen LED.
 *
 * **Tanpa `<table>`.** Ekstensi tabel Tiptap tidak terpasang (lihat
 * `apps/web/package.json`), jadi markup tabel hilang saat dirender. Angka
 * disajikan sebagai `<ul>`.
 */

export type KontenBabKonteks = {
	/** Nama program studi, mis. `Sistem Informasi`. */
	prodi: string;
	/** Nama berkas LKPS milik prodi itu, mis. `LKPS_Sistem_Informasi_2026.xlsx`. */
	lkps: string;
};

/** Dipakai saat pemanggil tidak tahu prodinya — jarang, tapi tidak boleh pecah. */
export const KONTEKS_BAWAAN: KontenBabKonteks = {
	prodi: 'program studi',
	lkps: 'LKPS_Program_Studi_2026.xlsx',
};

type PenyusunKonten = (konteks: KontenBabKonteks) => string;

const KONTEN_BAB: Record<number, PenyusunKonten> = {
	1: ({ prodi }) => `
<h3>Dasar Penyusunan</h3>
<p>Laporan Evaluasi Diri ini disusun Program Studi ${prodi} sebagai bagian dari pengajuan akreditasi kepada Lembaga Akreditasi Mandiri, sekaligus sebagai bahan evaluasi internal atas penyelenggaraan tridarma selama periode berjalan. Penyusunannya berpijak pada Statuta_Universitas_2024.pdf yang menetapkan otonomi keilmuan sebagai asas penyelenggaraan, dan pada Renstra_Universitas_2025_2030.pdf yang menurunkan asas itu menjadi sasaran strategis yang terukur.</p>
<h3>Mekanisme dan Keterlibatan</h3>
<p>Naskah disiapkan tim penyusun yang ditetapkan Dekan atas usul Ketua Program Studi, beranggotakan unsur pimpinan unit pengelola, dosen tetap, tenaga kependidikan, serta perwakilan mahasiswa. Data kuantitatif seluruhnya ditarik dari tabel Laporan Kinerja Program Studi, sedangkan uraian kualitatif disusun dari dokumen kebijakan, notulen rapat, dan laporan kegiatan yang tersimpan pada arsip unit pengelola.</p>
<h3>Cakupan dan Rujukan Silang</h3>
<p>Uraian mencakup sembilan kriteria akreditasi, didahului pemetaan kondisi eksternal dan profil unit pengelola, serta ditutup analisis capaian dan program pengembangan. Setiap pernyataan pada bab berikutnya dirujuk ke bukti dukung yang dapat ditelusuri, sehingga penilai tidak perlu bersandar pada keterangan lisan.</p>
<ul>
<li>Periode data: tahun akademik 2023/2024 sampai 2025/2026.</li>
<li>Jumlah kriteria yang diuraikan: sembilan, sesuai instrumen yang berlaku.</li>
<li>Penanggung jawab penyusunan: Ketua Program Studi ${prodi}, dengan penelaahan Gugus Penjaminan Mutu.</li>
</ul>
`,

	2: ({ prodi }) => `
<h3>Lingkungan Makro</h3>
<p>Kebutuhan tenaga kerja bidang teknologi informasi terus tumbuh seiring percepatan transformasi digital pada sektor publik maupun industri, sementara kebijakan nasional mendorong perguruan tinggi memperluas pembelajaran berbasis pengalaman kerja. Perubahan ini menuntut Program Studi ${prodi} meninjau kurikulum lebih sering daripada siklus lima tahunan yang lazim, dan membuka ruang pengakuan pembelajaran di luar kampus sebagaimana diatur Pedoman_Akademik_Universitas.docx.</p>
<h3>Lingkungan Mikro</h3>
<p>Pada tingkat wilayah terdapat sekurangnya delapan program studi sejenis dalam radius yang sama, tiga di antaranya telah berperingkat Unggul. Persaingan ini terasa paling nyata pada perebutan calon mahasiswa bermutu dan pada rekrutmen dosen berkualifikasi doktor. Di sisi lain, kepadatan industri di wilayah yang sama membuka peluang kemitraan yang tercatat pada Rekap_Kerja_Sama_Industri.xlsx.</p>
<h3>Posisi dan Tindak Lanjut</h3>
<p>Hasil penelusuran lulusan yang dijalankan menurut Panduan_Tracer_Study.pdf menunjukkan masa tunggu kerja pertama masih berada di atas target renstra, terutama pada lulusan yang tidak menempuh magang bersertifikat. Temuan ini ditetapkan sebagai dasar penguatan kerja sama industri pada dua tahun berikutnya, dengan penanggung jawab Koordinator Kerja Sama dan tenggat akhir tahun akademik 2026/2027.</p>
`,

	3: ({ prodi, lkps }) => `
<h3>Identitas Unit Pengelola</h3>
<p>Unit pengelola Program Studi ${prodi} adalah Fakultas Teknik, yang kedudukan, tugas, dan kewenangannya diatur Statuta_Universitas_2024.pdf serta dirinci pada Struktur_Organisasi_Universitas.png. Fakultas dipimpin Dekan yang dibantu dua Wakil Dekan, sedangkan penyelenggaraan akademik program studi dijalankan Ketua Program Studi bersama Gugus Penjaminan Mutu tingkat fakultas.</p>
<h3>Sumber Daya yang Dikelola</h3>
<p>Seluruh angka pada bagian ini ditarik dari ${lkps}, sehingga dapat dicocokkan langsung dengan tabel yang sama pada berkas usulan. Komposisi sumber daya menunjukkan rasio dosen terhadap mahasiswa yang masih berada dalam rentang yang dipersyaratkan, dengan sebaran kualifikasi yang sedang bergerak naik melalui skema tugas belajar.</p>
<ul>
<li>Dosen tetap program studi: 18 orang, 7 di antaranya berkualifikasi doktor.</li>
<li>Rasio dosen terhadap mahasiswa: 1 : 26.</li>
<li>Tenaga kependidikan pendukung: 9 orang, 4 bersertifikat kompetensi.</li>
<li>Mahasiswa aktif: 468 orang pada tahun akademik berjalan.</li>
</ul>
<h3>Catatan Pengembangan</h3>
<p>Kesenjangan yang paling menonjol ada pada jumlah guru besar, yang sampai periode ini belum terpenuhi. Unit pengelola menetapkan pendampingan kenaikan jabatan fungsional sebagai program prioritas, dengan penanggung jawab Wakil Dekan Bidang Sumber Daya dan target dua usulan lektor kepala setiap tahun.</p>
`,

	4: ({ prodi }) => `
<h3>Rumusan dan Mekanisme Penetapan</h3>
<p>Visi Program Studi ${prodi} diturunkan dari visi universitas sebagaimana termaktub pada Statuta_Universitas_2024.pdf, yaitu menjadi perguruan tinggi unggul di bidang rekayasa dan teknologi terapan yang berdaya saing regional pada tahun 2035. Penurunan itu dilakukan melalui lokakarya yang melibatkan dosen, tenaga kependidikan, mahasiswa, alumni, dan pengguna lulusan, lalu ditetapkan Dekan setelah ditelaah Senat Fakultas.</p>
<h3>Keselarasan dengan Strategi</h3>
<p>Misi dan tujuan diterjemahkan menjadi sasaran tahunan yang tercantum pada Renstra_Universitas_2025_2030.pdf, lengkap dengan indikator kinerja dan penanggung jawabnya. Keselarasan dijaga melalui peninjauan tahunan yang membandingkan capaian indikator dengan target periode berjalan, dan hasilnya dibahas pada rapat kerja fakultas.</p>
<ul>
<li>Ketercapaian indikator kinerja utama bidang pendidikan: 82% dari target tahun berjalan.</li>
<li>Tingkat pemahaman visi dan misi pada survei sivitas akademika: 4,21 dari 5.</li>
<li>Frekuensi peninjauan sasaran strategis: satu kali setiap tahun akademik.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Faktor pendukung utama adalah dokumen strategis yang telah selaras dari tingkat universitas sampai program studi. Faktor penghambatnya, sosialisasi visi belum menjangkau mahasiswa tahun pertama secara merata sehingga skornya tertahan. Program pengembangan yang ditetapkan adalah penyisipan materi visi dan misi pada masa pengenalan akademik, dengan penanggung jawab Ketua Program Studi dan tenggat awal tahun akademik berikutnya.</p>
`,

	5: ({ prodi }) => `
<h3>Sistem Tata Pamong</h3>
<p>Tata pamong Program Studi ${prodi} dijalankan menurut prinsip kredibel, transparan, akuntabel, bertanggung jawab, dan adil, dengan pembagian kewenangan yang diatur Statuta_Universitas_2024.pdf dan dirinci pada Struktur_Organisasi_Universitas.png. Pemilihan Ketua Program Studi dilakukan melalui penjaringan terbuka di tingkat fakultas dan ditetapkan Rektor, sedangkan keputusan akademik yang berdampak luas dibawa ke rapat senat sebagaimana terekam pada Notulen_Rapat_Senat_Juli.docx.</p>
<h3>Penjaminan Mutu</h3>
<p>Sistem penjaminan mutu internal dijalankan mengikuti siklus PPEPP yang ditetapkan Kebijakan_SPMI_Universitas.pdf, dengan penugasan auditor diatur SK_Rektor_Penjaminan_Mutu.pdf. Audit mutu internal dilaksanakan sekali setiap tahun oleh auditor yang tidak berasal dari unit yang diaudit, dan seluruh temuannya ditindaklanjuti dengan rencana perbaikan bertenggat.</p>
<ul>
<li>Temuan audit mutu internal periode berjalan: 6 temuan, 5 telah ditutup.</li>
<li>Kerja sama aktif bidang pendidikan, penelitian, dan pengabdian: 23 naskah perjanjian.</li>
<li>Kerja sama yang menghasilkan luaran terukur: 14 dari 23 naskah.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Kemitraan dengan industri yang tercatat pada Rekap_Kerja_Sama_Industri.xlsx telah memadai dari sisi jumlah, tetapi belum seluruhnya menghasilkan luaran yang dapat diukur. Unit pengelola menetapkan penyaringan mitra baru berdasarkan kejelasan luaran sebagai program perbaikan, dengan penanggung jawab Koordinator Kerja Sama dan evaluasi setiap semester.</p>
`,

	6: ({ prodi, lkps }) => `
<h3>Kebijakan Penerimaan</h3>
<p>Penerimaan mahasiswa Program Studi ${prodi} mengikuti ketentuan yang diatur Pedoman_Akademik_Universitas.docx, mencakup jalur prestasi, jalur ujian tertulis, dan jalur kerja sama. Daya tampung ditetapkan setiap tahun dengan mempertimbangkan rasio dosen terhadap mahasiswa serta ketersediaan sarana praktikum, agar penambahan jumlah mahasiswa tidak menurunkan mutu pembelajaran.</p>
<h3>Mutu Masukan dan Layanan</h3>
<p>Seluruh angka pendaftar, peserta seleksi, dan mahasiswa yang mendaftar ulang ditarik dari ${lkps}. Layanan kemahasiswaan meliputi bimbingan akademik oleh dosen wali, layanan konseling, pusat karier, serta pembinaan penalaran dan minat bakat yang dikelola bersama organisasi kemahasiswaan.</p>
<ul>
<li>Rasio pendaftar terhadap daya tampung: 4,3 : 1 pada tahun akademik berjalan.</li>
<li>Persentase mahasiswa yang mendaftar ulang: 91% dari yang dinyatakan lulus seleksi.</li>
<li>Mahasiswa berprestasi tingkat nasional dan internasional: 17 orang dalam tiga tahun terakhir.</li>
<li>Tingkat kepuasan layanan kemahasiswaan: 4,08 dari 5.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Keketatan seleksi telah membaik, namun sebaran asal daerah mahasiswa masih terpusat pada satu provinsi sehingga keberagaman masukan belum tercapai. Program pengembangan yang ditetapkan adalah promosi terarah ke wilayah yang selama ini kurang terjangkau, dengan penanggung jawab Koordinator Kemahasiswaan dan tenggat satu siklus penerimaan berikutnya.</p>
`,

	7: ({ prodi, lkps }) => `
<h3>Profil Sumber Daya Manusia</h3>
<p>Dosen tetap Program Studi ${prodi} berjumlah 18 orang dengan bidang keahlian yang seluruhnya sesuai badan pengetahuan program studi. Data kualifikasi, jabatan fungsional, dan beban kerja diambil dari ${lkps}, sedangkan penugasan mengajar setiap semester ditetapkan melalui surat tugas Dekan mengikuti ketentuan Pedoman_Akademik_Universitas.docx.</p>
<h3>Pengembangan dan Beban Kerja</h3>
<p>Pengembangan dosen dijalankan melalui skema tugas belajar, bantuan biaya studi lanjut, dan pendampingan kenaikan jabatan fungsional sebagaimana ditargetkan Renstra_Universitas_2025_2030.pdf. Beban kerja dosen dipantau setiap semester agar tetap berada dalam rentang yang dipersyaratkan, dan hasil pemantauan menjadi dasar penyesuaian penugasan pada semester berikutnya.</p>
<ul>
<li>Dosen berkualifikasi doktor: 7 dari 18 orang, atau 38,9%.</li>
<li>Dosen bersertifikat pendidik: 12 dari 18 orang.</li>
<li>Rata-rata beban kerja dosen: 13,4 satuan kredit semester per semester.</li>
<li>Dosen sedang menempuh studi doktor: 4 orang.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Proporsi doktor sedang bergerak naik dan diperkirakan melampaui target renstra pada akhir periode. Hambatan yang tersisa adalah belum adanya guru besar, yang membatasi kepemimpinan akademik pada penelitian bermutu tinggi. Pendampingan penulisan karya ilmiah untuk calon lektor kepala ditetapkan sebagai program prioritas, dengan penanggung jawab Wakil Dekan Bidang Sumber Daya dan evaluasi setiap tahun.</p>
`,

	8: ({ prodi, lkps }) => `
<h3>Pengelolaan Keuangan</h3>
<p>Perencanaan dan penggunaan anggaran Program Studi ${prodi} mengikuti siklus penganggaran fakultas yang penyerapannya dilaporkan pada Laporan_Keuangan_Universitas_2025.xlsx. Sumber dana berasal dari penerimaan mahasiswa, hibah kompetitif, serta kerja sama kemitraan, dengan alokasi untuk penelitian dan pengabdian dijaga sekurangnya pada batas yang ditetapkan Renstra_Universitas_2025_2030.pdf.</p>
<h3>Sarana dan Prasarana</h3>
<p>Sarana pembelajaran mencakup ruang kuliah, laboratorium, perpustakaan, dan sarana pendukung kemahasiswaan, dengan rincian luas dan kapasitas tercantum pada ${lkps}. Pemeliharaan dijadwalkan berkala dan usulan pengadaan disusun berdasarkan kebutuhan capaian pembelajaran, bukan berdasarkan sisa anggaran.</p>
<ul>
<li>Dana operasional pendidikan per mahasiswa per tahun: Rp 21,4 juta.</li>
<li>Dana penelitian per dosen per tahun: Rp 18,7 juta.</li>
<li>Laboratorium yang dikelola program studi: 5 unit, seluruhnya terpakai penuh.</li>
<li>Penyerapan anggaran tahun berjalan: 93% dari pagu.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Kecukupan dana operasional telah melampaui ambang yang dipersyaratkan, tetapi ketergantungan pada penerimaan mahasiswa masih tinggi sehingga ruang gerak pengembangan terbatas. Diversifikasi sumber dana melalui hibah dan kerja sama ditetapkan sebagai program pengembangan, dengan penanggung jawab Wakil Dekan Bidang Umum dan tenggat akhir periode renstra.</p>
`,

	9: ({ prodi, lkps }) => `
<h3>Kurikulum</h3>
<p>Kurikulum Program Studi ${prodi} disusun berdasarkan profil lulusan dan capaian pembelajaran yang diselaraskan dengan Kerangka Kualifikasi Nasional Indonesia jenjang enam, sebagaimana disyaratkan Kebijakan_SPMI_Universitas.pdf. Struktur mata kuliah, bobot, dan sebarannya per semester tercantum pada ${lkps}, sedangkan ketentuan pelaksanaannya diatur Pedoman_Akademik_Universitas.docx.</p>
<h3>Pelaksanaan Pembelajaran</h3>
<p>Pembelajaran dijalankan dengan pendekatan berpusat pada mahasiswa, memadukan kuliah, praktikum, studi kasus, dan proyek yang dikerjakan bersama mitra. Pemenuhan rencana pembelajaran semester dipantau setiap pertengahan dan akhir semester, dan hasil pemantauan menjadi bahan rapat evaluasi program studi.</p>
<ul>
<li>Mata kuliah yang menerapkan pembelajaran berbasis proyek atau kasus: 34 dari 62 mata kuliah.</li>
<li>Kesesuaian pelaksanaan terhadap rencana pembelajaran semester: 96%.</li>
<li>Tingkat kepuasan mahasiswa atas proses pembelajaran: 4,12 dari 5.</li>
<li>Peninjauan kurikulum terakhir: tahun akademik 2024/2025, melibatkan pengguna lulusan.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Penerapan pembelajaran berbasis proyek telah merata pada mata kuliah keahlian, namun integrasi hasil penelitian dosen ke dalam bahan ajar belum terdokumentasi rapi. Program pengembangan yang ditetapkan adalah pewajiban pencantuman rujukan hasil penelitian pada rencana pembelajaran semester, dengan penanggung jawab Koordinator Kurikulum dan tenggat awal semester berikutnya.</p>
`,

	10: ({ prodi, lkps }) => `
<h3>Kebijakan dan Arah Penelitian</h3>
<p>Penelitian dosen Program Studi ${prodi} diarahkan pada peta jalan yang ditetapkan fakultas dan diselaraskan dengan sasaran bidang penelitian pada Renstra_Universitas_2025_2030.pdf, yaitu peningkatan bertahap jumlah publikasi terindeks bereputasi per dosen per tahun. Pengelolaan usulan, pelaksanaan, dan pelaporan penelitian mengikuti ketentuan yang ditetapkan lembaga penelitian universitas.</p>
<h3>Pelaksanaan dan Pelibatan Mahasiswa</h3>
<p>Setiap penelitian yang didanai wajib melibatkan sekurangnya satu mahasiswa, sehingga tugas akhir sebagian besar mahasiswa merupakan bagian dari penelitian dosen pembimbingnya. Rekapitulasi judul, sumber dana, dan luaran penelitian tercantum pada ${lkps} dan dapat ditelusuri sampai ke laporan akhir masing-masing.</p>
<ul>
<li>Penelitian yang berjalan dalam tiga tahun terakhir: 41 judul.</li>
<li>Penelitian dengan pendanaan eksternal: 16 dari 41 judul.</li>
<li>Rata-rata publikasi terindeks bereputasi per dosen per tahun: 0,72.</li>
<li>Penelitian yang melibatkan mahasiswa: 38 dari 41 judul.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Capaian publikasi telah melampaui target tahun berjalan namun belum mencapai target akhir periode renstra. Hambatan utamanya adalah sebaran produktivitas yang tidak merata, dengan sebagian besar publikasi berasal dari sedikit dosen. Skema pendampingan penulisan bagi dosen yang belum berpublikasi ditetapkan sebagai program perbaikan, dengan penanggung jawab Koordinator Penelitian dan evaluasi setiap semester.</p>
`,

	11: ({ prodi, lkps }) => `
<h3>Kebijakan Pengabdian kepada Masyarakat</h3>
<p>Pengabdian kepada masyarakat yang dijalankan Program Studi ${prodi} diarahkan pada penerapan keahlian bidang teknologi informasi untuk menyelesaikan persoalan nyata mitra, sejalan dengan alokasi pendanaan yang ditetapkan Renstra_Universitas_2025_2030.pdf. Tema kegiatan disusun dari kebutuhan mitra, bukan dari ketersediaan bahan ajar, dan kemitraannya sebagian tercatat pada Rekap_Kerja_Sama_Industri.xlsx.</p>
<h3>Pelaksanaan dan Keberlanjutan</h3>
<p>Setiap kegiatan dirancang berjangka sekurangnya satu tahun agar dampaknya dapat diukur, dengan pelibatan mahasiswa sebagai bagian dari pembelajaran berbasis pengalaman. Rekapitulasi judul, mitra, sumber dana, dan luaran tercantum pada ${lkps}, dan laporan akhirnya diarsipkan unit pengelola.</p>
<ul>
<li>Kegiatan pengabdian dalam tiga tahun terakhir: 29 judul.</li>
<li>Kegiatan dengan pendanaan eksternal: 9 dari 29 judul.</li>
<li>Mitra yang berlanjut lebih dari satu periode: 11 mitra.</li>
<li>Mahasiswa yang terlibat: 214 orang.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Jumlah kegiatan telah memadai dan pelibatan mahasiswa berjalan baik, tetapi pengukuran dampak pada mitra masih bersifat naratif dan belum memakai indikator yang disepakati sejak awal kegiatan. Penyusunan instrumen pengukuran dampak ditetapkan sebagai program pengembangan, dengan penanggung jawab Koordinator Pengabdian dan tenggat akhir tahun akademik berjalan.</p>
`,

	12: ({ prodi, lkps }) => `
<h3>Capaian Pembelajaran Lulusan</h3>
<p>Ketercapaian capaian pembelajaran Program Studi ${prodi} diukur melalui penilaian mata kuliah, ujian tugas akhir, serta uji kompetensi bidang yang diselenggarakan mitra industri. Rekapitulasi indeks prestasi, masa studi, dan kelulusan tepat waktu ditarik dari ${lkps} sehingga dapat dicocokkan langsung dengan tabel usulan.</p>
<h3>Kinerja Lulusan</h3>
<p>Penelusuran lulusan dijalankan setiap tahun menurut Panduan_Tracer_Study.pdf, mencakup masa tunggu kerja pertama, kesesuaian bidang kerja, dan tingkat kepuasan pengguna lulusan. Hasilnya menjadi bahan peninjauan kurikulum dan penetapan program penguatan kesiapan kerja.</p>
<ul>
<li>Rata-rata indeks prestasi kumulatif lulusan: 3,41.</li>
<li>Kelulusan tepat waktu: 78% dari satu angkatan penuh.</li>
<li>Rata-rata masa tunggu kerja pertama: 4,6 bulan.</li>
<li>Kesesuaian bidang kerja terhadap bidang studi: 81%.</li>
<li>Tingkat kepuasan pengguna lulusan: 4,17 dari 5.</li>
</ul>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Masa tunggu kerja pertama telah membaik dan berada di bawah ambang yang dipersyaratkan, namun tingkat respons penelusuran lulusan baru mencapai 54% sehingga keterwakilan datanya belum kuat. Penguatan basis data alumni beserta pengingat berkala ditetapkan sebagai program perbaikan, dengan penanggung jawab Pusat Karier dan tenggat satu siklus penelusuran berikutnya.</p>
`,

	13: ({ prodi }) => `
<h3>Analisis Capaian Kriteria</h3>
<p>Pembacaan menyeluruh atas sembilan kriteria menunjukkan Program Studi ${prodi} berada pada posisi kuat di bidang pendidikan dan tata pamong, memadai di bidang mahasiswa dan sumber daya manusia, serta masih perlu penguatan di bidang penelitian dan luaran tridarma. Simpulan ini disusun dengan membandingkan capaian tiap indikator terhadap target Renstra_Universitas_2025_2030.pdf dan terhadap ambang yang ditetapkan instrumen akreditasi.</p>
<h3>Akar Masalah</h3>
<p>Tiga akar masalah yang berulang lintas kriteria adalah sebaran produktivitas penelitian yang timpang, dokumentasi dampak kegiatan yang belum memakai indikator terukur, serta tingkat respons penelusuran lulusan yang rendah. Ketiganya bermuara pada satu hal yang sama: pengumpulan bukti dilakukan menjelang pelaporan, bukan sepanjang tahun berjalan.</p>
<h3>Program Pengembangan</h3>
<ul>
<li>Pendampingan penulisan karya ilmiah bagi dosen yang belum berpublikasi — Koordinator Penelitian, evaluasi tiap semester.</li>
<li>Penyusunan instrumen pengukuran dampak pengabdian — Koordinator Pengabdian, tenggat akhir tahun akademik berjalan.</li>
<li>Penguatan basis data alumni dan pengingat penelusuran berkala — Pusat Karier, tenggat satu siklus penelusuran.</li>
<li>Pendampingan kenaikan jabatan fungsional ke lektor kepala — Wakil Dekan Bidang Sumber Daya, dua usulan per tahun.</li>
<li>Pengarsipan bukti dukung sepanjang tahun berjalan — Gugus Penjaminan Mutu, berlaku sejak periode ini.</li>
</ul>
<p>Seluruh program di atas dituangkan menjadi rencana operasional tahunan yang penyerapannya dipantau bersamaan dengan pemantauan anggaran pada Laporan_Keuangan_Universitas_2025.xlsx.</p>
`,

	14: ({ prodi }) => `
<h3>Simpulan</h3>
<p>Laporan Evaluasi Diri ini memperlihatkan Program Studi ${prodi} telah menyelenggarakan tridarma secara terencana, dengan tata pamong yang berjalan sesuai ketentuan Statuta_Universitas_2024.pdf dan penjaminan mutu yang berputar penuh mengikuti siklus PPEPP pada Kebijakan_SPMI_Universitas.pdf. Capaian pada bidang pendidikan dan tata pamong telah melampaui ambang yang dipersyaratkan, sedangkan bidang penelitian dan luaran tridarma masih berada pada jalur peningkatan.</p>
<h3>Komitmen Perbaikan</h3>
<p>Seluruh temuan pada bab analisis telah diterjemahkan menjadi program pengembangan yang memiliki penanggung jawab, indikator, dan tenggat, serta dimasukkan ke rencana operasional tahunan agar pelaksanaannya dapat dipantau seperti halnya penyerapan anggaran. Unit pengelola berkomitmen menjalankan pengarsipan bukti dukung sepanjang tahun berjalan, sehingga penyusunan laporan berikutnya tidak lagi bertumpu pada pengumpulan berkas menjelang tenggat.</p>
<h3>Pernyataan Keabsahan</h3>
<p>Seluruh data dan keterangan yang disampaikan pada laporan ini dapat ditelusuri sampai ke dokumen sumbernya, dan Ketua Program Studi bersama Dekan bertanggung jawab atas kebenarannya. Naskah ini telah ditelaah Gugus Penjaminan Mutu dan disahkan pada rapat pimpinan fakultas sebagaimana terekam pada Notulen_Rapat_Senat_Juli.docx.</p>
`,
};

/**
 * Isi bab contoh dalam bentuk HTML `kontenKerja`.
 *
 * Nomor bab yang tidak dikenali mengembalikan uraian ringkas yang tetap
 * memenuhi dua syarat mesin skor — cukup panjang dan menyebut berkas — supaya
 * penambahan bab baru pada `CHAPTER_TEMPLATE` tidak diam-diam menjatuhkan
 * seluruh kolom skor ke nol.
 */
export function kontenBab(
	urutanBab: number,
	judulBab: string,
	konteks: KontenBabKonteks = KONTEKS_BAWAAN,
): string {
	const penyusun = KONTEN_BAB[urutanBab];
	if (penyusun) return penyusun(konteks).trim();

	return `
<h3>Uraian</h3>
<p>Bagian ${judulBab} pada dokumen Program Studi ${konteks.prodi} menguraikan latar belakang, dasar kebijakan, dan mekanisme penetapan yang berlaku, dengan bertumpu pada Statuta_Universitas_2024.pdf serta sasaran tahunan yang ditetapkan Renstra_Universitas_2025_2030.pdf. Seluruh angka yang disebut ditarik dari ${konteks.lkps} sehingga dapat dicocokkan langsung dengan tabel pada berkas usulan.</p>
<h3>Analisis dan Tindak Lanjut</h3>
<p>Capaian pada bagian ini dibandingkan terhadap target periode berjalan, kemudian faktor pendukung dan penghambatnya diuraikan beserta akar masalahnya. Bagian ditutup dengan rencana tindak lanjut yang memuat penanggung jawab dan tenggat, sehingga perbaikannya dapat dipantau pada siklus penjaminan mutu berikutnya sebagaimana diatur Kebijakan_SPMI_Universitas.pdf.</p>
`.trim();
}
