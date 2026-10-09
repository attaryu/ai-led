import * as React from 'react';
import { ArrowClockwiseIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { formatRelativeTime } from '~/core/lib/format-time';
import { evidenceRepository } from '../../data/repositories/evidence.repository';
import { type EvidenceEntity } from '../../domain/entities/evidence.entity';
import { labelLkps } from '../../domain/lkps-meta';
import { useEvidencePermission } from '../hooks/use-evidence-permission';
import { formatBytes, getFileVisual } from '../utils/evidence-format';
import { EvidenceStatusBadge } from './evidence-status-badge';
import { LkpsUploadDialog } from './lkps-upload-dialog';

/**
 * Kartu LKPS prodi (dimas: kartu "LKPS" di atas perpustakaan berkas) -- Excel
 * LKPS disimpan terpisah dari Bukti Dukung: tidak muncul di perpustakaan, tidak
 * diekstrak sebagai bukti. Begitu diunggah langsung diindeks per sheet
 * (INGESTION_LKPS, algoritma dimas); statusnya Menunggu -> Siap/Gagal. Satu prodi
 * boleh punya beberapa LKPS; tiap Dokumen LED memilih salah satunya.
 */
export function LkpsCard({ studyProgramId }: { studyProgramId: string }) {
	const izin = useEvidencePermission('PROGRAM_STUDI', studyProgramId);
	const [daftar, setDaftar] = React.useState<EvidenceEntity[]>([]);
	// const [mengunggah, setMengunggah] = React.useState(false);
	// const inputRef = React.useRef<HTMLInputElement>(null);
	// Unggah kini lewat dialog (berkas + nama + tahun/periode), bukan langsung memilih berkas.
	const [dialogUnggah, setDialogUnggah] = React.useState(false);
	const [galat, setGalat] = React.useState<string | null>(null);

	const muat = React.useCallback(() => {
		evidenceRepository
			.findLkpsByStudyProgram(studyProgramId)
			.then(setDaftar)
			.catch(() => setGalat('Gagal memuat daftar LKPS.'));
	}, [studyProgramId]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	// Indexing runs in the worker -- poll while any LKPS is still MENUNGGU.
	const adaMenunggu = daftar.some((lkps) => lkps.status === 'MENUNGGU');
	React.useEffect(() => {
		if (!adaMenunggu) return;
		const timer = window.setInterval(muat, 3000);
		return () => window.clearInterval(timer);
	}, [adaMenunggu, muat]);

	const prosesUlang = async (lkps: EvidenceEntity) => {
		setGalat(null);
		try {
			await evidenceRepository.retryIngestion(lkps.id);
			muat();
		} catch (e) {
			setGalat(e instanceof Error ? e.message : 'Gagal memproses ulang LKPS.');
		}
	};

	// ponytail: dulu langsung mengunggah berkas tanpa nama/periode; digantikan LkpsUploadDialog.
	// const unggah = async (file: File) => {
	// setGalat(null);
	// setMengunggah(true);
	// try {
	// await evidenceRepository.uploadLkps(file, studyProgramId);
	// } catch (e) {
	// setGalat(e instanceof Error ? e.message : 'Unggah LKPS gagal.');
	// } finally {
	// setMengunggah(false);
	// }
	// };

	const hapus = async (lkps: EvidenceEntity) => {
		if (!window.confirm(`Hapus LKPS "${lkps.namaDokumen}"?`)) return;
		try {
			await evidenceRepository.delete(lkps.id);
		} catch (e) {
			setGalat(e instanceof Error ? e.message : 'Gagal menghapus LKPS.');
		}
	};

	if (!izin.canView) return null;

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle>Data LKPS</CardTitle>
					<CardDescription>
						Excel LKPS program studi (.xlsx/.xls), terpisah dari Bukti Dukung. Tiap LKPS diberi nama dan
						tahun/periode, lalu dipilih saat membuat Dokumen LED.
					</CardDescription>
				</div>
				{izin.canUpload && (
					<Button
						size="sm"
						onClick={() => setDialogUnggah(true)}
						className="shrink-0 cursor-pointer"
					>
						<UploadSimpleIcon className="size-4" />
						Unggah LKPS
					</Button>
				)}
			</CardHeader>
			<CardContent className="space-y-2">
				{galat && <p className="text-sm text-destructive">{galat}</p>}
				{daftar.length === 0 ? (
					<p className="text-sm text-muted-foreground">Belum ada LKPS untuk program studi ini.</p>
				) : (
					<ul className="divide-y divide-border rounded-md border border-border">
						{daftar.map((lkps) => {
							const { Icon, className } = getFileVisual(lkps.tipeFile);
							return (
								<li key={lkps.id} className="flex items-center gap-3 px-3 py-2">
									<Icon weight="fill" className={`size-5 shrink-0 ${className}`} />
									<button
										type="button"
										onClick={() => evidenceRepository.openFile(lkps.fileUrl)}
										className="min-w-0 flex-1 cursor-pointer text-left"
									>
										{/* <p className="truncate text-sm font-medium">{lkps.namaDokumen}</p> */}
										<p className="truncate text-sm font-medium">{labelLkps(lkps)}</p>
										<p className="text-xs text-muted-foreground">
											{formatBytes(lkps.ukuranBytes)} · {lkps.uploadedByName} ·{' '}
											{formatRelativeTime(lkps.waktuDiunggah)}
										</p>
										{lkps.status === 'GAGAL' && lkps.catatanGagal && (
											<p className="text-xs text-destructive">{lkps.catatanGagal}</p>
										)}
									</button>
									<EvidenceStatusBadge status={lkps.status} />
									{lkps.status === 'GAGAL' && izin.canRetry(lkps) && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() => void prosesUlang(lkps)}
											className="cursor-pointer"
										>
											<ArrowClockwiseIcon className="size-4" />
											Proses ulang
										</Button>
									)}
									{izin.canDelete(lkps) && (
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Hapus ${lkps.namaDokumen}`}
											onClick={() => void hapus(lkps)}
											className="cursor-pointer"
										>
											<TrashIcon className="size-4" />
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
			<LkpsUploadDialog
				open={dialogUnggah}
				onOpenChange={setDialogUnggah}
				studyProgramId={studyProgramId}
			/>
		</Card>
	);
}
