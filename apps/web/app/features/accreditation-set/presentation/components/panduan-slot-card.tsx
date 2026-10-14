import * as React from 'react';
import { SwapIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Select } from '~/core/components/ui/select';
import { cn } from '~/core/lib/utils';
import { EvidenceStatusBadge } from '~/features/evidence/presentation/components/evidence-status-badge';
import {
	type PanduanLibraryItem,
	type SetPanduan,
} from '../../domain/entities/accreditation-set.entity';

const ACCEPTED = '.pdf,.docx';

/**
 * Slot Panduan Penulisan -- beda dari `DocumentSlotCard`: Panduan sekarang
 * entitas reusable (`AccreditationSet.panduanId`), jadi kosong berarti "pilih
 * existing ATAU upload baru" (dua aksi, bukan satu), dan terisi berarti "milik
 * bersama" -- ganti berkas (replace) mempengaruhi SEMUA set lain yang
 * menunjuk Panduan yang sama, bukan cuma set ini.
 *
 * Simplifikasi sengaja: pindah dari satu Panduan existing ke Panduan existing
 * lain butuh Lepas dulu baru pilih lagi -- tidak ada dropdown "ganti" langsung
 * di atas slot yang sudah terisi, supaya kartu ini tidak perlu dua mode
 * dropdown sekaligus.
 */
export function PanduanSlotCard({
	panduan,
	library,
	canManage,
	onSelectExisting,
	onUploadNew,
	onReplace,
	onDetach,
}: {
	/** `null` = set ini belum punya Panduan terpasang. */
	panduan: SetPanduan | null;
	/** Daftar Panduan tenant ini -- dropdown "pilih existing", dimuat sekali oleh pemanggil. */
	library: PanduanLibraryItem[] | null;
	canManage: boolean;
	onSelectExisting: (panduanId: string) => Promise<void>;
	onUploadNew: (file: File) => Promise<void>;
	onReplace: (file: File) => Promise<void>;
	onDetach: () => void;
}) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = React.useState(false);
	const [selectedId, setSelectedId] = React.useState('');

	const handlePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;

		setUploading(true);
		try {
			if (panduan) {
				await onReplace(file);
			} else {
				await onUploadNew(file);
			}
		} finally {
			setUploading(false);
		}
	};

	const jumlahSetLain = library?.find((p) => p.id === panduan?.id)?.jumlahSetPemakai ?? 0;

	return (
		<div
			className={cn(
				'flex flex-col gap-2 rounded-lg border p-4',
				panduan ? 'border-border' : 'border-dashed border-border',
			)}
		>
			<p className="font-medium">Pedoman Penyusunan</p>

			<input
				ref={inputRef}
				type="file"
				accept={ACCEPTED}
				className="hidden"
				onChange={handlePick}
			/>

			{panduan ? (
				<div className="flex flex-wrap items-center gap-3">
					<div className="min-w-40 flex-1 basis-0">
						<div className="flex flex-wrap items-center gap-2">
							<p className="truncate font-medium" title={panduan.judul}>
								{panduan.judul}
							</p>
							{(panduan.structureParseStatus === 'DIPROSES' ||
								panduan.structureParseStatus === 'GAGAL') && (
								<EvidenceStatusBadge status={panduan.structureParseStatus} />
							)}
						</div>
						{jumlahSetLain > 1 && (
							<p className="text-xs text-muted-foreground">
								Dipakai {jumlahSetLain} instrumen (termasuk ini) -- mengganti berkasnya berlaku untuk semua.
							</p>
						)}
					</div>

					{canManage && (
						<div className="ml-auto flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								aria-label="Ganti berkas Panduan"
								disabled={uploading}
								className="cursor-pointer"
								onClick={() => inputRef.current?.click()}
							>
								<SwapIcon className="size-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Lepas Panduan dari instrumen ini"
								disabled={uploading}
								className="cursor-pointer text-destructive hover:text-destructive"
								onClick={onDetach}
							>
								<TrashIcon className="size-4" />
							</Button>
						</div>
					)}
				</div>
			) : (
				<div className="flex flex-col gap-2">
					<p className="text-sm text-muted-foreground">Belum dipilih.</p>
					{canManage && (
						<div className="flex flex-wrap items-center gap-2">
							<Select
								value={selectedId}
								disabled={uploading || !library || library.length === 0}
								onChange={async (e) => {
									const id = e.target.value;
									setSelectedId(id);
									if (!id) return;
									setUploading(true);
									try {
										await onSelectExisting(id);
									} finally {
										setUploading(false);
										setSelectedId('');
									}
								}}
								className="max-w-56"
							>
								<option value="">
									{library === null
										? 'Memuat…'
										: library.length === 0
											? 'Belum ada Panduan tenant ini'
											: '-- Pilih Panduan existing --'}
								</option>
								{library?.map((p) => (
									<option key={p.id} value={p.id}>
										{p.judul}
									</option>
								))}
							</Select>
							<Button
								variant="outline"
								size="sm"
								disabled={uploading}
								className="cursor-pointer gap-2"
								onClick={() => inputRef.current?.click()}
							>
								<UploadSimpleIcon className="size-4" />
								{uploading ? 'Mengunggah...' : 'Unggah Baru'}
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
