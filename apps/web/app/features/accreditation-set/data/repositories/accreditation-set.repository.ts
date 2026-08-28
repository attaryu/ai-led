import {
	type AccreditationSetDocument,
	type AccreditationSetEntity,
	type SetDocumentType,
	type SetStatus,
} from '../../domain/entities/accreditation-set.entity';
import { type CreateAccreditationSetDto } from '../../domain/dtos/create-accreditation-set.dto';
import { type UpdateAccreditationSetDto } from '../../domain/dtos/update-accreditation-set.dto';
import { accreditationSetLocalSource } from '../sources/local/accreditation-set-local.source';

const initialSets: AccreditationSetEntity[] = [
	{
		id: '1',
		nama: 'LAM-Teknik 2026',
		lembaga: 'LAM Teknik',
		tahunSiklus: 2026,
		status: 'SIAP',
		dokumen: [
			{
				tipe: 'DOKUMEN_RUBRIK',
				namaBerkas: 'Rubrik Penilaian LAM Teknik 2026.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 2_412_544,
				diunggahPada: '2026-08-02T09:12:00.000Z',
				diunggahOleh: 'Siti Penjamin Mutu',
			},
			{
				tipe: 'PANDUAN_LAM',
				namaBerkas: 'Panduan Penyusunan LED 2026.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 5_118_976,
				diunggahPada: '2026-08-02T09:20:00.000Z',
				diunggahOleh: 'Siti Penjamin Mutu',
			},
			{
				tipe: 'TEMPLATE_LKPS',
				namaBerkas: 'Template LKPS 2026.docx',
				tipeBerkas: 'docx',
				ukuranBytes: 743_424,
				diunggahPada: '2026-08-02T09:24:00.000Z',
				diunggahOleh: 'Siti Penjamin Mutu',
			},
		],
		createdAt: '2026-08-02T09:00:00.000Z',
	},
	{
		// Sengaja belum lengkap dan masih draf, supaya kedua keadaan itu ada
		// wujudnya di layar tanpa perlu menyiapkan data sendiri.
		id: '2',
		nama: 'LAM-Infokom 2025',
		lembaga: 'LAM Infokom',
		tahunSiklus: 2025,
		status: 'DRAF',
		dokumen: [
			{
				tipe: 'DOKUMEN_RUBRIK',
				namaBerkas: 'Rubrik LAM Infokom 2025.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 1_884_160,
				diunggahPada: '2026-08-19T14:05:00.000Z',
				diunggahOleh: 'Siti Penjamin Mutu',
			},
		],
		createdAt: '2026-08-19T14:00:00.000Z',
	},
];

/**
 * Mengisi field yang belum ada pada baris lama di localStorage — alasan dan
 * pola sama dengan `normalize` di `study-program.repository.ts`.
 */
function normalize(set: Partial<AccreditationSetEntity>): AccreditationSetEntity {
	return {
		id: set.id ?? '',
		nama: set.nama ?? '',
		lembaga: set.lembaga ?? 'Belum diisi',
		tahunSiklus: set.tahunSiklus ?? new Date().getFullYear(),
		status: (set.status as SetStatus | undefined) ?? 'DRAF',
		dokumen: set.dokumen ?? [],
		createdAt: set.createdAt ?? new Date().toISOString(),
	};
}

function read(): AccreditationSetEntity[] {
	const raw = accreditationSetLocalSource.getAll();

	if (!raw) {
		accreditationSetLocalSource.setAll(JSON.stringify(initialSets));
		return initialSets;
	}

	return (JSON.parse(raw) as Partial<AccreditationSetEntity>[]).map(normalize);
}

function write(sets: AccreditationSetEntity[]): void {
	accreditationSetLocalSource.setAll(JSON.stringify(sets));
	window.dispatchEvent(new Event('storage-update'));
}

/**
 * Jeda tiruan untuk unggah berkas. Bukan hiasan: ini menempati posisi yang
 * nanti diisi PUT ke penyimpanan objek, sehingga keadaan "sedang mengunggah"
 * di layar sudah punya wujud sejak sekarang dan tidak perlu ditambahkan
 * belakangan saat jalur aslinya masuk.
 */
function simulateUpload(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 700));
}

function extensionOf(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Satu-satunya titik yang tahu dari mana data set berasal. Ketika endpoint
 * backend-nya lahir, hanya isi fungsi-fungsi di berkas ini yang berubah —
 * seluruh halaman tetap memanggil nama yang sama dengan bentuk yang sama.
 *
 * Sengaja `async` walau sumbernya localStorage yang sinkron, mengikuti bentuk
 * repository yang dipakai di branch integrasi, supaya pemanggilnya tidak perlu
 * diubah saat sumbernya ditukar.
 */
export const accreditationSetRepository = {
	async findAll(): Promise<AccreditationSetEntity[]> {
		return read();
	},

	async findById(id: string): Promise<AccreditationSetEntity | undefined> {
		return read().find((set) => set.id === id);
	},

	async create(input: CreateAccreditationSetDto): Promise<AccreditationSetEntity> {
		const sets = read();
		const created: AccreditationSetEntity = {
			id: crypto.randomUUID(),
			nama: input.nama,
			lembaga: input.lembaga,
			tahunSiklus: input.tahunSiklus,
			status: 'DRAF',
			dokumen: [],
			createdAt: new Date().toISOString(),
		};

		write([...sets, created]);
		return created;
	},

	async update(
		id: string,
		input: UpdateAccreditationSetDto,
	): Promise<AccreditationSetEntity> {
		const sets = read();
		const target = sets.find((set) => set.id === id);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');

		const updated: AccreditationSetEntity = { ...target, ...input };
		write(sets.map((set) => (set.id === id ? updated : set)));
		return updated;
	},

	async delete(id: string): Promise<void> {
		write(read().filter((set) => set.id !== id));
	},

	/**
	 * Mengisi satu slot berkas. Slot yang sudah terisi langsung ditimpa — dari
	 * sudut pandang pengguna itulah arti "ganti berkas", dan menyimpan dua
	 * berkas pada satu slot tidak punya makna.
	 */
	async attachDocument(
		id: string,
		tipe: SetDocumentType,
		file: File,
		diunggahOleh: string,
	): Promise<AccreditationSetEntity> {
		await simulateUpload();

		const sets = read();
		const target = sets.find((set) => set.id === id);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');

		const dokumen: AccreditationSetDocument = {
			tipe,
			namaBerkas: file.name,
			tipeBerkas: extensionOf(file.name),
			ukuranBytes: file.size,
			diunggahPada: new Date().toISOString(),
			diunggahOleh,
		};

		const updated: AccreditationSetEntity = {
			...target,
			dokumen: [...target.dokumen.filter((d) => d.tipe !== tipe), dokumen],
		};

		write(sets.map((set) => (set.id === id ? updated : set)));
		return updated;
	},

	async removeDocument(
		id: string,
		tipe: SetDocumentType,
	): Promise<AccreditationSetEntity> {
		const sets = read();
		const target = sets.find((set) => set.id === id);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');

		const updated: AccreditationSetEntity = {
			...target,
			dokumen: target.dokumen.filter((d) => d.tipe !== tipe),
		};

		write(sets.map((set) => (set.id === id ? updated : set)));
		return updated;
	},
};
