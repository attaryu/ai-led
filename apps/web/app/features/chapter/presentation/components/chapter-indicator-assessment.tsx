import { SpinnerGapIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Checkbox } from '~/core/components/ui/checkbox';
import { Select } from '~/core/components/ui/select';
import { cn } from '~/core/lib/utils';
import { SKOR_PILIHAN, type SkorIndikator } from '../../domain/entities/indicator-assessment.entity';
import { type PenilaianIndikator } from '../hooks/use-indicator-assessment';

/**
 * "Penilaian Indikator" di tab Panduan, tepat di bawah kartu Panduan Penulisan.
 *
 * Indikator yang tampil hanyalah yang dipetakan ke section aktif; tak ada
 * indikator → komponen tidak muncul sama sekali. Centang adalah satu-satunya
 * kontrol aktif/nonaktif: select skor (0–4, 0 sah) baru bisa dipakai bila
 * dicentang. Menjalankan penilaian dilakukan tombol Generate di toolbar editor
 * — panel ini hanya menampung pilihan.
 */
export function ChapterIndicatorAssessment({ penilaian }: { penilaian: PenilaianIndikator }) {
	const { indikator, pilihan, jumlahDipilih, tanpaSkorIds, berjalan, bisaEdit, pesanGagal, progres } = penilaian;
	if (indikator.length === 0) return null;
	const terkunci = !bisaEdit || berjalan;

	return (
		<section className="pb-6" aria-label="Penilaian Indikator">
			<h3 className="text-base font-semibold">Penilaian Indikator</h3>
			<p className="mt-0.5 text-sm text-muted-foreground">
				Pilih indikator yang perlu dinilai dan tentukan skor untuk masing-masing indikator.
			</p>

			<ul className="mt-3 space-y-2.5">
				{indikator.map((item) => {
					const p = pilihan[item.id];
					const dicentang = p?.dipilih ?? false;
					const kurangSkor = tanpaSkorIds.includes(item.id);
					const idCek = `indikator-${item.id}`;
					return (
						<li key={item.id} className="rounded-md border border-border p-3">
							<div className="flex items-start gap-2.5">
								<Checkbox
									id={idCek}
									checked={dicentang}
									disabled={terkunci}
									onCheckedChange={(nilai) => penilaian.toggle(item.id, nilai === true)}
									className="mt-0.5"
								/>
								<label htmlFor={idCek} className="min-w-0 flex-1 cursor-pointer text-sm leading-snug">
									{item.deskripsi}
								</label>
							</div>
							<div className="mt-2.5 flex items-center gap-3 pl-[26px]">
								<label htmlFor={`${idCek}-skor`} className="shrink-0 text-sm text-muted-foreground">
									Skor
								</label>
								<Select
									id={`${idCek}-skor`}
									value={p?.skor === null || p?.skor === undefined ? '' : String(p.skor)}
									disabled={terkunci || !dicentang}
									aria-invalid={kurangSkor || undefined}
									onChange={(e) =>
										penilaian.setSkor(item.id, e.target.value === '' ? null : (Number(e.target.value) as SkorIndikator))
									}
									className={cn('flex-1', kurangSkor && 'border-destructive')}
								>
									<option value="" disabled hidden>
										Pilih skor
									</option>
									{SKOR_PILIHAN.map((s) => (
										<option key={s} value={s}>
											{s}
										</option>
									))}
								</Select>
							</div>
							{kurangSkor && <p className="mt-1.5 pl-[26px] text-xs text-destructive">Pilih skor untuk indikator ini.</p>}
						</li>
					);
				})}
			</ul>

			<div className="mt-3 flex items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground" aria-live="polite">
					{indikator.length} indikator tersedia · {jumlahDipilih} dipilih
				</p>
				<Button type="button" variant="outline" size="sm" disabled={terkunci || jumlahDipilih === 0 && Object.keys(pilihan).length === 0} onClick={penilaian.reset} className="cursor-pointer">
					Reset
				</Button>
			</div>

			{berjalan && (
				<p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
					<SpinnerGapIcon className="size-3.5 animate-spin" />
					Menilai indikator{progres ? ` (${progres.completed}/${progres.total})` : '…'}
				</p>
			)}
			{pesanGagal && (
				<p className="mt-2 text-xs leading-relaxed text-destructive" role="alert">
					{pesanGagal}
				</p>
			)}
		</section>
	);
}
