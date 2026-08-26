import { type BuktiDukungRef } from '../../../domain/entities/bukti-dukung-ref.entity';

/** Hash string sederhana, dipakai sebagai benih deterministik untuk kutipan tiruan di bawah. */
function sidikJari(teks: string): number {
	let nilai = 0;
	for (let i = 0; i < teks.length; i += 1) {
		nilai = (nilai * 31 + teks.charCodeAt(i)) >>> 0;
	}
	return nilai;
}

/**
 * Kutipan bukti dukung yang dipakai AI saat menyusun sebuah bab
 * (docs/application_flow.md §11.1a).
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap, mengikuti
 * kebiasaan `chapter-generation.mock.ts` dan `evidence-upload.mock.ts`. Yang
 * sungguhan datang dari `generation_runs.chunks_used`
 * (docs/integration-plan.md §"Rujukan displays chunks used"), hasil retrieval di
 * vector database eksternal.
 *
 * **Bentuknya sengaja meniru chunk sungguhan yang sudah ada di `apps/ai`.**
 * `LEDChunk` di `ingestion/led_chunker.py` membawa `chunk_id`, `text`,
 * `page_start`, `page_end`, `section_heading`, dan `char_start`; payload yang
 * benar-benar disimpan prototipe generasi membawa `{id, kind, filename, text,
 * query}`. Yang diambil ke sini hanya yang bisa ditampilkan dan tidak menipu:
 * `char_start` tidak berguna bagi pembaca, dan `distance`/skor kemiripan sengaja
 * ditinggalkan — angka karangan yang tampak presisi lebih menyesatkan daripada
 * tidak ada sama sekali.
 *
 * **Diturunkan, bukan dibaca dari `referensiChunkIds`.** Itu keputusan yang
 * dipaksa keadaan, dan perlu ditulis supaya tidak terbaca sebagai kelalaian:
 *
 * - Untuk **kondisi aktif**, id chunk sama sekali tidak ada. `chapterSchema`
 *   tidak punya fieldnya, `applyGenerate` tidak pernah menulisnya, dan
 *   `restoreFromDraft` tidak memulihkannya. Satu-satunya tempat ia pernah hidup
 *   adalah `hasilTerakhir` di `useChapterGeneration`, yang musnah begitu tab
 *   berpindah.
 * - Untuk **checkpoint**, `referensiChunkIds` memang tersimpan, tapi hanya untuk
 *   checkpoint bersumber `AI`, isinya id opaque tanpa entitas di baliknya, dan
 *   data seed-nya sendiri sudah berselisih dengan `ragas.jumlahChunk`.
 *
 * Menurunkannya dari `(urutanBab, ref.id)` adalah satu-satunya cara kedua
 * lingkup berperilaku sama.
 *
 * **Sinkron, bukan asinkron.** `TabsContent` di Editor Bab tidak memakai
 * `keepMounted`, jadi panelnya dilepas dari pohon setiap kali tab berpindah —
 * sumber asinkron berarti spinner di kolom 320 px pada tiap kali tab dibuka
 * kembali. Alasan yang sama dipakai `evidence-recommendation.entity.ts`.
 */
export type KutipanChunk = {
	/** `chunk-bukti-${refId}-${nn}` — keluarga rumus yang sama dengan generate. */
	id: string;
	/** Petikan isi berkas, sepanjang yang layak dibaca di laci detail. */
	kutipan: string;
	halamanMulai: number;
	halamanSelesai: number;
	/** Judul bagian tempat petikan diambil; `null` bila berkasnya tak berbagian. */
	judulBagian: string | null;
};

type Petikan = {
	teks: string;
	judulBagian: string | null;
};

/**
 * Petikan dikelompokkan menurut **kata kunci nama berkas**, bukan menurut tipe
 * berkasnya: sebuah `.pdf` bisa statuta maupun SK, dan keduanya berbunyi sangat
 * berbeda. Ini kerabat dekat pencocokan penanda di
 * `evidence-recommendation.entity.ts`, dan batasnya pun sama — nama berkas
 * adalah satu-satunya petunjuk yang dipunyai `BUKTI_DUKUNG` (§16 Pertanyaan
 * Terbuka #9).
 *
 * Urutan penting: yang pertama cocok dipakai, jadi kata kunci yang lebih khusus
 * harus berdiri di atas yang lebih umum (`laporan keuangan` sebelum `laporan`).
 */
const PUSTAKA_PETIKAN: { kunci: string[]; petikan: Petikan[] }[] = [
	{
		kunci: ['statuta'],
		petikan: [
			{
				judulBagian: 'BAB II ASAS, VISI, MISI, DAN TUJUAN',
				teks: 'Universitas menyelenggarakan pendidikan tinggi berdasarkan asas otonomi keilmuan, dengan visi menjadi perguruan tinggi unggul di bidang rekayasa dan teknologi terapan yang berdaya saing di tingkat regional pada tahun 2035.',
			},
			{
				judulBagian: 'BAB V TATA KELOLA',
				teks: 'Organ pengelola universitas terdiri atas Rektor sebagai pemimpin penyelenggaraan, Senat Akademik sebagai penyusun kebijakan akademik, dan Satuan Pengawas Internal yang menjalankan fungsi pengawasan non-akademik secara independen.',
			},
			{
				judulBagian: 'BAB V TATA KELOLA',
				teks: 'Rektor bertanggung jawab kepada Yayasan atas penyelenggaraan tridarma, dan wajib menyampaikan laporan kinerja tahunan yang telah ditelaah Satuan Pengawas Internal paling lambat tiga bulan setelah tahun akademik berakhir.',
			},
			{
				judulBagian: 'BAB VIII PENJAMINAN MUTU',
				teks: 'Universitas menyelenggarakan sistem penjaminan mutu internal yang mencakup penetapan, pelaksanaan, evaluasi, pengendalian, dan peningkatan standar pendidikan tinggi secara berkelanjutan pada setiap unit pengelola program studi.',
			},
			{
				judulBagian: 'BAB XI KERJA SAMA',
				teks: 'Kerja sama dengan pihak lain di dalam maupun luar negeri diselenggarakan atas dasar kesetaraan dan saling menguntungkan, dituangkan dalam naskah perjanjian yang ditandatangani Rektor atau pejabat yang diberi kuasa.',
			},
		],
	},
	{
		kunci: ['renstra', 'rencana strategis'],
		petikan: [
			{
				judulBagian: 'BAB III SASARAN STRATEGIS',
				teks: 'Sasaran strategis bidang pendidikan diarahkan pada peningkatan persentase lulusan yang memperoleh pekerjaan pertama dalam masa tunggu kurang dari enam bulan, dari 58% pada tahun dasar menjadi 75% pada akhir periode renstra.',
			},
			{
				judulBagian: 'BAB III SASARAN STRATEGIS',
				teks: 'Bidang sumber daya manusia menargetkan sekurang-kurangnya 40% dosen tetap berkualifikasi doktor dan 60% memiliki sertifikat pendidik pada akhir periode, melalui skema tugas belajar dan bantuan biaya studi lanjut.',
			},
			{
				judulBagian: 'BAB IV PROGRAM DAN INDIKATOR KINERJA',
				teks: 'Indikator kinerja utama bidang penelitian ditetapkan berupa jumlah publikasi terindeks bereputasi per dosen per tahun, dengan target 0,5 pada tahun pertama dan meningkat bertahap menjadi 1,0 pada tahun kelima.',
			},
			{
				judulBagian: 'BAB V KERANGKA PENDANAAN',
				teks: 'Pendanaan program bersumber dari penerimaan mahasiswa, hibah kompetitif, dan kerja sama kemitraan, dengan alokasi sekurang-kurangnya 15% dari total anggaran diarahkan pada penelitian dan pengabdian kepada masyarakat.',
			},
		],
	},
	{
		kunci: ['spmi', 'penjaminan mutu', 'audit mutu'],
		petikan: [
			{
				judulBagian: 'Kebijakan SPMI — Ruang Lingkup',
				teks: 'Sistem penjaminan mutu internal diterapkan pada seluruh unit pengelola program studi dan mencakup siklus PPEPP: penetapan standar, pelaksanaan, evaluasi, pengendalian, dan peningkatan, yang dijalankan dalam satu tahun akademik penuh.',
			},
			{
				judulBagian: 'Manual Mutu — Audit Mutu Internal',
				teks: 'Audit mutu internal dilaksanakan sekurang-kurangnya sekali setahun oleh auditor bersertifikat yang tidak berasal dari unit yang diaudit, dan hasilnya dibahas dalam Rapat Tinjauan Manajemen paling lambat satu bulan setelah audit selesai.',
			},
			{
				judulBagian: 'Standar Mutu — Pendidikan',
				teks: 'Standar kompetensi lulusan dirumuskan dari profil lulusan dan capaian pembelajaran yang selaras dengan Kerangka Kualifikasi Nasional Indonesia jenjang enam, serta ditinjau ulang paling lama setiap lima tahun.',
			},
			{
				judulBagian: 'Manual Mutu — Tindak Lanjut',
				teks: 'Setiap temuan audit wajib ditindaklanjuti dengan rencana perbaikan yang memuat penanggung jawab dan tenggat, dan status penyelesaiannya dilaporkan pada siklus audit berikutnya sebagai bahan pengendalian standar.',
			},
		],
	},
	{
		kunci: ['struktur organisasi', 'tata kerja'],
		petikan: [
			{
				judulBagian: 'Uraian Tugas — Ketua Program Studi',
				teks: 'Ketua Program Studi bertugas menyusun rencana kerja tahunan, mengoordinasikan pelaksanaan kurikulum, dan memastikan seluruh mata kuliah memiliki rencana pembelajaran semester yang mutakhir sebelum perkuliahan dimulai.',
			},
			{
				judulBagian: 'Uraian Tugas — Gugus Penjaminan Mutu',
				teks: 'Gugus Penjaminan Mutu di tingkat program studi menjalankan monitoring pelaksanaan pembelajaran setiap semester dan menyiapkan bahan evaluasi diri sebagai masukan bagi audit mutu internal tingkat fakultas.',
			},
			{
				judulBagian: 'Bagan Organisasi',
				teks: 'Program studi berada di bawah koordinasi Dekan Fakultas Teknik, dengan garis koordinasi fungsional ke Lembaga Penjaminan Mutu dan Lembaga Penelitian dan Pengabdian kepada Masyarakat di tingkat universitas.',
			},
		],
	},
	{
		kunci: ['kerja sama', 'kerjasama', 'mou'],
		petikan: [
			{
				judulBagian: 'Rekapitulasi Kerja Sama Tridarma',
				teks: 'Sepanjang tiga tahun terakhir tercatat 24 kerja sama aktif, terdiri atas 14 kerja sama bidang pendidikan berupa magang dan praktisi mengajar, 6 bidang penelitian bersama, dan 4 bidang pengabdian kepada masyarakat.',
			},
			{
				judulBagian: 'Kerja Sama Bidang Pendidikan',
				teks: 'Kerja sama dengan mitra industri mencakup penempatan magang bersertifikat selama satu semester penuh, dengan pembimbing lapangan yang ditetapkan mitra dan penilaian bersama antara pembimbing lapangan dan dosen pembimbing.',
			},
			{
				judulBagian: 'Manfaat dan Tindak Lanjut',
				teks: 'Sebanyak 9 dari 24 kerja sama menghasilkan luaran bersama berupa publikasi, prototipe, atau rekrutmen lulusan, dan seluruh perjanjian ditinjau keberlanjutannya pada akhir masa berlaku.',
			},
		],
	},
	{
		kunci: ['lkps', 'laporan kinerja program studi'],
		petikan: [
			{
				judulBagian: 'Tabel 3.a.1 Dosen Tetap',
				teks: 'Jumlah dosen tetap yang ditugaskan pada program studi sebanyak 18 orang, dengan 6 orang berkualifikasi doktor dan 12 orang magister; 11 di antaranya telah memiliki sertifikat pendidik profesional.',
			},
			{
				judulBagian: 'Tabel 3.a.2 Beban Kerja Dosen',
				teks: 'Rata-rata beban kerja dosen tetap pada tahun akademik berjalan sebesar 13,4 SKS per semester, berada dalam rentang 12–16 SKS yang dipersyaratkan, dengan sebaran tertinggi 15,5 SKS dan terendah 12,0 SKS.',
			},
			{
				judulBagian: 'Tabel 2.a Seleksi Mahasiswa',
				teks: 'Rasio keketatan seleksi tiga tahun terakhir berturut-turut 1:4,2, 1:4,8, dan 1:5,1, dengan persentase mahasiswa baru yang melakukan registrasi terhadap yang lulus seleksi berada di atas 88% pada setiap tahunnya.',
			},
			{
				judulBagian: 'Tabel 8.f.1 Publikasi Ilmiah',
				teks: 'Publikasi dosen tetap tiga tahun terakhir berjumlah 41 judul, terdiri atas 12 artikel jurnal internasional bereputasi, 17 jurnal nasional terakreditasi, dan 12 prosiding seminar internasional.',
			},
			{
				judulBagian: 'Tabel 8.d.1 Masa Tunggu Lulusan',
				teks: 'Rata-rata masa tunggu lulusan memperoleh pekerjaan pertama sebesar 4,7 bulan, dengan 71% lulusan bekerja pada bidang yang sesuai atau sangat sesuai dengan bidang studinya.',
			},
			{
				judulBagian: 'Tabel 4.a Penggunaan Dana',
				teks: 'Dana operasional pendidikan per mahasiswa per tahun sebesar Rp21,4 juta, dengan porsi terbesar pada komponen gaji dan pengembangan sumber daya manusia sebanyak 47% dari total belanja program studi.',
			},
		],
	},
	{
		kunci: ['kurikulum', 'rps', 'silabus', 'capaian pembelajaran'],
		petikan: [
			{
				judulBagian: 'Profil Lulusan dan Capaian Pembelajaran',
				teks: 'Capaian pembelajaran lulusan dirumuskan dalam empat ranah — sikap, pengetahuan, keterampilan umum, dan keterampilan khusus — dan dipetakan ke seluruh mata kuliah melalui matriks CPL–CPMK yang ditinjau setiap akhir tahun akademik.',
			},
			{
				judulBagian: 'Struktur Kurikulum',
				teks: 'Beban studi program sarjana ditetapkan 145 SKS yang ditempuh dalam delapan semester, mencakup 18 SKS mata kuliah pilihan terstruktur dalam tiga peminatan dan 6 SKS tugas akhir.',
			},
			{
				judulBagian: 'Mekanisme Peninjauan Kurikulum',
				teks: 'Peninjauan kurikulum dilaksanakan paling lama setiap lima tahun dengan melibatkan pengguna lulusan, alumni, dan asosiasi profesi, serta didahului evaluasi ketercapaian capaian pembelajaran pada dua angkatan terakhir.',
			},
			{
				judulBagian: 'Rencana Pembelajaran Semester',
				teks: 'Setiap rencana pembelajaran semester memuat capaian pembelajaran mata kuliah, bentuk dan metode pembelajaran, kriteria dan bobot penilaian, serta referensi utama yang mutakhir dalam lima tahun terakhir.',
			},
		],
	},
	{
		kunci: ['publikasi', 'sitasi'],
		petikan: [
			{
				judulBagian: 'Rekapitulasi Publikasi',
				teks: 'Dari 41 publikasi tiga tahun terakhir, 15 di antaranya melibatkan mahasiswa sebagai penulis pendamping, sebagian besar merupakan luaran tugas akhir yang dikembangkan bersama dosen pembimbing.',
			},
			{
				judulBagian: 'Sitasi dan Dampak',
				teks: 'Total sitasi karya ilmiah dosen tetap tercatat 268 dengan indeks-h rerata 4,1; lima artikel dengan sitasi tertinggi seluruhnya berasal dari bidang kecerdasan buatan dan sistem tertanam.',
			},
			{
				judulBagian: 'Luaran Selain Publikasi',
				teks: 'Selain publikasi, tercatat 7 hak cipta perangkat lunak dan 2 paten sederhana yang diajukan dalam periode yang sama, seluruhnya merupakan luaran penelitian dengan pendanaan hibah internal.',
			},
		],
	},
	{
		kunci: ['notulen', 'berita acara', 'rapat'],
		petikan: [
			{
				judulBagian: 'Pembahasan',
				teks: 'Rapat membahas usulan penyesuaian struktur kurikulum menyusul masukan pengguna lulusan pada forum temu industri, khususnya penguatan kompetensi keamanan siber dan analitik data pada mata kuliah peminatan.',
			},
			{
				judulBagian: 'Keputusan',
				teks: 'Rapat memutuskan membentuk tim ad hoc peninjauan kurikulum yang beranggotakan lima dosen dan dua perwakilan pengguna lulusan, dengan tenggat penyampaian rekomendasi pada akhir semester berjalan.',
			},
			{
				judulBagian: 'Daftar Hadir',
				teks: 'Rapat dihadiri 23 dari 27 anggota yang diundang, meliputi unsur pimpinan fakultas, ketua program studi, perwakilan dosen, gugus penjaminan mutu, serta dua perwakilan pemangku kepentingan eksternal.',
			},
			{
				judulBagian: 'Tindak Lanjut',
				teks: 'Butir tindak lanjut mencakup penyusunan jadwal lokakarya, penyiapan bahan evaluasi ketercapaian capaian pembelajaran, dan penetapan penanggung jawab untuk setiap butir dengan tenggat yang disepakati.',
			},
		],
	},
	{
		kunci: ['laporan keuangan', 'penggunaan dana', 'anggaran', 'rkat'],
		petikan: [
			{
				judulBagian: 'Realisasi Anggaran',
				teks: 'Realisasi belanja tahun berjalan mencapai 94,2% dari pagu yang ditetapkan, dengan serapan tertinggi pada komponen operasional pembelajaran dan terendah pada komponen pemeliharaan sarana laboratorium.',
			},
			{
				judulBagian: 'Belanja Tridarma',
				teks: 'Alokasi untuk penelitian dan pengabdian kepada masyarakat sebesar 16,8% dari total belanja, melampaui ambang minimum kebijakan universitas sebesar 15% yang ditetapkan dalam rencana strategis.',
			},
			{
				judulBagian: 'Sumber Penerimaan',
				teks: 'Penerimaan bersumber dari uang kuliah tunggal sebesar 78%, hibah kompetitif 13%, dan kerja sama kemitraan 9%, dengan kecenderungan porsi hibah meningkat dibanding dua tahun sebelumnya.',
			},
		],
	},
	{
		kunci: ['pengabdian', 'pkm'],
		petikan: [
			{
				judulBagian: 'Pelaksanaan Kegiatan',
				teks: 'Kegiatan pengabdian dilaksanakan pada dua desa mitra binaan dalam bentuk pelatihan literasi digital dan pendampingan penerapan sistem informasi sederhana untuk badan usaha milik desa.',
			},
			{
				judulBagian: 'Keterlibatan Mahasiswa',
				teks: 'Sebanyak 34 mahasiswa terlibat sebagai anggota tim pelaksana, dengan pengakuan beban belajar setara 2 SKS melalui skema pembelajaran berbasis proyek yang diakui dalam transkrip.',
			},
			{
				judulBagian: 'Kebermanfaatan dan Keberlanjutan',
				teks: 'Mitra melaporkan peningkatan pencatatan transaksi usaha dari manual menjadi terkomputerisasi, dan kerja sama dilanjutkan pada tahun berikutnya dengan cakupan pendampingan pemasaran daring.',
			},
		],
	},
	{
		kunci: ['penelitian', 'roadmap'],
		petikan: [
			{
				judulBagian: 'Peta Jalan Penelitian',
				teks: 'Peta jalan penelitian program studi diarahkan pada tiga tema unggulan — sistem cerdas, keamanan informasi, dan komputasi terapan — yang diturunkan dari rencana induk penelitian universitas.',
			},
			{
				judulBagian: 'Pelaksanaan dan Pendanaan',
				teks: 'Pada tahun berjalan terdapat 11 judul penelitian aktif, terdiri atas 4 hibah eksternal dan 7 hibah internal, dengan seluruh judul telah memiliki surat tugas dan laporan kemajuan tengah tahun.',
			},
			{
				judulBagian: 'Keterlibatan Mahasiswa',
				teks: 'Sembilan dari sebelas judul melibatkan mahasiswa tingkat akhir sebagai anggota tim, sebagian melalui skema skripsi payung yang topiknya diturunkan dari penelitian dosen pembimbing.',
			},
		],
	},
	{
		kunci: ['pedoman', 'panduan'],
		petikan: [
			{
				judulBagian: 'Ketentuan Akademik',
				teks: 'Mahasiswa wajib menempuh beban studi sekurang-kurangnya 144 SKS dengan indeks prestasi kumulatif minimum 2,00 dan tanpa nilai E untuk dinyatakan lulus dari program sarjana.',
			},
			{
				judulBagian: 'Evaluasi Hasil Belajar',
				teks: 'Penilaian hasil belajar menggunakan pendekatan acuan patokan dengan komponen kehadiran, tugas, ujian tengah semester, dan ujian akhir semester, yang bobotnya diumumkan pada rencana pembelajaran semester.',
			},
			{
				judulBagian: 'Bimbingan Akademik',
				teks: 'Setiap mahasiswa memiliki dosen pembimbing akademik yang wajib melaksanakan bimbingan sekurang-kurangnya tiga kali dalam satu semester dan mencatat hasilnya pada kartu bimbingan.',
			},
		],
	},
	{
		kunci: ['sk', 'surat keputusan', 'keputusan'],
		petikan: [
			{
				judulBagian: 'Menimbang',
				teks: 'Bahwa dalam rangka menjamin mutu penyelenggaraan tridarma perguruan tinggi, dipandang perlu menetapkan ketentuan pelaksanaan yang mengikat seluruh unit pengelola program studi di lingkungan universitas.',
			},
			{
				judulBagian: 'Menetapkan — Kesatu',
				teks: 'Menetapkan pemberlakuan ketentuan sebagaimana tercantum dalam lampiran yang merupakan bagian tidak terpisahkan dari keputusan ini, terhitung sejak tanggal ditetapkan.',
			},
			{
				judulBagian: 'Menetapkan — Kedua',
				teks: 'Segala biaya yang timbul sebagai akibat ditetapkannya keputusan ini dibebankan pada anggaran universitas tahun berjalan sesuai mata anggaran yang tersedia.',
			},
			{
				judulBagian: 'Lampiran — Daftar Penugasan',
				teks: 'Lampiran memuat daftar nama beserta kualifikasi akademik dan jabatan fungsional masing-masing, yang ditugaskan sebagai pelaksana pada unit yang disebutkan dalam diktum kesatu.',
			},
		],
	},
	{
		kunci: ['kemahasiswaan', 'himpunan', 'ormawa', 'beasiswa'],
		petikan: [
			{
				judulBagian: 'Layanan Kemahasiswaan',
				teks: 'Layanan yang tersedia meliputi bimbingan konseling, pengembangan minat dan bakat melalui 12 unit kegiatan mahasiswa, serta layanan karier berupa bursa kerja dan pelatihan kesiapan kerja menjelang kelulusan.',
			},
			{
				judulBagian: 'Kegiatan dan Prestasi',
				teks: 'Sepanjang tahun berjalan mahasiswa program studi meraih 8 prestasi tingkat nasional dan 2 tingkat internasional, terbanyak pada bidang pemrograman kompetitif dan rancang bangun perangkat.',
			},
			{
				judulBagian: 'Beasiswa',
				teks: 'Sebanyak 63 mahasiswa menerima beasiswa dari berbagai sumber, meliputi beasiswa pemerintah, beasiswa yayasan, dan keringanan biaya pendidikan berbasis prestasi maupun kondisi ekonomi.',
			},
		],
	},
	{
		kunci: ['tracer', 'lulusan', 'alumni'],
		petikan: [
			{
				judulBagian: 'Metodologi',
				teks: 'Penelusuran dilakukan terhadap lulusan dua tahun setelah kelulusan melalui kuesioner daring dan wawancara telepon, dengan tingkat respons 64% dari total populasi lulusan pada angkatan yang ditelusuri.',
			},
			{
				judulBagian: 'Masa Tunggu',
				teks: 'Sebanyak 68% responden memperoleh pekerjaan pertama dalam waktu kurang dari enam bulan, 22% antara enam sampai dua belas bulan, dan sisanya lebih dari dua belas bulan atau memilih melanjutkan studi.',
			},
			{
				judulBagian: 'Kesesuaian Bidang Kerja',
				teks: 'Tingkat kesesuaian bidang kerja dengan bidang studi dinilai sesuai atau sangat sesuai oleh 71% responden, dengan penempatan terbanyak pada sektor teknologi informasi dan manufaktur.',
			},
			{
				judulBagian: 'Kepuasan Pengguna Lulusan',
				teks: 'Pengguna lulusan menilai aspek etika kerja dan kemampuan bekerja dalam tim pada kategori baik, sementara aspek kemampuan berbahasa asing memperoleh nilai terendah dan menjadi butir perbaikan.',
			},
		],
	},
	{
		kunci: ['sarana', 'prasarana', 'laboratorium', 'inventaris', 'foto'],
		petikan: [
			{
				judulBagian: 'Laboratorium',
				teks: 'Program studi mengelola empat laboratorium — jaringan komputer, rekayasa perangkat lunak, sistem tertanam, dan multimedia — dengan rasio ketersediaan komputer terhadap mahasiswa praktikum sebesar 1:1.',
			},
			{
				judulBagian: 'Ruang Kuliah',
				teks: 'Tersedia sembilan ruang kuliah berkapasitas 40 mahasiswa yang seluruhnya dilengkapi proyektor dan akses nirkabel, dengan tingkat pemanfaatan rata-rata 76% pada jam perkuliahan efektif.',
			},
			{
				judulBagian: 'Aksesibilitas',
				teks: 'Gedung dilengkapi jalur landai dan lift yang menjangkau seluruh lantai, serta ruang baca dengan meja khusus bagi mahasiswa berkebutuhan khusus pada lantai dasar.',
			},
		],
	},
	{
		kunci: ['sertifikat', 'akreditasi', 'piagam'],
		petikan: [
			{
				judulBagian: 'Keterangan Sertifikat',
				teks: 'Sertifikat menyatakan peringkat akreditasi yang berlaku beserta masa berlakunya, diterbitkan lembaga akreditasi mandiri sesuai kewenangan bidang keilmuan yang bersangkutan.',
			},
			{
				judulBagian: 'Masa Berlaku',
				teks: 'Masa berlaku akreditasi ditetapkan lima tahun sejak tanggal penetapan, dengan kewajiban menyampaikan laporan evaluasi diri berkala kepada lembaga akreditasi selama masa tersebut.',
			},
		],
	},
];

/**
 * Petikan cadangan untuk berkas yang namanya tidak cocok satu kelompok pun.
 *
 * Sengaja bernada umum: menebak isi berkas yang tidak dikenali lalu menuliskan
 * angka yang meyakinkan justru jenis karangan yang paling berbahaya di produk
 * ini — pembacanya tidak punya cara membedakannya dari kutipan sungguhan.
 */
const PETIKAN_CADANGAN: Petikan[] = [
	{
		judulBagian: null,
		teks: 'Bagian ini menguraikan latar belakang penyusunan dokumen beserta dasar hukum dan ruang lingkup penerapannya pada unit pengelola program studi.',
	},
	{
		judulBagian: null,
		teks: 'Uraian dilanjutkan dengan mekanisme pelaksanaan, pihak yang bertanggung jawab pada setiap tahap, serta dokumen pendukung yang wajib disiapkan.',
	},
	{
		judulBagian: null,
		teks: 'Bagian penutup memuat ketentuan peralihan dan tanggal mulai berlakunya, beserta rujukan ke lampiran yang menjadi bagian tidak terpisahkan.',
	},
];

/** Nama berkas jadi arus token berspasi, diapit spasi supaya cocoknya di batas kata. */
function normalkan(nama: string): string {
	return ` ${nama
		.replace(/\.[a-z0-9]+$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()} `;
}

function pilihPustaka(namaDokumen: string): Petikan[] {
	const nama = normalkan(namaDokumen);
	const cocok = PUSTAKA_PETIKAN.find((kelompok) =>
		kelompok.kunci.some((kunci) => nama.includes(normalkan(kunci))),
	);
	return cocok?.petikan ?? PETIKAN_CADANGAN;
}

/** Berkas gambar tidak berhalaman; kutipannya keterangan, bukan petikan teks. */
function berupaGambar(tipeFile: string): boolean {
	return ['jpg', 'jpeg', 'png'].includes(tipeFile.toLowerCase());
}

/**
 * Kutipan yang dipakai satu bukti dukung untuk satu bab.
 *
 * **Deterministik**, bukan acak, dengan alasan yang sama seperti seluruh mock
 * lain di repo ini: dokumen yang sama pada bab yang sama harus memberi kutipan
 * yang sama setiap kali dibuka, kalau tidak jejak ketertelusurannya berbohong.
 *
 * Benihnya memuat `urutanBab`, jadi satu berkas yang dipakai beberapa bab
 * menyumbang kutipan yang berbeda-beda di tiap bab — persis seperti retrieval
 * sungguhan, yang mencari bagian paling relevan dengan bab yang sedang disusun.
 */
export function kutipanUntukBukti({
	urutanBab,
	ref,
}: {
	urutanBab: number;
	ref: BuktiDukungRef;
}): KutipanChunk[] {
	const benih = sidikJari(`${urutanBab}-${ref.id}-${ref.namaDokumen}`);
	const pustaka = pilihPustaka(ref.namaDokumen);
	const gambar = berupaGambar(ref.tipeFile);

	// Gambar hanya menyumbang satu keterangan; berkas teks 2–4 petikan, cukup
	// untuk memperlihatkan bahwa satu berkas memang dipakai lebih dari sepotong
	// tanpa membuat lacinya jadi bacaan panjang.
	const jumlah = gambar ? 1 : Math.min(pustaka.length, (benih % 3) + 2);

	// Halaman menaik monoton: kutipan yang melompat-lompat mundur akan terbaca
	// seperti kesalahan, padahal retrieval memang mengembalikannya berurutan.
	let halaman = (benih % 9) + 2;

	return Array.from({ length: jumlah }, (_, urutan) => {
		const petikan = pustaka[(benih + urutan * 7) % pustaka.length];
		const panjangHalaman = petikan.teks.length > 220 ? 1 : 0;
		const mulai = halaman;
		// `>>>`, bukan `>>`: `sidikJari` mengembalikan uint32, dan geser bertanda
		// membuat nilai di atas 2^31 jadi negatif — halamannya akan mundur, bukan
		// maju, dan kutipannya terbaca seperti salah urut.
		halaman += panjangHalaman + 1 + ((benih >>> (urutan + 1)) % 4);

		return {
			id: `chunk-bukti-${ref.id}-${String(urutan + 1).padStart(2, '0')}`,
			kutipan: petikan.teks,
			halamanMulai: gambar ? 1 : mulai,
			halamanSelesai: gambar ? 1 : mulai + panjangHalaman,
			judulBagian: gambar ? 'Keterangan berkas' : petikan.judulBagian,
		};
	});
}
