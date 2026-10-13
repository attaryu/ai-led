import { StatCard, type StatCardTone } from '~/core/components/ui/stat-card';
import { type ActiveDocumentStats } from '../../domain/entities/active-documents.entity';

/**
 * Nol terbaca tenang (redup), bukan sebagai peringatan; nada peringatan hanya
 * untuk angka yang memang menuntut tindakan.
 */
const toneFor = (value: number | null, active: StatCardTone): StatCardTone =>
	value === null || value === 0 ? 'muted' : active;

const show = (value: number | null) => (value === null ? '—' : String(value));

/**
 * Empat kartu angka di atas tabel Dokumen LED aktif, dalam dua pasang
 * berlabel. Satuannya selalu **dokumen**: tiap dokumen punya jumlah bab dan
 * rubrik yang berbeda, jadi menjumlahkan bab atau indikator lintas dokumen
 * tidak bermakna.
 *
 * `tampilkanAmi = false` (ringkasan AMI gagal dimuat) menyembunyikan pasangan
 * Penilaian AMI sama sekali — nol di sana akan terbaca "sudah dicek, tidak ada".
 */
export function ActiveDocumentStatCards({
	stats,
	tampilkanAmi,
}: {
	stats: ActiveDocumentStats;
	tampilkanAmi: boolean;
}) {
	return (
		<div className="grid gap-x-4 gap-y-6 lg:grid-cols-2">
			<StatGroup label="Penyusunan LED">
				<StatCard
					label="Dokumen aktif"
					value={String(stats.dokumenAktif)}
					tone={toneFor(stats.dokumenAktif, 'default')}
				/>
				<StatCard
					label="Tenggat mendesak"
					value={String(stats.tenggatMendesak)}
					hint={stats.terlambat > 0 ? `${stats.terlambat} terlambat` : undefined}
					tone={toneFor(stats.tenggatMendesak, stats.terlambat > 0 ? 'danger' : 'warning')}
				/>
			</StatGroup>

			{tampilkanAmi && (
				<StatGroup label="Penilaian AMI">
					<StatCard
						label="Perlu ditinjau"
						value={show(stats.perluDitinjau)}
						tone={toneFor(stats.perluDitinjau, 'default')}
					/>
					<StatCard
						label="Perlu perhatian"
						value={show(stats.perluPerhatian)}
						tone={toneFor(stats.perluPerhatian, 'warning')}
					/>
				</StatGroup>
			)}
		</div>
	);
}

function StatGroup({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{label}
			</p>
			<div className="grid flex-1 gap-4 sm:grid-cols-2">{children}</div>
		</div>
	);
}
