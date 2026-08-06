import {
	BuildingsIcon,
	LockSimpleIcon,
	NotebookIcon,
	TimerIcon,
} from '@phosphor-icons/react';

import { StatCard, type StatCardTone } from '~/core/components/ui/stat-card';
import { PROJECT_DEADLINE_SOON_DAYS } from '~/features/led-project/domain/entities/led-project.entity';
import { type InstitutionCycles } from '../../domain/entities/institution-readiness.entity';

/**
 * Blok B Dashboard Utama (docs/application_flow.md §4.0b) — usaha yang sedang
 * berjalan, kerangka waktunya sekarang.
 *
 * **Aturan yang mengikat baris ini: seluruh angkanya bercakupan siklus
 * berjalan.** Tidak ada peringkat akreditasi, tidak ada akumulasi bukti dukung
 * lintas siklus. Itu yang membuat empat kartu ini bisa dibaca sebagai satu
 * kesatuan, dan alasannya sama dengan §5.1b di Dashboard Prodi.
 *
 * Angka bab diagregasi sebagai **jumlah bab lintas prodi**, bukan rata-rata
 * persen antar prodi — lihat `summarizeInstitutionCycles` untuk alasannya.
 */
export function InstitutionCycleSummary({
	siklus,
}: {
	siklus: InstitutionCycles;
}) {
	const tanpaSiklus = siklus.totalProdi - siklus.prodiBersiklus;
	const tenggatBerisiko = siklus.tenggatLewat + siklus.tenggatDekat;

	const tenggatTone: StatCardTone =
		siklus.tenggatLewat > 0
			? 'danger'
			: siklus.tenggatDekat > 0
				? 'warning'
				: 'default';

	return (
		<section className="flex flex-col gap-3">
			<div>
				<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Siklus Berjalan Se-Universitas
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Seluruh angka di bawah hanya menghitung Dokumen LED yang sedang
					dikerjakan.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Prodi Bersiklus"
					icon={BuildingsIcon}
					value={`${siklus.prodiBersiklus}/${siklus.totalProdi}`}
					progress={siklus.persenProdiBersiklus}
					hint={
						tanpaSiklus === 0
							? 'Seluruh prodi sedang menyusun dokumen'
							: `${tanpaSiklus} prodi belum memulai siklus`
					}
				/>
				{/*
				 * Penyebutnya hanya bab milik prodi yang bersiklus. Prodi tanpa siklus
				 * sudah terhitung di kartu sebelah, dan menghitungnya lagi sebagai bab
				 * kosong berarti satu keadaan dihukum dua kali.
				 */}
				<StatCard
					label="Kelengkapan Bab"
					icon={NotebookIcon}
					value={`${siklus.babTerisi}/${siklus.babTotal}`}
					progress={siklus.persenKelengkapan}
					hint={`${siklus.persenKelengkapan}% bab siklus berjalan sudah ada isinya`}
				/>
				<StatCard
					label="Kesiapan Review"
					icon={LockSimpleIcon}
					value={`${siklus.babTerkunci}/${siklus.babTotal}`}
					progress={siklus.persenKesiapanReview}
					hint="Bab yang sudah dikunci Penjamin Mutu"
				/>
				{/*
				 * Siklus tanpa tenggat tidak ikut dihitung: tidak dipatok adalah pilihan
				 * yang sah (§14), bukan keterlambatan.
				 */}
				<StatCard
					label="Tenggat Berisiko"
					icon={TimerIcon}
					value={String(tenggatBerisiko)}
					tone={tenggatTone}
					hint={
						tenggatBerisiko === 0
							? 'Tidak ada tenggat yang lewat atau mendekat'
							: `${siklus.tenggatLewat} sudah lewat · ${siklus.tenggatDekat} tersisa ≤ ${PROJECT_DEADLINE_SOON_DAYS} hari`
					}
				/>
			</div>
		</section>
	);
}
