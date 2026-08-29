import * as React from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeftIcon, CheckCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { useConfirmDialog } from '~/core/components/ui/confirm-dialog';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { CHAPTER_TEMPLATE } from '~/features/chapter/data/repositories/chapter.repository';
import { type RubricCriterion } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	deriveSetReadiness,
	deriveSetSkorRange,
	findBabTanpaKriteria,
} from '../../domain/entities/accreditation-set.entity';
import { applyCriterionQuery } from '../../domain/dtos/criterion-query.dto';
import {
	accreditationSetRepository,
	type CriterionInput,
} from '../../data/repositories/accreditation-set.repository';
import { getCriterionColumns } from '../components/criterion-columns';
import { CriterionFormDialog } from '../components/criterion-form-dialog';
import { SetLockNotice } from '../components/set-lock-notice';
import { SetStatusBadge } from '../components/set-status-badge';
import { useAccreditationSet } from '../hooks/use-accreditation-set';
import { useAccreditationSetPermission } from '../hooks/use-accreditation-set-permission';

const SEMUA_URUTAN_BAB = CHAPTER_TEMPLATE.map((bab) => bab.urutanBab);

/**
 * Layar tinjau isi satu set: daftar kriteria beserta level skor dan bab yang
 * dinilainya, dengan koreksi terbuka selama setnya masih draf.
 *
 * Berdiri sebagai halaman sendiri, bukan kartu ketiga di halaman detail, karena
 * isinya bisa berjumlah puluhan baris dan butuh pencarian serta pengurutan.
 * Kolom setinggi itu di dalam halaman detail akan mengubur berkas acuan yang
 * berada di atasnya.
 *
 * **Meninjau dan membetulkan, bukan menyusun.** Isi rubrik turun dari lembaga
 * penilai lewat berkas yang diunggah, jadi tidak ada jalan membuat kriteria dari
 * nol di sini — yang ada hanya koreksi dan hapus untuk baris yang salah
 * terbaca. Set yang isinya masih kosong menunggu pembacaan berkas rubriknya,
 * bukan menunggu diketik.
 */
export function AccreditationSetCriteria() {
	const navigate = useNavigate();
	const { setId } = useParams<{ setId: string }>();
	const { canView, canManage } = useAccreditationSetPermission();
	const { set, lock, notFound, memuat, reload } = useAccreditationSet(setId);

	// Satu keadaan saja, bukan pasangan `open` + `initial`: dialognya memang tidak
	// punya wujud tanpa kriteria yang sedang dikoreksi.
	const [sedangDikoreksi, setSedangDikoreksi] =
		React.useState<RubricCriterion | null>(null);
	const [aksiError, setAksiError] = React.useState<string | null>(null);
	const { konfirmasi, confirmDialog } = useConfirmDialog();

	const bolehKelola = canManage && !!lock?.terbuka;

	const {
		sorting,
		setSorting,
		globalFilter,
		setGlobalFilter,
		pagination,
		setPagination,
		columnVisibility,
		setColumnVisibility,
		clearAll,
	} = useDataTableState('accreditation-set-criteria');

	const columns = React.useMemo(
		() => getCriterionColumns({ withActions: bolehKelola }),
		[bolehKelola],
	);

	// `DataTable` berjalan manual, jadi penyaringan dan pemotongan halaman
	// dikerjakan di sini — tanpa ini kotak pencariannya tampil tapi diam.
	const halaman = React.useMemo(
		() =>
			applyCriterionQuery(set?.kriteria ?? [], {
				q: globalFilter,
				sort: sorting[0]?.id,
				dir: sorting[0]?.desc ? 'desc' : 'asc',
				page: pagination.pageIndex,
				pageSize: pagination.pageSize,
			}),
		[set?.kriteria, globalFilter, sorting, pagination],
	);

	const handleEdit = React.useCallback((criterion: RubricCriterion) => {
		setSedangDikoreksi(criterion);
	}, []);

	const handleDelete = React.useCallback(
		async (criterion: RubricCriterion) => {
			if (!setId) return;

			const lanjut = await konfirmasi({
				judul: `Hapus kriteria nomor ${criterion.no}?`,
				deskripsi: `${criterion.kodeKriteria} — ${criterion.deskripsi}`,
				labelAksi: 'Hapus Kriteria',
				merusak: true,
			});
			if (!lanjut) return;

			setAksiError(null);

			try {
				await accreditationSetRepository.removeCriterion(setId, criterion.id);
				reload();
			} catch (e) {
				setAksiError(
					e instanceof Error ? e.message : 'Gagal menghapus kriteria.',
				);
			}
		},
		[setId, reload, konfirmasi],
	);

	const tableMeta = React.useMemo(
		() => ({ onEditCriterion: handleEdit, onDeleteCriterion: handleDelete }),
		[handleEdit, handleDelete],
	);

	const simpanKriteria = React.useCallback(
		async (input: CriterionInput) => {
			if (!setId || !sedangDikoreksi) return;

			await accreditationSetRepository.updateCriterion(
				setId,
				sedangDikoreksi.id,
				input,
			);
			reload();
		},
		[setId, sedangDikoreksi, reload],
	);

	const tandaiSiap = React.useCallback(async () => {
		if (!setId) return;

		const lanjut = await konfirmasi({
			judul: 'Tandai set ini siap dipakai?',
			deskripsi:
				'Set akan muncul sebagai pilihan acuan di Dokumen LED, dan statusnya tidak bisa ditarik kembali. Isinya sendiri baru terkunci setelah ada dokumen yang memakainya.',
			labelAksi: 'Tandai Siap',
		});
		if (!lanjut) return;

		setAksiError(null);

		try {
			await accreditationSetRepository.markReady(setId);
			reload();
		} catch (e) {
			setAksiError(
				e instanceof Error ? e.message : 'Gagal menandai set sebagai siap.',
			);
		}
	}, [setId, reload, konfirmasi]);

	// Alasan sama dengan halaman daftar dan detailnya: lapis tenant meloloskan
	// Admin, jadi alamat ini masih terbuka langsung walau menunya tidak ada.
	if (!canView) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Set akreditasi adalah bagian dari konten akreditasi, di luar kewenangan
				Admin.
			</div>
		);
	}

	if (notFound) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Set akreditasi tidak ditemukan.
			</div>
		);
	}

	if (memuat || !set || !lock) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Memuat isi rubrik...
			</div>
		);
	}

	const skala = deriveSetSkorRange(set);
	const babKosong = findBabTanpaKriteria(set, SEMUA_URUTAN_BAB);
	const readiness = deriveSetReadiness(set);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-4">
					<Button
						variant="outline"
						size="icon"
						title="Kembali ke set"
						onClick={() => navigate(`/dashboard/accreditation-sets/${set.id}`)}
						className="cursor-pointer"
					>
						<ArrowLeftIcon className="size-4" />
					</Button>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="font-heading text-2xl font-bold tracking-tight">
								Isi Rubrik
							</h2>
							<SetStatusBadge status={set.status} />
						</div>
						<p className="text-sm text-muted-foreground">
							{set.nama} · {set.lembaga} · siklus {set.tahunSiklus}
						</p>
					</div>
				</div>

				{canManage && readiness.boleh && (
					<Button
						onClick={tandaiSiap}
						className="cursor-pointer gap-2"
					>
						<CheckCircleIcon className="size-4" />
						Tandai Siap
					</Button>
				)}
			</div>

			{aksiError && (
				<p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{aksiError}
				</p>
			)}

			<SetLockNotice lock={lock} />

			{/* Tanpa ini "Tandai Siap" cuma lenyap, dan yang melihatnya tidak punya
			    cara menebak bahwa penyebabnya berkas yang belum lengkap — apalagi
			    berkasnya diurus di halaman lain. Hanya untuk yang berhak menandai
			    siap; bagi Pimpinan kalimat ini menyebut pekerjaan yang bukan
			    miliknya. */}
			{canManage && set.status === 'DRAF' && readiness.halangan && (
				<div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
					{readiness.halangan}
				</div>
			)}

			{/* Ringkasan sengaja tiga angka saja — jumlah kriteria, skala, dan bab
			    yang tidak dinilai. Ketiganya yang menentukan apakah set ini layak
			    ditandai siap; sisanya sudah ada di tabelnya. */}
			<div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-border px-4 py-3 text-sm">
				<span>
					<span className="text-muted-foreground">Kriteria: </span>
					<span className="font-medium tabular-nums">
						{set.kriteria.length}
					</span>
				</span>
				<span>
					<span className="text-muted-foreground">Skala skor: </span>
					<span className="font-medium tabular-nums">
						{skala ? `${skala.min}–${skala.max}` : '—'}
					</span>
				</span>
				<span>
					<span className="text-muted-foreground">Bab tanpa kriteria: </span>
					<span className="font-medium tabular-nums">
						{babKosong.length > 0 ? babKosong.join(', ') : 'tidak ada'}
					</span>
				</span>
			</div>

			{set.kriteria.length === 0 ? (
				<div className="rounded-md border border-dashed border-border p-10 text-center">
					<p className="font-medium">Isi rubrik set ini belum terbaca.</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Kriteria penilaian berasal dari berkas Dokumen Rubrik yang diunggah,
						bukan diketik di sini. Set tanpa kriteria belum bisa ditandai siap.
					</p>
				</div>
			) : (
				<DataTable
					columns={columns}
					data={halaman.rows}
					rowCount={halaman.rowCount}
					meta={tableMeta}
					searchPlaceholder="Cari kode, kelompok, atau bunyi kriteria..."
					sorting={sorting}
					onSortingChange={setSorting}
					globalFilter={globalFilter}
					onGlobalFilterChange={setGlobalFilter}
					columnVisibility={columnVisibility}
					onColumnVisibilityChange={setColumnVisibility}
					pagination={pagination}
					onPaginationChange={setPagination}
					onClearAll={clearAll}
				/>
			)}

			{confirmDialog}

			{sedangDikoreksi && (
				<CriterionFormDialog
					open
					onOpenChange={(open) => {
						if (!open) setSedangDikoreksi(null);
					}}
					initial={sedangDikoreksi}
					onSubmit={simpanKriteria}
				/>
			)}
		</div>
	);
}
