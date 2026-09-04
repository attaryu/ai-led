import * as React from 'react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { Field, FieldLabel } from '~/core/components/ui/field';
import { Input } from '~/core/components/ui/input';
import { evidenceFolderRepository } from '../../data/repositories/evidence-folder.repository';
import {
	EVIDENCE_FOLDER_NAME_MAX,
	folderAnak,
	validateFolderName,
	type EvidenceFolderEntity,
	type EvidenceScope,
} from '../../domain/entities/evidence-folder.entity';

/**
 * Membuat folder baru **atau** mengganti nama folder yang ada
 * (docs/application_flow.md §4.6a).
 *
 * **Satu dialog untuk dua pekerjaan**, karena bentuknya memang identik: satu
 * ruas nama dengan validasi yang sama persis terhadap saudara-saudaranya. Dua
 * dialog terpisah berarti dua salinan pesan validasi yang harus dijaga tetap
 * sama tanpa satu pun mekanisme yang memaksanya.
 *
 * Yang membedakan keduanya hanya `folder`: terisi berarti mengganti nama, dan
 * id-nya ikut dikecualikan saat memeriksa nama kembar supaya folder tidak
 * dianggap bertabrakan dengan dirinya sendiri.
 */
export function EvidenceFolderDialog({
	open,
	onOpenChange,
	cakupan,
	parentId,
	folder,
	pembuat,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cakupan: EvidenceScope;
	/** Induk folder baru; diabaikan saat mengganti nama. */
	parentId: string | null;
	/** Terisi = mengganti nama. `null` = membuat baru. */
	folder: EvidenceFolderEntity | null;
	pembuat: { userId: string; nama: string };
}) {
	const mengganti = folder !== null;
	const [nama, setNama] = React.useState('');
	const [galat, setGalat] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!open) return;
		setNama(folder?.nama ?? '');
		setGalat(null);
	}, [open, folder]);

	const [menyimpan, setMenyimpan] = React.useState(false);

	const simpan = async () => {
		setMenyimpan(true);
		try {
			const induk = mengganti ? folder.parentId : parentId;
			const saudara = folderAnak(
				await evidenceFolderRepository.findByScope(cakupan),
				induk,
			);

			const pesan = validateFolderName(nama, saudara, folder?.id);
			if (pesan) {
				setGalat(pesan);
				return;
			}

			if (mengganti) await evidenceFolderRepository.rename(folder.id, nama);
			else {
				await evidenceFolderRepository.create({
					cakupan,
					nama,
					parentId,
					pembuat,
				});
			}

			onOpenChange(false);
		} catch (error) {
			setGalat(error instanceof Error ? error.message : 'Gagal menyimpan folder.');
		} finally {
			setMenyimpan(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mengganti ? 'Ganti Nama Folder' : 'Folder Baru'}
					</DialogTitle>
					<DialogDescription>
						{mengganti
							? 'Berkas di dalamnya tidak ikut berpindah.'
							: 'Folder dibuat di lokasi yang sedang dibuka.'}
					</DialogDescription>
				</DialogHeader>

				<Field data-invalid={!!galat}>
					<FieldLabel htmlFor="nama-folder">Nama folder</FieldLabel>
					<Input
						id="nama-folder"
						value={nama}
						autoFocus
						maxLength={EVIDENCE_FOLDER_NAME_MAX}
						placeholder="Misalnya: Kriteria 4 - SDM"
						onChange={(event) => {
							setNama(event.target.value);
							setGalat(null);
						}}
						onKeyDown={(event) => {
							// Enter menyimpan: ruasnya cuma satu, dan menuntut pengguna
							// menjangkau tombol untuk mengetik satu nama membuat membuat
							// beberapa folder berturut-turut terasa berat.
							if (event.key === 'Enter') {
								event.preventDefault();
								simpan();
							}
						}}
					/>
					{galat && <p className="text-sm text-destructive">{galat}</p>}
				</Field>

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
						onClick={simpan}
						disabled={nama.trim() === '' || menyimpan}
						className="cursor-pointer"
					>
						{mengganti ? 'Simpan' : 'Buat folder'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
