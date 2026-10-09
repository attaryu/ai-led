import * as React from 'react';
import {
	CaretDownIcon,
	CaretRightIcon,
	CloudArrowUpIcon,
	FolderIcon,
	FolderPlusIcon,
	FilePlusIcon,
	TagIcon,
	WarningCircleIcon,
	XIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Checkbox } from '~/core/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { Input } from '~/core/components/ui/input';
import { Select } from '~/core/components/ui/select';
import { Field, FieldLabel } from '~/core/components/ui/field';
import { cn } from '~/core/lib/utils';
import { accreditationSetRepository } from '~/features/accreditation-set/data/repositories/accreditation-set.repository';
import { type AccreditationSetEntity } from '~/features/accreditation-set/domain/entities/accreditation-set.entity';
import { type RubricCriterion } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { studyProgramRepository } from '~/features/study-program/data/repositories/study-program.repository';
import { type StudyProgramEntity } from '~/features/study-program/domain/entities/study-program.entity';
import { evidenceFolderRepository } from '../../data/repositories/evidence-folder.repository';
import { evidenceScopeFor } from '../../data/repositories/evidence.repository';
import {
	EVIDENCE_ACCEPT_ATTRIBUTE,
	EVIDENCE_ACCEPTED_EXTENSIONS,
	validateEvidenceFile,
	type EvidenceEntity,
	type EvidenceOwnerType,
} from '../../domain/entities/evidence.entity';
import {
	jalurFolder,
	type EvidenceFolderEntity,
	type EvidenceScope,
} from '../../domain/entities/evidence-folder.entity';
import { uploadEvidenceTargetSchema } from '../../domain/dtos/upload-evidence.dto';
import {
	useEvidenceUploadStore,
	type UploaderIdentity,
} from '../stores/evidence-upload.store';
import { formatBytes } from '../utils/evidence-format';
import { EvidenceFolderPicker } from './evidence-folder-picker';

const TENANT_OPTION = 'TENANT';

/**
 * Batas berkas per batch.
 *
 * Unggah folder membuat batas ini perlu ada: tiap unggahan tiruan memakai
 * `setInterval` sungguhan 1,2–6 detik ditambah dua timer ingestion, dan folder
 * nyata gampang berisi ratusan berkas. Angkanya **dinyatakan di modal dan
 * sisanya dilaporkan**, bukan dipotong diam-diam — daftar yang tiba-tiba lebih
 * pendek dari yang dipilih terbaca seperti berkas yang hilang.
 */
const MAKS_BERKAS_PER_BATCH = 100;

type QueuedFile = {
	file: File;
	error: string | null;
	/** Folder relatif dari hasil pilih folder; kosong untuk pilih berkas biasa. */
	jalur: string[];
};

/** Kunci antrean: nama saja tidak cukup begitu satu batch memuat banyak folder. */
function kunciAntrean(item: QueuedFile): string {
	return `${item.jalur.join('/')}/${item.file.name}-${item.file.size}`;
}

/**
 * Modal pemilihan berkas untuk satu batch unggahan (docs/application_flow.md
 * §4.4, §4.6a & §5.2).
 *
 * Satu batch = satu **cakupan**: di lapis tenant dipilih di sini (universitas
 * atau salah satu prodi), di lapis prodi ia terkunci ke prodi yang sedang dibuka
 * sehingga pemilihnya tidak dirender sama sekali.
 *
 * **Folder-nya per berkas, bukan per batch.** Unggah folder membawa berkas dari
 * beberapa folder sekaligus, sementara cakupannya tetap satu — pembagian itu yang
 * membuat struktur folder di komputer pengguna bisa mendarat apa adanya.
 *
 * **Folder tujuan hanya bisa dipilih saat cakupannya sama dengan yang sedang
 * dibuka.** Mengarahkan unggahan ke prodi lain (§4.4.1) berarti berkasnya masuk
 * pohon prodi itu, yang tidak sedang terlihat; memilih folder di perpustakaan
 * yang tidak kelihatan adalah menebak. Dalam keadaan itu tujuannya akar prodi
 * tersebut, dan itu **dinyatakan**, bukan didiamkan.
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
	allowTenantTarget = false,
	cakupan,
	folderAktif = null,
	labelAkar,
	uploader,
	onUploaded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	level: EvidenceOwnerType;
	studyProgramId?: string;
	studyProgramName?: string | null;
	/**
	 * Membuka opsi "Universitas" pada konteks yang cakupannya terkunci ke satu
	 * prodi (`level === 'PROGRAM_STUDI'`), untuk pengunggah yang memang berwenang
	 * lintas program studi. Prodi lain tetap tidak pernah dirender — hanya prodi yang
	 * sedang dibuka dan universitas.
	 */
	allowTenantTarget?: boolean;
	/** Cakupan yang sedang dibuka; jadi pembanding saat memutuskan folder tujuan. */
	cakupan: EvidenceScope;
	/** Folder yang sedang dibuka; jadi tujuan bawaan. */
	folderAktif?: string | null;
	labelAkar: string;
	uploader: UploaderIdentity;
	/**
	 * Dipanggil per berkas yang barisnya berhasil tercatat. Dipakai pemanggil yang
	 * perlu menindaklanjuti hasil unggahannya — mis. tab Generasi yang mencentang
	 * berkas baru begitu ekstraksinya selesai.
	 */
	onUploaded?: (evidence: EvidenceEntity) => void;
}) {
	const startBatch = useEvidenceUploadStore((state) => state.startBatch);

	/**
	 * Nilai awal pemilih target. Di lapis prodi ia bukan sekadar penanda kosong:
	 * begitu opsi universitas ikut dirender, `targetValue` jadi satu-satunya
	 * sumber target untuk kedua lapis, dan bawaannya harus prodi yang sedang
	 * dibuka — bukan universitas.
	 */
	const targetBawaan = level === 'TENANT' ? TENANT_OPTION : (studyProgramId ?? '');

	const [queued, setQueued] = React.useState<QueuedFile[]>([]);
	const [isDragging, setIsDragging] = React.useState(false);
	const [targetValue, setTargetValue] = React.useState<string>(targetBawaan);
	const [targetError, setTargetError] = React.useState<string | null>(null);
	const [studyPrograms, setStudyPrograms] = React.useState<
		StudyProgramEntity[]
	>([]);
	const [tujuanFolder, setTujuanFolder] = React.useState<string | null>(
		folderAktif,
	);
	const [pemilihTerbuka, setPemilihTerbuka] = React.useState(false);
	const [tolakanTerbuka, setTolakanTerbuka] = React.useState(false);
	const [dilewati, setDilewati] = React.useState(0);
	const [folders, setFolders] = React.useState<EvidenceFolderEntity[]>([]);
	const [setList, setSetList] = React.useState<AccreditationSetEntity[]>([]);
	const [accreditationSetId, setAccreditationSetId] = React.useState<string>('');
	const [indikatorList, setIndikatorList] = React.useState<RubricCriterion[]>([]);
	const [indikatorTerpilih, setIndikatorTerpilih] = React.useState<Set<number>>(
		() => new Set(),
	);
	const [indikatorTerbuka, setIndikatorTerbuka] = React.useState(false);
	const [cariIndikator, setCariIndikator] = React.useState('');
	const inputRef = React.useRef<HTMLInputElement>(null);
	const folderInputRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		if (level === 'TENANT') studyProgramRepository.findAll().then(setStudyPrograms);
	}, [level]);

	// Setiap kali modal dibuka lagi, ia mulai dari kondisi bersih — antrean lama
	// sudah pindah ke panel melayang. Daftar folder dibaca di sini, bukan
	// dilanggankan: modal ini hidup sebentar dan tidak ada yang bisa menambah
	// folder selagi ia terbuka.
	React.useEffect(() => {
		if (!open) return;
		setQueued([]);
		setTargetValue(targetBawaan);
		setTargetError(null);
		setIsDragging(false);
		setTujuanFolder(folderAktif);
		setPemilihTerbuka(false);
		setTolakanTerbuka(false);
		setDilewati(0);
		setIndikatorTerpilih(new Set());
		setIndikatorTerbuka(false);
		setCariIndikator('');
		setAccreditationSetId('');
		setIndikatorList([]);
		evidenceFolderRepository.findByScope(cakupan).then(setFolders);
		accreditationSetRepository.findSelectable().then(setSetList);
	}, [open, targetBawaan, folderAktif, cakupan]);

	// Daftar indikator ikut Set Akreditasi yang dipilih -- nomor indikator
	// mulai dari 1 lagi di tiap set, jadi tidak ada daftar tunggal yang "benar
	// buat semua". Ganti set = pilihan indikator lama tidak lagi bermakna.
	React.useEffect(() => {
		if (!accreditationSetId) {
			setIndikatorList([]);
			setIndikatorTerpilih(new Set());
			return;
		}
		accreditationSetRepository.findById(accreditationSetId).then((set) => {
			// ponytail: dulu `setIndikatorList(set?.kriteria ?? [])`. Dua belas indikator punya dua baris (sub-indikator
			// dengan `no` sama, mis. 43.I/43.II): kuncinya kembar dan dua kotak centang berbagi satu pilihan.
			// Penandaan bukti per NOMOR indikator, jadi satu entri per nomor (baris pertama).
			const unik = new Map<number, NonNullable<typeof set>['kriteria'][number]>();
			for (const k of set?.kriteria ?? []) if (!unik.has(k.no)) unik.set(k.no, k);
			setIndikatorList([...unik.values()]);
		});
		setIndikatorTerpilih(new Set());
	}, [accreditationSetId]);

	const indikatorTersaring = React.useMemo(() => {
		const kunci = cariIndikator.trim().toLowerCase();
		if (!kunci) return indikatorList;
		return indikatorList.filter(
			(indikator) =>
				String(indikator.no).includes(kunci) ||
				indikator.kriteria.toLowerCase().includes(kunci),
		);
	}, [indikatorList, cariIndikator]);

	const toggleIndikator = (no: number) =>
		setIndikatorTerpilih((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			if (!berikutnya.delete(no)) berikutnya.add(no);
			return berikutnya;
		});

	const addFiles = React.useCallback((files: FileList | null) => {
		if (!files) return;

		const incoming = Array.from(files).map<QueuedFile>((file) => {
			// `webkitRelativePath` hanya terisi lewat input berkasnya sendiri —
			// `Kriteria 4/SK/a.pdf`. Ruas terakhir nama berkasnya, jadi dibuang.
			const relatif = file.webkitRelativePath;
			const jalur = relatif ? relatif.split('/').slice(0, -1) : [];

			return { file, error: validateEvidenceFile(file), jalur };
		});

		setQueued((previous) => {
			// Berkas yang sama dipilih dua kali cukup dihitung sekali.
			const seen = new Set(previous.map(kunciAntrean));
			const segar = incoming.filter((item) => !seen.has(kunciAntrean(item)));
			const ruang = MAKS_BERKAS_PER_BATCH - previous.length;

			if (segar.length > ruang) {
				setDilewati((sebelumnya) => sebelumnya + (segar.length - ruang));
				return [...previous, ...segar.slice(0, Math.max(0, ruang))];
			}

			return [...previous, ...segar];
		});
	}, []);

	const validFiles = queued.filter((item) => !item.error);
	const ditolak = queued.filter((item) => item.error);

	/** Ditolak dikelompokkan per alasan; 150 baris satu-satu tidak terbaca lagi. */
	const tolakanPerAlasan = React.useMemo(() => {
		const peta = new Map<string, QueuedFile[]>();
		for (const item of ditolak) {
			const alasan = item.error as string;
			const daftar = peta.get(alasan);
			if (daftar) daftar.push(item);
			else peta.set(alasan, [item]);
		}
		return [...peta.entries()];
	}, [ditolak]);

	/** Antrean dikelompokkan per folder asal; kunci kosong = tanpa folder. */
	const antreanPerJalur = React.useMemo(() => {
		const peta = new Map<string, QueuedFile[]>();
		for (const item of validFiles) {
			const kunci = item.jalur.join('/');
			const daftar = peta.get(kunci);
			if (daftar) daftar.push(item);
			else peta.set(kunci, [item]);
		}
		return [...peta.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [validFiles]);

	const targetTerpilih =
		targetValue === TENANT_OPTION
			? { ownerTipe: 'TENANT' as const, studyProgramId: null }
			: {
					ownerTipe: 'PROGRAM_STUDI' as const,
					studyProgramId: targetValue,
				};

	/**
	 * Apakah target unggahan sama dengan perpustakaan yang sedang dibuka. Kalau
	 * tidak, folder tujuan tidak bisa dipilih — lihat JSDoc komponen.
	 */
	const targetSamaDenganCakupan =
		targetTerpilih.ownerTipe === cakupan.ownerTipe &&
		(targetTerpilih.ownerTipe === 'TENANT' ||
			targetTerpilih.studyProgramId === cakupan.studyProgramId);

	const namaTujuan = React.useMemo(() => {
		if (tujuanFolder === null) return labelAkar;
		const jalur = jalurFolder(folders, tujuanFolder);
		return jalur.length > 0 ? jalur.map((f) => f.nama).join(' / ') : labelAkar;
	}, [folders, tujuanFolder, labelAkar]);

	const [mengirim, setMengirim] = React.useState(false);

	const handleSubmit = async () => {
		const parsed = uploadEvidenceTargetSchema.safeParse(targetTerpilih);
		if (!parsed.success) {
			setTargetError(parsed.error.issues[0]?.message ?? 'Target tidak valid');
			return;
		}
		if (validFiles.length === 0) return;

		const targetProgramName =
			parsed.data.ownerTipe === 'PROGRAM_STUDI'
				? parsed.data.studyProgramId === studyProgramId
					? (studyProgramName ?? null)
					: // Hanya terisi di lapis tenant; di lapis prodi cabang ini tak terjangkau.
						(studyPrograms.find((program) => program.id === targetValue)
							?.studyProgramName ?? null)
				: null;

		const indukTujuan = targetSamaDenganCakupan ? tujuanFolder : null;

		/*
		 * Struktur folder diselesaikan **sekali, sebelum batch dimulai** — bukan
		 * per berkas saat unggahannya jalan. Dua berkas dalam satu folder akan
		 * berlomba membuat folder yang sama kalau masing-masing menyelesaikannya
		 * sendiri. Cakupannya cakupan target, bukan yang sedang dibuka: unggahan ke
		 * prodi lain tetap membawa strukturnya, hanya mendarat di akar prodi itu.
		 */
		const cakupanTujuan = evidenceScopeFor({
			ownerTipe: parsed.data.ownerTipe,
			studyProgramId: parsed.data.studyProgramId,
		});
		const jalurUnik = [
			...new Set(
				validFiles
					.filter((item) => item.jalur.length > 0)
					.map((item) => item.jalur.join('/')),
			),
		].map((kunci) => kunci.split('/'));

		setMengirim(true);
		let petaFolder: Map<string, string | null>;
		try {
			petaFolder =
				jalurUnik.length > 0
					? await evidenceFolderRepository.ensureFolderPaths({
							cakupan: cakupanTujuan,
							parentId: indukTujuan,
							daftarJalur: jalurUnik,
							pembuat: { userId: uploader.userId, nama: uploader.name },
						})
					: new Map<string, string | null>();
		} catch (error) {
			setMengirim(false);
			setTargetError(
				error instanceof Error ? error.message : 'Gagal menyiapkan struktur folder.',
			);
			return;
		}
		setMengirim(false);

		startBatch({
			files: validFiles.map((item) => ({
				file: item.file,
				folderId:
					item.jalur.length === 0
						? indukTujuan
						: (petaFolder.get(item.jalur.join('/')) ?? indukTujuan),
				/** Dipakai panel melayang untuk menyebut tempat mendaratnya. */
				namaFolder:
					item.jalur.length === 0
						? tujuanRingkas(indukTujuan, namaTujuan, targetSamaDenganCakupan)
						: item.jalur[item.jalur.length - 1],
			})),
			target: parsed.data,
			studyProgramName: targetProgramName,
			indicatorNos: indikatorTerpilih.size > 0 ? [...indikatorTerpilih] : undefined,
			accreditationSetId: indikatorTerpilih.size > 0 ? accreditationSetId : undefined,
			uploader,
			onUploaded,
		});
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Unggah Bukti Dukung</DialogTitle>
					<DialogDescription>
						Bisa memilih beberapa berkas, atau satu folder utuh beserta
						isinya. Format {EVIDENCE_ACCEPTED_EXTENSIONS.join(', ')}, maksimal
						25 MB per berkas dan {MAKS_BERKAS_PER_BATCH} berkas per unggahan.
					</DialogDescription>
				</DialogHeader>

				<div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
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
									Universitas (berlaku lintas program studi)
								</option>
								{studyPrograms.map((program) => (
									<option key={program.id} value={program.id}>
										Program studi {program.studyProgramName}
									</option>
								))}
							</Select>
							{targetError && (
								<p className="text-sm text-destructive">{targetError}</p>
							)}
						</Field>
					) : allowTenantTarget ? (
						/*
						 * Tepat dua pilihan. Prodi lain sengaja tidak ikut walau
						 * pengunggahnya berwenang atas semuanya: cakupan yang sedang dibuka
						 * adalah program studi ini, dan mengunggah ke prodi tetangga dari sini
						 * hampir selalu salah pencet, bukan niat. Untuk itu ada perpustakaan
						 * tenant (§4.4.1).
						 */
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
								<option value={studyProgramId ?? ''}>
									Program studi {studyProgramName}
								</option>
								<option value={TENANT_OPTION}>
									Universitas (berlaku lintas program studi)
								</option>
							</Select>
							{targetError && (
								<p className="text-sm text-destructive">{targetError}</p>
							)}
						</Field>
					) : (
						<p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
							Disimpan di{' '}
							<span className="font-medium text-foreground">
								Program studi {studyProgramName}
							</span>{' '}
							dan otomatis tersedia untuk semua Dokumen LED program studi ini.
						</p>
					)}

					{targetSamaDenganCakupan ? (
						<Field>
							<FieldLabel htmlFor="evidence-folder-tujuan">Folder</FieldLabel>
							<button
								id="evidence-folder-tujuan"
								type="button"
								onClick={() => setPemilihTerbuka((buka) => !buka)}
								aria-expanded={pemilihTerbuka}
								className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent/40"
							>
								<FolderIcon
									weight="fill"
									className="size-4 shrink-0 text-muted-foreground"
								/>
								<span className="min-w-0 flex-1 truncate">{namaTujuan}</span>
								{pemilihTerbuka ? (
									<CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
								) : (
									<CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
								)}
							</button>

							{pemilihTerbuka && (
								<EvidenceFolderPicker
									folders={folders}
									labelAkar={labelAkar}
									nilai={tujuanFolder}
									onPilih={setTujuanFolder}
								/>
							)}

							<p className="text-xs text-muted-foreground">
								Folder dari hasil pilih folder dibuat di dalam sini.
							</p>
						</Field>
					) : (
						<p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
							Berkas mendarat di <span className="font-medium">akar</span>{' '}
							perpustakaan tujuan, bukan di folder yang sedang Anda buka —
							pohon folder tiap perpustakaan berdiri sendiri. Struktur folder
							yang ikut diunggah tetap terbawa.
						</p>
					)}

					{/*
					 * Tag indikator berlaku untuk **seluruh batch**, sama seperti target di
					 * atas — mencerminkan cara pemilih folder tujuan bekerja, dan alasan yang
					 * sama: satu batch nyaris selalu berisi bukti untuk kebutuhan yang sama.
					 * Kosong BUKAN berarti berlaku ke semua indikator — sebaliknya, evidence
					 * tanpa tag sama sekali TIDAK PERNAH muncul di pencarian bukti agen
					 * penilaian AMI untuk indikator manapun (list_available_evidence_ids
					 * di pgvector_evidence_store.py meng-INNER JOIN ke evidence_indicator_tags,
					 * tanpa fallback — port skema origin/ariel). Mengosongkan tag berarti
					 * berkas ini murni referensi Bukti Dukung, tidak dipakai asesmen AMI.
					 */}
					<Field>
						<FieldLabel htmlFor="evidence-accreditation-set">
							Set Akreditasi acuan (opsional)
						</FieldLabel>
						<Select
							id="evidence-accreditation-set"
							value={accreditationSetId}
							onChange={(event) => setAccreditationSetId(event.target.value)}
						>
							<option value="">Tidak ditandai ke indikator manapun</option>
							{setList.map((set) => (
								<option key={set.id} value={set.id}>
									{set.nama}
								</option>
							))}
						</Select>
					</Field>

					<Field>
						<FieldLabel htmlFor="evidence-indicator-tujuan">
							Tag indikator AMI (opsional)
						</FieldLabel>
						<button
							id="evidence-indicator-tujuan"
							type="button"
							disabled={!accreditationSetId}
							onClick={() => setIndikatorTerbuka((buka) => !buka)}
							aria-expanded={indikatorTerbuka}
							className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<TagIcon
								weight="fill"
								className="size-4 shrink-0 text-muted-foreground"
							/>
							<span className="min-w-0 flex-1 truncate">
								{!accreditationSetId
									? 'Pilih Set Akreditasi dulu untuk menandai indikator'
									: indikatorTerpilih.size > 0
										? `${indikatorTerpilih.size} indikator dipilih`
										: 'Belum ditandai (tidak dipakai asesmen AMI)'}
							</span>
							{indikatorTerbuka ? (
								<CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
							) : (
								<CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
							)}
						</button>

						{indikatorTerbuka && (
							<div className="flex flex-col gap-2 rounded-md border border-border p-2">
								<Input
									value={cariIndikator}
									onChange={(event) => setCariIndikator(event.target.value)}
									placeholder="Cari nomor atau kriteria..."
									aria-label="Cari indikator AMI"
									className="h-8 text-sm"
								/>
								<div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
									{indikatorTersaring.map((indikator) => (
										<label
											key={indikator.no}
											className="flex cursor-pointer items-start gap-2 rounded-sm px-1.5 py-1 hover:bg-accent/40"
										>
											<Checkbox
												checked={indikatorTerpilih.has(indikator.no)}
												onCheckedChange={() => toggleIndikator(indikator.no)}
												className="mt-0.5"
											/>
											<span className="text-xs leading-snug">
												<span className="font-medium">{indikator.no}.</span>{' '}
												{indikator.kriteria}
											</span>
										</label>
									))}
									{indikatorTersaring.length === 0 && (
										<p className="py-3 text-center text-xs text-muted-foreground">
											Tidak ada indikator yang cocok.
										</p>
									)}
								</div>
							</div>
						)}

						<p className="text-xs text-muted-foreground">
							Berlaku untuk seluruh berkas dalam unggahan ini. Agen penilaian AMI
							hanya mencari bukti yang ditandai indikator yang sedang dinilainya —
							berkas tanpa tag tidak akan muncul di penilaian AMI manapun.
						</p>
					</Field>

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
						className={cn(
							'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors',
							isDragging && 'border-primary bg-primary/5',
						)}
					>
						<CloudArrowUpIcon className="size-8 text-muted-foreground" />
						<p className="text-sm font-medium">Tarik berkas ke sini</p>

						<div className="flex flex-wrap items-center justify-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => inputRef.current?.click()}
								className="cursor-pointer gap-1.5"
							>
								<FilePlusIcon className="size-4" />
								Pilih berkas
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => folderInputRef.current?.click()}
								className="cursor-pointer gap-1.5"
							>
								<FolderPlusIcon className="size-4" />
								Pilih folder
							</Button>
						</div>

						<p className="text-xs text-muted-foreground">
							Pilih folder ikut membawa subfoldernya. Folder yang tidak berisi
							berkas tidak ikut terbawa.
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
						{/*
						 * `webkitdirectory` tidak ada di tipe atribut React, dan ia satu-satunya
						 * cara membaca struktur folder dari peramban. Ditulis lewat `{...{}}`
						 * supaya tidak perlu menambal deklarasi global demi satu atribut.
						 *
						 * Tanpa `accept`: peramban tidak menyaringnya secara andal untuk
						 * pilihan folder, dan berkas sampah seperti `.DS_Store` memang
						 * seharusnya masuk lalu ditolak dengan alasannya — bukan lenyap
						 * tanpa kabar.
						 */}
						<input
							ref={folderInputRef}
							type="file"
							multiple
							className="hidden"
							{...{ webkitdirectory: '' }}
							onChange={(event) => {
								addFiles(event.target.files);
								event.target.value = '';
							}}
						/>
					</div>

					{antreanPerJalur.length > 0 && (
						<div className="flex flex-col gap-3">
							{antreanPerJalur.map(([kunci, daftar]) => (
								<div key={kunci} className="flex flex-col gap-2">
									{kunci !== '' && (
										<p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
											<FolderIcon weight="fill" className="size-3.5 shrink-0" />
											{kunci.split('/').join(' / ')}
										</p>
									)}
									{daftar.map((item) => (
										<BarisAntrean
											key={kunciAntrean(item)}
											item={item}
											onKeluarkan={() =>
												setQueued((previous) =>
													previous.filter(
														(kandidat) => kandidat.file !== item.file,
													),
												)
											}
										/>
									))}
								</div>
							))}
						</div>
					)}

					{tolakanPerAlasan.length > 0 && (
						<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
							<button
								type="button"
								onClick={() => setTolakanTerbuka((buka) => !buka)}
								aria-expanded={tolakanTerbuka}
								aria-controls="daftar-tolakan"
								className="flex w-full cursor-pointer items-center gap-2 text-left"
							>
								<WarningCircleIcon className="size-4 shrink-0 text-destructive" />
								<span className="min-w-0 flex-1 text-sm font-medium">
									{ditolak.length} berkas dilewati
								</span>
								{tolakanTerbuka ? (
									<CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
								) : (
									<CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
								)}
							</button>

							<div className="mt-1.5 flex flex-col gap-1">
								{tolakanPerAlasan.map(([alasan, daftar]) => (
									<p key={alasan} className="text-xs text-muted-foreground">
										{daftar.length} × {alasan}
									</p>
								))}
							</div>

							{/*
							 * Tetap dirender walau tertutup: `aria-controls` di atas harus
							 * menunjuk elemen yang sungguh ada. Pola yang sama dengan daftar
							 * saran bukti dukung di tab Generasi.
							 */}
							<ul
								id="daftar-tolakan"
								hidden={!tolakanTerbuka}
								className="mt-2 flex max-h-40 list-inside list-disc flex-col gap-0.5 overflow-y-auto text-xs text-muted-foreground"
							>
								{ditolak.map((item) => (
									<li key={kunciAntrean(item)} className="truncate">
										{item.jalur.length > 0 && `${item.jalur.join('/')}/`}
										{item.file.name}
									</li>
								))}
							</ul>

							<p className="mt-2 text-xs text-muted-foreground">
								Berkas lain dalam pilihan ini tetap bisa dilanjutkan.
							</p>
						</div>
					)}

					{dilewati > 0 && (
						<p className="text-xs text-muted-foreground">
							{dilewati} berkas tidak dimasukkan karena satu unggahan dibatasi{' '}
							{MAKS_BERKAS_PER_BATCH} berkas. Unggah sisanya setelah batch ini
							selesai.
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
						disabled={validFiles.length === 0 || mengirim}
						className="cursor-pointer"
					>
						Unggah {validFiles.length > 0 && `${validFiles.length} berkas`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Nama pendek tujuan untuk baris panel melayang. */
function tujuanRingkas(
	folderId: string | null,
	namaLengkap: string,
	targetSama: boolean,
): string | null {
	if (!targetSama || folderId === null) return null;
	const bagian = namaLengkap.split(' / ');
	return bagian[bagian.length - 1];
}

function BarisAntrean({
	item,
	onKeluarkan,
}: {
	item: QueuedFile;
	onKeluarkan: () => void;
}) {
	return (
		<div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
				</p>
			</div>
			<button
				type="button"
				aria-label={`Keluarkan ${item.file.name}`}
				onClick={onKeluarkan}
				className="cursor-pointer rounded-sm p-1 text-muted-foreground hover:text-foreground"
			>
				<XIcon className="size-4" />
			</button>
		</div>
	);
}
