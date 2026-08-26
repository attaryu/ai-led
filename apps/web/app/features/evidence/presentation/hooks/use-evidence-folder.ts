import * as React from 'react';
import { useSearchParams } from 'react-router';

import { evidenceFolderRepository } from '../../data/repositories/evidence-folder.repository';
import {
	jalurFolder,
	type EvidenceFolderEntity,
	type EvidenceScope,
} from '../../domain/entities/evidence-folder.entity';

/**
 * Folder yang sedang dijelajahi, jalurnya, dan cara berpindah
 * (docs/application_flow.md §4.6a).
 *
 * **Folder aktif hidup di URL** (`?folder=<id>`), tanpa nilai berarti akar. Bukan
 * segmen path: rutenya tetap `/dashboard/evidence` dan id folder itu opaque. Ini
 * menyambung kebiasaan §4.6, tempat `q`/`sort`/`dir`/`page`/`limit` sudah lebih
 * dulu tinggal di URL supaya tautan bisa dibagikan dan muat ulang tidak
 * menghilangkan konteks.
 *
 * **Kenapa `useSearchParams` sendiri, bukan lewat `useDataTableState`.** Masuk
 * folder mengubah tiga parameter sekaligus — set `folder`, `page=1`, hapus `q` —
 * dan tiga panggilan berurutan akan saling menimpa karena masing-masing membaca
 * URL yang sudah tercatat, bukan yang baru saja diminta. Satu panggilan yang
 * mengurus ketiganya adalah satu-satunya bentuk yang benar. `useDataTableState`
 * sendiri dipakai empat tabel lain yang tidak punya folder, dan tidak boleh ikut
 * tahu soal ini.
 */
export function useEvidenceFolder(cakupan: EvidenceScope) {
	const [searchParams, setSearchParams] = useSearchParams();
	const dariUrl = searchParams.get('folder');

	const { ownerTipe, tenantId, studyProgramId } = cakupan;

	/**
	 * `null` sampai pembacaan pertama selesai — bukan larik kosong.
	 *
	 * Bedanya menentukan: penjaga di bawah memulangkan penjelajah ke akar saat
	 * folder di URL tidak ada lagi, dan larik kosong sebagai keadaan awal membuat
	 * penjaga itu menyala pada render pertama, sebelum ada satu folder pun yang
	 * dibaca — setiap tautan ke dalam folder akan terpental ke akar.
	 */
	const [folders, setFolders] = React.useState<EvidenceFolderEntity[] | null>(
		null,
	);

	const muat = React.useCallback(() => {
		setFolders(
			evidenceFolderRepository.findByScope({
				ownerTipe,
				tenantId,
				studyProgramId,
			}),
		);
	}, [ownerTipe, tenantId, studyProgramId]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	const pindah = React.useCallback(
		(id: string | null) => {
			setSearchParams((prev) => {
				if (id) prev.set('folder', id);
				else prev.delete('folder');
				// Pencarian merata ke seluruh cakupan; membiarkannya menyala sementara
				// penjelajah berpindah folder berarti daftarnya tidak berubah sedikit
				// pun setelah diklik, dan itu terbaca seperti klik yang tidak berfungsi.
				prev.delete('q');
				prev.set('page', '1');
				return prev;
			});
		},
		[setSearchParams],
	);

	/**
	 * Folder yang ditunjuk URL bisa saja sudah tidak ada — tautan lama, atau
	 * dihapus dari tab lain. Yang tampil kalau dibiarkan adalah folder kosong yang
	 * tidak bisa dijelaskan apa pun; dipulangkan ke akar sekalian membersihkan
	 * URL-nya, pola yang sama dengan pemulangan halaman kosong di
	 * `useEvidenceLibrary`.
	 */
	React.useEffect(() => {
		if (dariUrl === null || folders === null) return;
		if (folders.some((folder) => folder.id === dariUrl)) return;
		pindah(null);
	}, [dariUrl, folders, pindah]);

	const daftarFolder = folders ?? [];
	const folderAktif =
		dariUrl !== null && daftarFolder.some((folder) => folder.id === dariUrl)
			? dariUrl
			: null;

	return {
		/** Sudah dipastikan ada; `null` = akar. */
		folderAktif,
		/** Seluruh folder satu cakupan — pemilih dan remah tautan memakainya. */
		folders: daftarFolder,
		/** Dari akar sampai folder aktif; kosong bila sedang di akar. */
		jalur: React.useMemo(
			() => jalurFolder(daftarFolder, folderAktif),
			[daftarFolder, folderAktif],
		),
		pindah,
	};
}
