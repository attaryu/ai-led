import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { AdminOrganizationSummary } from '../components/admin-organization-summary';
import { InstitutionAccreditationCard } from '../components/institution-accreditation-card';
import { InstitutionDraftingSummary } from '../components/institution-drafting-summary';
import { InstitutionResourceStrip } from '../components/institution-resource-strip';
import { ProgramReadinessTable } from '../components/program-readiness-table';
import { useInstitutionReadiness } from '../hooks/use-institution-readiness';

/**
 * Dashboard Utama (docs/application_flow.md §4.0).
 *
 * Halaman ini menjawab satu pertanyaan: **seberapa siap universitas ini
 * menghadapi akreditasi, dan prodi mana yang tertinggal.** Subjeknya universitas,
 * bukan daftar menunya.
 *
 * **Aturan utama halaman ini: satu blok, satu kerangka waktu** — aturan yang sama
 * yang berlaku di Dashboard Prodi (§5.1) dan yang secara khusus diperingatkan
 * PRD §3.8 untuk level institusi: capaian akreditasi yang sudah disahkan dan
 * usaha penyusunan yang sedang berjalan tidak boleh disandingkan sebagai angka
 * sederajat.
 *
 *   Blok A — Posisi Akreditasi ......... masa lalu, dari `PROGRAM_STUDI`
 *   Blok B — Sedang Menyusun ........... sekarang, dari `DOKUMEN_LED` aktif + babnya
 *   Blok C — Kesiapan per Prodi ........ inti halaman, perbandingan antar prodi
 *   Blok D — Sumber Daya Institusi ..... lintas penyusunan, bukti dukung & tim
 *
 * Versi sebelumnya halaman ini berisi empat kartu penaut yang isinya persis menu
 * sidebar. Keduanya difilter per role dengan aturan yang sama, jadi kartu-kartu
 * itu salinan kedua tanpa nilai tambah — alasan yang sama yang membuang daftar
 * riwayat penyusunan dari Dashboard Prodi (§5.1c).
 *
 * Halaman ini murni baca: tidak ada satu pun aksi ubah data, jadi tidak ada
 * tombol yang perlu disembunyikan per role selain tautan Manajemen User di Blok
 * D — penjagaan selebihnya sudah selesai di layout lapis ini.
 */
export function Dashboard() {
	const session = useSession();

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="font-heading text-2xl font-bold tracking-tight">
					Dashboard Utama
				</h2>
				<p className="text-sm text-muted-foreground">
					{session?.role === 'Admin'
						? 'Ringkasan organisasi level universitas (tenant).'
						: 'Kesiapan akreditasi seluruh program studi di universitas ini.'}
				</p>
			</div>

			{/*
			 * Session belum terbaca: jangan merender salah satu cabang lebih dulu.
			 * Menampilkan agregat kesiapan sesaat lalu menggantinya dengan ringkasan
			 * Admin berarti Admin sempat melihat angka yang tidak boleh ia lihat.
			 */}
			{!session ? null : session.role === 'Admin' ? (
				<AdminOrganizationSummary />
			) : (
				<InstitutionReadinessView
					dapatKelolaUser={session.role === 'Pimpinan'}
				/>
			)}
		</div>
	);
}

/**
 * Dipisah dari komponen di atas supaya hook kesiapan tidak berjalan (dan
 * menyentuh penyimpanan) untuk Admin yang tidak akan merendernya — pemisahan
 * yang sama seperti `ProgramReadinessView` di Dashboard Prodi.
 */
function InstitutionReadinessView({
	dapatKelolaUser,
}: {
	dapatKelolaUser: boolean;
}) {
	const { rows, akreditasi, penyusunan, sumberDaya } =
		useInstitutionReadiness();

	return (
		<>
			<InstitutionAccreditationCard akreditasi={akreditasi} />
			<InstitutionDraftingSummary penyusunan={penyusunan} />
			<ProgramReadinessTable rows={rows} />
			<InstitutionResourceStrip
				sumberDaya={sumberDaya}
				totalProdi={akreditasi.totalProdi}
				dapatKelolaUser={dapatKelolaUser}
			/>
		</>
	);
}
