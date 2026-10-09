import * as React from 'react';
import { WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { evidenceFolderRepository } from '../../data/repositories/evidence-folder.repository';
import { evidenceRepository } from '../../data/repositories/evidence.repository';
import {
	keturunanIds,
	type EvidenceFolderEntity,
	type EvidenceNode,
} from '../../domain/entities/evidence-folder.entity';
import { EvidenceFolderPicker } from './evidence-folder-picker';

/**
 * "Pindahkan ke…" — satu jalan untuk satu item maupun hasil pilih massal
 * (docs/application_flow.md §4.6a).
 *
 * **Kenapa dialog, bukan tarik-lepas.** Tarik-lepas hanya bisa menjangkau folder
 * yang kebetulan sedang terlihat di layar yang sama; folder tujuan di halaman
 * lain, atau di cabang yang tertutup, tidak punya jalan sama sekali. Ia juga
 * tidak bisa dipakai tanpa tetikus. Dialog dengan pohon menjawab keduanya, dan ia
 * pula yang membuat memindahkan dua belas berkas sekaligus mungkin.
 *
 * **Cakupan tidak pernah berubah di sini.** Pemilihnya hanya menawarkan folder
 * dari perpustakaan yang sedang dibuka; memindahkan berkas antar prodi berarti
 * memindahkannya antar perpustakaan, dan itu keputusan lain dengan konsekuensi
 * hak akses sendiri.
 */
export function EvidenceMoveDialog({
	open,
	onOpenChange,
	node,
	folders,
	labelAkar,
	folderAsal,
	onSelesai,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Yang dipindahkan — satu baris, atau seluruh yang terpilih. */
	node: EvidenceNode[];
	folders: EvidenceFolderEntity[];
	labelAkar: string;
	/** Folder yang sedang dibuka; jadi titik awal pemilih. */
	folderAsal: string | null;
	onSelesai: () => void;
}) {
	const [tujuan, setTujuan] = React.useState<string | null>(folderAsal);

	React.useEffect(() => {
		if (open) setTujuan(folderAsal);
	}, [open, folderAsal]);

	const folderDipindah = node.filter((baris) => baris.tipe === 'FOLDER');
	const berkasDipindah = node.filter((baris) => baris.tipe === 'BERKAS');

	/**
	 * Folder yang dipindahkan beserta seluruh keturunannya tidak dirender di
	 * pemilih. Tanpa ini, folder bisa dijadikan induk dirinya sendiri dan seluruh
	 * cabangnya lenyap dari daftar mana pun tanpa jalan pulih lewat UI.
	 */
	const sembunyikan = React.useMemo(() => {
		const kumpulan = new Set<string>();
		for (const baris of folderDipindah) {
			for (const id of keturunanIds(folders, baris.id)) kumpulan.add(id);
		}
		return kumpulan;
	}, [folderDipindah, folders]);

	const pindahkan = () => {
		const idBerkas = new Set(berkasDipindah.map((baris) => baris.id));
		if (idBerkas.size > 0) {
			evidenceRepository.moveMany(idBerkas, tujuan).catch((error: unknown) => {
				alert(error instanceof Error ? error.message : 'Gagal memindahkan berkas.');
			});
		}
		for (const baris of folderDipindah) {
			evidenceFolderRepository.moveFolder(baris.id, tujuan).catch((error: unknown) => {
				alert(error instanceof Error ? error.message : 'Gagal memindahkan folder.');
			});
		}

		onOpenChange(false);
		onSelesai();
	};

	const ringkasan =
		node.length === 1
			? namaNode(node[0])
			: [
					folderDipindah.length > 0 && `${folderDipindah.length} folder`,
					berkasDipindah.length > 0 && `${berkasDipindah.length} berkas`,
				]
					.filter(Boolean)
					.join(' dan ');

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Pindahkan ke…</DialogTitle>
					<DialogDescription>
						Memindahkan <span className="font-medium">{ringkasan}</span>.
					</DialogDescription>
				</DialogHeader>

				<EvidenceFolderPicker
					folders={folders}
					labelAkar={labelAkar}
					nilai={tujuan}
					onPilih={setTujuan}
					sembunyikan={sembunyikan.size > 0 ? sembunyikan : undefined}
				/>

				{folderDipindah.length > 0 && (
					<p className="flex items-start gap-1.5 text-xs text-muted-foreground">
						<WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" />
						Folder yang dipindahkan tidak muncul sebagai tujuan — sebuah folder
						tidak bisa dipindahkan ke dalam dirinya sendiri.
					</p>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						className="cursor-pointer"
					>
						Batal
					</Button>
					<Button
						type="button"
						onClick={pindahkan}
						disabled={tujuan === folderAsal}
						className="cursor-pointer"
					>
						Pindahkan
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function namaNode(node: EvidenceNode): string {
	return node.tipe === 'FOLDER' ? node.folder.nama : node.evidence.namaDokumen;
}
