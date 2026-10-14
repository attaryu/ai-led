import { EvidenceStatusCard } from '~/features/evidence/presentation/components/evidence-status-card';
import { type InstitutionResources } from '../../domain/entities/institution-readiness.entity';

/**
 * Dashboard Utama §4.0d (docs/application_flow.md) — bekal yang berlaku
 * **lintas penyusunan**, karena itu berdiri di luar baris ringkasan dokumen
 * yang sedang disusun dan menyebut kerangka waktunya sendiri.
 */
export function InstitutionResourceStrip({
	sumberDaya,
}: {
	sumberDaya: InstitutionResources;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Sumber Daya Institusi
				</p>
			</div>

			<div className="grid gap-4">
				{/*
				 * Cakupannya hanya `owner_tipe = TENANT` supaya angkanya cocok
				 * dengan daftar di halaman yang dituju tombolnya (§4.4).
				 */}
				<EvidenceStatusCard
					judul="Bukti Dukung Universitas"
					ringkasan={sumberDaya.evidenceTenant}
					href="/dashboard/evidence"
					pesanKosong="Belum ada berkas level universitas."
				/>
			</div>
		</section>
	);
}
