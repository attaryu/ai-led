import { GaugeIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { MetricMeter } from '~/core/components/metric-meter';
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
								const info = RAGAS_METRIK_INFO[nama];
								return (
									<MetricMeter
										key={nama}
										label={info.label}
										diukur={info.diukur}
										nilai={baris.nilai}
										alasan={baris.alasan}
										alasanLabel="Pada generate ini"
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
