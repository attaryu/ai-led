import * as React from 'react';
import {
	TrashIcon,
	UploadSimpleIcon,
	UserIcon,
	SwapIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/core/components/ui/tooltip';
import { cn } from '~/core/lib/utils';
import { formatDateTimeCompact } from '~/core/lib/format-time';
import {
	formatBytes,
	getFileVisual,
} from '~/features/evidence/presentation/utils/evidence-format';
import {
	SET_DOCUMENT_TYPE_LABEL,
	type AccreditationSetDocument,
	type SetDocumentType,
} from '../../domain/entities/accreditation-set.entity';

/** Jenis berkas yang diterima; sama untuk ketiga slot. */
const ACCEPTED = '.pdf,.docx';

/**
 * Tombol beraksi tunggal tanpa teks.
 *
 * `render` menukar elemen pemicunya jadi tombol ini alih-alih membungkusnya:
 * `TooltipTrigger` bawaan Base UI merender `<button>` sendiri, dan tombol
 * bersarang bukan HTML yang sah — persoalan yang sudah pernah menimbulkan galat
 * hidrasi di `assessment-confidence-badge.tsx`.
 */
function AksiIkon({
	label,
	icon: Icon,
	disabled,
	merusak,
	onClick,
}: {
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	disabled?: boolean;
	merusak?: boolean;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={label}
						disabled={disabled}
						onClick={onClick}
						className={cn(
							'cursor-pointer',
							merusak && 'text-destructive hover:text-destructive',
						)}
					/>
				}
			>
				<Icon className="size-4" />
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

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
				'flex flex-col gap-2 rounded-lg border p-4',
				dokumen ? 'border-border' : 'border-dashed border-border',
			)}
		>
			<p className="font-medium">{SET_DOCUMENT_TYPE_LABEL[tipe]}</p>

			<input
				ref={inputRef}
				type="file"
				accept={ACCEPTED}
				className="hidden"
				onChange={handlePick}
			/>

			{dokumen ? (
				// Satu baris: ikon berkas, lalu nama beserta keterangannya, lalu aksi
				// di ujung kanan. Aksinya ikon saja karena keduanya berulang di tiap
				// slot — tiga kali "Ganti Berkas" dan "Hapus" di satu kartu lebih
				// banyak dibaca daripada dipakai.
				<div className="flex flex-wrap items-center gap-3">
					<Icon weight="fill" className={cn('size-8 shrink-0', className)} />

					{/* `min-w-40` memaksa aksinya melipat ke baris sendiri begitu nama
					    berkas tidak lagi kebagian ruang yang layak — tanpa itu, di lebar
					    360px nama berkas terpotong tinggal belasan huruf demi menyisakan
					    tempat untuk dua ikon. Angkanya sengaja tidak lebih besar: pada
					    ambang yang terlalu tinggi, ikon berkasnya sendiri yang ikut
					    terlempar ke baris sendiri. */}
					<div className="min-w-40 flex-1 basis-0">
						<p className="truncate font-medium" title={dokumen.namaBerkas}>
							{dokumen.namaBerkas}
						</p>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
							<span>{formatBytes(dokumen.ukuranBytes)}</span>
							<span className="inline-flex items-center gap-1">
								<UploadSimpleIcon className="size-3.5 shrink-0" />
								{formatDateTimeCompact(dokumen.diunggahPada)}
							</span>
							<span className="inline-flex items-center gap-1">
								<UserIcon className="size-3.5 shrink-0" />
								{dokumen.diunggahOleh}
							</span>
						</div>
					</div>

					{canManage && (
						<div className="ml-auto flex shrink-0 items-center">
							<AksiIkon
								label="Ganti berkas"
								icon={SwapIcon}
								disabled={uploading}
								onClick={() => inputRef.current?.click()}
							/>
							<AksiIkon
								label="Hapus berkas"
								icon={TrashIcon}
								disabled={uploading}
								merusak
								onClick={() => onRemove(tipe)}
							/>
						</div>
					)}
				</div>
			) : (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-sm text-muted-foreground">Belum diunggah.</p>
					{canManage && (
						// Tetap bertulisan, tidak ikut jadi ikon: ini satu-satunya aksi di
						// slot yang masih kosong, dan slot kosong justru yang perlu
						// menyatakan sendiri apa yang harus dilakukan padanya.
						<Button
							variant="outline"
							size="sm"
							disabled={uploading}
							className="cursor-pointer gap-2"
							onClick={() => inputRef.current?.click()}
						>
							<UploadSimpleIcon className="size-4" />
							{uploading ? 'Mengunggah...' : 'Unggah Berkas'}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
