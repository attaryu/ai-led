import * as React from 'react';
import { TrashIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { useConfirmDialog } from '~/core/components/ui/confirm-dialog';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { type PanduanLibraryItem } from '../../domain/entities/accreditation-set.entity';

/**
 * Daftar SELURUH Panduan tenant ini (bukan cuma yang terpasang ke set ini),
 * satu-satunya tempat menghapus baris Panduan sungguhan. `PanduanSlotCard`
 * ("Lepas") cuma putus tautan Set <-> Panduan, tidak pernah menghapus
 * Panduan itu sendiri -- kalau Set-nya dihapus semua, Panduan jadi orphan
 * permanen tanpa modal ini (lihat panduan.controller.ts::delete).
 */
export function PanduanManageModal({
	open,
	onOpenChange,
	library,
	onChanged,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	library: PanduanLibraryItem[] | null;
	/** Dipanggil setelah 1 Panduan berhasil dihapus -- pemanggil me-refresh `library`. */
	onChanged: () => void;
}) {
	const { konfirmasi, confirmDialog } = useConfirmDialog();
	const [menghapusId, setMenghapusId] = React.useState<string | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const handleDelete = async (item: PanduanLibraryItem) => {
		const lanjut = await konfirmasi({
			judul: `Hapus "${item.judul}"?`,
			deskripsi: 'Struktur bab/sub-bab hasil ekstraksinya ikut terhapus. Tidak bisa dibatalkan.',
			labelAksi: 'Hapus Permanen',
			merusak: true,
		});
		if (!lanjut) return;

		setError(null);
		setMenghapusId(item.id);
		try {
			await accreditationSetRepository.deletePanduan(item.id);
			onChanged();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Gagal menghapus Panduan.');
		} finally {
			setMenghapusId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
				<DialogHeader>
					<DialogTitle>Kelola Panduan</DialogTitle>
					<DialogDescription>
						Panduan yang masih dipakai Set manapun tidak bisa dihapus dari sini --
						lepas dulu dari tiap Set yang memakainya.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 space-y-2 overflow-y-auto">
					{library === null ? (
						<p className="py-6 text-center text-sm text-muted-foreground">Memuat…</p>
					) : library.length === 0 ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							Belum ada Panduan yang diunggah.
						</p>
					) : (
						library.map((item) => (
							<div
								key={item.id}
								className="flex items-center gap-3 rounded-md border border-border p-3"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium" title={item.judul}>
										{item.judul}
									</p>
									<p className="text-xs text-muted-foreground">
										{item.jumlahBab} bab · dipakai {item.jumlahSetPemakai} Set ·{' '}
										{formatRelativeTimeLong(item.createdAt)}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									aria-label={`Hapus ${item.judul}`}
									disabled={item.jumlahSetPemakai > 0 || menghapusId === item.id}
									title={
										item.jumlahSetPemakai > 0
											? `Masih dipakai ${item.jumlahSetPemakai} Set, lepas dulu sebelum bisa dihapus`
											: undefined
									}
									className="shrink-0 cursor-pointer text-destructive hover:text-destructive disabled:cursor-not-allowed"
									onClick={() => handleDelete(item)}
								>
									<TrashIcon className="size-4" />
								</Button>
							</div>
						))
					)}
				</div>

				{error && <p className="text-xs text-destructive">{error}</p>}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Tutup
					</Button>
				</DialogFooter>
			</DialogContent>
			{confirmDialog}
		</Dialog>
	);
}
