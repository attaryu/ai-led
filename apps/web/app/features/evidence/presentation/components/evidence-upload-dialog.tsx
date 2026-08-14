import * as React from 'react';
import {
	CloudArrowUpIcon,
	WarningCircleIcon,
	XIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { Select } from '~/core/components/ui/select';
import { Field, FieldLabel } from '~/core/components/ui/field';
import { cn } from '~/core/lib/utils';
import { studyProgramRepository } from '~/features/study-program/data/repositories/study-program.repository';
import { type StudyProgramEntity } from '~/features/study-program/domain/entities/study-program.entity';
import {
	EVIDENCE_ACCEPT_ATTRIBUTE,
	EVIDENCE_ACCEPTED_EXTENSIONS,
	validateEvidenceFile,
	type EvidenceOwnerType,
} from '../../domain/entities/evidence.entity';
import { uploadEvidenceTargetSchema } from '../../domain/dtos/upload-evidence.dto';
import {
	useEvidenceUploadStore,
	type UploaderIdentity,
} from '../stores/evidence-upload.store';
import { formatBytes } from '../utils/evidence-format';

const TENANT_OPTION = 'TENANT';

type QueuedFile = { file: File; error: string | null };

/**
 * Modal pemilihan berkas untuk satu batch unggahan (docs/application_flow.md
 * §4.4 & §5.2).
 *
 * Satu batch = satu target: di lapis tenant target dipilih di sini (universitas
 * atau salah satu prodi), di lapis prodi ia terkunci ke prodi yang sedang
 * dibuka sehingga pemilihnya tidak dirender sama sekali.
 *
 * Begitu tombol unggah ditekan, modal langsung tertutup — progres berpindah ke
 * panel melayang agar pengguna tidak terkurung menunggu di halaman ini.
 */
export function EvidenceUploadDialog({
	open,
	onOpenChange,
	level,
	studyProgramId,
	studyProgramName,
	uploader,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	level: EvidenceOwnerType;
	studyProgramId?: string;
	studyProgramName?: string | null;
	uploader: UploaderIdentity;
}) {
	const startBatch = useEvidenceUploadStore((state) => state.startBatch);

	const [queued, setQueued] = React.useState<QueuedFile[]>([]);
	const [isDragging, setIsDragging] = React.useState(false);
	const [targetValue, setTargetValue] = React.useState<string>(TENANT_OPTION);
	const [targetError, setTargetError] = React.useState<string | null>(null);
	const [studyPrograms, setStudyPrograms] = React.useState<
		StudyProgramEntity[]
	>([]);
	const inputRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		if (level === 'TENANT') studyProgramRepository.findAll().then(setStudyPrograms);
	}, [level]);

	// Setiap kali modal dibuka lagi, ia mulai dari kondisi bersih — antrean lama
	// sudah pindah ke panel melayang.
	React.useEffect(() => {
		if (open) {
			setQueued([]);
			setTargetValue(TENANT_OPTION);
			setTargetError(null);
			setIsDragging(false);
		}
	}, [open]);

	const addFiles = React.useCallback((files: FileList | null) => {
		if (!files) return;
		const incoming = Array.from(files).map((file) => ({
			file,
			error: validateEvidenceFile(file),
		}));
		setQueued((previous) => {
			// Berkas yang sama dipilih dua kali cukup dihitung sekali.
			const seen = new Set(
				previous.map((item) => `${item.file.name}-${item.file.size}`),
			);
			return [
				...previous,
				...incoming.filter(
					(item) => !seen.has(`${item.file.name}-${item.file.size}`),
				),
			];
		});
	}, []);

	const validFiles = queued.filter((item) => !item.error).map((item) => item.file);
	const rejectedCount = queued.length - validFiles.length;

	const handleSubmit = () => {
		const target =
			level === 'TENANT'
				? targetValue === TENANT_OPTION
					? { ownerTipe: 'TENANT' as const, studyProgramId: null }
					: {
							ownerTipe: 'PROGRAM_STUDI' as const,
							studyProgramId: targetValue,
						}
				: {
						ownerTipe: 'PROGRAM_STUDI' as const,
						studyProgramId: studyProgramId ?? null,
					};

		const parsed = uploadEvidenceTargetSchema.safeParse(target);
		if (!parsed.success) {
			setTargetError(parsed.error.issues[0]?.message ?? 'Target tidak valid');
			return;
		}
		if (validFiles.length === 0) return;

		const targetProgramName =
			parsed.data.ownerTipe === 'PROGRAM_STUDI'
				? level === 'TENANT'
					? (studyPrograms.find((program) => program.id === targetValue)
							?.studyProgramName ?? null)
					: (studyProgramName ?? null)
				: null;

		startBatch({
			files: validFiles,
			target: parsed.data,
			studyProgramName: targetProgramName,
			uploader,
		});
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Unggah Bukti Dukung</DialogTitle>
					<DialogDescription>
						Bisa memilih beberapa berkas sekaligus. Format{' '}
						{EVIDENCE_ACCEPTED_EXTENSIONS.join(', ')}, maksimal 25 MB per
						berkas.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					{level === 'TENANT' ? (
						<Field data-invalid={!!targetError}>
							<FieldLabel htmlFor="evidence-target">Simpan ke</FieldLabel>
							<Select
								id="evidence-target"
								value={targetValue}
								onChange={(event) => {
									setTargetValue(event.target.value);
									setTargetError(null);
								}}
							>
								<option value={TENANT_OPTION}>
									Universitas (berlaku lintas prodi)
								</option>
								{studyPrograms.map((program) => (
									<option key={program.id} value={program.id}>
										Prodi {program.studyProgramName}
									</option>
								))}
							</Select>
							{targetError && (
								<p className="text-sm text-destructive">{targetError}</p>
							)}
						</Field>
					) : (
						<p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
							Disimpan di{' '}
							<span className="font-medium text-foreground">
								Prodi {studyProgramName}
							</span>{' '}
							dan otomatis tersedia untuk semua Dokumen LED prodi ini.
						</p>
					)}

					<div
						onDragOver={(event) => {
							event.preventDefault();
							setIsDragging(true);
						}}
						onDragLeave={() => setIsDragging(false)}
						onDrop={(event) => {
							event.preventDefault();
							setIsDragging(false);
							addFiles(event.dataTransfer.files);
						}}
						onClick={() => inputRef.current?.click()}
						className={cn(
							'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors',
							isDragging && 'border-primary bg-primary/5',
						)}
					>
						<CloudArrowUpIcon className="size-8 text-muted-foreground" />
						<p className="text-sm font-medium">
							Tarik berkas ke sini, atau klik untuk memilih
						</p>
						<p className="text-xs text-muted-foreground">
							Beberapa berkas sekaligus diperbolehkan
						</p>
						<input
							ref={inputRef}
							type="file"
							multiple
							accept={EVIDENCE_ACCEPT_ATTRIBUTE}
							className="hidden"
							onChange={(event) => {
								addFiles(event.target.files);
								// Direset supaya memilih berkas yang sama lagi tetap memicu
								// onChange.
								event.target.value = '';
							}}
						/>
					</div>

					{queued.length > 0 && (
						<div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
							{queued.map((item) => (
								<div
									key={`${item.file.name}-${item.file.size}`}
									className={cn(
										'flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2',
										item.error && 'border-destructive/40 bg-destructive/5',
									)}
								>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">
											{item.file.name}
										</p>
										<p className="text-xs text-muted-foreground">
											{formatBytes(item.file.size)}
										</p>
										{item.error && (
											<p className="mt-1 flex items-center gap-1 text-xs text-destructive">
												<WarningCircleIcon className="size-3.5 shrink-0" />
												{item.error}
											</p>
										)}
									</div>
									<button
										type="button"
										aria-label={`Keluarkan ${item.file.name}`}
										onClick={() =>
											setQueued((previous) =>
												previous.filter(
													(candidate) => candidate.file !== item.file,
												),
											)
										}
										className="cursor-pointer rounded-sm p-1 text-muted-foreground hover:text-foreground"
									>
										<XIcon className="size-4" />
									</button>
								</div>
							))}
						</div>
					)}

					{rejectedCount > 0 && (
						<p className="text-xs text-muted-foreground">
							{rejectedCount} berkas tidak akan diunggah karena tidak memenuhi
							syarat. Berkas lain tetap bisa dilanjutkan.
						</p>
					)}
				</div>

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
						onClick={handleSubmit}
						disabled={validFiles.length === 0}
						className="cursor-pointer"
					>
						Unggah {validFiles.length > 0 && `${validFiles.length} berkas`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
