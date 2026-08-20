import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import { mapHasilSkor } from '../../data/backend-mappers';
import { mapBabDraft } from '../../data/sources/remote/chapter-draft.remote-source';
import { chapterRemoteSource } from '../../data/sources/remote/chapter.remote-source';
import {
	ringkasSkor,
	type ChapterScoreEntity,
} from '../../domain/entities/chapter-score.entity';
import { type ChapterDraftEntity } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type RubricCriterion } from '../../domain/entities/rubric-criterion.entity';
import { type ChapterPermission } from './use-chapter-permission';

export type StatusSimulasi = 'diam' | 'berjalan' | 'gagal';

/** Bentuk event `GET jobs/:id/events` — sama dengan yang dipakai `use-chapter-generation.ts`. */
type JobEvent = {
	jobId: string;
	status: 'progress' | 'completed' | 'failed';
	result?: { status: 'completed' | 'error'; error?: string };
	error?: string;
};

/**
 * Bab tidak dinilai kriteria rubrik apa pun sengaja tetap array kosong, bukan
 * `undefined` — docs/database.md §10 menyatakan itu keadaan yang sah, bukan
 * kegagalan pemuatan (lihat panelnya).
 */
function mapKriteria(row: {
	id: string;
	kodeKriteria: string;
	deskripsi: string;
	level: { skor: number; deskripsi: string }[];
}): RubricCriterion {
	return {
		id: row.id,
		// Field di bawah ini tidak dipakai `chapter-rubric-panel.tsx` sama sekali
		// (lihat isi accordion-nya) — Postgres `RubrikKriteria` sungguhan tidak
		// punya kolomnya (beda dari data contoh `rubric-criterion.entity.ts`,
		// yang dibuat lebih kaya dari yang pernah dipakai), jadi diisi placeholder
		// yang jujur alih-alih mengarang.
		no: 0,
		kriteria: '',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		kodeKriteria: row.kodeKriteria,
		deskripsi: row.deskripsi,
		levelSkor: row.level,
		urutanBab: [],
	};
}

/**
 * Isi tab Rubrik: kriteria LAM Teknik untuk bab ini, hasil simulasi skornya, dan
 * penjalanan simulasi itu sendiri (docs/application_flow.md §9).
 *
 * Lingkupnya bisa dipilih — kondisi aktif atau salah satu checkpoint — meniru
 * `useChapterReference`. §9.2 sebenarnya menuliskannya sebagai deretan card di
 * kaki tab yang membuka modal; dropdown dipilih supaya pertanyaan yang sama
 * ("lihat milik checkpoint mana") dijawab dengan kontrol yang sama di dua tab
 * bersebelahan.
 *
 * `hasilAktif` dipegang sendiri (bukan langsung dibaca dari `chapter` prop)
 * karena simulasi SIMULASI_SKOR tidak mengubah `kontenKerja` bab — parent
 * (`chapter-editor.tsx`) tidak punya alasan menyegarkan `chapter` untuknya, dan
 * memaksanya begitu hanya untuk satu tab ini menambah pergerakan yang tidak
 * perlu di tempat lain.
 */
export function useChapterScore({
	chapter,
	izin,
	lingkup,
	setLingkup,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
	/**
	 * Diangkat ke halaman editor, bukan dipegang hook ini, supaya menu "Lihat
	 * skor" di tab Draft bisa mengarahkannya (§8.1).
	 */
	lingkup: string;
	setLingkup: (lingkup: string) => void;
}) {
	const [kriteria, setKriteria] = React.useState<RubricCriterion[]>([]);
	const [daftarDraft, setDaftarDraft] = React.useState<ChapterDraftEntity[]>([]);
	/** Hasil per checkpoint, diambil dari `hasilSkorKriteria` mentah tiap `BabDraft`. */
	const [hasilPerDraft, setHasilPerDraft] = React.useState<
		Map<string, ChapterScoreEntity[]>
	>(new Map());
	const [hasilAktif, setHasilAktif] = React.useState<ChapterScoreEntity[]>(
		chapter.hasilSkorKriteriaAktif,
	);
	const [status, setStatus] = React.useState<StatusSimulasi>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const muat = React.useCallback(() => {
		chapterRemoteSource
			.findRubrik(chapter.id)
			.then((rows) => setKriteria(rows.map(mapKriteria)))
			.catch(() => setKriteria([]));

		chapterRemoteSource
			.findDrafts(chapter.id)
			.then((rows) => {
				setDaftarDraft(rows.map(mapBabDraft));
				setHasilPerDraft(
					new Map(rows.map((row) => [row.id, mapHasilSkor(row.hasilSkorKriteria)])),
				);
			})
			.catch(() => {
				setDaftarDraft([]);
				setHasilPerDraft(new Map());
			});
		// `terakhirDisimpan` ikut jadi dependency di samping `id` — penanda
		// checkpoint baru mungkin lahir dari tab Generasi sebelahnya, sama seperti
		// `useChapterQuality`/`useChapterReference`.
	}, [chapter.id, chapter.terakhirDisimpan]);

	React.useEffect(muat, [muat]);

	// `chapter` (jadi `hasilSkorKriteriaAktif`-nya) berganti tiap generate ulang
	// dari tab sebelahnya — susul di sini juga, bukan cuma dari `muatUlangAktif`
	// di bawah, supaya simulasi lama tidak sisa nempel di kontribusi bab yang
	// sudah ditimpa isinya.
	React.useEffect(() => {
		setHasilAktif(chapter.hasilSkorKriteriaAktif);
	}, [chapter.hasilSkorKriteriaAktif]);

	const muatUlangAktif = React.useCallback(() => {
		chapterRemoteSource
			.findOne(chapter.id)
			.then((row) => setHasilAktif(mapHasilSkor(row.hasilSkorKriteria)))
			.catch(() => {});
	}, [chapter.id]);

	const draftTerpilih = daftarDraft.find((draft) => draft.id === lingkup);
	// Lingkup yang menunjuk checkpoint yang sudah tidak ada jatuh kembali ke aktif,
	// alih-alih menampilkan daftar kosong tanpa penjelasan.
	const lingkupEfektif = lingkup !== 'aktif' && !draftTerpilih ? 'aktif' : lingkup;

	const hasil = React.useMemo(() => {
		const baris =
			lingkupEfektif === 'aktif'
				? hasilAktif
				: (hasilPerDraft.get(lingkupEfektif) ?? []);
		return new Map(baris.map((item) => [item.kriteriaId, item]));
	}, [lingkupEfektif, hasilAktif, hasilPerDraft]);

	const ringkasan = React.useMemo(
		() => ringkasSkor([...hasil.values()], kriteria),
		[hasil, kriteria],
	);

	/**
	 * §9.3 dan §12.2 sekaligus: hanya Penjamin Mutu dan Penyusun yang boleh
	 * menjalankan, dan bab terkunci memblokir semua orang. Keduanya sudah
	 * terangkum di `canEdit`, jadi tidak perlu aturan kedua yang bisa menyimpang.
	 */
	const bolehMenjalankan = izin.canEdit && kriteria.length > 0;

	const jalankanSimulasi = React.useCallback(async () => {
		if (!bolehMenjalankan || status === 'berjalan') return;

		const konten =
			lingkupEfektif === 'aktif'
				? (chapter.kontenKerja ?? '')
				: (draftTerpilih?.kontenSnapshot ?? '');

		if (konten.trim() === '') {
			setStatus('gagal');
			setPesanGagal(
				'Belum ada tulisan yang bisa dinilai untuk lingkup yang dipilih.',
			);
			return;
		}

		setStatus('berjalan');
		setPesanGagal(null);

		try {
			const job = await chapterRemoteSource.simulateScore(
				chapter.id,
				lingkupEfektif === 'aktif' ? undefined : lingkupEfektif,
			);

			let hasilJob: JobEvent | null = null;
			for await (const event of streamSse<JobEvent>(`/jobs/${job.id}/events`)) {
				if (event.status === 'completed' || event.status === 'failed') {
					hasilJob = event;
					break;
				}
			}

			if (
				!hasilJob ||
				hasilJob.status === 'failed' ||
				hasilJob.result?.status === 'error'
			) {
				setStatus('gagal');
				setPesanGagal(
					hasilJob?.result?.error ??
						hasilJob?.error ??
						'Simulasi gagal diselesaikan. Periksa koneksi lalu coba lagi.',
				);
				return;
			}

			if (lingkupEfektif === 'aktif') {
				muatUlangAktif();
			} else {
				muat();
			}

			setStatus('diam');
		} catch {
			setStatus('gagal');
			setPesanGagal(
				'Simulasi gagal diselesaikan. Periksa koneksi lalu coba lagi.',
			);
		}
	}, [
		bolehMenjalankan,
		status,
		lingkupEfektif,
		chapter.id,
		chapter.kontenKerja,
		draftTerpilih,
		muat,
		muatUlangAktif,
	]);

	return {
		daftarDraft,
		lingkup: lingkupEfektif,
		setLingkup,
		draftTerpilih,
		kriteria,
		hasil,
		ringkasan,
		status,
		pesanGagal,
		bolehMenjalankan,
		jalankanSimulasi,
	};
}
