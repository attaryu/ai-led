import {
	GaugeIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { MetricMeter } from '~/core/components/metric-meter';
import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { findKriteriaByNo } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	AMI_RAGAS_METRIK_INFO,
	AMI_RAGAS_URUTAN,
	pickRecallRendah,
	RECALL_PERLU_DIPERIKSA,
	type AssessmentQuality,
} from '../../domain/entities/assessment-quality.entity';
import { type StatusEvaluasi } from '../hooks/use-assessment-quality';

/**
 * Tab "Kualitas Penilaian" — metrik RAGAS atas satu sesi.
 *
 * **Terbuka untuk semua role, tidak dipagari flag pengembang.** Pertanyaan yang
 * dijawabnya — "seberapa bisa saya percaya angka-angka ini?" — adalah pertanyaan
 * Penjamin Mutu, bukan hanya pertanyaan tim RAG. Yang membuatnya begitu adalah
 * metrik kelengkapan pencarian: ia satu-satunya cara membedakan "dokumen saya
 * memang kurang" dari "mesinnya tidak menemukan tulisan saya", dan tanpa itu
 * satu-satunya jalan adalah membaca ulang seluruh LED.
 *
 * Bahasanya mengikuti tab "Kualitas AI" di editor, sampai ke komponen kartunya
 * — `MetricMeter` yang sama dipakai keduanya.
 */
export function AssessmentQualityPanel({
	kualitas,
	status,
	pesanGagal,
	bolehMengevaluasi,
	sesiSelesai,
	adaSesi,
	onJalankan,
}: {
	kualitas: AssessmentQuality | null;
	status: StatusEvaluasi;
	pesanGagal: string | null;
	bolehMengevaluasi: boolean;
	sesiSelesai: boolean;
	adaSesi: boolean;
	onJalankan: () => void;
}) {
	if (!kualitas) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-3 py-10 text-center">
					<GaugeIcon className="size-7 text-muted-foreground/50" />
					{/*
					 * Tiga sebab berbeda, tiga kalimat berbeda — tindak lanjutnya memang
					 * tidak sama. Satu kalimat umum akan menyuruh pengguna menjalankan
					 * evaluasi atas sesi yang tidak akan pernah bisa dievaluasi.
					 */}
					<p className="max-w-md text-xs leading-relaxed text-muted-foreground">
						{!adaSesi
							? 'Dokumen ini belum pernah dinilai, jadi belum ada mutu penilaian yang bisa diukur.'
							: !sesiSelesai
								? 'Sesi ini belum selesai. Mutu penilaian baru bisa dihitung setelah seluruh indikator punya justifikasi.'
								: 'Sesi ini belum dievaluasi. Jalankan untuk mengukur seberapa bisa hasilnya dipercaya.'}
					</p>

					{bolehMengevaluasi && (
						<Button
							type="button"
							onClick={onJalankan}
							disabled={status === 'berjalan'}
							className="cursor-pointer"
						>
							{status === 'berjalan' ? (
								<>
									<SpinnerGapIcon className="animate-spin" />
									Mengevaluasi…
								</>
							) : (
								<>
									<GaugeIcon />
									Jalankan Evaluasi
								</>
							)}
						</Button>
					)}

					{status === 'gagal' && pesanGagal && (
						<p className="text-xs leading-relaxed text-destructive">
							{pesanGagal}
						</p>
					)}
				</CardContent>
			</Card>
		);
	}

	const perluDiperiksa = pickRecallRendah(kualitas);

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Kualitas Penilaian</CardTitle>
					<CardDescription>
						{kualitas.jumlahChunk} potongan sumber ikut dinilai · dievaluasi{' '}
						{formatRelativeTimeLong(kualitas.dihitungPada)} oleh{' '}
						{kualitas.judgeModel}
					</CardDescription>
				</CardHeader>

				<CardContent className="grid gap-4 sm:grid-cols-2">
					{AMI_RAGAS_URUTAN.map((nama) => {
						const baris = kualitas.metrik.find((item) => item.metrik === nama);
						if (!baris) return null;
						const info = AMI_RAGAS_METRIK_INFO[nama];
						return (
							<MetricMeter
								key={nama}
								label={info.label}
								diukur={info.diukur}
								nilai={baris.nilai}
								alasan={baris.alasan}
								alasanLabel="Pada penilaian ini"
							/>
						);
					})}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Patut Diperiksa Manual</CardTitle>
					<CardDescription>
						Indikator yang kelengkapan pencariannya di bawah{' '}
						{RECALL_PERLU_DIPERIKSA.toFixed(2)} — skornya bisa lebih rendah dari
						yang seharusnya karena ada tulisan yang tidak ditemukan mesin.
					</CardDescription>
				</CardHeader>

				<CardContent>
					{perluDiperiksa.length === 0 ? (
						<p className="text-xs leading-relaxed text-muted-foreground">
							Tidak ada. Seluruh indikator menemukan bagian dokumen yang
							relevan dengan cukup lengkap.
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{perluDiperiksa.map((baris) => {
								const kriteria = findKriteriaByNo(baris.indikatorNo);
								return (
									<li
										key={baris.indikatorNo}
										className="flex items-start gap-2.5 rounded-md bg-muted/60 px-2.5 py-2"
									>
										<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
										<div className="min-w-0 flex-1">
											<p className="text-xs font-medium">
												Indikator {baris.indikatorNo}
												{kriteria ? ` — ${kriteria.deskripsi}` : ''}
											</p>
											<p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
												Kelengkapan pencarian {baris.contextRecall.toFixed(2)} ·
												kesetiaan {baris.faithfulness.toFixed(2)}
											</p>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>

			{/*
			 * Sejajar kalimat penutup tab "Kualitas AI": dua permukaan bersebelahan
			 * sama-sama menampilkan angka, dan pembacanya berhak tahu bahwa yang satu
			 * mengukur mesinnya sementara yang lain mengukur dokumennya.
			 */}
			<p className="text-xs leading-relaxed text-muted-foreground">
				Metrik ini mengukur mutu kerja mesin penilainya, bukan kelayakan dokumen
				terhadap kriteria akreditasi — itu ada di tab Penilaian.
			</p>
		</div>
	);
}
