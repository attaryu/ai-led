import {
	getEvidenceExtension,
	type EvidenceEntity,
	type EvidenceStatus,
} from '../../domain/entities/evidence.entity';
import {
	type EvidencePage,
	type EvidenceQueryDto,
} from '../../domain/dtos/evidence-query.dto';
import { type UploadEvidenceTargetDto } from '../../domain/dtos/upload-evidence.dto';
import { evidenceLocalSource } from '../sources/local/evidence-local.source';
import {
	reportUploadComplete,
	requestPresignedUrl,
	shouldFailIngestion,
	uploadToStorage,
} from '../sources/remote/evidence-upload.mock';

/** Tenant tunggal selama autentikasi belum terhubung ke backend. */
const CURRENT_TENANT_ID = '1';

/** Jeda tiap tahap pipeline ekstraksi tiruan (PRD §3.3). */
const INGESTION_QUEUE_MS = 3000;
const INGESTION_PROCESS_MS = 5000;

const initialEvidences: EvidenceEntity[] = [
	{
		id: 'ev-01',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Statuta_Universitas_2024.pdf',
		fileUrl: 'tenant/statuta-universitas-2024.pdf',
		tipeFile: 'pdf',
		ukuranBytes: 2_411_520,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '2',
		uploadedByName: 'Budi Pimpinan',
		waktuDiunggah: '2026-07-20T02:10:00.000Z',
	},
	{
		id: 'ev-02',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Renstra_Universitas_2025_2030.pdf',
		fileUrl: 'tenant/renstra-universitas-2025-2030.pdf',
		tipeFile: 'pdf',
		ukuranBytes: 5_872_026,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '2',
		uploadedByName: 'Budi Pimpinan',
		waktuDiunggah: '2026-07-20T03:40:00.000Z',
	},
	{
		id: 'ev-03',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'SK_Rektor_Penjaminan_Mutu.pdf',
		fileUrl: 'tenant/sk-rektor-penjaminan-mutu.pdf',
		tipeFile: 'pdf',
		ukuranBytes: 845_312,
		status: 'DIPROSES',
		catatanGagal: null,
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-28T01:05:00.000Z',
	},
	{
		id: 'ev-04',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Pedoman_Akademik_Universitas.docx',
		fileUrl: 'tenant/pedoman-akademik-universitas.docx',
		tipeFile: 'docx',
		ukuranBytes: 1_258_291,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-22T07:15:00.000Z',
	},
	{
		id: 'ev-05',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Laporan_Keuangan_Universitas_2025.xlsx',
		fileUrl: 'tenant/laporan-keuangan-universitas-2025.xlsx',
		tipeFile: 'xlsx',
		ukuranBytes: 3_355_443,
		status: 'GAGAL',
		catatanGagal: 'Berkas terkunci kata sandi sehingga isinya tidak terbaca.',
		uploadedByUserId: '2',
		uploadedByName: 'Budi Pimpinan',
		waktuDiunggah: '2026-07-25T04:20:00.000Z',
	},
	{
		id: 'ev-06',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Sertifikat_Akreditasi_Institusi.jpg',
		fileUrl: 'tenant/sertifikat-akreditasi-institusi.jpg',
		tipeFile: 'jpg',
		ukuranBytes: 1_887_437,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '2',
		uploadedByName: 'Budi Pimpinan',
		waktuDiunggah: '2026-07-18T08:00:00.000Z',
	},
	{
		id: 'ev-07',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Kebijakan_SPMI_Universitas.pdf',
		fileUrl: 'tenant/kebijakan-spmi-universitas.pdf',
		tipeFile: 'pdf',
		ukuranBytes: 967_680,
		status: 'MENUNGGU',
		catatanGagal: null,
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-29T02:45:00.000Z',
	},
	{
		id: 'ev-08',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Struktur_Organisasi_Universitas.png',
		fileUrl: 'tenant/struktur-organisasi-universitas.png',
		tipeFile: 'png',
		ukuranBytes: 512_000,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '2',
		uploadedByName: 'Budi Pimpinan',
		waktuDiunggah: '2026-07-19T06:30:00.000Z',
	},
	{
		id: 'ev-09',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Rekap_Kerja_Sama_Industri.xlsx',
		fileUrl: 'tenant/rekap-kerja-sama-industri.xlsx',
		tipeFile: 'xlsx',
		ukuranBytes: 2_097_152,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-27T09:10:00.000Z',
	},
	{
		id: 'ev-10',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Notulen_Rapat_Senat_Juli.docx',
		fileUrl: 'tenant/notulen-rapat-senat-juli.docx',
		tipeFile: 'docx',
		ukuranBytes: 331_776,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '2',
		uploadedByName: 'Budi Pimpinan',
		waktuDiunggah: '2026-07-26T01:55:00.000Z',
	},
	{
		id: 'ev-11',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		studyProgramName: null,
		namaDokumen: 'Panduan_Tracer_Study.pdf',
		fileUrl: 'tenant/panduan-tracer-study.pdf',
		tipeFile: 'pdf',
		ukuranBytes: 1_468_006,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-21T03:25:00.000Z',
	},
	{
		id: 'ev-12',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		namaDokumen: 'LKPS_Teknik_Informatika_2026.xlsx',
		fileUrl: 'program-studi/1/lkps-teknik-informatika-2026.xlsx',
		tipeFile: 'xlsx',
		ukuranBytes: 4_299_161,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '4',
		uploadedByName: 'Dewi Penyusun',
		waktuDiunggah: '2026-07-28T04:00:00.000Z',
	},
	{
		id: 'ev-13',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		namaDokumen: 'SK_Kurikulum_Prodi_TI.pdf',
		fileUrl: 'program-studi/1/sk-kurikulum-prodi-ti.pdf',
		tipeFile: 'pdf',
		ukuranBytes: 723_968,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '4',
		uploadedByName: 'Dewi Penyusun',
		waktuDiunggah: '2026-07-27T02:30:00.000Z',
	},
	{
		id: 'ev-14',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		namaDokumen: 'Daftar_Publikasi_Dosen_TI.xlsx',
		fileUrl: 'program-studi/1/daftar-publikasi-dosen-ti.xlsx',
		tipeFile: 'xlsx',
		ukuranBytes: 1_153_434,
		status: 'GAGAL',
		catatanGagal: 'Ekstraksi gagal: format tabel tidak dikenali.',
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-29T06:45:00.000Z',
	},
	{
		id: 'ev-15',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		namaDokumen: 'Foto_Laboratorium_Jaringan.jpg',
		fileUrl: 'program-studi/1/foto-laboratorium-jaringan.jpg',
		tipeFile: 'jpg',
		ukuranBytes: 2_936_012,
		status: 'DIPROSES',
		catatanGagal: null,
		uploadedByUserId: '4',
		uploadedByName: 'Dewi Penyusun',
		waktuDiunggah: '2026-07-30T01:20:00.000Z',
	},
	{
		id: 'ev-16',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '2',
		studyProgramName: 'Sistem Informasi',
		namaDokumen: 'LKPS_Sistem_Informasi_2026.xlsx',
		fileUrl: 'program-studi/2/lkps-sistem-informasi-2026.xlsx',
		tipeFile: 'xlsx',
		ukuranBytes: 3_984_589,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-26T07:05:00.000Z',
	},
	{
		id: 'ev-17',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '2',
		studyProgramName: 'Sistem Informasi',
		namaDokumen: 'Laporan_Kegiatan_Himpunan_SI.docx',
		fileUrl: 'program-studi/2/laporan-kegiatan-himpunan-si.docx',
		tipeFile: 'docx',
		ukuranBytes: 655_360,
		status: 'MENUNGGU',
		catatanGagal: null,
		uploadedByUserId: '2',
		uploadedByName: 'Budi Pimpinan',
		waktuDiunggah: '2026-07-30T03:15:00.000Z',
	},
	{
		id: 'ev-18',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '3',
		studyProgramName: 'Teknik Elektro',
		namaDokumen: 'SK_Dosen_Pembimbing_TA_Elektro.pdf',
		fileUrl: 'program-studi/3/sk-dosen-pembimbing-ta-elektro.pdf',
		tipeFile: 'pdf',
		ukuranBytes: 489_472,
		status: 'SIAP',
		catatanGagal: null,
		uploadedByUserId: '3',
		uploadedByName: 'Citra Penjamin Mutu',
		waktuDiunggah: '2026-07-24T05:50:00.000Z',
	},
];

/** Nilai urut yang dipakai kolom `status` supaya urutannya bermakna, bukan A-Z. */
const statusOrder: Record<EvidenceStatus, number> = {
	MENUNGGU: 0,
	DIPROSES: 1,
	SIAP: 2,
	GAGAL: 3,
};

function compare(a: EvidenceEntity, b: EvidenceEntity, sort: string): number {
	switch (sort) {
		case 'ukuranBytes':
			return a.ukuranBytes - b.ukuranBytes;
		case 'status':
			return statusOrder[a.status] - statusOrder[b.status];
		case 'waktuDiunggah':
			return a.waktuDiunggah.localeCompare(b.waktuDiunggah);
		case 'tipeFile':
			return a.tipeFile.localeCompare(b.tipeFile);
		case 'uploadedByName':
			return a.uploadedByName.localeCompare(b.uploadedByName);
		case 'studyProgramName':
			return (a.studyProgramName ?? '').localeCompare(b.studyProgramName ?? '');
		default:
			return a.namaDokumen.localeCompare(b.namaDokumen, 'id');
	}
}

export const evidenceRepository = {
	findAll(): EvidenceEntity[] {
		const stored = evidenceLocalSource.getAll();
		if (!stored) {
			this.save(initialEvidences);
			return initialEvidences;
		}
		try {
			return JSON.parse(stored);
		} catch {
			this.save(initialEvidences);
			return initialEvidences;
		}
	},

	save(evidences: EvidenceEntity[]): void {
		evidenceLocalSource.setAll(JSON.stringify(evidences));
	},

	/**
	 * Memberi tahu seluruh daftar yang sedang terpasang bahwa data berubah.
	 * Memakai event yang sama dengan fitur lain supaya polanya seragam.
	 */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/**
	 * Penyaringan, pencarian, pengurutan, dan pemotongan halaman semuanya di
	 * sini — bukan di halaman — supaya saat pindah ke API ia tinggal berubah
	 * jadi query string tanpa menyentuh lapis presentasi.
	 */
	findPaged(query: EvidenceQueryDto): EvidencePage {
		const all = this.findAll();

		const scoped = all.filter((evidence) => {
			if (evidence.ownerTipe !== query.ownerTipe) return false;
			if (query.ownerTipe === 'TENANT') {
				return evidence.tenantId === (query.tenantId ?? CURRENT_TENANT_ID);
			}
			return evidence.studyProgramId === query.studyProgramId;
		});

		const keyword = query.q?.trim().toLowerCase() ?? '';
		const filtered = keyword
			? scoped.filter(
					(evidence) =>
						evidence.namaDokumen.toLowerCase().includes(keyword) ||
						evidence.uploadedByName.toLowerCase().includes(keyword) ||
						evidence.tipeFile.toLowerCase().includes(keyword),
				)
			: scoped;

		// Tanpa pilihan urutan, yang terbaru di atas — kebiasaan umum daftar berkas.
		const sortKey = query.sort ?? 'waktuDiunggah';
		const descending = query.sort ? query.dir === 'desc' : true;
		const sorted = [...filtered].sort((a, b) => {
			const result = compare(a, b, sortKey);
			return descending ? -result : result;
		});

		const start = (query.page - 1) * query.limit;
		return {
			items: sorted.slice(start, start + query.limit),
			total: sorted.length,
		};
	},

	findById(id: string): EvidenceEntity | undefined {
		return this.findAll().find((evidence) => evidence.id === id);
	},

	/**
	 * Seluruh bukti dukung yang bisa dipakai satu prodi: miliknya sendiri
	 * ditambah bukti level tenant yang berlaku lintas prodi
	 * (docs/application_flow.md §5.2).
	 */
	findAvailableForStudyProgram(studyProgramId: string): EvidenceEntity[] {
		return this.findAll().filter(
			(evidence) =>
				evidence.ownerTipe === 'TENANT' ||
				evidence.studyProgramId === studyProgramId,
		);
	},

	/**
	 * Bukti dukung **milik** satu prodi saja, tanpa berkas level tenant.
	 *
	 * Sengaja dipisah dari {@link findAvailableForStudyProgram}: yang ini
	 * menjawab "apa isi perpustakaan prodi ini" sehingga angkanya cocok dengan
	 * daftar di `/study-programs/:id/evidence` (§5.2), sedangkan yang satunya
	 * menjawab "apa yang boleh dipakai babnya" dan wajar ikut menghitung berkas
	 * universitas.
	 */
	findOwnedByStudyProgram(studyProgramId: string): EvidenceEntity[] {
		return this.findAll().filter(
			(evidence) =>
				evidence.ownerTipe === 'PROGRAM_STUDI' &&
				evidence.studyProgramId === studyProgramId,
		);
	},

	create(evidence: EvidenceEntity): void {
		this.save([evidence, ...this.findAll()]);
		this.notify();
	},

	updateStatus(
		id: string,
		status: EvidenceStatus,
		catatanGagal: string | null = null,
	): void {
		const all = this.findAll();
		// Berkas bisa saja sudah dihapus saat timer ingestion masih berjalan.
		if (!all.some((evidence) => evidence.id === id)) return;

		this.save(
			all.map((evidence) =>
				evidence.id === id ? { ...evidence, status, catatanGagal } : evidence,
			),
		);
		this.notify();
	},

	delete(id: string): void {
		this.save(this.findAll().filter((evidence) => evidence.id !== id));
		this.notify();
	},

	/**
	 * Tiruan antrean ekstraksi di sisi backend: MENUNGGU → DIPROSES → SIAP|GAGAL.
	 * Dijalankan lewat timer, jadi status ikut berubah di layar tanpa muat ulang.
	 */
	startIngestion(id: string): void {
		setTimeout(() => {
			this.updateStatus(id, 'DIPROSES');

			setTimeout(() => {
				if (shouldFailIngestion()) {
					this.updateStatus(
						id,
						'GAGAL',
						'Ekstraksi teks gagal. Berkas mungkin hasil pindai berkualitas rendah.',
					);
				} else {
					this.updateStatus(id, 'SIAP');
				}
			}, INGESTION_PROCESS_MS);
		}, INGESTION_QUEUE_MS);
	},

	retryIngestion(id: string): void {
		this.updateStatus(id, 'MENUNGGU');
		this.startIngestion(id);
	},

	/**
	 * Satu berkas, dari minta presigned URL sampai barisnya tercatat dan masuk
	 * antrean ingestion. Melempar `EvidenceUploadError` bila gagal di tengah —
	 * pemanggil (store unggah) yang menampilkan dan menyediakan coba lagi.
	 */
	async upload({
		file,
		target,
		uploadedByUserId,
		uploadedByName,
		studyProgramName,
		onProgress,
	}: {
		file: File;
		target: UploadEvidenceTargetDto;
		uploadedByUserId: string;
		uploadedByName: string;
		studyProgramName: string | null;
		onProgress: (percent: number) => void;
	}): Promise<EvidenceEntity> {
		const tipeFile = getEvidenceExtension(file.name);
		const presignRequest = {
			namaDokumen: file.name,
			tipeFile,
			ukuranBytes: file.size,
			target,
		};

		const presigned = await requestPresignedUrl(presignRequest);
		await uploadToStorage(file, presigned.uploadUrl, onProgress);
		const reported = await reportUploadComplete({
			...presignRequest,
			objectKey: presigned.objectKey,
		});

		const evidence: EvidenceEntity = {
			id: reported.id,
			ownerTipe: target.ownerTipe,
			tenantId: target.ownerTipe === 'TENANT' ? CURRENT_TENANT_ID : null,
			studyProgramId:
				target.ownerTipe === 'PROGRAM_STUDI' ? target.studyProgramId : null,
			studyProgramName:
				target.ownerTipe === 'PROGRAM_STUDI' ? studyProgramName : null,
			namaDokumen: file.name,
			fileUrl: reported.fileUrl,
			tipeFile,
			ukuranBytes: file.size,
			status: 'MENUNGGU',
			catatanGagal: null,
			uploadedByUserId,
			uploadedByName,
			waktuDiunggah: reported.waktuDiunggah,
		};

		this.create(evidence);
		this.startIngestion(evidence.id);

		return evidence;
	},
};
