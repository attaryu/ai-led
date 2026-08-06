import {
	type ChapterDraftEntity,
	type ChapterDraftSumber,
} from '../../domain/entities/chapter-draft.entity';
import { chapterDraftLocalSource } from '../sources/local/chapter-draft-local.source';

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Checkpoint contoh untuk bab-bab yang di `SEED_STATE` (chapter.repository.ts)
 * sudah terisi.
 *
 * Ada supaya tab Draft — tab yang **terbuka pertama kali** saat editor dibuka —
 * tidak selalu tampak kosong saat aplikasi baru dijalankan. Sengaja dibuat
 * beragam: berlabel dan tanpa label, `MANUAL` dan `AI`, dibuat oleh dua orang
 * berbeda, supaya tiap cabang tampilannya terlihat tanpa perlu menyiapkan data
 * sendiri. `buktiDukungIds`-nya mengikuti seed bab masing-masing.
 */
const initialDrafts: ChapterDraftEntity[] = [
	{
		id: 'draft-1-1-1',
		chapterId: 'bab-1-1',
		versi: 1,
		label: 'Kerangka awal sebelum data LKPS masuk',
		kontenSnapshot:
			'<p>Kerangka Pendahuluan yang disusun sebelum data LKPS tersedia.</p>',
		sumber: 'MANUAL',
		buktiDukungIds: ['ev-01'],
		referensiChunkIds: [],
		dibuatOlehUserId: '2',
		dibuatOlehNama: 'Siti Rahmawati',
		dibuatPada: daysAgo(9),
	},
	{
		id: 'draft-1-1-2',
		chapterId: 'bab-1-1',
		versi: 2,
		label: null,
		kontenSnapshot:
			'<p>Pendahuluan hasil generate pertama, disusun dari dua bukti dukung tingkat universitas.</p>',
		sumber: 'AI',
		buktiDukungIds: ['ev-01', 'ev-02'],
		referensiChunkIds: ['chunk-panduan-1-02', 'chunk-bukti-ev-01-07'],
		dibuatOlehUserId: '2',
		dibuatOlehNama: 'Siti Rahmawati',
		dibuatPada: daysAgo(4),
	},
	{
		id: 'draft-1-1-3',
		chapterId: 'bab-1-1',
		versi: 3,
		label: 'Sebelum revisi Penjamin Mutu',
		kontenSnapshot:
			'<p>Pendahuluan sesudah disunting tangan, diamankan sebelum masuk review.</p>',
		sumber: 'MANUAL',
		buktiDukungIds: ['ev-01', 'ev-02'],
		referensiChunkIds: [],
		dibuatOlehUserId: '1',
		dibuatOlehNama: 'Ahmad Fauzi',
		dibuatPada: daysAgo(1),
	},
	{
		id: 'draft-1-4-1',
		chapterId: 'bab-1-4',
		versi: 1,
		label: null,
		kontenSnapshot:
			'<p>Draf awal bagian ini, dihasilkan dari bukti dukung universitas dan prodi.</p>',
		sumber: 'AI',
		buktiDukungIds: ['ev-01', 'ev-12'],
		referensiChunkIds: ['chunk-panduan-4-01'],
		dibuatOlehUserId: '2',
		dibuatOlehNama: 'Siti Rahmawati',
		dibuatPada: daysAgo(6),
	},
	{
		id: 'draft-2-3-1',
		chapterId: 'bab-2-3',
		versi: 1,
		label: 'Versi yang disetujui rapat prodi',
		kontenSnapshot: '<p>Bagian ini sudah dibahas dan disetujui di rapat prodi.</p>',
		sumber: 'MANUAL',
		buktiDukungIds: ['ev-16'],
		referensiChunkIds: [],
		dibuatOlehUserId: '1',
		dibuatOlehNama: 'Ahmad Fauzi',
		dibuatPada: daysAgo(12),
	},
];

export const chapterDraftRepository = {
	findAll(): ChapterDraftEntity[] {
		const stored = chapterDraftLocalSource.getAll();
		if (!stored) {
			this.save(initialDrafts);
			return initialDrafts;
		}
		try {
			return JSON.parse(stored);
		} catch {
			this.save(initialDrafts);
			return initialDrafts;
		}
	},

	save(drafts: ChapterDraftEntity[]): void {
		chapterDraftLocalSource.setAll(JSON.stringify(drafts));
	},

	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/** Riwayat satu bab, `versi` terbesar di atas (§8.1). */
	findByChapterId(chapterId: string): ChapterDraftEntity[] {
		return this.findAll()
			.filter((draft) => draft.chapterId === chapterId)
			.sort((a, b) => b.versi - a.versi);
	},

	/**
	 * Membuat checkpoint baru.
	 *
	 * `versi` dihitung di sini, **tidak pernah diterima dari pemanggil**: nomor
	 * urut yang boleh ditentukan dari luar cepat atau lambat akan bertabrakan
	 * karena dua pemanggil membaca daftar yang sama sebelum salah satunya menulis.
	 *
	 * Tidak ada pasangan `update`, dan tidak ada pula jalan menghapus **satu**
	 * checkpoint. Itu disengaja: §8.1 melarang penghapusan karena checkpoint
	 * adalah jejak audit akreditasi, dan `kontenSnapshot` menurut
	 * docs/database.md "tidak pernah berubah" sesudah dibuat. Ketiadaan methodnya
	 * adalah penegakan aturan itu — jangan dilengkapi tanpa mengubah kedua pasal
	 * tersebut lebih dulu.
	 */
	create(input: {
		chapterId: string;
		label: string | null;
		kontenSnapshot: string;
		sumber: ChapterDraftSumber;
		buktiDukungIds: string[];
		referensiChunkIds: string[];
		dibuatOlehUserId: string;
		dibuatOlehNama: string;
	}): ChapterDraftEntity {
		const all = this.findAll();
		const versiTerakhir = all
			.filter((draft) => draft.chapterId === input.chapterId)
			.reduce((tertinggi, draft) => Math.max(tertinggi, draft.versi), 0);

		const dibuat: ChapterDraftEntity = {
			...input,
			id: `draft-${input.chapterId}-${versiTerakhir + 1}-${Date.now()}`,
			versi: versiTerakhir + 1,
			dibuatPada: new Date().toISOString(),
		};

		this.save([...all, dibuat]);
		this.notify();
		return dibuat;
	},

	/**
	 * Pembersihan berantai saat **seluruh Dokumen LED** dihapus — bukan pintu
	 * belakang untuk larangan §8.1 di atas.
	 *
	 * Bedanya bukan permainan kata: yang dilarang §8.1 adalah membuang satu
	 * checkpoint sementara dokumennya masih hidup dan masih merujuknya. Begitu
	 * dokumennya sendiri tidak ada, tidak ada lagi yang bisa dirujuk, dan
	 * meninggalkan barisnya hanya membuat sampah di penyimpanan. Alasan yang sama
	 * dipakai `chapterRepository.deleteByProjectId` terhadap babnya.
	 */
	deleteByChapterIds(chapterIds: string[]): void {
		const dibuang = new Set(chapterIds);
		this.save(this.findAll().filter((draft) => !dibuang.has(draft.chapterId)));
	},
};
