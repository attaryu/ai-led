import * as React from 'react';
import {
	CaretDownIcon,
	CaretUpIcon,
	CheckCircleIcon,
	MinusCircleIcon,
	SpinnerGapIcon,
	UploadSimpleIcon,
	WarningCircleIcon,
	type Icon,
} from '@phosphor-icons/react';
import { Link } from 'react-router';

import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { Select } from '~/core/components/ui/select';
import { cn } from '~/core/lib/utils';
import { EvidenceUploadDialog } from '~/features/evidence/presentation/components/evidence-upload-dialog';
import { evidenceRepository, evidenceScopeFor } from '~/features/evidence/data/repositories/evidence.repository';
import { type EvidenceEntity } from '~/features/evidence/domain/entities/evidence.entity';
import { uploadLedPdf } from '../../data/sources/remote/led-upload.remote-source';
import {
	type AssessmentReadiness,
	type AssessmentSource,
	type ReadinessState,
} from '../../domain/entities/assessment-source.entity';

const stateVisual: Record<ReadinessState, { icon: Icon; className: string }> = {
	SIAP: { icon: CheckCircleIcon, className: 'text-emerald-600 dark:text-emerald-400' },
	KURANG: { icon: WarningCircleIcon, className: 'text-destructive' },
	OPSIONAL: { icon: MinusCircleIcon, className: 'text-muted-foreground' },
};

/**
 * Sumber bahan penilaian beserta kesiapannya — pengganti langkah 1 wizard
 * prototipe.
 *
 * Prototipe menaruh empat kotak unggah di sini. Tiga di antaranya sudah punya
 * rumah di produk (master rubrik, editor, pustaka bukti dukung), jadi yang
 * tersisa bukan pekerjaan mengunggah melainkan pekerjaan **memilih** — dan
 * memilih tidak berurutan, sehingga wizardnya tidak punya isi lagi.
 *
 * **Kartunya mengempis saat siap, mengembang saat tidak.** Sengaja bukan sekadar
 * state buka-tutup biasa: prasyarat yang belum terpenuhi tidak akan pernah bisa
 * disembunyikan, apa pun yang diklik pengguna. Kartu yang bisa ditutup dalam
 * keadaan kurang akan membuat tombol jalankan tampak mati tanpa sebab yang
 * terlihat di layar.
 */
export function AssessmentSourceCard({
	sumber,
	setSumber,
	kesiapan,
	kandidat,
	kandidatLkps,
	dokumenId,
	studyProgramId,
	studyProgramName,
	uploader,
	bolehMengubah,
}: {
	sumber: AssessmentSource;
	setSumber: (sumber: AssessmentSource) => void;
	kesiapan: AssessmentReadiness;
	/** Bukti Dukung tabular milik prodi yang bisa dipilih jadi Laporan AK. */
	kandidat: EvidenceEntity[];
	/** LKPS prodi (kartu "Data LKPS"), bukan Bukti Dukung. */
	kandidatLkps: EvidenceEntity[];
	/** Untuk mengaitkan unggahan PDF LED ke dokumen yang benar (R2 + indexing pgvector). */
	dokumenId: string;
	studyProgramId: string;
	studyProgramName: string;
	uploader: { userId: string; name: string };
	bolehMengubah: boolean;
}) {
	const [diminta, setDiminta] = React.useState(false);
	const [unggahUntuk, setUnggahUntuk] = React.useState<'laporan' | null>(null);
	const ledInputRef = React.useRef<HTMLInputElement>(null);
	const lkpsInputRef = React.useRef<HTMLInputElement>(null);
	const [galatLkps, setGalatLkps] = React.useState<string | null>(null);

	const unggahLkps = async (file: File) => {
		setGalatLkps(null);
		// ponytail: kartu ini DISEMBUNYIKAN (lihat TAMPILKAN_KARTU_SUMBER di
		// led-project-assessment.tsx). LKPS kini wajib punya nama + tahun/periode dan
		// terhubung ke Dokumen LED lewat pilihan di form dokumen -- unggah cepat dari sini
		// akan membuat LKPS tanpa keduanya. Kode lama dipertahankan di bawah; kalau kartu ini
		// diaktifkan lagi, ganti dengan dialog yang sama dengan kartu "Data LKPS".
		void file;
		setGalatLkps(
			'Unggah LKPS lewat kartu "Data LKPS" di halaman Bukti Dukung program studi (perlu nama dan tahun/periode).',
		);
		// try {
		// 	const lkps = await evidenceRepository.uploadLkps(file, studyProgramId);
		// 	setSumber({ ...sumber, lkpsBuktiDukungId: lkps.id });
		// } catch (e) {
		// 	setGalatLkps(e instanceof Error ? e.message : 'Unggah LKPS gagal.');
		// }
	};

	const terbuka = diminta || !kesiapan.siap;

	/**
	 * Berkas yang baru selesai diunggah langsung terpilih.
	 *
	 * Inilah yang membuat "unggah" bukan jalur kedua melainkan jalan masuk ke
	 * pustaka: berkasnya tetap jadi `BuktiDukung` yang bisa dipakai ulang
	 * penilaian berikutnya, sementara pengguna tidak perlu mencarinya lagi di
	 * dropdown setelah unggahannya selesai.
	 */
	const pakaiHasilUnggah = React.useCallback(
		(evidence: EvidenceEntity) => {
			if (unggahUntuk === 'laporan') {
				setSumber({ ...sumber, laporanBuktiDukungId: evidence.id });
			}
		},
		[unggahUntuk, sumber, setSumber],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Sumber &amp; Kesiapan</CardTitle>
				<CardDescription>
					{kesiapan.siap
						? 'Semua bahan penilaian sudah tersedia.'
						: `${kesiapan.jumlahKurang} bahan wajib belum lengkap.`}
				</CardDescription>

				{/*
				 * Tombolnya hanya muncul saat kartunya memang boleh ditutup — saat ada
				 * yang kurang, tombol yang tidak bisa menutup apa pun cuma menawarkan
				 * hal yang tidak akan terjadi.
				 */}
				{kesiapan.siap && (
					<CardAction>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setDiminta((nilai) => !nilai)}
							className="cursor-pointer"
						>
							{terbuka ? <CaretUpIcon /> : <CaretDownIcon />}
							{terbuka ? 'Sembunyikan' : 'Ubah sumber'}
						</Button>
					</CardAction>
				)}
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				{terbuka ? (
					<ul className="flex flex-col gap-3">
						{kesiapan.items.map((item) => {
							const { icon: StateIcon, className } = stateVisual[item.state];

							return (
								<li key={item.kunci} className="flex items-start gap-2.5">
									<StateIcon
										className={cn('mt-0.5 size-4 shrink-0', className)}
										weight="fill"
									/>

									<div className="flex min-w-0 flex-1 flex-col gap-1.5">
										<div className="flex flex-wrap items-baseline gap-x-2">
											<p className="text-sm font-medium">{item.label}</p>
											{item.state === 'OPSIONAL' && (
												<span className="text-xs text-muted-foreground">
													opsional
												</span>
											)}
										</div>
										<p className="text-xs leading-relaxed text-muted-foreground">
											{item.keterangan}
										</p>

										{item.kunci === 'led' && bolehMengubah && (
											<SumberLed
												sumber={sumber}
												setSumber={setSumber}
												inputRef={ledInputRef}
												dokumenId={dokumenId}
											/>
										)}

										{item.kunci === 'lkps' && bolehMengubah && (
											<PilihBerkas
												nilai={sumber.lkpsBuktiDukungId}
												onChange={(id) =>
													setSumber({ ...sumber, lkpsBuktiDukungId: id })
												}
												kandidat={kandidatLkps}
												labelKosong="— pilih berkas LKPS —"
												ariaLabel="Berkas data LKPS"
												onUnggah={() => lkpsInputRef.current?.click()}
											/>
										)}
										{item.kunci === 'lkps' && bolehMengubah && (
											<>
												<input
													ref={lkpsInputRef}
													type="file"
													accept=".xlsx,.xls"
													className="hidden"
													onChange={(e) => {
														const file = e.target.files?.[0];
														e.target.value = '';
														if (file) void unggahLkps(file);
													}}
												/>
												{galatLkps && <p className="text-xs text-destructive">{galatLkps}</p>}
											</>
										)}

										{item.kunci === 'laporan' && bolehMengubah && (
											<PilihBerkas
												nilai={sumber.laporanBuktiDukungId}
												onChange={(id) =>
													setSumber({ ...sumber, laporanBuktiDukungId: id })
												}
												kandidat={kandidat}
												labelKosong="— tidak dipakai —"
												ariaLabel="Berkas Laporan AK"
												onUnggah={() => setUnggahUntuk('laporan')}
											/>
										)}

										{item.tautan && !bolehMengubah && (
											<Link
												to={item.tautan.to}
												className="w-fit text-xs font-medium text-primary underline underline-offset-3"
											>
												{item.tautan.label}
											</Link>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						{kesiapan.items
							.filter((item) => item.state === 'SIAP')
							.map((item) => item.keterangan)
							.join(' · ')}
					</p>
				)}
			</CardContent>

			<EvidenceUploadDialog
				open={unggahUntuk !== null}
				onOpenChange={(open) => {
					if (!open) setUnggahUntuk(null);
				}}
				level="PROGRAM_STUDI"
				studyProgramId={studyProgramId}
				studyProgramName={studyProgramName}
				/*
				 * Cakupannya program studi ini, tujuannya akar: halaman Penilaian AMI tidak
				 * menjelajahi perpustakaan, jadi tidak ada folder yang sedang dibuka.
				 * Pemilih folder di modal tetap tersedia (§4.6a).
				 */
				cakupan={evidenceScopeFor({
					ownerTipe: 'PROGRAM_STUDI',
					studyProgramId,
				})}
				labelAkar={`Bukti Dukung ${studyProgramName}`}
				uploader={uploader}
				onUploaded={pakaiHasilUnggah}
			/>
		</Card>
	);
}

/**
 * Dua jalur sumber LED: isi editor atau berkas unggahan.
 *
 * Jalur unggahan ada untuk kasus nyata yang tidak bisa dilayani jalur pertama —
 * dokumen LED yang sudah selesai disusun di luar aplikasi lalu ingin dinilai.
 * Tanpa itu, satu-satunya cara menilai dokumen lama adalah mengetik ulang
 * seluruhnya ke editor.
 */
function SumberLed({
	sumber,
	setSumber,
	inputRef,
	dokumenId,
}: {
	sumber: AssessmentSource;
	setSumber: (sumber: AssessmentSource) => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
	dokumenId: string;
}) {
	const [mengunggah, setMengunggah] = React.useState(false);
	const [galat, setGalat] = React.useState<string | null>(null);

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-wrap items-center gap-2">
				<Select
					value={sumber.sumberLed}
					onChange={(event) =>
						setSumber({
							...sumber,
							sumberLed: event.target.value === 'UNGGAHAN' ? 'UNGGAHAN' : 'EDITOR',
							// Nama berkas ikut dibuang saat kembali ke editor: menyimpannya
							// membuat sesi berikutnya mengaku memakai unggahan yang sudah tidak
							// dipilih lagi.
							ledFileName:
								event.target.value === 'UNGGAHAN' ? sumber.ledFileName : null,
						})
					}
					aria-label="Sumber dokumen LED"
					className="h-8 w-fit text-xs"
				>
					<option value="EDITOR">Dari editor</option>
					<option value="UNGGAHAN">Dari unggahan PDF</option>
				</Select>

				{sumber.sumberLed === 'UNGGAHAN' && (
					<>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => inputRef.current?.click()}
							disabled={mengunggah}
							className="cursor-pointer"
						>
							{mengunggah ? (
								<SpinnerGapIcon className="animate-spin" />
							) : (
								<UploadSimpleIcon />
							)}
							{mengunggah
								? 'Mengunggah…'
								: sumber.ledFileName
									? 'Ganti berkas'
									: 'Pilih PDF'}
						</Button>
						<input
							ref={inputRef}
							type="file"
							accept=".pdf"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0];
								// Direset supaya berkas yang sama bisa dipilih lagi setelah
								// dibatalkan — sama seperti `evidence-upload-dialog.tsx`.
								event.target.value = '';
								if (!file) return;

								setGalat(null);
								setMengunggah(true);
								// PDF LED-nya sendiri sampai ke R2 langsung dari browser (presigned
								// PUT), lalu dikonfirmasi lewat backend yang meneruskannya ke
								// apps/ai untuk diekstraksi+diindeks pgvector — bukan sekadar
								// mencatat nama filenya seperti sebelumnya.
								uploadLedPdf(file, dokumenId)
									.then(() => setSumber({ ...sumber, ledFileName: file.name }))
									.catch(() =>
										setGalat('Unggah PDF LED gagal. Periksa koneksi lalu coba lagi.'),
									)
									.finally(() => setMengunggah(false));
						}}
					/>
				</>
			)}
			</div>

			{galat && (
				<p className="text-xs leading-relaxed text-destructive">{galat}</p>
			)}
		</div>
	);
}

/** Pemilih berkas dari pustaka, dengan unggahan sebagai jalan masuk ke pustaka. */
function PilihBerkas({
	nilai,
	onChange,
	kandidat,
	labelKosong,
	ariaLabel,
	onUnggah,
}: {
	nilai: string | null;
	onChange: (id: string | null) => void;
	kandidat: EvidenceEntity[];
	labelKosong: string;
	ariaLabel: string;
	onUnggah: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Select
				value={nilai ?? ''}
				onChange={(event) => onChange(event.target.value || null)}
				aria-label={ariaLabel}
				className="h-8 w-fit max-w-full text-xs"
			>
				<option value="">{labelKosong}</option>
				{kandidat.map((item) => (
					<option key={item.id} value={item.id}>
						{item.namaDokumen}
						{item.status === 'SIAP' ? '' : ` (${item.status.toLowerCase()})`}
					</option>
				))}
			</Select>

			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={onUnggah}
				className="cursor-pointer"
			>
				<UploadSimpleIcon />
				Unggah
			</Button>
		</div>
	);
}
