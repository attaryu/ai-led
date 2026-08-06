import {
	ListChecksIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '~/core/components/ui/accordion';
import { Button } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { Select } from '~/core/components/ui/select';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { type ChapterScoreEntity } from '../../domain/entities/chapter-score.entity';
import { labelDraft } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	skorMaksimal,
	type RubricCriterion,
} from '../../domain/entities/rubric-criterion.entity';
import { useChapterScore } from '../hooks/use-chapter-score';
import { type ChapterPermission } from '../hooks/use-chapter-permission';

/**
 * Isi tab "Rubrik" — simulasi skor terhadap kriteria LAM Teknik
 * (docs/application_flow.md §9).
 *
 * Bedanya dari tab Skor (§10): yang ini menilai **kelayakan isi bab** terhadap
 * kriteria akreditasi, sedangkan tab itu mengukur kualitas jawaban AI-nya sendiri.
 *
 * Tiga hal yang berbeda dari tulisan §9, semuanya disengaja dan dicatat di docs:
 *
 * - **Skor checkpoint dilihat lewat dropdown**, bukan deretan card di kaki tab
 *   yang membuka modal (§9.2) — pertanyaan yang sama sudah dijawab dropdown di
 *   tab Rujukan sebelahnya, dan dua kontrol berbeda untuk hal yang sama hanya
 *   menambah yang harus dipelajari.
 * - **Tombol simulasi berlaku untuk lingkup yang sedang dipilih**, termasuk
 *   checkpoint. Docs memang mengizinkan checkpoint di-run ulang; tanpa ini,
 *   checkpoint yang belum pernah dinilai tidak akan pernah bisa dinilai.
 * - **Deskripsi tiap level skor** ditampilkan di dalam accordion tiap kriteria.
 *   §9.1 menuntutnya, tapi `docs/database.md §10` belum punya kolomnya — celah itu
 *   dicatat di sana dan diisi oleh `RubricCriterion.levelSkor`.
 */
export function ChapterRubricPanel({
	chapter,
	izin,
	lingkup,
	setLingkup,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
	lingkup: string;
	setLingkup: (lingkup: string) => void;
}) {
	const {
		daftarDraft,
		lingkup: lingkupEfektif,
		kriteria,
		hasil,
		ringkasan,
		status,
		pesanGagal,
		bolehMenjalankan,
		jalankanSimulasi,
	} = useChapterScore({ chapter, izin, lingkup, setLingkup });

	const sedangBerjalan = status === 'berjalan';
	const punyaRiwayat = daftarDraft.length > 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 space-y-2 px-5 pt-4 pb-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
					<p className="text-sm font-medium">Kriteria Rubrik</p>
					<span className="text-xs text-muted-foreground">
						{kriteria.length === 0
							? 'Tidak dinilai'
							: `${kriteria.length} kriteria`}
					</span>
				</div>

				{punyaRiwayat && (
					<Select
						value={lingkupEfektif}
						onChange={(event) => setLingkup(event.target.value)}
						aria-label="Lingkup skor"
						disabled={sedangBerjalan}
						className="h-8 text-xs"
					>
						<option value="aktif">Kondisi aktif</option>
						{daftarDraft.map((draft) => (
							<option key={draft.id} value={draft.id}>
								{draft.label
									? `Versi ${draft.versi} — ${draft.label}`
									: labelDraft(draft)}
							</option>
						))}
					</Select>
				)}
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="px-5 pb-2">
					{kriteria.length === 0 ? (
						<div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
							<ListChecksIcon className="size-7 text-muted-foreground/50" />
							{/*
							 * Bukan kegagalan pemuatan: docs/database.md §10 menyatakan bab
							 * yang tidak punya baris `RUBRIK_KRITERIA_BAB` memang tidak
							 * dinilai rubrik. Kalimatnya harus menyatakan itu, bukan
							 * membiarkan pengguna mengira datanya gagal datang.
							 */}
							<p className="text-xs leading-relaxed text-muted-foreground">
								Bab ini tidak dinilai oleh kriteria rubrik LAM Teknik, jadi tidak
								ada simulasi skor untuknya.
							</p>
						</div>
					) : (
						<Accordion className="w-full">
							{kriteria.map((item) => (
								<KriteriaItem
									key={item.id}
									kriteria={item}
									hasil={hasil.get(item.id)}
								/>
							))}
						</Accordion>
					)}
				</div>
			</ScrollArea>

			{kriteria.length > 0 && (
				<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
					<div className="flex items-center justify-between gap-2">
						<div className="min-w-0">
							{ringkasan.jumlahDinilai === 0 ? (
								<p className="text-xs text-muted-foreground">
									Belum pernah disimulasikan.
								</p>
							) : (
								<>
									<p className="text-sm font-medium tabular-nums">
										{ringkasan.totalDidapat} / {ringkasan.totalMaksimal}{' '}
										<span className="text-xs font-normal text-muted-foreground">
											({ringkasan.persen}%)
										</span>
									</p>
									{ringkasan.dijalankanPada && (
										<p className="truncate text-xs text-muted-foreground">
											{ringkasan.dijalankanOlehNama} ·{' '}
											{formatRelativeTimeLong(ringkasan.dijalankanPada)}
										</p>
									)}
								</>
							)}
						</div>

						{/*
						 * §9.3: Pimpinan hanya melihat, tombolnya disembunyikan — bukan
						 * dimatikan. §12.2 menambahkan bab terkunci memblokir semua orang.
						 * Keduanya sudah terangkum di `canEdit`.
						 */}
						{bolehMenjalankan && (
							<Button
								type="button"
								size="sm"
								onClick={jalankanSimulasi}
								disabled={sedangBerjalan}
								className="shrink-0"
							>
								{sedangBerjalan ? (
									<>
										<SpinnerGapIcon className="animate-spin" />
										Menilai…
									</>
								) : (
									<>
										<ListChecksIcon />
										{ringkasan.jumlahDinilai === 0
											? 'Jalankan Simulasi'
											: 'Simulasi Ulang'}
									</>
								)}
							</Button>
						)}
					</div>

					{sedangBerjalan && (
						<p className="text-xs leading-relaxed text-muted-foreground">
							Hasil sebelumnya untuk lingkup ini akan digantikan.
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

					{!izin.canEdit && (
						<p className="text-xs leading-relaxed text-muted-foreground">
							{izin.blockedReason === 'terkunci'
								? 'Bab ini dikunci Penjamin Mutu, jadi simulasi tidak bisa dijalankan.'
								: 'Anda hanya bisa melihat hasil simulasi bab ini.'}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Satu kriteria beserta rinciannya.
 *
 * Kepalanya menampilkan kode, bunyi ringkas, dan skor yang didapat; isinya
 * menampilkan bunyi lengkap, justifikasi penilai, dan **seluruh level skor
 * beserta penjelasannya** — level yang didapat ditandai. Tanpa daftar level itu,
 * angka "3 dari 4" tidak memberi tahu apa pun tentang apa yang harus diperbaiki
 * untuk naik ke 4, dan justru itu gunanya rubrik.
 */
function KriteriaItem({
	kriteria,
	hasil,
}: {
	kriteria: RubricCriterion;
	hasil: ChapterScoreEntity | undefined;
}) {
	const maksimal = skorMaksimal(kriteria);

	return (
		<AccordionItem value={kriteria.id}>
			{/*
			 * `hover:no-underline` menimpa bawaan primitifnya: bawaan itu masuk akal
			 * untuk kepala accordion yang cuma beberapa kata, tapi di sini kepalanya
			 * memuat bunyi kriteria selengkapnya — garis bawah sepanjang dua baris
			 * kalimat terbaca seperti tautan, bukan penanda bisa-diklik.
			 */}
			<AccordionTrigger className="gap-2 py-3 hover:no-underline">
				<span className="flex min-w-0 flex-1 flex-col gap-1 pr-2">
					<span className="flex items-center gap-1.5">
						<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
							{kriteria.kodeKriteria}
						</span>
						{hasil ? (
							<span className="shrink-0 text-xs font-semibold tabular-nums">
								{hasil.skorDidapat}
								<span className="font-normal text-muted-foreground">
									/{maksimal}
								</span>
							</span>
						) : (
							<span className="shrink-0 text-xs font-normal text-muted-foreground">
								Belum dinilai
							</span>
						)}
					</span>
					{/*
					 * Bunyi kriteria ditampilkan **sekali saja**, di sini. Sebelumnya ia
					 * juga diulang di dalam panel accordion — kalimat yang sama persis
					 * dua kali, dan yang di kepala dipotong `line-clamp` sehingga
					 * pengulangannya justru terlihat seperti dua teks berbeda. Dibiarkan
					 * membungkus penuh: daftar tertutup harus bisa dipakai membedakan
					 * kriteria tanpa membuka satu per satu.
					 */}
					<span className="text-xs font-normal leading-relaxed text-muted-foreground">
						{kriteria.deskripsi}
					</span>
				</span>
			</AccordionTrigger>

			<AccordionContent className="pb-3">
				<div className="space-y-3">
					{/*
					 * Label menyebut skornya, bukan sekadar "Penilaian": seluruh tab ini
					 * soal penilaian, jadi judul sepolos itu tidak memberi tahu bahwa
					 * yang dibaca adalah **alasan angka tertentu**. Isinya pun harus
					 * menjelaskan kondisi bab ini, bukan mengulang bunyi levelnya —
					 * kalau mengulang, ia muncul dua kali di layar dan tidak menambah
					 * apa pun.
					 */}
					{hasil && hasil.justifikasi && (
						<div className="rounded-md bg-muted/60 p-2.5">
							<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
								Alasan skor {hasil.skorDidapat}
							</p>
							<p className="mt-1 text-xs leading-relaxed">
								{hasil.justifikasi}
							</p>
						</div>
					)}

					<div className="space-y-1">
						<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							Tingkat penilaian
						</p>
						<ul className="space-y-1">
							{kriteria.levelSkor.map((level) => {
								const didapat = hasil?.skorDidapat === level.skor;
								return (
									<li
										key={level.skor}
										className={cn(
											'flex gap-2 rounded-md px-2 py-1.5',
											didapat && 'bg-primary/10',
										)}
									>
										<span
											className={cn(
												'mt-px flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums',
												didapat
													? 'bg-primary text-primary-foreground'
													: 'bg-muted text-muted-foreground',
											)}
										>
											{level.skor}
										</span>
										<span
											className={cn(
												'text-xs leading-relaxed',
												didapat ? 'text-foreground' : 'text-muted-foreground',
											)}
										>
											{level.deskripsi}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}
