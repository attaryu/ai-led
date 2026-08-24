import {
	ArrowClockwiseIcon,
	CaretDownIcon,
	CaretUpIcon,
	CheckCircleIcon,
	WarningCircleIcon,
	XIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { cn } from '~/core/lib/utils';
import {
	useEvidenceUploadStore,
	type EvidenceUploadItem,
} from '../stores/evidence-upload.store';
import { formatBytes, getFileVisual } from '../utils/evidence-format';

const phaseLabel: Record<EvidenceUploadItem['phase'], string> = {
	antre: 'Menunggu giliran',
	presign: 'Menyiapkan',
	uploading: 'Mengunggah',
	reporting: 'Menyelesaikan',
	selesai: 'Selesai diunggah',
	gagal: 'Gagal',
};

function UploadRow({ item }: { item: EvidenceUploadItem }) {
	const retryItem = useEvidenceUploadStore((state) => state.retryItem);
	const dismissItem = useEvidenceUploadStore((state) => state.dismissItem);
	const { Icon: FileTypeIcon, className } = getFileVisual(
		item.fileName.split('.').pop() ?? '',
	);

	return (
		<div className="flex items-start gap-3 px-4 py-3">
			<FileTypeIcon weight="fill" className={cn('mt-0.5 size-5', className)} />

			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium" title={item.fileName}>
					{item.fileName}
				</p>

				{item.phase === 'gagal' ? (
					<p className="mt-0.5 text-xs text-destructive">
						{item.error ?? phaseLabel.gagal}
					</p>
				) : (
					<p className="mt-0.5 text-xs text-muted-foreground">
						{phaseLabel[item.phase]} · {formatBytes(item.sizeBytes)}
						{/*
						 * Folder tujuan ikut disebut karena satu batch tidak lagi mendarat
						 * di satu tempat: unggah folder menyebar berkasnya ke beberapa
						 * folder sekaligus, dan tanpa keterangan ini panel melayang jadi
						 * satu-satunya bagian yang tidak tahu itu terjadi.
						 */}
						{item.namaFolder && ` · ${item.namaFolder}`}
					</p>
				)}

				{item.phase !== 'selesai' && item.phase !== 'gagal' && (
					<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-all duration-150"
							style={{ width: `${item.progress}%` }}
						/>
					</div>
				)}
			</div>

			<div className="flex shrink-0 items-center gap-1">
				{item.phase === 'uploading' && (
					<span className="text-xs tabular-nums text-muted-foreground">
						{item.progress}%
					</span>
				)}
				{item.phase === 'selesai' && (
					<CheckCircleIcon
						weight="fill"
						className="size-5 text-emerald-600 dark:text-emerald-400"
					/>
				)}
				{item.phase === 'gagal' && (
					<>
						<WarningCircleIcon
							weight="fill"
							className="size-5 text-destructive"
						/>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Coba unggah lagi"
							onClick={() => retryItem(item.id)}
							className="size-7 cursor-pointer"
						>
							<ArrowClockwiseIcon className="size-4" />
						</Button>
					</>
				)}
				{(item.phase === 'selesai' || item.phase === 'gagal') && (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Sembunyikan baris"
						onClick={() => dismissItem(item.id)}
						className="size-7 cursor-pointer"
					>
						<XIcon className="size-4" />
					</Button>
				)}
			</div>
		</div>
	);
}

/**
 * Panel progres unggahan yang melayang di pojok kanan bawah.
 *
 * Dipasang sekali di `AppShell` supaya ia ikut seluruh lapis ruang kerja:
 * pengguna bisa meninggalkan Perpustakaan Bukti Dukung sementara unggahannya
 * jalan terus, dan tetap melihat hasil akhirnya di mana pun ia berada.
 */
export function EvidenceUploadPanel() {
	const items = useEvidenceUploadStore((state) => state.items);
	const isCollapsed = useEvidenceUploadStore((state) => state.isCollapsed);
	const toggleCollapsed = useEvidenceUploadStore(
		(state) => state.toggleCollapsed,
	);
	const dismissAll = useEvidenceUploadStore((state) => state.dismissAll);

	if (items.length === 0) return null;

	const active = items.filter(
		(item) => item.phase !== 'selesai' && item.phase !== 'gagal',
	).length;
	const failed = items.filter((item) => item.phase === 'gagal').length;

	const title =
		active > 0
			? `Mengunggah ${active} berkas`
			: failed > 0
				? `${failed} berkas gagal diunggah`
				: `${items.length} berkas selesai diunggah`;

	return (
		<div className="fixed bottom-4 right-4 z-40 w-[22rem] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
			<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
				<p className="truncate text-sm font-medium">{title}</p>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={isCollapsed ? 'Bentangkan panel' : 'Lipat panel'}
						onClick={toggleCollapsed}
						className="size-7 cursor-pointer"
					>
						{isCollapsed ? (
							<CaretUpIcon className="size-4" />
						) : (
							<CaretDownIcon className="size-4" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Tutup panel"
						// Tidak membatalkan unggahan yang sedang jalan — barisnya saja yang
						// disembunyikan, karena pembatalan butuh dukungan sisi backend.
						onClick={dismissAll}
						className="size-7 cursor-pointer"
					>
						<XIcon className="size-4" />
					</Button>
				</div>
			</div>

			{!isCollapsed && (
				<div className="max-h-72 divide-y divide-border overflow-y-auto">
					{items.map((item) => (
						<UploadRow key={item.id} item={item} />
					))}
				</div>
			)}
		</div>
	);
}
