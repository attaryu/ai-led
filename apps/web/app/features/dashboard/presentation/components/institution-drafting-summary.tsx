import {
	BuildingsIcon,
	LockSimpleIcon,
	NotebookIcon,
	TimerIcon,
} from '@phosphor-icons/react';

import { StatCard, type StatCardTone } from '~/core/components/ui/stat-card';
import { PROJECT_DEADLINE_SOON_DAYS } from '~/features/led-project/domain/entities/led-project.entity';
import { type InstitutionDrafting } from '../../domain/entities/institution-readiness.entity';

/**
 * Blok B Dashboard Utama (docs/application_flow.md §4.0b) — usaha yang sedang
 * berjalan, kerangka waktunya sekarang.
 *
 * **Aturan yang mengikat baris ini: seluruh angkanya bercakupan dokumen yang
 * sedang disusun.** Tidak ada peringkat akreditasi, tidak ada akumulasi bukti
 * dukung lintas penyusunan. Itu yang membuat empat kartu ini bisa dibaca
 * sebagai satu kesatuan, dan alasannya sama dengan §5.1b di Dashboard Prodi.
 *
 * Angka bab diagregasi sebagai **jumlah bab lintas prodi**, bukan rata-rata
 * persen antar prodi — lihat `summarizeInstitutionDrafting` untuk alasannya.
 */
export function InstitutionDraftingSummary({
	penyusunan,
}: {
	penyusunan: InstitutionDrafting;
}) {
	const belumMenyusun = penyusunan.totalProdi - penyusunan.prodiMenyusun;
	const tenggatBerisiko = penyusunan.tenggatLewat + penyusunan.tenggatDekat;

	const tenggatTone: StatCardTone =
		penyusunan.tenggatLewat > 0
			? 'danger'
			: penyusunan.tenggatDekat > 0
				? 'warning'
				: 'default';

	return (
		<section className="flex flex-col gap-3">
			<div>
				<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Sedang Menyusun Se-Universitas
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Seluruh angka di bawah hanya menghitung Dokumen LED yang sedang
					dikerjakan.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Prodi Sedang Menyusun"
					icon={BuildingsIcon}
					value={`${penyusunan.prodiMenyusun}/${penyusunan.totalProdi}`}
					progress={penyusunan.persenProdiMenyusun}
					hint={
						belumMenyusun === 0
							? 'Seluruh prodi sedang menyusun dokumen'
							: `${belumMenyusun} prodi belum mulai menyusun`
					}
				/>
				{/*
				 * Penyebutnya hanya bab milik prodi yang sedang menyusun. Prodi yang
				 * belum mulai sudah terhitung di kartu sebelah, dan menghitungnya lagi
				 * sebagai bab kosong berarti satu keadaan dihukum dua kali.
				 */}
				<StatCard
					label="Kelengkapan Bab"
					icon={NotebookIcon}
					value={`${penyusunan.babTerisi}/${penyusunan.babTotal}`}
					progress={penyusunan.persenKelengkapan}
					hint={`${penyusunan.persenKelengkapan}% bab yang sedang disusun sudah ada isinya`}
				/>
				<StatCard
					label="Kesiapan Review"
					icon={LockSimpleIcon}
					value={`${penyusunan.babTerkunci}/${penyusunan.babTotal}`}
					progress={penyusunan.persenKesiapanReview}
					hint={
						penyusunan.babMenungguReview > 0
							? `${penyusunan.babMenungguReview} bab menunggu review`
							: 'Bab yang sudah dikunci Penjamin Mutu'
					}
				/>
				{/*
				 * Penyusunan tanpa tenggat tidak ikut dihitung: tidak dipatok adalah
				 * pilihan yang sah (§14), bukan keterlambatan.
				 */}
				<StatCard
					label="Tenggat Berisiko"
					icon={TimerIcon}
					value={String(tenggatBerisiko)}
					tone={tenggatTone}
					hint={
						tenggatBerisiko === 0
							? 'Tidak ada tenggat yang lewat atau mendekat'
							: `${penyusunan.tenggatLewat} sudah lewat · ${penyusunan.tenggatDekat} tersisa ≤ ${PROJECT_DEADLINE_SOON_DAYS} hari`
					}
				/>
			</div>
		</section>
	);
}
