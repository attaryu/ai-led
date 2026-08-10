import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { ActiveDraftingTable } from '../components/active-drafting-table';
import { AdminOrganizationSummary } from '../components/admin-organization-summary';
import { InstitutionAccreditationCard } from '../components/institution-accreditation-card';
import { InstitutionResourceStrip } from '../components/institution-resource-strip';
import { PendingDraftingTable } from '../components/pending-drafting-table';
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
 *   §4.0a — Posisi Akreditasi ......... masa lalu, dari `PROGRAM_STUDI`
 *   §4.0c — Sedang Menyusun ........... prodi yang dokumennya sedang berjalan
 *           Perlu Segera Disusun ..... prodi yang seharusnya sudah mulai
 *   §4.0d — Sumber Daya Institusi ..... lintas penyusunan, bukti dukung & tim
 *
 * Nomor bagiannya sengaja tidak dirapatkan setelah §4.0b dibuang: §4.0c dan
 * §4.0d dirujuk dari banyak tempat lain di dokumen, dan menggesernya hanya untuk
 * menutup lubang penomoran akan membatalkan seluruh rujukan itu. §4.0b kini
 * ditempati catatan desain yang menerangkan kenapa bloknya tidak ada.
 *
 * **Dua tabel, bukan satu tabel dengan kolom Status.** Keduanya pernah jadi satu,
 * dan kolom-kolomnya saling meniadakan: "sejauh mana penyusunan berjalan" butuh
 * progres dan tenggat, "siapa yang harus mulai" butuh masa berlaku akreditasi
 * dan tombol untuk memulainya. Satu tabel tidak bisa melayani keduanya tanpa
 * separuh selnya berisi `—`.
 *
 * **Rincian per bab tetap tidak ada di sini.** Halaman ini pernah punya blok
 * berisi empat kartu angka se-universitas, dan tabelnya mengulang ketiganya lagi
 * per baris, sehingga lapis tenant terbaca sebagai Dashboard Project LED (§6.1)
 * yang diperbanyak barisnya. Yang tersisa cuma satu bar kelengkapan yang
 * menyebutkan pembagiannya lewat tooltip.
 *
 * Berbeda dari versi sebelumnya, halaman ini **punya** aksi ubah data: tombol
 * Buat Proyek LED di tabel kedua. Sesuai §1 ia tidak dirender sama sekali di luar
 * Penjamin Mutu, sama seperti tautan Manajemen User di §4.0d.
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
					dapatBuatProyek={session.role === 'Penjamin Mutu'}
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
	dapatBuatProyek,
}: {
	dapatKelolaUser: boolean;
	/** Penjamin Mutu; Pimpinan read-only atas Dokumen LED di level ini (§6.2). */
	dapatBuatProyek: boolean;
}) {
	const { sedangMenyusun, perluDisusun, belumPerlu, akreditasi, sumberDaya } =
		useInstitutionReadiness();

	const adaProdi = akreditasi.totalProdi > 0;

	return (
		<>
			<InstitutionAccreditationCard akreditasi={akreditasi} />

			{/*
			 * Tenant tanpa prodi sama sekali tidak dapat dua kotak kosong berturut-turut
			 * yang mengulang hal yang sama — keduanya akan berbunyi "belum ada prodi",
			 * dan dua kali tidak membuatnya lebih benar.
			 */}
			{!adaProdi ? (
				<div className="rounded-md border border-dashed border-border p-8 text-center">
					<p className="text-sm font-medium">Belum ada program studi</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Kesiapan akreditasi baru bisa dipantau setelah ada prodi yang
						terdaftar.
					</p>
				</div>
			) : (
				<>
					<section className="flex flex-col gap-3">
						<div>
							<h3 className="font-heading text-lg font-bold tracking-tight">
								Sedang Menyusun
								{sedangMenyusun.length > 0 && (
									<span className="ml-2 text-sm font-normal text-muted-foreground">
										{sedangMenyusun.length} prodi
									</span>
								)}
							</h3>
							<p className="text-sm text-muted-foreground">
								Diurutkan dari tenggat yang paling menekan. Klik nama prodi untuk
								masuk ke Dashboard Prodi-nya.
							</p>
						</div>
						<ActiveDraftingTable rows={sedangMenyusun} />
					</section>

					<section className="flex flex-col gap-3">
						<div>
							<h3 className="font-heading text-lg font-bold tracking-tight">
								Perlu Segera Disusun
								{perluDisusun.length > 0 && (
									<span className="ml-2 text-sm font-normal text-muted-foreground">
										{perluDisusun.length} prodi
									</span>
								)}
							</h3>
							<p className="text-sm text-muted-foreground">
								Masa berlaku akreditasinya tersisa setahun atau kurang, sudah
								habis, atau belum pernah ada — dan belum ada Dokumen LED yang
								dikerjakan.
							</p>
						</div>
						<PendingDraftingTable
							rows={perluDisusun}
							canManage={dapatBuatProyek}
						/>
						{/*
						 * Prodi yang tidak masuk kedua tabel tidak hilang diam-diam:
						 * penjumlahan ketiganya harus selalu bisa dicocokkan dengan total
						 * prodi di kartu akreditasi.
						 */}
						{belumPerlu > 0 && (
							<p className="text-xs text-muted-foreground">
								{belumPerlu} prodi lain akreditasinya masih panjang dan belum
								perlu menyusun.
							</p>
						)}
					</section>
				</>
			)}

			<InstitutionResourceStrip
				sumberDaya={sumberDaya}
				totalProdi={akreditasi.totalProdi}
				dapatKelolaUser={dapatKelolaUser}
			/>
		</>
	);
}
