import * as React from 'react';

import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import {
	summarizeChapters,
	type ChapterSummary,
} from '~/features/chapter/domain/entities/chapter.entity';
import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import {
	summarizeEvidence,
	type EvidenceSummary,
} from '~/features/evidence/domain/entities/evidence.entity';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import {
	pickPenyusunanAktif,
	type LedProjectEntity,
} from '~/features/led-project/domain/entities/led-project.entity';
import { userRepository } from '~/features/users/data/repositories/user.repository';
import { type UserEntity } from '~/features/users/domain/entities/user.entity';

export type ProgramReadiness = {
	penyusunanAktif: LedProjectEntity | null;
	arsip: LedProjectEntity[];
	/** Ringkasan bab **yang sedang disusun**; nol semua bila belum menyusun. */
	chapterSummary: ChapterSummary;
	/**
	 * Bukti dukung milik prodi ini saja — angka yang sama dengan yang terlihat di
	 * Perpustakaan Bukti Dukung prodi (§5.2).
	 */
	evidenceProdi: EvidenceSummary;
	penyusun: UserEntity[];
};

const EMPTY_READINESS: ProgramReadiness = {
	penyusunanAktif: null,
	arsip: [],
	chapterSummary: summarizeChapters([]),
	evidenceProdi: summarizeEvidence([]),
	penyusun: [],
};

async function read(programId: string): Promise<ProgramReadiness> {
	const { aktif, arsip } = pickPenyusunanAktif(
		await ledProjectRepository.findByStudyProgramId(programId),
	);

	// Bab hanya dibaca untuk dokumen yang sedang disusun: angka kelengkapan yang
	// mencampur dokumen lama yang sudah tuntas akan selalu terlihat bagus dan
	// menyembunyikan pekerjaan yang sebenarnya belum jalan.
	const chapters = aktif ? await chapterRepository.findByProjectId(aktif.id) : [];
	const chapterSummary = summarizeChapters(chapters);

	const evidenceProdi = summarizeEvidence(
		evidenceRepository.findOwnedByStudyProgram(programId),
	);

	return {
		penyusunanAktif: aktif,
		arsip,
		chapterSummary,
		evidenceProdi,
		penyusun: userRepository.findPenyusunByStudyProgramId(programId),
	};
}

/**
 * Seluruh angka Dashboard Prodi dalam satu tempat, supaya halaman tinggal
 * merender. Berlangganan `storage-update` seperti daftar lain di aplikasi ini —
 * datanya bisa berubah dari halaman lain (bukti dukung baru diunggah, dokumen
 * baru dibuat Penjamin Mutu).
 *
 * Perhitungannya sendiri hidup di domain, bukan di sini, agar dashboard agregat
 * institusi bisa memakainya ulang tanpa menyalin aturannya.
 *
 * Parameternya sengaja `programId`, bukan objek prodi utuh: repository
 * mengembalikan objek baru tiap panggilan, sehingga memakainya sebagai
 * dependensi efek akan memicu pembacaan ulang tanpa henti.
 */
export function useProgramReadiness(programId: string): ProgramReadiness {
	const [readiness, setReadiness] = React.useState<ProgramReadiness>(EMPTY_READINESS);

	React.useEffect(() => {
		let cancelled = false;
		const load = () => {
			read(programId).then((result) => {
				if (!cancelled) setReadiness(result);
			});
		};
		load();
		window.addEventListener('storage-update', load);
		return () => {
			cancelled = true;
			window.removeEventListener('storage-update', load);
		};
	}, [programId]);

	return readiness;
}
