import * as React from 'react';

import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { type CollectionViewMode } from '~/core/components/ui/collection-toolbar';
import {
	evidenceRepository,
	evidenceScopeFor,
} from '../../data/repositories/evidence.repository';
import { type EvidencePage } from '../../domain/dtos/evidence-query.dto';
import { type EvidenceOwnerType } from '../../domain/entities/evidence.entity';
import { useEvidenceFolder } from './use-evidence-folder';

const VIEW_MODE_STORAGE_KEY = 'evidence_view_mode';

const EMPTY_PAGE: EvidencePage = { items: [], total: 0 };

/**
 * Sumber data + state daftar bukti dukung untuk kedua mode tampilan.
 *
 * Pencarian, halaman, dan urutan dibaca dari URL lewat `useDataTableState`
 * (`?q=&page=&limit=&sort=&dir=`), jadi tautan bisa dibagikan dan muat ulang
 * halaman tidak menghilangkan konteks. Folder aktif ikut di URL juga, tapi lewat
 * {@link useEvidenceFolder} — alasannya di JSDoc hook itu. Mode tampilan
 * sebaliknya adalah selera pribadi, bukan konteks halaman, jadi ia tinggal di
 * localStorage.
 */
export function useEvidenceLibrary({
	level,
	studyProgramId,
}: {
	level: EvidenceOwnerType;
	studyProgramId?: string;
}) {
	const cakupan = React.useMemo(
		() => evidenceScopeFor({ ownerTipe: level, studyProgramId }),
		[level, studyProgramId],
	);
	const folder = useEvidenceFolder(cakupan);

	const tableState = useDataTableState(
		level === 'TENANT' ? 'evidence-tenant' : 'evidence-program',
	);
	const {
		sorting,
		globalFilter,
		setPagination,
		pagination: { pageIndex, pageSize },
	} = tableState;

	const [page, setPage] = React.useState<EvidencePage>(EMPTY_PAGE);
	const [viewMode, setViewModeState] = React.useState<CollectionViewMode>(
		'grid',
	);

	/**
	 * Yang dipegang **id**, bukan objek barisnya — pola yang sama dengan tab Bukti
	 * dan Panduan di Editor Bab. Di sini alasannya lebih tegas lagi: barisnya
	 * dirakit ulang setiap kali `storage-update` menyala, jadi objek yang disimpan
	 * akan jadi salinan basi dalam hitungan detik saat ekstraksi selesai.
	 */
	const [terpilih, setTerpilih] = React.useState<Set<string>>(new Set());

	React.useEffect(() => {
		const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
		if (stored === 'grid' || stored === 'table') setViewModeState(stored);
	}, []);

	const setViewMode = React.useCallback((mode: CollectionViewMode) => {
		setViewModeState(mode);
		try {
			localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
		} catch {}
	}, []);

	const sortId = sorting[0]?.id;
	const sortDir = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

	const load = React.useCallback(() => {
		setPage(
			evidenceRepository.findPaged({
				ownerTipe: level,
				studyProgramId: studyProgramId ?? null,
				folderId: folder.folderAktif,
				q: globalFilter,
				sort: sortId,
				dir: sortDir,
				page: pageIndex + 1,
				limit: pageSize,
			}),
		);
	}, [
		level,
		studyProgramId,
		folder.folderAktif,
		globalFilter,
		sortId,
		sortDir,
		pageIndex,
		pageSize,
	]);

	// Halaman terakhir bisa jadi kosong setelah berkasnya dihapus, atau karena
	// nomor halaman lama tertinggal di URL saat hasil menyusut. Dipulangkan ke
	// halaman pertama alih-alih menampilkan daftar kosong yang membingungkan.
	React.useEffect(() => {
		if (page.total > 0 && page.items.length === 0 && pageIndex > 0) {
			setPagination({ pageIndex: 0, pageSize });
		}
	}, [page, pageIndex, pageSize, setPagination]);

	React.useEffect(() => {
		load();
		// Unggahan dan perubahan status ingestion terjadi di luar halaman ini
		// (panel melayang, timer), jadi daftar ikut menyegarkan lewat event yang
		// sama seperti fitur lain.
		window.addEventListener('storage-update', load);
		return () => window.removeEventListener('storage-update', load);
	}, [load]);

	/**
	 * Seleksi dibersihkan saat berpindah folder, saat kata kuncinya berubah, dan
	 * saat berpindah halaman.
	 *
	 * Bukan kerapian: aksi massal atas berkas yang tidak terlihat di layar adalah
	 * cara paling mudah menghapus hal yang salah. Yang terpilih harus selalu yang
	 * sedang ditatap — dan aturan itu pula yang membuat baris terpilih selalu bisa
	 * ditemukan kembali di `items`, sehingga pemanggil tidak perlu membaca ulang
	 * penyimpanan untuk tahu apa yang sedang dipilih.
	 */
	React.useEffect(() => {
		setTerpilih(new Set());
	}, [folder.folderAktif, globalFilter, pageIndex]);

	const alihkanPilih = React.useCallback((id: string, aktif: boolean) => {
		setTerpilih((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			if (aktif) berikutnya.add(id);
			else berikutnya.delete(id);
			return berikutnya;
		});
	}, []);

	const bersihkanPilihan = React.useCallback(() => setTerpilih(new Set()), []);

	return {
		...tableState,
		items: page.items,
		total: page.total,
		viewMode,
		setViewMode,
		reload: load,
		cakupan,
		folderAktif: folder.folderAktif,
		folders: folder.folders,
		jalurFolder: folder.jalur,
		pindahFolder: folder.pindah,
		terpilih,
		alihkanPilih,
		bersihkanPilihan,
	};
}
