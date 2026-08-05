import * as React from 'react';
import {
	ArrowClockwiseIcon,
	CheckIcon,
	TrashIcon,
	WarningCircleIcon,
	XIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Separator } from '~/core/components/ui/separator';
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

const stepOrder: Record<EvidenceStatus, number> = {
	MENUNGGU: 0,
	DIPROSES: 1,
	SIAP: 2,
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
	canDelete,
	canRetry,
	onClose,
	onDelete,
	onRetry,
}: {
	/** `null` → panel tertutup. */
	evidence: EvidenceEntity | null;
	canDelete: boolean;
	canRetry: boolean;
	onClose: () => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
}) {
	React.useEffect(() => {
		if (!evidence) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [evidence, onClose]);

	if (!evidence) return null;

	const { Icon: FileTypeIcon, className } = getFileVisual(evidence.tipeFile);
	const currentStep = stepOrder[evidence.status];
	const isFailed = evidence.status === 'GAGAL';

	return (
		<>
			<div
				className="fixed inset-0 z-40 bg-black/40"
				onClick={onClose}
				aria-hidden
			/>

			<aside
				role="dialog"
				aria-label={`Detail ${evidence.namaDokumen}`}
				className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-lg"
			>
				<div className="flex items-start justify-between gap-3 border-b border-border p-5">
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
							<EvidenceStatusBadge
								status={evidence.status}
								className="mt-1.5"
							/>
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Tutup detail"
						onClick={onClose}
						className="shrink-0 cursor-pointer"
					>
						<XIcon className="size-4" />
					</Button>
				</div>

				<div className="flex-1 overflow-y-auto p-5">
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
								? 'Universitas (lintas prodi)'
								: `Prodi ${evidence.studyProgramName ?? '-'}`
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
				</div>

				{(canDelete || (canRetry && isFailed)) && (
					<div className="flex items-center justify-end gap-2 border-t border-border p-4">
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
					</div>
				)}
			</aside>
		</>
	);
}
