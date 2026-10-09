import { GaugeIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { MetricMeter } from '~/core/components/metric-meter';
import { Button } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { Select } from '~/core/components/ui/select';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { labelDraft } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	RAGAS_METRIK_INFO,
	RAGAS_URUTAN,
} from '../../domain/entities/ragas-score.entity';
import { useChapterQuality } from '../hooks/use-chapter-quality';
import { ChapterChecklistTimeline } from './chapter-checklist-timeline';
import { ChapterQualityScores } from './chapter-quality-scores';

/**
 * Isi tab "Kualitas AI" — metrik RAGAS untuk hasil generate
 * (docs/application_flow.md §10).
 *
 * Tabnya semula bernama "Skor", dan itu menyatakan terlalu banyak: di dokumen
 * akreditasi "skor" berarti kelayakan isi terhadap kriteria, bukan mutu kerja
 * AI. Nama barunya menyebut apa yang benar-benar diukur.
 *
 * **Nol tombol.** §10.1 dan §12.1 menyatakan skor ini dihitung otomatis begitu
 * generate selesai, tanpa pemicu manual — yang mengisinya tab Generasi, dan tab
 * ini murni membacanya. Karena itu tidak ada cabang `izin.canEdit` sama sekali.
 */
export function ChapterQualityPanel({
	chapter,
	sectionId,
	savedAt,
}: {
	chapter: ChapterEntity;
	/** Section terbuka -> skor judge section itu, bukan skor bab. */
	sectionId: string | null;
	/** Stempel simpan terakhir dari autosave; alasannya di `useChapterQuality`. */
	savedAt: string | null;
}) {
	const { daftarDraft, lingkup, setLingkup, ragas, basi, section, sedangDinilai, penilaianMacet, mintaNilai, memicu, galatPicu } = useChapterQuality({
		chapter,
		sectionId,
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
								{sedangDinilai
									? 'Sedang dinilai RAGAS. Skornya muncul otomatis di sini setelah selesai (bisa beberapa menit).'
									: penilaianMacet
									? 'Penilaian RAGAS tidak selesai (proses penilaiannya terhenti). Klik tombol di bawah untuk mencoba lagi.'
									: section?.judgeError
									? `Penilaian gagal: ${section.judgeError}`
									: sectionId && section
									? 'Skor kualitas belum dihitung. Penilaian RAGAS dijalankan atas permintaan dan memakan waktu beberapa menit; yang dinilai adalah teks section ini saat ini.'
									: sectionId
									? 'Section ini belum di-generate AI, jadi belum ada mutu jawaban yang bisa diukur.'
									: lingkup === 'aktif'
									? 'Isi bab ini tidak berasal dari generate, jadi belum ada mutu jawaban AI yang bisa diukur. Jalankan generate di tab Generasi untuk mendapatkannya.'
									: 'Checkpoint ini menyimpan tulisan yang tidak berasal dari generate, jadi tidak punya penilaian mutu AI.'}
							</p>
							{sectionId && section && !sedangDinilai && (
								<Button size="sm" disabled={memicu} onClick={() => void mintaNilai()} className="cursor-pointer">
									{memicu
										? 'Memulai…'
										: penilaianMacet || section.judgeError
										? 'Coba lagi'
										: 'Nilai kualitas (RAGAS)'}
								</Button>
							)}
							{galatPicu && <p className="text-xs text-destructive">{galatPicu}</p>}
						</div>
					) : (
						<>
							<ChapterQualityScores ragas={ragas} />
							{/* ponytail: tampilan lama (MetricMeter berbilah) diganti kartu bercincin ChapterQualityScores.
						<div className="space-y-3 pt-1">
							{RAGAS_URUTAN.map((nama) => {
								const baris = ragas.metrik.find((item) => item.metrik === nama);
								if (!baris) return null;
								const info = RAGAS_METRIK_INFO[nama];
								return (
									<MetricMeter
										key={nama}
										label={info.label}
										diukur={info.diukur}
										nilai={baris.nilai}
										alasan={baris.alasan}
									/>
								);
							})}
						</div>
							*/}
						</>
					)}

					{/* Hasil tahap checklist: butir fakta yang dicari retrieval untuk generate terakhir section ini. */}
					{sectionId && section && (
						<ChapterChecklistTimeline checklist={section.checklist} galat={section.checklistError} />
					)}
					{/* ponytail: daftar checklist lama (ol bernomor polos) diganti ChapterChecklistTimeline.
						<div className="mt-4 border-t border-border pt-3">
							<p className="text-xs font-medium">Checklist pencarian fakta</p>
							{section.checklist.length > 0 ? (
								<ol className="mt-1.5 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
									{section.checklist.map((butir, i) => (
										<li key={i}>{butir}</li>
									))}
								</ol>
							) : (
								<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
									{section.checklistError
										? `Tahap checklist gagal, section ini digenerate tanpa panduan pencarian fakta: ${section.checklistError}`
										: 'Tidak ada butir checklist yang tercatat untuk generate ini.'}
								</p>
							)}
						</div>
					)}
					*/}
				</div>
			</ScrollArea>

			<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
				{/* ponytail: tombol "Nilai ulang (teks saat ini)" disembunyikan atas permintaan pengguna.
				{ragas && sectionId && section && !sedangDinilai && (
					<Button
						size="sm"
						variant="outline"
						disabled={memicu}
						onClick={() => void mintaNilai()}
						className="cursor-pointer"
					>
						{memicu ? 'Memulai…' : 'Nilai ulang (teks saat ini)'}
					</Button>
				)}
				{ragas && galatPicu && <p className="text-xs text-destructive">{galatPicu}</p>}
				*/}
				{ragas && (
					<p className="text-xs text-muted-foreground">
						Dinilai {formatRelativeTimeLong(ragas.dihitungPada)} saat generate
						berjalan.
						{sectionId ? '' : ' Skor bab = rata-rata skor terakhir tiap section.'}
					</p>
				)}
				{/* ponytail: baris "Model penulis · Waktu generate" disembunyikan atas permintaan pengguna.
				{section && (section.model || section.latensiDetik !== null) && (
					<p className="text-xs text-muted-foreground">
						{section.model && `Model penulis: ${section.model}`}
						{section.latensiDetik !== null && ` · Waktu generate ${section.latensiDetik.toFixed(1)} dtk`}
					</p>
				)}
				*/}

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
				 * §10.1: tab ini menilai kualitas jawaban AI, bukan kelayakan
				 * akreditasi. Pembacanya berhak tahu tanpa harus membuka dokumentasi —
				 * angka di dokumen akreditasi hampir selalu dibaca sebagai kelayakan,
				 * dan yang menjawab itu Penilaian AMI di luar editor. Skor finalnya
				 * untuk bab ini ada di tab Review.
				 */}
				{/* ponytail: catatan "Metrik ini mengukur mutu kerja AI-nya…" disembunyikan atas permintaan pengguna.
				<p className="text-xs leading-relaxed text-muted-foreground">
					Metrik ini mengukur mutu kerja AI-nya, bukan kelayakan bab terhadap
					kriteria akreditasi — itu ada di Penilaian AMI, dan skor final bab ini
					ditampilkan di tab Review.
				</p>
				*/}
			</div>
		</div>
	);
}
