import * as React from 'react';
import {
	CaretDownIcon,
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
import { Textarea } from '~/core/components/ui/textarea';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { EvidenceStatusBadge } from '~/features/evidence/presentation/components/evidence-status-badge';
import { EvidenceUploadDialog } from '~/features/evidence/presentation/components/evidence-upload-dialog';
import { useEvidencePermission } from '~/features/evidence/presentation/hooks/use-evidence-permission';
import { formatBytes } from '~/features/evidence/presentation/utils/evidence-format';
import { type EvidenceEntity } from '~/features/evidence/domain/entities/evidence.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	frasaBlokir,
	type ChapterPermission,
} from '../hooks/use-chapter-permission';
import {
	useChapterGeneration,
	type HasilGenerate,
} from '../hooks/use-chapter-generation';

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
export function ChapterGenerationPanel({
	chapter,
	studyProgramId,
	izin,
	onGenerated,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
	izin: ChapterPermission;
	/** Dipanggil setelah hasilnya tersimpan; halaman editor yang mendorongnya ke Tiptap. */
	onGenerated: (hasil: HasilGenerate) => void;
}) {
	const generasi = useChapterGeneration({ chapter, studyProgramId, izin });

	const {
		daftar,
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
		prompt,
		setPrompt,
		status,
		pesanGagal,
		digenerateAt,
		jalankanGenerate,
		bisaSimpanDraft,
		versiTersimpan,
		simpanSebagaiDraft,
	} = generasi;

	const sedangBerjalan = status === 'berjalan';

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
	 * Prompt tertutup secara bawaan karena ia memang opsional (§12.1 bahkan tidak
	 * menyebutnya sama sekali): membiarkannya terbuka berarti tiga baris ruang
	 * hilang dari daftar bukti dukung di setiap sesi, termasuk yang tidak pernah
	 * mengisinya.
	 */
	const [promptTerbuka, setPromptTerbuka] = React.useState(false);

	async function handleGenerate() {
		const hasil = await jalankanGenerate();
		if (hasil) onGenerated(hasil);
	}

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
						 */}
						{bisaUnggah && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => setUnggahTerbuka(true)}
								disabled={sedangBerjalan}
								aria-label="Unggah bukti dukung"
								className="size-6 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
							>
								<UploadSimpleIcon className="size-4" />
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

			{/*
			 * Hanya bagian inilah yang bergulir. Pencarian di atas dan blok generate
			 * di bawah tetap terlihat berapa pun panjang pustakanya — daftar yang
			 * mendorong tombolnya keluar layar akan membuat penyusun menggulung balik
			 * hanya untuk menekan Generate.
			 *
			 * `ScrollArea`, bukan `overflow-y-auto`, karena kolomnya sempit: scrollbar
			 * bawaan Windows selebar ~17 px memakan ruang yang di sini justru paling
			 * mahal, sementara yang ini 10 px dan menumpang di atas isinya. Dasarnya
			 * tetap gulungan native, jadi roda tetikus, drag thumb, dan pencarian
			 * bawaan peramban berperilaku seperti biasa.
			 */}
			<ScrollArea className="min-h-0 flex-1">
				<div className="px-5">
					{daftar.length === 0 ? (
						totalPustaka === 0 && bisaUnggah ? (
							// Ajakannya kini bisa dituntaskan di tempat; sebelumnya kalimat ini
							// memulangkan pengguna ke Perpustakaan Bukti Dukung dan kembali.
							<div className="flex flex-col items-center gap-2 py-8 text-center">
								<p className="text-xs leading-relaxed text-muted-foreground">
									Belum ada bukti dukung yang bisa dipakai bab ini.
								</p>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => setUnggahTerbuka(true)}
									disabled={sedangBerjalan}
									className="cursor-pointer"
								>
									<UploadSimpleIcon />
									Unggah bukti dukung
								</Button>
							</div>
						) : (
							<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
								{totalPustaka === 0
									? 'Belum ada bukti dukung yang bisa dipakai bab ini. Unggah dari Perpustakaan Bukti Dukung lebih dulu.'
									: 'Tidak ada berkas yang cocok dengan pencarian.'}
							</p>
						)
					) : (
						<ul className="space-y-0.5 pb-2">
							{daftar.map((bukti) => (
								<BarisBukti
									key={bukti.id}
									bukti={bukti}
									terpilih={terpilih.has(bukti.id)}
									dimatikan={sedangBerjalan}
									onToggle={() => toggle(bukti)}
								/>
							))}
						</ul>
					)}
				</div>
			</ScrollArea>

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
							<button
								type="button"
								onClick={() => setPromptTerbuka((terbuka) => !terbuka)}
								disabled={sedangBerjalan}
								aria-expanded={promptTerbuka}
								aria-controls="prompt-generate"
								className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
							>
								<CaretDownIcon
									className={
										promptTerbuka
											? 'size-3 shrink-0 rotate-180 transition-transform'
											: 'size-3 shrink-0 transition-transform'
									}
								/>
								<span className="truncate">
									{/*
									 * Prompt yang terisi lalu dilipat tetap ikut terkirim.
									 * Tanpa penanda ini, pengguna tidak punya cara tahu bahwa
									 * generate berikutnya masih membawa arahan lama.
									 */}
									Prompt tambahan{!promptTerbuka && prompt.trim() && ' · terisi'}
								</span>
							</button>

							<Button
								type="button"
								size="sm"
								onClick={handleGenerate}
								disabled={sedangBerjalan || terpilih.size === 0}
								className="shrink-0"
							>
								{sedangBerjalan ? (
									<>
										<SpinnerGapIcon className="animate-spin" />
										Menyusun…
									</>
								) : (
									<>
										<SparkleIcon />
										Generate
									</>
								)}
							</Button>
						</div>

						{/*
						 * Tetap terpasang saat dilipat, bukan dilepas dari pohon: tombol di
						 * atas menunjuknya lewat `aria-controls`, dan acuan ke elemen yang
						 * tidak ada membuat pola disclosure-nya tidak bisa diikuti pembaca
						 * layar. Atribut `hidden` sudah cukup mengeluarkannya dari urutan
						 * tab maupun pohon aksesibilitas.
						 */}
						<Textarea
							id="prompt-generate"
							hidden={!promptTerbuka}
							rows={2}
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							disabled={sedangBerjalan}
							placeholder="Arahan khusus untuk AI, misal: fokus pada capaian tiga tahun terakhir."
							aria-label="Prompt tambahan (opsional)"
							className="max-h-28 min-h-14 resize-none py-1.5 text-xs"
						/>

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
					<p className="text-xs leading-relaxed text-muted-foreground">
						{izin.blockedReason === 'terkunci' ||
						izin.blockedReason === 'diajukan'
							? `${frasaBlokir[izin.blockedReason]}, jadi generate tidak bisa dijalankan.`
							: 'Anda hanya bisa membaca bab ini.'}
					</p>
				)}
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
 * Satu bukti dukung di daftar pemilihan.
 *
 * Seluruh barisnya `<label>` supaya sasaran kliknya selebar baris, bukan sekotak
 * 16 px. Untuk baris yang tidak bisa dipakai, statusnya tetap ditampilkan penuh
 * dan catatan kegagalannya ikut dimunculkan — itulah satu-satunya keterangan
 * yang menjelaskan kenapa ia mati.
 */
function BarisBukti({
	bukti,
	terpilih,
	dimatikan,
	onToggle,
}: {
	bukti: EvidenceEntity;
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
