import * as React from 'react';
import {
	CaretLeftIcon,
	CaretRightIcon,
	CheckIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Sheet,
	SheetBody,
	SheetFooter,
	SheetHeader,
} from '~/core/components/ui/sheet';
import { Textarea } from '~/core/components/ui/textarea';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { rubricScoreTypeLabels } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { type PenilaianFinalRow } from '../../domain/entities/assessment-session.entity';
import { catatanKoreksiSchema } from '../../domain/entities/assessment-verdict.entity';
import { AssessmentConfidenceBadge } from './assessment-confidence-badge';
import { AssessmentScoreChip } from './assessment-score-chip';
import { AssessmentStatusBadge } from './assessment-status-badge';
import { formatSkor } from '../utils/assessment-format';

/**
 * Detail satu indikator beserta keputusan Penjamin Mutu atasnya.
 *
 * **Tanpa mode sunting.** Lima level skor langsung hidup dengan yang berlaku
 * tertandai; menggeser pilihan itulah yang memunculkan aksi, bukan menekan
 * tombol "Edit" lebih dulu. Tombol utamanya menyesuaikan diri:
 *
 * | Keadaan | Tombol utama | Tombol samping |
 * | --- | --- | --- |
 * | Pilihan = skor AI | Setujui skor | — |
 * | Pilihan digeser | Simpan koreksi (alasan wajib) | Batal |
 * | Sudah ada keputusan | seperti di atas | Batal keputusan |
 *
 * **Label ditentukan dengan membandingkan pilihan terhadap skor AI**, bukan
 * terhadap nilai tersimpan. Satu perilaku muncul sendiri dari situ: menggeser
 * kembali ke angka AI otomatis jadi "Setujui skor", dan hasilnya status
 * Disetujui — persis yang dimaksud penggunanya ("saya batalkan koreksi saya,
 * AI-nya benar"). Ia tidak perlu tahu ada dua konsep.
 *
 * **Keduanya berbunyi "Batal" tapi tidak sama, dan itu disengaja.** `Batal`
 * membuang perubahan yang belum disimpan; `Batal keputusan` menghapus keputusan
 * yang **sudah** tersimpan sehingga indikatornya kembali ke Belum ditinjau —
 * yang pertama bisa diulang, yang kedua membuang pekerjaan orang. Keduanya
 * menempati slot yang sama di kaki laci, jadi kata "keputusan" itulah
 * satu-satunya yang membedakan aksi merusak dari yang tidak. Ia tidak pernah
 * bisa muncul bersamaan dengan `Batal` — cabang rendernya saling meniadakan —
 * sehingga tidak ada dua tombol kembar di layar.
 *
 * Navigasi ‹ › ada supaya meninjau berurutan tidak menuntut tutup-buka per
 * indikator — tanpa itu, laci justru dua kali lebih mahal daripada accordion
 * yang digantikannya.
 */
export function AssessmentDetailSheet({
	row,
	posisi,
	total,
	bolehMemutuskan,
	onTutup,
	onPindah,
	onSimpan,
	onCabut,
}: {
	row: PenilaianFinalRow | null;
	/** Urutan ke berapa dalam daftar yang sedang tampil, mulai 1. */
	posisi: number;
	total: number;
	bolehMemutuskan: boolean;
	onTutup: () => void;
	onPindah: (arah: -1 | 1) => void;
	onSimpan: (input: { skorFinal: number; catatan: string }) => void;
	onCabut: () => void;
}) {
	const [pilihan, setPilihan] = React.useState<number | null>(null);
	const [catatan, setCatatan] = React.useState('');
	const [galat, setGalat] = React.useState<string | null>(null);

	const indikatorNo = row?.kriteria.no;

	// Disetel ulang tiap kali indikatornya berganti — termasuk saat berpindah
	// lewat ‹ ›. Tanpa ini, catatan indikator sebelumnya ikut terbawa dan bisa
	// tersimpan sebagai alasan bagi angka yang salah.
	React.useEffect(() => {
		if (!row) return;
		setPilihan(row.skorFinal);
		setCatatan(row.keputusan?.catatan ?? '');
		setGalat(null);
	}, [indikatorNo, row]);

	if (!row) return null;

	const { kriteria, hasil } = row;
	const mengoreksi = pilihan !== row.skorMesin;
	const adaPerubahan =
		pilihan !== row.skorFinal || catatan !== (row.keputusan?.catatan ?? '');

	function simpan() {
		if (pilihan === null) {
			setGalat('Pilih tingkat penilaian yang berlaku.');
			return;
		}

		// Alasan wajib hanya saat mengoreksi. Menyetujui berarti justifikasi AI
		// sudah memadai, dan justifikasi itu sudah ada di layar — menuntut kalimat
		// untuk menyatakan setuju hanya menghasilkan "sudah sesuai" berulang-ulang.
		if (mengoreksi) {
			const hasilCek = catatanKoreksiSchema.safeParse(catatan);
			if (!hasilCek.success) {
				setGalat(
					hasilCek.error.issues[0]?.message ?? 'Alasan koreksi wajib diisi',
				);
				return;
			}
			onSimpan({ skorFinal: pilihan, catatan: hasilCek.data });
			return;
		}

		onSimpan({ skorFinal: pilihan, catatan: catatan.trim() });
	}

	return (
		<Sheet
			open
			onClose={onTutup}
			label={`Detail indikator ${kriteria.no}`}
			className="max-w-lg"
		>
			<SheetHeader onClose={onTutup}>
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Indikator sebelumnya"
							onClick={() => onPindah(-1)}
							disabled={posisi <= 1}
							className="cursor-pointer"
						>
							<CaretLeftIcon className="size-4" />
						</Button>
						<span className="text-xs tabular-nums text-muted-foreground">
							{posisi}/{total}
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Indikator berikutnya"
							onClick={() => onPindah(1)}
							disabled={posisi >= total}
							className="cursor-pointer"
						>
							<CaretRightIcon className="size-4" />
						</Button>

						<AssessmentStatusBadge
							status={row.statusTinjau}
							className="ml-1"
						/>
					</div>

					<div className="flex items-start gap-3">
						<AssessmentScoreChip
							skor={row.skorFinal}
							maksimal={row.skorMaksimal}
						/>
						<div className="min-w-0">
							<h3 className="font-heading text-sm font-semibold">
								Indikator {kriteria.no} · {kriteria.kodeKriteria}
							</h3>
							<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
								{kriteria.deskripsi}
							</p>
						</div>
					</div>
				</div>
			</SheetHeader>

			<SheetBody className="flex flex-col gap-4">
				{hasil?.error && (
					<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
						<p className="text-xs leading-relaxed text-destructive">
							{hasil.error}
						</p>
					</div>
				)}

				{hasil?.justifikasi && (
					<div className="rounded-md bg-muted/60 p-2.5">
						<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
							{/*
							 * Skornya ikut disebut, bukan sekadar "Justifikasi AI".
							 *
							 * Begitu Penjamin Mutu menggeser angkanya, kalimat di bawah tetap
							 * menjelaskan angka milik AI — dan label tanpa penyebut skor akan
							 * terbaca seolah ia membenarkan skor yang berlaku sekarang.
							 */}
							<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
								Justifikasi AI · skor {formatSkor(row.skorMesin)}
							</p>
							{/*
							 * Keyakinan ditaruh di sini, bukan di kepala laci: ia menerangkan
							 * seberapa jauh **alasan di bawahnya** boleh dipercaya, bukan
							 * indikatornya secara umum. Sebelumnya ia hanya ada di baris
							 * daftar — sehingga hilang justru di layar tempat keputusan
							 * diambil.
							 */}
							<AssessmentConfidenceBadge nilai={hasil.confidence} />
						</div>
						<p className="mt-1 text-xs leading-relaxed">{hasil.justifikasi}</p>
					</div>
				)}

				{hasil?.rekomendasi && (
					<div className="rounded-md border border-border p-2.5">
						<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							Rekomendasi AI
						</p>
						<p className="mt-1 text-xs leading-relaxed">{hasil.rekomendasi}</p>
					</div>
				)}

				{row.statusTinjau === 'TINJAU_ULANG' && row.keputusan && (
					<div className="rounded-md border border-amber-300/60 bg-amber-50 p-2.5 dark:border-amber-800/40 dark:bg-amber-950/30">
						<p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
							Keputusan ini dibuat saat AI menilai{' '}
							{formatSkor(row.keputusan.skorMesinSaatDitinjau)}; penilaian
							terbaru memberi {formatSkor(row.skorMesin)}. Skor yang berlaku
							masih {formatSkor(row.skorFinal)} — simpan lagi untuk
							menegaskannya, atau geser bila sudah tidak sesuai.
						</p>
					</div>
				)}

				<div className="flex flex-col gap-1.5">
					<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
						Tingkat penilaian · {rubricScoreTypeLabels[kriteria.tipeSkor]}
						{kriteria.tabelLkps.length > 0 &&
							` · ${kriteria.tabelLkps.join(', ')}`}
					</p>

					{kriteria.levelSkor.map((level) => {
						const terpilih = pilihan === level.skor;
						const dariMesin = row.skorMesin === level.skor;

						/*
						 * Yang tidak berhak memutuskan mendapat daftar mati, bukan radio.
						 * Kontrol yang menanggapi klik tapi tidak akan pernah bisa disimpan
						 * itu berbohong — dan aplikasi ini konsisten menyembunyikan yang
						 * tidak boleh dilakukan, bukan memalsukannya.
						 */
						const Wrapper = bolehMemutuskan ? 'label' : 'div';

						return (
							<Wrapper
								key={level.skor}
								className={cn(
									'flex gap-2 rounded-md px-2 py-1.5 transition-colors',
									bolehMemutuskan && 'cursor-pointer hover:bg-muted',
									terpilih && 'bg-primary/10',
								)}
							>
								{bolehMemutuskan && (
									<input
										type="radio"
										name={`skor-${kriteria.no}`}
										checked={terpilih}
										onChange={() => {
											setPilihan(level.skor);
											setGalat(null);
										}}
										className="sr-only"
									/>
								)}
								<span
									className={cn(
										'mt-px flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums',
										terpilih
											? 'bg-primary text-primary-foreground'
											: 'bg-muted text-muted-foreground',
									)}
								>
									{level.skor}
								</span>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span
										className={cn(
											'text-xs leading-relaxed',
											terpilih ? 'text-foreground' : 'text-muted-foreground',
										)}
									>
										{level.deskripsi}
									</span>
									{/*
									 * Menandai level mana yang berasal dari AI membuat
									 * "menggeser" jadi tindakan yang bisa dinilai sendiri oleh
									 * penggunanya — ia tahu persis sejauh apa ia menyimpang.
									 */}
									{dariMesin && (
										<span className="text-[10px] text-muted-foreground">
											hitungan AI
										</span>
									)}
								</span>
							</Wrapper>
						);
					})}
				</div>

				{bolehMemutuskan ? (
					<div className="flex flex-col gap-1.5">
						<label htmlFor="catatan-tinjau" className="text-xs font-medium">
							Alasan {mengoreksi ? '(wajib)' : '(opsional)'}
						</label>
						<Textarea
							id="catatan-tinjau"
							value={catatan}
							onChange={(event) => {
								setCatatan(event.target.value);
								setGalat(null);
							}}
							rows={3}
							placeholder={
								mengoreksi
									? 'Apa yang membuat skor AI tidak tepat untuk indikator ini?'
									: 'Catatan tambahan, misalnya sudah dicek silang dengan berkas fisik.'
							}
						/>
						{galat ? (
							<p className="text-xs text-destructive">{galat}</p>
						) : (
							<p className="text-xs leading-relaxed text-muted-foreground">
								Tersimpan bersama nama Anda dan skor AI yang berlaku saat
								peninjauan.
							</p>
						)}
					</div>
				) : (
					row.keputusan?.catatan && (
						<div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
							<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
								Catatan Penjamin Mutu
							</p>
							<p className="mt-1 text-xs leading-relaxed">
								{row.keputusan.catatan}
							</p>
						</div>
					)
				)}

				{row.keputusan && (
					<p className="text-xs text-muted-foreground">
						Ditinjau {row.keputusan.ditinjauOlehNama} ·{' '}
						{formatRelativeTimeLong(row.keputusan.ditinjauPada)}
					</p>
				)}
			</SheetBody>

			{bolehMemutuskan && (
				<SheetFooter className="flex flex-wrap items-center justify-end gap-2">
					{row.keputusan && !adaPerubahan && (
						<Button
							variant="ghost"
							onClick={onCabut}
							className="mr-auto cursor-pointer text-destructive"
						>
							Batal keputusan
						</Button>
					)}

					{adaPerubahan && (
						<Button
							variant="outline"
							onClick={() => {
								setPilihan(row.skorFinal);
								setCatatan(row.keputusan?.catatan ?? '');
								setGalat(null);
							}}
							className="mr-auto cursor-pointer"
						>
							Batal
						</Button>
					)}

					{/*
					 * Mati hanya saat menekannya tidak akan mengubah apa pun: sudah ada
					 * keputusan, tidak ada suntingan, dan dasarnya masih sama.
					 *
					 * **Yang berstatus "Perlu ditinjau ulang" sengaja tetap hidup.**
					 * Menekan tombolnya di sana menuliskan ulang snapshot skor AI ke
					 * angka yang berlaku sekarang, sehingga statusnya kembali Disetujui —
					 * dan itu memang yang dimaksud Penjamin Mutu yang sudah memeriksa
					 * ulang lalu berkata "keputusan saya masih berlaku". Tanpa ini,
					 * satu-satunya jalan adalah membatalkan keputusannya lalu membuatnya
					 * lagi dari nol.
					 */}
					<Button
						onClick={simpan}
						disabled={
							row.keputusan !== undefined &&
							!adaPerubahan &&
							row.statusTinjau !== 'TINJAU_ULANG'
						}
						className="cursor-pointer"
					>
						<CheckIcon />
						{mengoreksi ? 'Simpan koreksi' : 'Setujui skor'}
					</Button>
				</SheetFooter>
			)}
		</Sheet>
	);
}
