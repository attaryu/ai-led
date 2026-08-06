import { GaugeIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { ScrollArea } from '~/core/components/ui/scroll-area';
import { Select } from '~/core/components/ui/select';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/core/components/ui/tooltip';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { labelDraft } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	RAGAS_METRIK_INFO,
	RAGAS_URUTAN,
	type RagasScore,
} from '../../domain/entities/ragas-score.entity';
import { useChapterQuality } from '../hooks/use-chapter-quality';

/**
 * Isi tab "Kualitas AI" — metrik RAGAS untuk hasil generate
 * (docs/application_flow.md §10).
 *
 * Tabnya semula bernama "Skor", dan itu tertukar rasanya: "Rubrik" justru yang
 * menampilkan skor 1–4 beserta totalnya. Nama barunya menyebut apa yang diukur.
 *
 * **Nol tombol.** §10.1 dan §12.1 menyatakan skor ini dihitung otomatis begitu
 * generate selesai, tanpa pemicu manual — yang mengisinya tab Generasi, dan tab
 * ini murni membacanya. Karena itu tidak ada cabang `izin.canEdit` sama sekali.
 */
export function ChapterQualityPanel({
	chapter,
	savedAt,
}: {
	chapter: ChapterEntity;
	/** Stempel simpan terakhir dari autosave; alasannya di `useChapterQuality`. */
	savedAt: string | null;
}) {
	const { daftarDraft, lingkup, setLingkup, ragas, basi } = useChapterQuality({
		chapter,
		savedAt,
	});

	const punyaRiwayat = daftarDraft.length > 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 space-y-2 px-5 pt-4 pb-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
					<p className="text-sm font-medium">Kualitas Jawaban AI</p>
					{ragas && (
						<span className="text-xs text-muted-foreground">
							{ragas.jumlahChunk} potongan sumber
						</span>
					)}
				</div>

				{punyaRiwayat && (
					<Select
						value={lingkup}
						onChange={(event) => setLingkup(event.target.value)}
						aria-label="Lingkup penilaian"
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
					{ragas === null ? (
						<div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
							<GaugeIcon className="size-7 text-muted-foreground/50" />
							{/*
							 * Dua cabang, karena penyebabnya berbeda dan tindak lanjutnya
							 * juga: yang aktif tinggal dijalankan generate, sedangkan
							 * checkpoint yang sudah terlanjur disimpan tanpa generate memang
							 * tidak akan pernah punya angka.
							 */}
							<p className="text-xs leading-relaxed text-muted-foreground">
								{lingkup === 'aktif'
									? 'Isi bab ini tidak berasal dari generate, jadi belum ada mutu jawaban AI yang bisa diukur. Jalankan generate di tab Generasi untuk mendapatkannya.'
									: 'Checkpoint ini menyimpan tulisan yang tidak berasal dari generate, jadi tidak punya penilaian mutu AI.'}
							</p>
						</div>
					) : (
						<div className="space-y-3 pt-1">
							{RAGAS_URUTAN.map((nama) => {
								const baris = ragas.metrik.find((item) => item.metrik === nama);
								if (!baris) return null;
								return (
									<KartuMetrik
										key={nama}
										nama={nama}
										nilai={baris.nilai}
										alasan={baris.alasan}
									/>
								);
							})}
						</div>
					)}
				</div>
			</ScrollArea>

			<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
				{ragas && (
					<p className="text-xs text-muted-foreground">
						Dinilai {formatRelativeTimeLong(ragas.dihitungPada)} saat generate
						berjalan.
					</p>
				)}

				{/*
				 * Skornya tidak dihapus saat isi bab disunting — ia tetap fakta tentang
				 * generate yang pernah terjadi. Yang perlu diberitahukan hanyalah bahwa
				 * ia berhenti menggambarkan tulisan yang sekarang.
				 */}
				{basi && (
					<div className="flex items-start gap-2 rounded-md border border-border bg-muted/60 p-2.5">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
						<p className="text-xs leading-relaxed text-muted-foreground">
							Isi bab sudah disunting setelah penilaian ini. Angkanya masih
							menggambarkan hasil generate, bukan tulisan yang sekarang.
						</p>
					</div>
				)}

				{/*
				 * §10.1: tab ini menilai kualitas jawaban AI, bukan kelayakan akreditasi
				 * — itulah yang membedakannya dari tab Rubrik. Pembacanya berhak tahu
				 * tanpa harus membuka dokumentasi, apalagi karena dua tab bersebelahan
				 * sama-sama menampilkan angka.
				 */}
				<p className="text-xs leading-relaxed text-muted-foreground">
					Metrik ini mengukur mutu kerja AI-nya, bukan kelayakan bab terhadap
					kriteria akreditasi — itu ada di tab Rubrik.
				</p>
			</div>
		</div>
	);
}

/**
 * Satu metrik: nilai, bilah, apa yang diukur, dan alasan angkanya.
 *
 * Tanpa accordion — hanya ada tiga metrik, dan menyembunyikan penjelasannya di
 * balik klik justru mengembalikan masalah yang membuat tab ini perlu ada:
 * angka tanpa arti bagi siapa pun di luar tim RAG.
 */
function KartuMetrik({
	nama,
	nilai,
	alasan,
}: {
	nama: keyof typeof RAGAS_METRIK_INFO;
	nilai: number;
	alasan: string;
}) {
	const info = RAGAS_METRIK_INFO[nama];
	const persen = Math.round(nilai * 100);

	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<p className="flex min-w-0 items-center gap-1 text-xs font-medium">
					<span className="truncate">{info.label}</span>

					{/*
					 * Definisi metriknya disembunyikan di balik ikon ini. Ia hanya perlu
					 * dibaca sekali — sesudah paham apa itu "kesetiaan pada sumber",
					 * mengulangnya di tiap kartu setiap kali tab dibuka hanya mendorong
					 * temuan yang sebenarnya (alasan di bawah) keluar layar.
					 *
					 * `TooltipTrigger` merender tombol, jadi ia terjangkau papan tik dan
					 * tooltipnya ikut terbuka saat difokus — bukan hover saja.
					 */}
					<Tooltip>
						<TooltipTrigger
							aria-label={`Apa yang diukur ${info.label}`}
							className="shrink-0 rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
						>
							<InfoIcon className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent side="left" className="leading-relaxed">
							{info.diukur}
						</TooltipContent>
					</Tooltip>
				</p>

				<p className="shrink-0 text-sm font-semibold tabular-nums">
					{nilai.toFixed(2)}
				</p>
			</div>

			{/* Bilahnya sekadar `div`: satu bentuk sesederhana ini tidak memerlukan primitif sendiri. */}
			<div
				role="meter"
				aria-label={info.label}
				aria-valuenow={persen}
				aria-valuemin={0}
				aria-valuemax={100}
				className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-primary"
					style={{ width: `${persen}%` }}
				/>
			</div>

			<div className="rounded-md bg-muted/60 p-2.5">
				<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					Pada generate ini
				</p>
				<p className="mt-1 text-xs leading-relaxed">{alasan}</p>
			</div>
		</div>
	);
}
