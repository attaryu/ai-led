import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '~/core/components/ui/accordion';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import {
	findAllKriteria,
	rubricScoreTypeLabels,
	type RubricCriterion,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';

/**
 * Matriks penilaian — daftar indikator beserta bunyi tiap level skornya.
 *
 * **Ini pengganti kartu "Upload Matriks Penilaian" di prototipe.** Pertanyaan
 * yang dijawab kartu itu sebenarnya "dinilai pakai rubrik apa?", dan di produk
 * jawabannya sudah ada: matriks adalah master global yang di-seed sekali
 * (`PanduanReferensi` bertipe `DOKUMEN_RUBRIK` bahkan tidak punya `tenantId`).
 * Yang dibutuhkan bukan kotak unggah, melainkan cara melihat isinya.
 *
 * Murni baca. Tidak ada aksi apa pun di sini, jadi tidak ada yang perlu
 * disembunyikan per role.
 */
export function AssessmentMatrixView() {
	const kriteria = findAllKriteria();

	// Dikelompokkan per kriteria induk, bukan dideret rata: satu daftar panjang
	// tanpa jenjang membuat "C4" yang punya tiga indikator terbaca seperti tiga
	// hal yang tidak berhubungan.
	const kelompok = new Map<string, RubricCriterion[]>();
	for (const item of kriteria) {
		const isi = kelompok.get(item.kriteria) ?? [];
		isi.push(item);
		kelompok.set(item.kriteria, isi);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Matriks Penilaian</CardTitle>
				<CardDescription>
					{kriteria.length} indikator dalam {kelompok.size} kriteria. Master
					rubrik LAM Teknik — sama untuk semua program studi dan tidak disunting
					dari sini.
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-5">
				{[...kelompok.entries()].map(([nama, isi]) => (
					<section key={nama} className="flex flex-col gap-1">
						<h3 className="font-heading text-sm font-medium">
							{isi[0].kodeKriteria} — {nama}
						</h3>

						<Accordion className="w-full">
							{isi.map((item) => (
								<AccordionItem key={item.id} value={item.id}>
									<AccordionTrigger className="gap-2 py-3 hover:no-underline">
										<span className="flex min-w-0 flex-1 flex-col gap-1 pr-2">
											<span className="flex flex-wrap items-center gap-1.5">
												<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
													{item.no}
												</span>
												<span className="shrink-0 text-[10px] font-medium text-muted-foreground">
													{rubricScoreTypeLabels[item.tipeSkor]}
												</span>
												{/*
												 * Tabel LKPS-nya disebut di kepala, bukan di dalam:
												 * indikator kuantitatif tidak akan membaik dengan
												 * menulis lebih banyak, dan penyusun yang sedang
												 * mencari apa yang harus diperbaiki perlu tahu itu
												 * tanpa membuka satu per satu.
												 */}
												{item.tabelLkps.length > 0 && (
													<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
														{item.tabelLkps.join(' · ')}
													</span>
												)}
											</span>
											<span className="text-xs font-normal leading-relaxed text-muted-foreground">
												{item.deskripsi}
											</span>
										</span>
									</AccordionTrigger>

									<AccordionContent className="pb-3">
										<ul className="space-y-1">
											{item.levelSkor.map((level) => (
												<li key={level.skor} className="flex gap-2 px-2 py-1">
													<span className="mt-px flex size-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
														{level.skor}
													</span>
													<span className="text-xs leading-relaxed text-muted-foreground">
														{level.deskripsi}
													</span>
												</li>
											))}
										</ul>

										<p className="mt-2 text-xs text-muted-foreground">
											Dinilai atas bab nomor {item.urutanBab.join(', ')}.
										</p>
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					</section>
				))}
			</CardContent>
		</Card>
	);
}
