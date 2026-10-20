import * as React from 'react';

import { chapterIndicatorRemoteSource } from '../../data/sources/remote/chapter-indicator.remote-source';
import {
	aturCentang,
	jumlahDipilih,
	susunPayload,
	type HasilIkuSetor,
	type IkuPayload,
	type IndikatorSection,
	type PilihanSection,
	type SkorIndikator,
} from '../../domain/entities/indicator-assessment.entity';

const JEDA_POLLING_MS = 2000;
const BATAS_TUNGGU_MS = 15 * 60 * 1000;

export type HasilPenilaian = { sectionId: string; ikuList: IkuPayload[]; hasil: HasilIkuSetor[] };

export type PenilaianIndikator = ReturnType<typeof useIndicatorAssessment>;

/**
 * Penilaian Indikator untuk SATU section aktif: daftar indikator yang
 * dipetakan ke section itu, pilihan centang + skor per section (bertahan
 * selama sesi editing, tidak bocor antar section), dan menjalankan job
 * Setor ke LED sampai hasilnya siap.
 *
 * Hook ini tidak menyentuh editor — hasilnya dikembalikan, dan halaman editor
 * yang menyisipkannya sebagai tabel Tiptap. Status job dibaca dengan polling
 * `GET /jobs/:id` (bukan SSE) sesuai docs/setor-led-api.md §2: klien yang
 * menyambung SSE setelah job selesai tidak menerima event `completed`.
 */
export function useIndicatorAssessment({
	babId,
	dokumenId,
	sectionId,
	bisaEdit,
}: {
	babId: string;
	dokumenId: string;
	sectionId: string | null;
	bisaEdit: boolean;
}) {
	const [indikatorPerSection, setIndikatorPerSection] = React.useState<Record<string, IndikatorSection[]>>({});
	const [pilihanPerSection, setPilihanPerSection] = React.useState<Record<string, PilihanSection>>({});
	const [tanpaSkorIds, setTanpaSkorIds] = React.useState<string[]>([]);
	const [berjalan, setBerjalan] = React.useState(false);
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);
	const [progres, setProgres] = React.useState<{ completed: number; total: number } | null>(null);

	const sectionIdRef = React.useRef(sectionId);
	sectionIdRef.current = sectionId;
	const terpasang = React.useRef(true);
	React.useEffect(() => {
		terpasang.current = true;
		return () => {
			terpasang.current = false;
		};
	}, []);

	React.useEffect(() => {
		setTanpaSkorIds([]);
		setPesanGagal(null);
		if (!sectionId || indikatorPerSection[sectionId]) return;
		let batal = false;
		chapterIndicatorRemoteSource
			.findIndikator(babId, sectionId)
			.then((daftar) => {
				if (!batal) setIndikatorPerSection((lama) => ({ ...lama, [sectionId]: daftar }));
			})
			.catch(() => {
				// Gagal memuat = tidak ada panel; tidak diulang, dicoba lagi saat section dibuka kembali.
			});
		return () => {
			batal = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- cache per section; hanya section/bab yang memicu muat
	}, [babId, sectionId]);

	const indikator = (sectionId && indikatorPerSection[sectionId]) || [];
	const pilihan: PilihanSection = (sectionId && pilihanPerSection[sectionId]) || {};
	const dipilih = jumlahDipilih(pilihan);

	const ubah = React.useCallback(
		(id: string, perubahan: (lama: { dipilih: boolean; skor: SkorIndikator | null }) => { dipilih: boolean; skor: SkorIndikator | null }) => {
			if (!sectionId) return;
			setPilihanPerSection((lama) => {
				const bagian = lama[sectionId] ?? {};
				return { ...lama, [sectionId]: { ...bagian, [id]: perubahan(bagian[id] ?? { dipilih: false, skor: null }) } };
			});
			setTanpaSkorIds((ids) => ids.filter((x) => x !== id));
		},
		[sectionId],
	);

	const toggle = React.useCallback((id: string, dicentang: boolean) => ubah(id, (p) => aturCentang(p, dicentang)), [ubah]);
	const setSkor = React.useCallback((id: string, skor: SkorIndikator | null) => ubah(id, (p) => ({ ...p, skor })), [ubah]);
	const reset = React.useCallback(() => {
		if (!sectionId) return;
		setPilihanPerSection((lama) => ({ ...lama, [sectionId]: {} }));
		setTanpaSkorIds([]);
		setPesanGagal(null);
	}, [sectionId]);

	/**
	 * Memvalidasi, memulai job, menunggu selesai. `null` = tidak ada hasil yang
	 * boleh disisipkan (validasi gagal, job gagal, atau pengguna pindah section —
	 * alasannya ada di `pesanGagal`); editor tidak tersentuh dalam semua kasus itu.
	 */
	const jalankan = React.useCallback(async (): Promise<HasilPenilaian | null> => {
		if (!sectionId || berjalan) return null;
		const payload = susunPayload(indikator, pilihan);
		if (!payload.ok) {
			setTanpaSkorIds(payload.indikatorTanpaSkor);
			return null;
		}
		if (payload.ikuList.length === 0) return null;

		setBerjalan(true);
		setPesanGagal(null);
		setProgres(null);
		try {
			const { id } = await chapterIndicatorRemoteSource.startSetorLed(dokumenId, payload.ikuList);
			const mulai = Date.now();
			for (;;) {
				await new Promise((r) => setTimeout(r, JEDA_POLLING_MS));
				if (!terpasang.current) return null;
				const job = await chapterIndicatorRemoteSource.getJob(id);
				if (typeof job.progress === 'object' && job.progress) setProgres(job.progress);
				if (job.status === 'FAILED') {
					setPesanGagal(job.error ?? 'Penilaian indikator gagal diselesaikan.');
					return null;
				}
				if (job.status === 'COMPLETED') {
					// `COMPLETED` hanya berarti worker selesai menjalankan fungsinya; hasilnya ada di result.status.
					if (job.result?.status === 'completed') {
						if (sectionIdRef.current !== sectionId) {
							setPesanGagal('Penilaian selesai, tetapi tidak disisipkan karena Anda berpindah section. Jalankan lagi dari section tersebut.');
							return null;
						}
						return { sectionId, ikuList: payload.ikuList, hasil: job.result.hasil ?? [] };
					}
					setPesanGagal(
						job.result?.status === 'cancelled'
							? 'Penilaian indikator dibatalkan.'
							: (job.result?.error ?? 'Penilaian indikator gagal diselesaikan.'),
					);
					return null;
				}
				if (Date.now() - mulai > BATAS_TUNGGU_MS) {
					setPesanGagal('Penilaian indikator terlalu lama. Coba lagi nanti.');
					return null;
				}
			}
		} catch {
			setPesanGagal('Penilaian indikator gagal dijalankan. Periksa koneksi lalu coba lagi.');
			return null;
		} finally {
			if (terpasang.current) setBerjalan(false);
		}
	}, [sectionId, berjalan, indikator, pilihan, dokumenId]);

	return {
		indikator,
		pilihan,
		jumlahDipilih: dipilih,
		tanpaSkorIds,
		berjalan,
		progres,
		pesanGagal,
		bisaEdit,
		toggle,
		setSkor,
		reset,
		jalankan,
		laporkanGagal: setPesanGagal,
	};
}
