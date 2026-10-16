import * as React from 'react';
import {
	FolderIcon,
	MagnifyingGlassIcon,
	SparkleIcon,
	SpinnerGapIcon,
	UploadSimpleIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Checkbox } from '~/core/components/ui/checkbox';
import { Input } from '~/core/components/ui/input';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { EvidenceStatusBadge } from '~/features/evidence/presentation/components/evidence-status-badge';
import { EvidenceUploadDialog } from '~/features/evidence/presentation/components/evidence-upload-dialog';
import { evidenceScopeFor } from '~/features/evidence/data/repositories/evidence.repository';
import { useEvidencePermission } from '~/features/evidence/presentation/hooks/use-evidence-permission';
import { formatBytes } from '~/features/evidence/presentation/utils/evidence-format';
import { type EvidenceEntity } from '~/features/evidence/domain/entities/evidence.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type ChapterSectionEntity } from '../../domain/entities/chapter-section.entity';
import {
	frasaBlokir,
	type ChapterPermission,
} from '../hooks/use-chapter-permission';
import {
	useChapterGeneration,
	type HasilGenerate,
} from '../hooks/use-chapter-generation';
import { useChapterRecommendation } from '../hooks/use-chapter-recommendation';
import { useChapterSections } from '../hooks/use-chapter-sections';
import { ChapterDocumentRecommendation } from './chapter-document-recommendation';

/**
 * Isi tab "Generasi" (docs/application_flow.md §12.1): memilih bukti dukung yang
 * jadi konteks AI, memberi arahan tambahan, lalu menjalankan generate yang
 * langsung menimpa `kontenKerja` tanpa tahap pratinjau.
 *
 * Daftarnya menampilkan **seluruh** bukti dukung yang boleh dipakai bab ini,
 * termasuk yang belum selesai diproses. §4.5 memang memintanya begitu: berkas
 * yang statusnya belum `SIAP` tetap terlihat supaya penyusun tahu ia sudah
 * terunggah dan tinggal ditunggu — statusnya sendirilah penjelasan kenapa ia
 * belum bisa dicentang.
 */
/** Aksi Generate section terbuka yang dipasang di toolbar editor. */
export type KontrolGenerate = { jalankan: () => Promise<void>; berjalan: boolean };

export function ChapterGenerationPanel({
	chapter,
	studyProgramId,
	izin,
	section,
	onGenerated,
	onKontrolGenerate,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
	izin: ChapterPermission;
	/** Section yang dibuka di kanvas — pemilik rekomendasi dokumen (dimas: per section). */
	section: ChapterSectionEntity | null;
	/** Dipanggil setelah hasilnya tersimpan; halaman editor yang mendorongnya ke Tiptap. */
	onGenerated: (hasil: HasilGenerate) => void;
	/**
	 * dimas: satu tombol Generate untuk section yang dibuka, di toolbar editor (bukan daftar tombol per
	 * section di sini). Panel ini yang memegang centang bukti & rekomendasi, jadi ia yang menyerahkan aksinya.
	 */
	onKontrolGenerate?: (kontrol: KontrolGenerate | null) => void;
}) {
	const generasi = useChapterGeneration({
		chapter,
		studyProgramId,
		izin,
		sectionId: section?.id ?? null,
		onGenerated,
	});
	const rekomendasiDokumen = useChapterRecommendation({
		chapter,
		izin,
		sectionId: section?.id ?? null,
	});
	const sections = useChapterSections(chapter.id);

	const {
		daftar,
		jalurBukti,
		totalPustaka,
		jumlahSiap,
		kataKunci,
		setKataKunci,
		terpilih,
		toggle,
		kembalikanKeDasar,
		jumlahBaru,
		punyaDasar,
		jumlahGugur,
		namaProdi,
		tandaiUnggahanBaru,
		jumlahMenungguOtomatis,
		status,
		pesanGagal,
		peringatanChecklist,
		digenerateAt,
		jalankanGenerate,
		bisaSimpanDraft,
		versiTersimpan,
		simpanSebagaiDraft,
	} = generasi;

	const sedangBerjalan = status === 'berjalan' || sections.status === 'berjalan';

	/**
	 * Hak unggah dibaca terpisah dari `izin`, dan sengaja **tidak** diikat ke
	 * `izin.canEdit`. Mengunggah bukti dukung tidak menyentuh isi bab, jadi §12.2
	 * tidak melarangnya saat bab terkunci; dan §4.4 memberi Pimpinan — yang di
	 * editor hanya membaca — hak unggah yang penuh.
	 */
	const izinBukti = useEvidencePermission('PROGRAM_STUDI', studyProgramId);
	const bisaUnggah = izinBukti.canUpload && izinBukti.session !== null;
	const [unggahTerbuka, setUnggahTerbuka] = React.useState(false);

	/**
	 * Kelompok folder ROOT (segmen pertama `jalurBukti`) buat daftar Bukti
	 * Dukung -- port pola dimas (`RecommendationPanel.jsx`): daftar panjang
	 * jadi satu kotak scroll sendiri (lihat `h-64` di bawah) dibagi per
	 * folder, bukan satu list datar raksasa. Berkas di akar (tanpa folder)
	 * dirender lepas duluan, sebelum kelompok folder.
	 *
	 * Berkas yg SEDANG dicentang dipisah ke grup "Terpilih" tersendiri di
	 * paling atas (`terpilihAkar`/`terpilihKelompok`) -- lepas dari folder
	 * asalnya, tapi tetap dikelompokkan per-folder DI DALAM grup itu --
	 * supaya user langsung lihat semua pilihannya tanpa expand folder
	 * (port lanjutan pola dimas, commit `9ae4fad`). `kelompok`/`akar` di
	 * bawah cuma berisi SISA yg belum tercentang; `kelompokSemua` tetap
	 * dihitung terpisah supaya state checkbox header folder (checked/
	 * indeterminate) akurat walau sebagian isinya sudah pindah ke atas.
	 */
	const folderGroups = React.useMemo(() => {
		const akarSemua: EvidenceEntity[] = [];
		const kelompokSemua = new Map<string, EvidenceEntity[]>();
		for (const bukti of daftar) {
			// ponytail: dikelompokkan per JALUR LENGKAP, bukan segmen pertama.
			// Dulu `.split(' / ')[0]` melipat "sertifikat mahasiswa / akademik" dan
			// "sertifikat mahasiswa / non akademik" jadi satu kelompok, jadi
			// subfoldernya tidak pernah terlihat dan tidak bisa dicentang terpisah.
			const jalurPenuh = jalurBukti.get(bukti.id);
			if (!jalurPenuh) {
				akarSemua.push(bukti);
				continue;
			}
			(kelompokSemua.get(jalurPenuh) ?? kelompokSemua.set(jalurPenuh, []).get(jalurPenuh)!).push(
				bukti,
			);
		}

		const terpilihAkar = akarSemua.filter((b) => terpilih.has(b.id));
		const akar = akarSemua.filter((b) => !terpilih.has(b.id));
		const terpilihKelompok = new Map<string, EvidenceEntity[]>();
		const kelompok = new Map<string, EvidenceEntity[]>();
		for (const [nama, dokumen] of kelompokSemua) {
			const dipilih = dokumen.filter((b) => terpilih.has(b.id));
			const sisa = dokumen.filter((b) => !terpilih.has(b.id));
			if (dipilih.length > 0) terpilihKelompok.set(nama, dipilih);
			if (sisa.length > 0) kelompok.set(nama, sisa);
		}

		return {
			akar,
			kelompok,
			kelompokSemua,
			namaFolder: [...kelompok.keys()].sort(),
			terpilihAkar,
			terpilihKelompok,
			namaFolderTerpilih: [...terpilihKelompok.keys()].sort(),
		};
	}, [daftar, jalurBukti, terpilih]);

	const [folderTerbuka, setFolderTerbuka] = React.useState<Record<string, boolean>>({});

	/**
	 * Centang/lepas SEMUA berkas SIAP di satu folder sekaligus (termasuk yang
	 * belum di-expand) -- kalau baru sebagian terpilih, klik pertama
	 * melengkapi jadi semua terpilih (bukan malah melepas semua).
	 */
	function toggleFolderSelection(dokumen: EvidenceEntity[]) {
		const bisaDipilih = dokumen.filter((bukti) => bukti.status === 'SIAP');
		const semuaTerpilih =
			bisaDipilih.length > 0 && bisaDipilih.every((bukti) => terpilih.has(bukti.id));
		for (const bukti of bisaDipilih) {
			if (terpilih.has(bukti.id) === semuaTerpilih) toggle(bukti);
		}
	}

	const { rekomendasi } = rekomendasiDokumen;

	// `onGenerated` sekarang dipanggil dari DALAM `useChapterGeneration`
	// (lihat JSDoc `onGenerated` di sana) supaya jalur menyambung ulang job
	// lama setelah refresh juga mendorong hasilnya ke editor, bukan cuma
	// jalur klik manual ini.
	//
	// Konfirmasi + generate satu aksi (persis `confirmAndGenerate` milik
	// dimas) -- tidak ada tombol Konfirmasi terpisah. Kalau rekomendasi masih
	// DIREKOMENDASIKAN (belum pernah dikonfirmasi), konfirmasi dulu dengan
	// `terpilih` SEKARANG sebelum generate; `confirmRecommendation` menolak
	// (403) rekomendasi yang sudah DIKONFIRMASI, jadi ini cuma jalan sekali.
	async function handleGenerateSection(sectionId: string) {
		// Rekomendasi milik section yang dibuka saja; section lain generate dengan centang manual.
		// dimas confirmAndGenerate: selalu konfirmasi ulang dengan centang SEKARANG, jadi rekomendasi
		// ikut pilihan terbaru dan cross-check status dokumen tetap jalan sesudah centang diubah.
		const pakaiRekomendasi = rekomendasi?.chapterSectionId === sectionId;
		if (pakaiRekomendasi) await rekomendasiDokumen.konfirmasi([...terpilih]);
		await jalankanGenerate(sectionId, pakaiRekomendasi ? rekomendasi!.chapterDraftId : undefined);
		await sections.refetch();
	}

	// Ref supaya kontrol yang diserahkan ke toolbar selalu memanggil closure terbaru (centang/rekomendasi sekarang).
	const generateRef = React.useRef(handleGenerateSection);
	generateRef.current = handleGenerateSection;
	const sectionId = section?.id ?? null;
	React.useEffect(() => {
		if (!onKontrolGenerate) return;
		onKontrolGenerate(
			sectionId && izin.canEdit
				? { jalankan: () => generateRef.current(sectionId), berjalan: sedangBerjalan }
				: null,
		);
	}, [onKontrolGenerate, sectionId, izin.canEdit, sedangBerjalan]);
	React.useEffect(() => () => onKontrolGenerate?.(null), [onKontrolGenerate]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 space-y-2 px-5 pt-4 pb-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
					<div className="flex items-center gap-1">
						<p className="text-sm font-medium">Bukti Dukung</p>

						{/*
						 * Ditaruh menempel pada judulnya, bukan di kaki panel bersama
						 * tombol Generate: yang ini menambah isi daftar di atasnya, bukan
						 * menjalankan apa pun atas pilihan yang sudah dibuat.
						 *
						 * **Berlabel, bukan ikon telanjang.** Begitu pustakanya terisi,
						 * keadaan kosong tidak lagi dirender dan tombol inilah satu-satunya
						 * jalan unggah dari dalam tab — sementara tidak ada apa pun di
						 * layar yang menamainya. Bobotnya sengaja ditahan di `ghost`/`xs`:
						 * ia utilitas yang selalu tersedia, dan tidak boleh menyaingi
						 * "Unggah sekarang" di blok rekomendasi, yang menjawab nasihat
						 * tertentu dan menyebut berkas apa yang sedang dicari.
						 */}
						{bisaUnggah && (
							<Button
								type="button"
								size="xs"
								variant="ghost"
								onClick={() => setUnggahTerbuka(true)}
								disabled={sedangBerjalan}
								className="cursor-pointer text-muted-foreground hover:text-foreground"
							>
								<UploadSimpleIcon />
								Unggah
							</Button>
						)}
					</div>

					<div className="flex items-baseline gap-2 text-xs text-muted-foreground">
						<span>
							{terpilih.size > 0
								? `${terpilih.size} dipilih`
								: `${jumlahSiap} siap dipakai`}
						</span>

						{/*
						 * Hanya membatalkan centang yang dibuat sesi ini. Bukti yang sudah
						 * dipakai generate sebelumnya sengaja tidak ikut dilepas: itu
						 * konteks yang memang sedang berlaku untuk bab ini, dan
						 * melepasnya diam-diam berarti generate berikutnya kehilangan
						 * dasar tanpa pengguna memintanya.
						 */}
						{jumlahBaru > 0 && (
							<button
								type="button"
								onClick={kembalikanKeDasar}
								disabled={sedangBerjalan}
								className="underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
							>
								{punyaDasar ? `Batalkan ${jumlahBaru} baru` : 'Bersihkan'}
							</button>
						)}
					</div>
				</div>

				<div className="relative">
					<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={kataKunci}
						onChange={(event) => setKataKunci(event.target.value)}
						disabled={sedangBerjalan}
						placeholder="Cari nama berkas, pengunggah, atau tipe..."
						aria-label="Cari bukti dukung"
						className="h-8 pl-8 text-sm"
					/>
				</div>
			</div>

			{/* Daftar bukti mengisi sisa tinggi panel; aksi menempel di bawah (bukan menyisakan ruang kosong). */}
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex min-h-0 flex-1 flex-col px-5 pb-2">
					{/*
					 * Nempel langsung di atas daftar Bukti Dukung, bukan di kaki panel
					 * dekat Generate (posisi lama) -- menjawab pertanyaan sebaliknya
					 * dari daftar di bawahnya: satu memerikan yang dimiliki, satu yang
					 * dibutuhkan bab ini, jadi keduanya bertetangga (pola mockup-only
					 * attar, `chapter-generation-panel.tsx`).
					 */}
					{izin.canEdit && (
						<ChapterDocumentRecommendation
							judulSection={section ? section.judul || 'section ini' : null}
							rekomendasi={rekomendasi}
							status={rekomendasiDokumen.status}
							pesanGagal={rekomendasiDokumen.pesanGagal}
							dimatikan={sedangBerjalan}
							onTrigger={rekomendasiDokumen.trigger}
						/>
					)}

					{daftar.length === 0 ? (
						<KeadaanKosong
							totalPustaka={totalPustaka}
							bisaUnggah={bisaUnggah}
							dimatikan={sedangBerjalan}
							onUnggah={() => setUnggahTerbuka(true)}
						/>
					) : (
						<ScrollArea className="min-h-40 flex-1 rounded-md border border-border">
							<ul className="space-y-0.5 p-1.5">
								{(folderGroups.terpilihAkar.length > 0 || folderGroups.namaFolderTerpilih.length > 0) && (
									<li>
										<p className="px-1.5 py-1 text-[11px] font-semibold tracking-wider text-primary uppercase">
											Terpilih ({terpilih.size})
										</p>
										<ul className="space-y-0.5">
											{folderGroups.terpilihAkar.map((bukti) => (
												<BarisBukti
													key={bukti.id}
													bukti={bukti}
													jalur={jalurBukti.get(bukti.id)}
													terpilih
													dimatikan={sedangBerjalan}
													onToggle={() => toggle(bukti)}
												/>
											))}
											{folderGroups.namaFolderTerpilih.map((nama) => (
												<li key={nama}>
													<p className="flex items-center gap-1.5 px-2 py-1 pl-6 text-[11px] text-muted-foreground">
														<FolderIcon className="size-3 shrink-0" />
														<span className="truncate">{nama}</span>
													</p>
													<ul className="space-y-0.5 pl-4">
														{folderGroups.terpilihKelompok.get(nama)!.map((bukti) => (
															<BarisBukti
																key={bukti.id}
																bukti={bukti}
																jalur={jalurBukti.get(bukti.id)}
																terpilih
																dimatikan={sedangBerjalan}
																onToggle={() => toggle(bukti)}
															/>
														))}
													</ul>
												</li>
											))}
										</ul>
									</li>
								)}

								{folderGroups.akar.map((bukti) => (
									<BarisBukti
										key={bukti.id}
										bukti={bukti}
										jalur={jalurBukti.get(bukti.id)}
										terpilih={terpilih.has(bukti.id)}
										dimatikan={sedangBerjalan}
										onToggle={() => toggle(bukti)}
									/>
								))}

								{folderGroups.namaFolder.map((nama) => {
									const dokumen = folderGroups.kelompok.get(nama)!;
									const dokumenLengkap = folderGroups.kelompokSemua.get(nama)!;
									return (
										<GrupFolderBukti
											key={nama}
											nama={nama}
											dokumen={dokumen}
											dokumenLengkap={dokumenLengkap}
											jalurBukti={jalurBukti}
											terpilih={terpilih}
											dimatikan={sedangBerjalan}
											terbuka={!!folderTerbuka[nama]}
											onToggleTerbuka={() =>
												setFolderTerbuka((s) => ({ ...s, [nama]: !s[nama] }))
											}
											onToggleBukti={toggle}
											onToggleSemua={() => toggleFolderSelection(dokumenLengkap)}
										/>
									);
								})}
							</ul>
						</ScrollArea>
					)}
				</div>

				<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
					{/*
					 * Auto-centang tanpa keterangan terbaca seperti perilaku hantu: berkas
					 * yang barusan diunggah tampil mati beberapa detik, lalu tiba-tiba
					 * tercentang sendiri. Baris ini yang mengumumkannya lebih dulu.
					 */}
					{jumlahMenungguOtomatis > 0 && (
						<p className="text-xs leading-relaxed text-muted-foreground">
							{jumlahMenungguOtomatis} berkas yang baru diunggah sedang diproses
							dan akan tercentang sendiri begitu siap dipakai.
						</p>
					)}

					{/*
					 * Hanya bicara soal berkas yang benar-benar lenyap dari pustaka. Yang
					 * cuma belum selesai diproses tidak lagi disebut di sini — barisnya
					 * terlihat di daftar atas lengkap dengan badge dan catatan gagalnya,
					 * dan karena statusnya tidak berubah sendiri, catatan ini dulu menyala
					 * permanen sampai berhenti terbaca sebagai kabar.
					 */}
					{jumlahGugur > 0 && (
						<p className="text-xs leading-relaxed text-muted-foreground">
							{jumlahGugur} bukti dari generate sebelumnya sudah dihapus dari
							pustaka, jadi tidak ikut tercentang.
						</p>
					)}

					{/*
					 * §1: yang tidak boleh dipakai disembunyikan, bukan ditampilkan mati —
					 * aturan yang sama dipakai bilah alat editor. Daftar di atas tetap utuh
					 * karena §12.2 menuntut seluruh tab tetap terbaca saat bab dikunci.
					 */}
					{izin.canEdit ? (
						<>
							<div className="flex items-center justify-between gap-2">
								<span />

								{sections.dimuat && sections.sections.length === 0 && (
									<Button
										type="button"
										size="sm"
										onClick={() => sections.generateOutline()}
										disabled={sedangBerjalan}
										className="shrink-0"
									>
										{sections.status === 'berjalan' ? (
											<>
												<SpinnerGapIcon className="animate-spin" />
												Menyusun outline…
											</>
										) : (
											<>
												<SparkleIcon />
												Buat Outline
											</>
										)}
									</Button>
								)}
							</div>

							{sections.status === 'gagal' && sections.pesanGagal && (
								<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
									<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
									<p className="text-xs leading-relaxed text-destructive">
										{sections.pesanGagal}
									</p>
								</div>
							)}

							{sections.dimuat && sections.sections.length > 0 && !section && (
								<p className="text-xs leading-relaxed text-muted-foreground">
									Buka satu section di Daftar Isi, lalu tekan Generate di toolbar editor.
								</p>
							)}

							{sedangBerjalan && (
								<p className="text-xs leading-relaxed text-muted-foreground">
									Hasilnya akan langsung menggantikan isi bab ini.
								</p>
							)}

							{status === 'gagal' && pesanGagal && (
								<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
									<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
									<p className="text-xs leading-relaxed text-destructive">
										{pesanGagal}
									</p>
								</div>
							)}

							{status === 'diam' && peringatanChecklist && (
								<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
									<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
									<p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
										Section ini digenerate tanpa panduan pencarian fakta (checklist gagal disusun): {peringatanChecklist}
									</p>
								</div>
							)}

							{status === 'diam' && digenerateAt && (
								<p className="text-xs leading-relaxed text-muted-foreground">
									Digenerate {formatRelativeTimeLong(digenerateAt)} dari{' '}
									{chapter.buktiDukung.length} bukti dukung.{' '}
									{/*
									 * §8.2: checkpoint tidak pernah dibuat sistem sendiri, bahkan
									 * sesudah generate. Tawarannya diletakkan di sini — tepat di
									 * tempat hasilnya muncul — supaya jalur yang menandai
									 * checkpoint bersumber `AI` adalah jalur yang paling dekat.
									 */}
									{bisaSimpanDraft ? (
										<button
											type="button"
											onClick={simpanSebagaiDraft}
											className="underline underline-offset-4 hover:text-foreground"
										>
											Simpan sebagai draft
										</button>
									) : (
										versiTersimpan !== null && (
											<span className="text-foreground">
												Tersimpan sebagai Versi {versiTersimpan}.
											</span>
										)
									)}
								</p>
							)}
						</>
					) : (
						/*
						 * Akibatnya lebih dulu, sebabnya belakangan — dua kalimat pendek,
						 * bukan satu kalimat "X, jadi Y tidak bisa". Yang dicari pembaca
						 * saat tombolnya mati adalah "apa yang tidak bisa saya lakukan",
						 * dan itu tidak boleh menunggu sampai anak kalimat kedua.
						 */
						<p className="text-xs leading-relaxed text-muted-foreground">
							{izin.blockedReason === 'terkunci' ||
							izin.blockedReason === 'diajukan'
								? `Generate tidak tersedia. ${frasaBlokir[izin.blockedReason]}.`
								: 'Anda hanya bisa membaca bab ini.'}
						</p>
					)}
				</div>
			</div>

			{/*
			 * Modal yang sama persis dengan yang dipakai kedua Perpustakaan Bukti
			 * Dukung — termasuk panel progres melayangnya, yang sudah terpasang di
			 * akar aplikasi sehingga unggahan tetap jalan walau penggunanya berpindah
			 * bab atau keluar dari editor (§4.5).
			 */}
			{bisaUnggah && izinBukti.session && (
				<EvidenceUploadDialog
					open={unggahTerbuka}
					onOpenChange={setUnggahTerbuka}
					level="PROGRAM_STUDI"
					studyProgramId={studyProgramId}
					studyProgramName={namaProdi}
					allowTenantTarget={izinBukti.canUploadTenant}
					/*
					 * Cakupannya prodi dokumen ini, dan tujuannya akarnya — editor bab
					 * tidak sedang menjelajahi perpustakaan, jadi tidak ada "folder yang
					 * sedang dibuka" untuk dijadikan bawaan. Pemilih foldernya tetap ada
					 * di modal, sehingga berkas yang diunggah sambil menulis tetap bisa
					 * langsung ditaruh pada tempatnya (§4.6a).
					 */
					cakupan={evidenceScopeFor({
						ownerTipe: 'PROGRAM_STUDI',
						studyProgramId,
					})}
					labelAkar={`Bukti Dukung ${namaProdi ?? ''}`.trim()}
					uploader={{
						userId: izinBukti.session.userId,
						name: izinBukti.session.namaLengkap,
					}}
					onUploaded={tandaiUnggahanBaru}
				/>
			)}
		</div>
	);
}

/**
 * Keadaan kosong daftar bukti dukung, dibedakan menurut **penyebabnya** (§4.6).
 */
function KeadaanKosong({
	totalPustaka,
	bisaUnggah,
	dimatikan,
	onUnggah,
}: {
	totalPustaka: number;
	bisaUnggah: boolean;
	dimatikan: boolean;
	onUnggah: () => void;
}) {
	if (totalPustaka > 0) {
		return (
			<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
				Tidak ada berkas yang cocok dengan pencarian.
			</p>
		);
	}

	if (!bisaUnggah) {
		return (
			<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
				Belum ada bukti dukung yang bisa dipakai bab ini. Unggah dari
				Perpustakaan Bukti Dukung lebih dulu.
			</p>
		);
	}

	// Ajakannya bisa dituntaskan di tempat; sebelumnya kalimat ini memulangkan
	// pengguna ke Perpustakaan Bukti Dukung dan kembali.
	return (
		<div className="flex flex-col items-center gap-2 py-8 text-center">
			<p className="text-xs leading-relaxed text-muted-foreground">
				Belum ada bukti dukung yang bisa dipakai bab ini.
			</p>
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={onUnggah}
				disabled={dimatikan}
				className="cursor-pointer"
			>
				<UploadSimpleIcon />
				Unggah bukti dukung
			</Button>
		</div>
	);
}

const FOLDER_PREVIEW_COUNT = 5;

/**
 * Satu kelompok folder di daftar Bukti Dukung (port pola dimas
 * `RecommendationPanel.jsx`): header bisa dicentang buat pilih semua isi
 * folder, isinya dibatasi {@link FOLDER_PREVIEW_COUNT} dulu supaya folder
 * besar tidak mendominasi kotak scroll `h-64` di atasnya sendirian.
 */
function GrupFolderBukti({
	nama,
	dokumen,
	dokumenLengkap,
	jalurBukti,
	terpilih,
	dimatikan,
	terbuka,
	onToggleTerbuka,
	onToggleBukti,
	onToggleSemua,
}: {
	nama: string;
	/** Sisa yg BELUM tercentang -- yg dirender sbg baris di bawah header. */
	dokumen: EvidenceEntity[];
	/** SELURUH isi folder ini (termasuk yg sudah pindah ke grup "Terpilih") -- dipakai utk state checkbox header & hitungan supaya tetap akurat. */
	dokumenLengkap: EvidenceEntity[];
	jalurBukti: Map<string, string>;
	terpilih: ReadonlySet<string>;
	dimatikan: boolean;
	terbuka: boolean;
	onToggleTerbuka: () => void;
	onToggleBukti: (bukti: EvidenceEntity) => void;
	onToggleSemua: () => void;
}) {
	if (dokumen.length === 0) return null; // seluruh isi folder ini sudah tercentang, tak perlu render grup kosong

	const ditampilkan = terbuka ? dokumen : dokumen.slice(0, FOLDER_PREVIEW_COUNT);
	const sisaTersembunyi = dokumen.length - ditampilkan.length;
	const bisaDipilihLengkap = dokumenLengkap.filter((bukti) => bukti.status === 'SIAP');
	const jumlahTerpilihLengkap = bisaDipilihLengkap.filter((bukti) => terpilih.has(bukti.id)).length;

	return (
		<li>
			<label
				className={
					dimatikan || bisaDipilihLengkap.length === 0
						? 'flex cursor-not-allowed items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground opacity-60'
						: 'flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60'
				}
			>
				<Checkbox
					checked={bisaDipilihLengkap.length > 0 && jumlahTerpilihLengkap === bisaDipilihLengkap.length}
					indeterminate={jumlahTerpilihLengkap > 0 && jumlahTerpilihLengkap < bisaDipilihLengkap.length}
					onCheckedChange={onToggleSemua}
					disabled={dimatikan || bisaDipilihLengkap.length === 0}
					aria-label={`Pilih semua file di folder ${nama}`}
				/>
				<FolderIcon className="size-3.5 shrink-0" />
				<span className="min-w-0 flex-1 truncate">{nama}</span>
				<span className="shrink-0 text-muted-foreground/70">({dokumenLengkap.length})</span>
			</label>

			<ul className="space-y-0.5 pl-4">
				{ditampilkan.map((bukti) => (
					<BarisBukti
						key={bukti.id}
						bukti={bukti}
						jalur={jalurBukti.get(bukti.id)}
						terpilih={terpilih.has(bukti.id)}
						dimatikan={dimatikan}
						onToggle={() => onToggleBukti(bukti)}
					/>
				))}
			</ul>

			{(sisaTersembunyi > 0 || terbuka) && dokumen.length > FOLDER_PREVIEW_COUNT && (
				<button
					type="button"
					onClick={onToggleTerbuka}
					className="w-full py-1 pl-9 text-left text-xs text-muted-foreground hover:text-foreground"
				>
					{terbuka ? 'Sembunyikan' : `Tampilkan ${sisaTersembunyi} lainnya…`}
				</button>
			)}
		</li>
	);
}

/**
 * Satu bukti dukung di daftar pemilihan.
 *
 * Seluruh barisnya `<label>` supaya sasaran kliknya selebar baris, bukan sekotak
 * 16 px. Untuk baris yang tidak bisa dipakai, statusnya tetap ditampilkan penuh
 * dan catatan kegagalannya ikut dimunculkan — itulah satu-satunya keterangan
 * yang menjelaskan kenapa ia mati.
 */
function BarisBukti({
	bukti,
	jalur,
	terpilih,
	dimatikan,
	onToggle,
}: {
	bukti: EvidenceEntity;
	/** Jalur folder berkas ini; tak ada berarti di akar perpustakaannya. */
	jalur?: string;
	terpilih: boolean;
	/** `true` selagi generate berjalan; seluruh daftar dibekukan. */
	dimatikan: boolean;
	onToggle: () => void;
}) {
	const belumSiap = bukti.status !== 'SIAP';
	const nonaktif = belumSiap || dimatikan;

	return (
		<li>
			<label
				className={
					nonaktif
						? 'flex cursor-not-allowed items-start gap-2.5 rounded-md px-2 py-2 opacity-60'
						: 'flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60'
				}
			>
				<Checkbox
					checked={terpilih}
					onCheckedChange={onToggle}
					disabled={nonaktif}
					className="mt-0.5"
					aria-label={bukti.namaDokumen}
				/>

				<span className="min-w-0 flex-1">
					<span
						className="block truncate text-sm leading-tight"
						title={bukti.namaDokumen}
					>
						{bukti.namaDokumen}
					</span>

					<span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
						<EvidenceStatusBadge status={bukti.status} />
						<span className="text-xs text-muted-foreground">
							{bukti.tipeFile.toUpperCase()} · {formatBytes(bukti.ukuranBytes)}
						</span>
					</span>

					{/*
					 * Jalur lengkap tetap ditampilkan di sini walau folder ROOT-nya
					 * sudah jadi header kelompok (GrupFolderBukti) -- yang membedakan
					 * dua berkas bernama sama di SUBfolder berbeda dalam folder ROOT
					 * yang sama, lihat JSDoc `jalurBukti`.
					 */}
					{jalur && (
						<span
							className="mt-1 block truncate text-xs text-muted-foreground"
							title={jalur}
						>
							{jalur}
						</span>
					)}

					{bukti.status === 'GAGAL' && bukti.catatanGagal && (
						<span className="mt-1 block text-xs leading-relaxed text-destructive">
							{bukti.catatanGagal}
						</span>
					)}
				</span>
			</label>
		</li>
	);
}
