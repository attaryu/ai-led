import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { ActiveDocumentStatCards } from '../components/active-document-stat-cards';
import { ActiveDocumentsTable } from '../components/active-documents-table';
import { AdminOrganizationSummary } from '../components/admin-organization-summary';
import { InstitutionResourceStrip } from '../components/institution-resource-strip';
import { useActiveDocumentsOverview } from '../hooks/use-active-documents-overview';

/**
 * Dashboard Utama (docs/application_flow.md §4.0).
 *
 * Halaman ini menjawab satu pertanyaan: **seberapa siap universitas ini
 * menghadapi akreditasi, dan prodi mana yang tertinggal.** Subjeknya universitas,
 * bukan daftar menunya.
 *
 * **Aturan utama halaman ini: satu blok, satu kerangka waktu** — aturan yang sama
 * yang berlaku di Dashboard Program Studi (§5.1) dan yang secara khusus diperingatkan
 * PRD §3.8 untuk level institusi: capaian yang sudah disahkan dan usaha
 * penyusunan yang sedang berjalan tidak boleh disandingkan sebagai angka
 * sederajat. Seluruh angka di sini adalah tentang Dokumen LED yang **aktif**
 * (sedang disusun) beserta penilaian AMI terbarunya.
 *
 *   Empat kartu ....................... Penyusunan LED (dokumen aktif, tenggat
 *                                       mendesak) dan Penilaian AMI (perlu ditinjau,
 *                                       perlu perhatian), di puncak halaman
 *   §4.0c — Dokumen LED aktif ......... satu tabel, satu baris per dokumen: status
 *                                       dan tenggat, progres bab, peninjauan serta
 *                                       rata-rata skor AMI
 *   §4.0d — Sumber Daya Institusi ..... lintas penyusunan, bukti dukung
 *
 * Tabel Dokumen LED aktif menggantikan dua tabel yang dulu berdampingan —
 * "Sedang menyusun" (§4.0c) dan "Penilaian AMI" — yang memuat dokumen yang sama
 * dan memaksa pembaca mencocokkan barisnya sendiri. Nomor §4.0c tetap dipakai
 * untuk tabel gabungan ini.
 *
 * Nomor bagiannya sengaja tidak dirapatkan setelah §4.0a dan §4.0b dibuang:
 * §4.0c dan §4.0d dirujuk dari banyak tempat lain di dokumen, dan menggesernya
 * hanya untuk menutup lubang penomoran akan membatalkan seluruh rujukan itu.
 * Posisi Akreditasi (§4.0a), tabel Perlu Segera Disusun, dan kartu Tim Penyusun
 * dibuang dari halaman: peringkat akreditasi tidak dipakai pembangkitan AI
 * maupun penilaian AMI. Datanya tetap ada di DB dan payload API, hanya tidak
 * lagi ditampilkan atau ditanyakan.
 *
 * **Kartu menghitung dokumen, bukan bab atau indikator.** Tiap dokumen punya
 * jumlah bab dan rubrik yang berbeda, jadi menjumlahkan sub-unit itu lintas
 * dokumen menghasilkan angka yang tidak bermakna. Halaman ini pernah punya blok
 * empat kartu angka se-universitas yang diulang lagi per baris tabel, sehingga
 * lapis tenant terbaca sebagai Dashboard Project LED (§6.1) yang diperbanyak
 * barisnya; kartu yang sekarang hanya menjawab "berapa dokumen yang perlu
 * disentuh", dan rincian per bab tetap tidak ada di sini.
 *
 * Bila ringkasan AMI gagal dimuat, tabel tetap tampil (kolom dokumen, bab, dan
 * tenggat tidak bergantung padanya) sementara kolom AMI menjadi "—" dan dua
 * kartu Penilaian AMI disembunyikan — nol di sana akan terbaca sebagai
 * "sudah dicek, tidak ada".
 *
 * Halaman ini murni baca: tombol Buat Dokumen LED yang dulu ada di tabel Perlu
 * Segera Disusun ikut hilang bersamanya. Tautan Manajemen User tinggal di
 * sidebar.
 */
export function Dashboard() {
	const session = useSession();

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h2 className="font-heading text-2xl font-bold tracking-tight">
					Dashboard Utama
				</h2>
				<p className="text-sm text-muted-foreground">
					{session?.role === 'Admin'
						? 'Ringkasan organisasi level universitas (tenant).'
						: 'Kesiapan AMI seluruh program studi di universitas ini.'}
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
				<InstitutionReadinessView />
			)}
		</div>
	);
}

/**
 * Dipisah dari komponen di atas supaya hook kesiapan tidak berjalan (dan
 * menyentuh penyimpanan) untuk Admin yang tidak akan merendernya — pemisahan
 * yang sama seperti `ProgramReadinessView` di Dashboard Program Studi.
 */
function InstitutionReadinessView() {
	const { loaded, adaProdi, rows, stats, amiStatus, sumberDaya } =
		useActiveDocumentsOverview();

	// Menunggu pembacaan pertama: jangan memunculkan "Belum ada program studi" sesaat.
	if (!loaded) return null;

	return (
		<>
			{/* Tenant tanpa prodi sama sekali tidak punya apa pun untuk disusun. */}
			{!adaProdi ? (
				<div className="rounded-md border border-dashed border-border p-8 text-center">
					<p className="text-sm font-medium">Belum ada program studi</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Dokumen LED baru bisa disusun setelah ada program studi yang terdaftar.
					</p>
				</div>
			) : (
				<>
					<ActiveDocumentStatCards
						stats={stats}
						tampilkanAmi={amiStatus !== 'error'}
					/>
					<section className="flex flex-col gap-3">
						<h3 className="font-heading text-lg font-bold tracking-tight">
							Dokumen LED aktif
						</h3>
						<ActiveDocumentsTable
							rows={rows}
							amiTersedia={amiStatus === 'ready'}
						/>
					</section>
				</>
			)}

			<InstitutionResourceStrip sumberDaya={sumberDaya} />
		</>
	);
}
