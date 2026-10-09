import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	CheckIcon,
	TrashIcon,
	WarningCircleIcon,
	XIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Separator } from '~/core/components/ui/separator';
import {
	Sheet,
	SheetBody,
	SheetFooter,
	SheetHeader,
} from '~/core/components/ui/sheet';
import { cn } from '~/core/lib/utils';
import {
	type EvidenceEntity,
	type EvidenceStatus,
} from '../../domain/entities/evidence.entity';
import { formatDateTime } from '~/core/lib/format-time';
import { formatBytes, getFileVisual } from '../utils/evidence-format';
import { EvidenceStatusBadge } from './evidence-status-badge';

/**
 * Tahapan pipeline ekstraksi. Ditampilkan sebagai langkah berjenjang yang
 * diturunkan dari status saat ini — bukan riwayat bercap waktu, karena backend
 * memang hanya menyimpan status terakhir (docs/database.md → BUKTI_DUKUNG).
 */
const ingestionSteps: { status: EvidenceStatus; label: string }[] = [
	{ status: 'MENUNGGU', label: 'Masuk antrean ekstraksi' },
	{ status: 'DIPROSES', label: 'Teks sedang diekstraksi' },
	{ status: 'SIAP', label: 'Siap dipakai sebagai konteks AI' },
];

// SIAP satu angka lewat index terakhir (bukan `2`) — supaya `index < currentStep`
// di bawah menandai KETIGA langkah selesai, bukan cuma dua dan menyisakan
// langkah terakhir tampak "sedang aktif" padahal prosesnya sudah tuntas.
const stepOrder: Record<EvidenceStatus, number> = {
	MENUNGGU: 0,
	DIPROSES: 1,
	SIAP: ingestionSteps.length,
	GAGAL: 1,
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="break-words">{value}</span>
		</div>
	);
}

export function EvidenceDetailPanel({
	evidence,
	folderJalur,
	canDelete,
	canRetry,
	onClose,
	onDelete,
	onRetry,
	onOpenFile,
}: {
	/** `null` → panel tertutup. */
	evidence: EvidenceEntity | null;
	/**
	 * Nama folder dari akar sampai tempat berkas ini; kosong berarti di akar.
	 *
	 * Dititipkan pemanggil, bukan dibaca sendiri dari penyimpanan: panel ini
	 * seluruhnya menampilkan apa yang diberikan padanya, dan menambah satu
	 * langganan `storage-update` di sini hanya untuk satu baris teks membuatnya
	 * punya sumber data sendiri yang harus dijaga sinkron dengan daftarnya.
	 */
	folderJalur: string[];
	canDelete: boolean;
	canRetry: boolean;
	onClose: () => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
	/** Buka berkas asli di tab baru (presigned URL R2, diminta fresh tiap klik). */
	onOpenFile: (evidence: EvidenceEntity) => void;
}) {
	if (!evidence) return null;

	const { Icon: FileTypeIcon, className } = getFileVisual(evidence.tipeFile);
	const currentStep = stepOrder[evidence.status];
	const isFailed = evidence.status === 'GAGAL';

	return (
		<Sheet
			open
			onClose={onClose}
			label={`Detail ${evidence.namaDokumen}`}
		>
			<SheetHeader onClose={onClose}>
				<div className="flex min-w-0 items-start gap-3">
					<FileTypeIcon
						weight="fill"
						className={cn('mt-0.5 size-8 shrink-0', className)}
					/>
					<div className="min-w-0">
						<h3
							className="font-heading font-semibold break-words"
							title={evidence.namaDokumen}
						>
							{evidence.namaDokumen}
						</h3>
						<EvidenceStatusBadge status={evidence.status} className="mt-1.5" />
					</div>
				</div>
			</SheetHeader>

			<SheetBody>
					{isFailed && evidence.catatanGagal && (
						<div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							<WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
							<span>{evidence.catatanGagal}</span>
						</div>
					)}

					<DetailRow
						label="Level"
						value={
							evidence.ownerTipe === 'TENANT'
								? 'Universitas (lintas program studi)'
								: `Program studi ${evidence.studyProgramName ?? '-'}`
						}
					/>
					<DetailRow
						label="Folder"
						value={
							folderJalur.length === 0 ? (
								<span className="text-muted-foreground">
									Di luar folder mana pun
								</span>
							) : (
								folderJalur.join(' / ')
							)
						}
					/>
					<DetailRow
						label="Tipe berkas"
						value={evidence.tipeFile.toUpperCase()}
					/>
					<DetailRow label="Ukuran" value={formatBytes(evidence.ukuranBytes)} />
					<DetailRow label="Diunggah oleh" value={evidence.uploadedByName} />
					<DetailRow
						label="Waktu unggah"
						value={formatDateTime(evidence.waktuDiunggah)}
					/>
					<DetailRow
						label="Lokasi objek"
						value={
							<code className="text-xs break-all text-muted-foreground">
								{evidence.fileUrl}
							</code>
						}
					/>

					<Separator className="my-5" />

					<p className="mb-3 text-sm font-medium">Status pemrosesan</p>
					<ol className="flex flex-col gap-3">
						{ingestionSteps.map((step, index) => {
							const done = index < currentStep;
							const active = index === currentStep && !isFailed;
							const failedHere = index === currentStep && isFailed;

							return (
								<li key={step.status} className="flex items-start gap-3">
									<span
										className={cn(
											'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
											done &&
												'border-emerald-500 bg-emerald-500 text-white dark:border-emerald-400 dark:bg-emerald-400',
											active && 'border-primary text-primary',
											failedHere &&
												'border-destructive bg-destructive text-white',
											!done &&
												!active &&
												!failedHere &&
												'border-border text-muted-foreground',
										)}
									>
										{done ? (
											<CheckIcon className="size-3" weight="bold" />
										) : failedHere ? (
											<XIcon className="size-3" weight="bold" />
										) : (
											index + 1
										)}
									</span>
									<span
										className={cn(
											'text-sm',
											!done && !active && !failedHere && 'text-muted-foreground',
										)}
									>
										{failedHere ? 'Ekstraksi gagal' : step.label}
									</span>
								</li>
							);
						})}
					</ol>
			</SheetBody>

			{(evidence.status === 'SIAP' || canDelete || (canRetry && isFailed)) && (
				<SheetFooter className="flex items-center justify-end gap-2">
					{evidence.status === 'SIAP' && (
						<Button
							variant="outline"
							onClick={() => onOpenFile(evidence)}
							className="cursor-pointer gap-2"
						>
							<ArrowSquareOutIcon className="size-4" />
							Buka berkas
						</Button>
					)}
					{canRetry && isFailed && (
						<Button
							variant="outline"
							onClick={() => onRetry(evidence)}
							className="cursor-pointer gap-2"
						>
							<ArrowClockwiseIcon className="size-4" />
							Coba proses lagi
						</Button>
					)}
					{canDelete && (
						<Button
							variant="destructive"
							onClick={() => onDelete(evidence)}
							className="cursor-pointer gap-2"
						>
							<TrashIcon className="size-4" />
							Hapus
						</Button>
					)}
				</SheetFooter>
			)}
		</Sheet>
	);
}
