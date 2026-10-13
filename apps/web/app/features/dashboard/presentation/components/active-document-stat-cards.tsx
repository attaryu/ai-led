import {
	ClockCountdownIcon,
	FileTextIcon,
	SealCheckIcon,
} from '@phosphor-icons/react';

import { StatCard, type StatCardTone } from '~/core/components/ui/stat-card';
import { type ActiveDocumentStats } from '../../domain/entities/active-documents.entity';

/**
 * Nol terbaca tenang (redup), bukan sebagai peringatan; nada berwarna hanya
 * untuk angka yang memang menuntut tindakan.
 */
const toneFor = (value: number | null, active: StatCardTone): StatCardTone =>
	value === null || value === 0 ? 'muted' : active;

const show = (value: number | null) => (value === null ? '—' : String(value));

/**
 * Tiga kartu angka di atas tabel Dokumen LED aktif, dalam satu grid tanpa
 * judul kelompok dan tanpa keterangan tambahan. Satuannya selalu **dokumen**,
 * tidak pernah bab atau indikator: tiap dokumen punya jumlah bab dan rubrik
 * yang berbeda, jadi menjumlahkan sub-unit lintas dokumen tidak bermakna.
 * Kartu AMI menghitung dokumen yang punya tinjauan tertunda.
 *
 * `tampilkanAmi = false` (ringkasan AMI gagal dimuat) menyembunyikan kartu AMI
 * sama sekali — nol di sana akan terbaca "sudah dicek, tidak ada". Selama
 * ringkasan masih dimuat, angkanya '—'.
 */
export function ActiveDocumentStatCards({
	stats,
	tampilkanAmi,
}: {
	stats: ActiveDocumentStats;
	tampilkanAmi: boolean;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<StatCard
				boxed
				icon={FileTextIcon}
				label="Dokumen LED aktif"
				value={String(stats.dokumenAktif)}
				tone={toneFor(stats.dokumenAktif, 'default')}
			/>
			<StatCard
				boxed
				icon={ClockCountdownIcon}
				label="Tenggat mendesak"
				value={String(stats.tenggatMendesak)}
				tone={toneFor(stats.tenggatMendesak, 'danger')}
			/>
			{tampilkanAmi && (
				<StatCard
					boxed
					icon={SealCheckIcon}
					label="Menunggu tinjauan AMI"
					value={show(stats.perluDitinjau)}
					tone={toneFor(stats.perluDitinjau, 'info')}
				/>
			)}
		</div>
	);
}
