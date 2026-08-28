import * as React from 'react';
import { TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { cn } from '~/core/lib/utils';
import { formatDateTime } from '~/core/lib/format-time';
import {
	formatBytes,
	getFileVisual,
} from '~/features/evidence/presentation/utils/evidence-format';
import {
	SET_DOCUMENT_TYPE_HINT,
	SET_DOCUMENT_TYPE_LABEL,
	type AccreditationSetDocument,
	type SetDocumentType,
} from '../../domain/entities/accreditation-set.entity';

/** Jenis berkas yang diterima; sama untuk ketiga slot. */
const ACCEPTED = '.pdf,.docx';

/**
 * Satu slot berkas acuan. Slotnya tetap ada walau kosong — itulah yang membuat
 * "set ini kurang apa" terbaca langsung, alih-alih harus diingat sendiri dari
 * daftar berkas yang ada.
 */
export function DocumentSlotCard({
	tipe,
	dokumen,
	canManage,
	onUpload,
	onRemove,
}: {
	tipe: SetDocumentType;
	/** `null` berarti slot ini belum diisi. */
	dokumen: AccreditationSetDocument | null;
	canManage: boolean;
	onUpload: (tipe: SetDocumentType, file: File) => Promise<void>;
	onRemove: (tipe: SetDocumentType) => void;
}) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = React.useState(false);

	const handlePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// Input direset lebih dulu supaya memilih berkas yang sama dua kali
		// berturut-turut tetap memicu `change`.
		event.target.value = '';
		if (!file) return;

		setUploading(true);
		try {
			await onUpload(tipe, file);
		} finally {
			setUploading(false);
		}
	};

	const { Icon, className } = getFileVisual(dokumen?.tipeBerkas ?? '');

	return (
		<div
			className={cn(
				'flex flex-col gap-3 rounded-lg border p-4',
				dokumen ? 'border-border' : 'border-dashed border-border',
			)}
		>
			<div>
				<p className="font-medium">{SET_DOCUMENT_TYPE_LABEL[tipe]}</p>
				<p className="text-sm text-muted-foreground">
					{SET_DOCUMENT_TYPE_HINT[tipe]}
				</p>
			</div>

			{dokumen ? (
				<div className="flex min-w-0 items-start gap-3">
					<Icon weight="fill" className={cn('mt-0.5 size-8 shrink-0', className)} />
					<div className="min-w-0">
						<p className="break-words font-medium" title={dokumen.namaBerkas}>
							{dokumen.namaBerkas}
						</p>
						<p className="text-xs text-muted-foreground">
							{formatBytes(dokumen.ukuranBytes)} · diunggah{' '}
							{formatDateTime(dokumen.diunggahPada)} oleh {dokumen.diunggahOleh}
						</p>
					</div>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">Belum diunggah.</p>
			)}

			{canManage && (
				<div className="flex items-center gap-2">
					<input
						ref={inputRef}
						type="file"
						accept={ACCEPTED}
						className="hidden"
						onChange={handlePick}
					/>
					<Button
						variant="outline"
						size="sm"
						disabled={uploading}
						className="cursor-pointer gap-2"
						onClick={() => inputRef.current?.click()}
					>
						<UploadSimpleIcon className="size-4" />
						{uploading
							? 'Mengunggah...'
							: dokumen
								? 'Ganti Berkas'
								: 'Unggah Berkas'}
					</Button>
					{dokumen && (
						<Button
							variant="ghost"
							size="sm"
							disabled={uploading}
							className="cursor-pointer gap-2 text-destructive hover:text-destructive"
							onClick={() => onRemove(tipe)}
						>
							<TrashIcon className="size-4" />
							Hapus
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
