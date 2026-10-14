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
	deriveDeadline,
	pickPenyusunanAktif,
	type LedProjectEntity,
	type ProjectDeadline,
} from '~/features/led-project/domain/entities/led-project.entity';
import { userRepository } from '~/features/users/data/repositories/user.repository';
import { type UserEntity } from '~/features/users/domain/entities/user.entity';
import {
	SOURCE_LOADING,
	toSourceState,
	type SourceState,
} from '../../domain/source-state';

/** Dokumen LED prodi beserta bab dokumen yang sedang disusun. */
export type ProgramDocuments = {
	penyusunanAktif: LedProjectEntity | null;
	arsip: LedProjectEntity[];
	/** `null` bila belum menyusun, atau dokumennya tidak dipatok tenggat. */
	tenggat: ProjectDeadline | null;
	/** Ringkasan bab **yang sedang disusun**; nol semua bila belum menyusun. */
	chapterSummary: ChapterSummary;
};

export type ProgramReadiness = {
	dokumen: SourceState<ProgramDocuments>;
	/**
	 * Bukti dukung milik prodi ini saja — angka yang sama dengan yang terlihat di
	 * Perpustakaan Bukti Dukung prodi (§5.2).
	 */
	evidenceProdi: SourceState<EvidenceSummary>;
	penyusun: SourceState<UserEntity[]>;
};

const INITIAL_READINESS: ProgramReadiness = {
	dokumen: SOURCE_LOADING,
	evidenceProdi: SOURCE_LOADING,
	penyusun: SOURCE_LOADING,
};

async function readDocuments(programId: string): Promise<ProgramDocuments> {
	const { aktif, arsip } = pickPenyusunanAktif(
		await ledProjectRepository.findByStudyProgramId(programId),
	);

	// Bab hanya dibaca untuk dokumen yang sedang disusun: angka kelengkapan yang
	// mencampur dokumen lama yang sudah tuntas akan selalu terlihat bagus dan
	// menyembunyikan pekerjaan yang sebenarnya belum jalan.
	const chapters = aktif ? await chapterRepository.findByProjectId(aktif.id) : [];

	return {
		penyusunanAktif: aktif,
		arsip,
		tenggat: aktif ? deriveDeadline(aktif.tenggat) : null,
		chapterSummary: summarizeChapters(chapters),
	};
}

async function readEvidence(programId: string): Promise<EvidenceSummary> {
	return summarizeEvidence(await evidenceRepository.findOwnedByStudyProgram(programId));
}

/**
 * Tiap kelompok dibaca dan gagal sendiri-sendiri: 403 pada satu sumber tidak
 * boleh mengosongkan panel lain.
 */
async function read(programId: string): Promise<ProgramReadiness> {
	const [dokumen, evidenceProdi, penyusun] = await Promise.allSettled([
		readDocuments(programId),
		readEvidence(programId),
		userRepository.findPenyusunByStudyProgramId(programId),
	]);
	return {
		dokumen: toSourceState(dokumen),
		evidenceProdi: toSourceState(evidenceProdi),
		penyusun: toSourceState(penyusun),
	};
}

/**
 * Seluruh angka Dashboard Prodi dalam satu tempat, supaya halaman tinggal
 * merender. Berlangganan `storage-update` seperti daftar lain di aplikasi ini —
 * datanya bisa berubah dari halaman lain (bukti dukung baru diunggah, dokumen
 * baru dibuat Penjamin Mutu).
 *
 * Setiap sumber punya status sendiri (`loading`/`ready`/`error`), sehingga
 * halaman bisa membedakan "kosong" dari "gagal dimuat". Muat ulang menimpa
 * status galat dengan hasil baru.
 *
 * Perhitungannya sendiri hidup di domain, bukan di sini, agar dashboard agregat
 * institusi bisa memakainya ulang tanpa menyalin aturannya.
 *
 * Parameternya sengaja `programId`, bukan objek prodi utuh: repository
 * mengembalikan objek baru tiap panggilan, sehingga memakainya sebagai
 * dependensi efek akan memicu pembacaan ulang tanpa henti.
 */
export function useProgramReadiness(programId: string): ProgramReadiness {
	const [readiness, setReadiness] = React.useState<ProgramReadiness>(INITIAL_READINESS);

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
