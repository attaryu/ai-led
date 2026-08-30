import * as React from 'react';
import {
	ClipboardTextIcon,
	FilePdfIcon,
	PencilSimpleIcon,
	SealCheckIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import { useParams, useSearchParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import { Button } from '~/core/components/ui/button';
import { StatCard } from '~/core/components/ui/stat-card';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '~/core/components/ui/tabs';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { useActiveTenant } from '~/features/tenant/presentation/hooks/use-active-tenant';
import { type PenilaianFinalRow } from '../../domain/entities/assessment-session.entity';
import { AssessmentDetailSheet } from '../components/assessment-detail-sheet';
import { AssessmentDownloadDialog } from '../components/assessment-download-dialog';
import { AssessmentHistoryList } from '../components/assessment-history-list';
import { AssessmentQualityPanel } from '../components/assessment-quality-panel';
import { AssessmentResultList } from '../components/assessment-result-list';
import { AssessmentRunPanel } from '../components/assessment-run-panel';
import { AssessmentSourceCard } from '../components/assessment-source-card';
import { useAssessmentPermission } from '../hooks/use-assessment-permission';
import { useAssessmentQuality } from '../hooks/use-assessment-quality';
import { useAssessmentReadiness } from '../hooks/use-assessment-readiness';
import { useAssessmentResults } from '../hooks/use-assessment-results';
import { useAssessmentSession } from '../hooks/use-assessment-session';
import { formatSkor } from '../utils/assessment-format';

const TAB_VALID = ['penilaian', 'kualitas', 'riwayat'] as const;
type TabValue = (typeof TAB_VALID)[number];

/**
 * Penilaian AMI — lapis 3, satu sesi per Dokumen LED.
 *
 * **Kenapa di sini dan bukan di tempat lain.** `AssessmentSession.dokumenId`
 * adalah foreign key ke `DokumenLed`, jadi lingkupnya sudah tertulis di bentuk
 * datanya: bukan per prodi (Dashboard Program Studi), bukan pula per bab (Editor Bab).
 *
 * Tiga tab, bukan tiga menu sidebar seperti prototipe. Ketiganya menjawab
 * pertanyaan tentang **dokumen yang sama**, dan menaikkannya jadi menu sederajat
 * akan menyatakan bahwa masing-masing berdiri sendiri — padahal Riwayat tanpa
 * konteks dokumen tidak berarti apa pun, dan Kualitas Penilaian selalu tentang
 * satu sesi tertentu.
 */
export function LedProjectAssessment() {
	const { projectId } = useParams<{ projectId: string }>();
	const ledProject = projectId
		? ledProjectRepository.findById(projectId)
		: undefined;

	// Layout sudah menampilkan keadaan "tidak ditemukan" dan tidak merender
	// halaman ini; cabang ini hanya penjaga bila rutenya dipakai di luar layout.
	if (!ledProject) {
		return (
			<PlaceholderPage
				title="Dokumen LED tidak ditemukan"
				description="Dokumen yang diminta tidak ada di daftar."
				links={[
					{ label: 'Dokumen LED lintas program studi', to: '/dashboard/led-projects' },
				]}
			/>
		);
	}

	return <AssessmentView ledProject={ledProject} />;
}

/**
 * Dipisah dari komponen di atas supaya hook penilaian tidak perlu berjalan (dan
 * menyentuh penyimpanan) untuk dokumen yang belum tentu ada — sama seperti
 * `led-project-workspace-home.tsx`.
 */
function AssessmentView({ ledProject }: { ledProject: LedProjectEntity }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const izin = useAssessmentPermission(ledProject.studyProgramId);

	const tabDariUrl = searchParams.get('tab');
	const tab: TabValue = TAB_VALID.includes(tabDariUrl as TabValue)
		? (tabDariUrl as TabValue)
		: 'penilaian';

	const sesiIdTerpilih = searchParams.get('sesi');

	const {
		daftarSesi,
		sesiAktif,
		melihatSesiTerbaru,
		kontenSesi,
		status,
		pesanGagal,
		jalankan,
	} = useAssessmentSession({
		projectId: ledProject.id,
		sesiIdTerpilih,
		izin,
	});

	const { sumber, setSumber, kandidat, kesiapan } = useAssessmentReadiness({
		projectId: ledProject.id,
		studyProgramId: ledProject.studyProgramId,
		sumberTerakhir: daftarSesi[0]?.sumber,
	});

	const { baris, ringkasan, simpanKeputusan, cabutKeputusan } =
		useAssessmentResults({ projectId: ledProject.id, sesi: sesiAktif, izin });

	const kualitas = useAssessmentQuality({
		sesi: sesiAktif,
		izin,
		konten: kontenSesi,
	});

	/**
	 * Indikator yang sedang dibuka di laci, disimpan sebagai **nomor** bukan objek
	 * barisnya.
	 *
	 * Barisnya dihitung ulang tiap kali keputusan tersimpan (lewat
	 * `storage-update`), jadi objek yang dipegang di state akan jadi salinan basi
	 * segera setelah tombol simpan ditekan — lacinya akan terus menampilkan
	 * keadaan sebelum penyimpanan sampai ditutup. Menyimpan nomornya membuat isi
	 * laci selalu ikut segar.
	 */
	const [indikatorDibuka, setIndikatorDibuka] = React.useState<number | null>(
		null,
	);

	/** Urutan yang sedang terlihat di daftar; jadi urutan navigasi ‹ › di laci. */
	const [urutanTampil, setUrutanTampil] = React.useState<PenilaianFinalRow[]>(
		[],
	);

	const [unduhTerbuka, setUnduhTerbuka] = React.useState(false);
	const tenant = useActiveTenant();

	const posisiDibuka = urutanTampil.findIndex(
		(row) => row.kriteria.no === indikatorDibuka,
	);
	const rowDibuka = posisiDibuka >= 0 ? urutanTampil[posisiDibuka] : null;

	function gantiParam(ubah: Record<string, string | null>) {
		const berikutnya = new URLSearchParams(searchParams);
		for (const [kunci, nilai] of Object.entries(ubah)) {
			if (nilai === null) berikutnya.delete(kunci);
			else berikutnya.set(kunci, nilai);
		}
		setSearchParams(berikutnya, { replace: true });
	}

	if (!izin.canRead) {
		return (
			<PlaceholderPage
				title="Tidak ada akses"
				description="Anda tidak berhak melihat penilaian dokumen ini."
				links={[{ label: 'Kembali ke Dashboard', to: '/dashboard' }]}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Penilaian AMI
					</h2>
					<p className="text-sm text-muted-foreground">
						AI menilai tiap indikator; Penjamin Mutu yang memutuskan skor
						akhirnya.
					</p>
				</div>

				{/*
				 * Di kepala halaman, bukan di dalam tab Penilaian: yang diunduh seluruh
				 * indikator, jadi tombolnya tidak boleh terasa milik satu tab saja.
				 *
				 * Disembunyikan — bukan dimatikan — saat belum ada sesi, mengikuti §1
				 * dan tombol jalankan di `AssessmentRunPanel`. Tanpa sesi, `baris`
				 * kosong dan yang terunduh cuma kop tanpa satu baris pun.
				 */}
				{sesiAktif !== undefined && baris.length > 0 && (
					<Button
						type="button"
						variant="outline"
						onClick={() => setUnduhTerbuka(true)}
						className="shrink-0 cursor-pointer"
					>
						<FilePdfIcon />
						Unduh PDF
					</Button>
				)}
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Skor Rata-rata"
					icon={ClipboardTextIcon}
					value={formatSkor(sesiAktif ? ringkasan.rataRata : null)}
					progress={sesiAktif ? ringkasan.persen : undefined}
					hint={
						sesiAktif
							? `${ringkasan.persen}% dari skor maksimal`
							: 'Belum pernah dinilai'
					}
				/>
				{/*
				 * Menggantikan kartu "Indikator Dinilai" (cakupan AI), yang hampir
				 * selalu penuh dan karena itu jarang jadi pertanyaan. Yang benar-benar
				 * ditanyakan Penjamin Mutu tiap hari adalah seberapa jauh **dia** sudah
				 * memeriksa — jadi itulah yang diangkat jadi angka besar beserta barnya.
				 */}
				<StatCard
					label="Progres Peninjauan"
					icon={SealCheckIcon}
					value={`${ringkasan.jumlahDitinjau}/${ringkasan.total}`}
					progress={ringkasan.persenDitinjau}
					hint={
						ringkasan.total === 0
							? 'Jalankan penilaian lebih dulu'
							: ringkasan.jumlahTinjauUlang > 0
								? `${ringkasan.jumlahBelumDitinjau} belum ditinjau · ${ringkasan.jumlahTinjauUlang} perlu ditinjau ulang`
								: ringkasan.jumlahBelumDitinjau === 0
									? 'Seluruh indikator sudah ditinjau'
									: `${ringkasan.jumlahBelumDitinjau} indikator belum ditinjau`
					}
					tone={ringkasan.jumlahTinjauUlang > 0 ? 'warning' : 'default'}
				/>
				<StatCard
					label="Dikoreksi Penjamin Mutu"
					icon={PencilSimpleIcon}
					value={String(ringkasan.jumlahDikoreksi)}
					hint={
						ringkasan.jumlahDikoreksi === 0
							? 'Belum ada skor AI yang diubah'
							: `${ringkasan.jumlahDisetujuiApaAdanya} lainnya disetujui apa adanya`
					}
				/>
				<StatCard
					label="Perlu Diperiksa"
					icon={WarningCircleIcon}
					value={String(ringkasan.jumlahPerluDiperiksa)}
					// Menyebut "belum disetujui", bukan mendaftar ketiga pemicunya:
					// angkanya kini menyusut tiap kali Penjamin Mutu menyetujui sesuatu,
					// dan daftar pemicu tanpa syarat itu akan membuat angkanya tampak
					// tidak cocok dengan keterangannya sendiri.
					hint="Temuan AI yang belum disetujui Penjamin Mutu"
					tone={ringkasan.jumlahPerluDiperiksa > 0 ? 'warning' : 'default'}
				/>
			</div>

			<Tabs
				value={tab}
				onValueChange={(nilai) => gantiParam({ tab: String(nilai) })}
			>
				<TabsList variant="line">
					<TabsTrigger value="penilaian">Penilaian</TabsTrigger>
					<TabsTrigger value="kualitas">Kualitas Penilaian</TabsTrigger>
					<TabsTrigger value="riwayat">Riwayat</TabsTrigger>
				</TabsList>

				<TabsContent value="penilaian" className="flex flex-col gap-4 pt-2">
					<AssessmentSourceCard
						sumber={sumber}
						setSumber={setSumber}
						kesiapan={kesiapan}
						kandidat={kandidat}
						studyProgramId={ledProject.studyProgramId}
						studyProgramName={ledProject.studyProgramName}
						uploader={{
							userId: izin.session?.userId ?? '',
							name: izin.session?.namaLengkap ?? '',
						}}
						bolehMengubah={izin.canRun}
					/>

					<AssessmentRunPanel
						sesi={sesiAktif}
						status={status}
						pesanGagal={pesanGagal}
						siap={kesiapan.siap}
						bolehMenjalankan={izin.canRun}
						melihatSesiTerbaru={melihatSesiTerbaru}
						onJalankan={() => {
							// Sesi baru selalu jadi yang terbaru, jadi penunjuk sesi lama di
							// URL harus dilepas — kalau tidak, halaman akan tetap
							// memperlihatkan hasil lama sementara yang baru berjalan.
							gantiParam({ sesi: null });
							void jalankan(sumber);
						}}
					/>

					<AssessmentResultList
						baris={baris}
						ringkasan={ringkasan}
						barisTerpilihNo={indikatorDibuka}
						onBuka={(row) => setIndikatorDibuka(row.kriteria.no)}
						onDaftarTampilBerubah={setUrutanTampil}
					/>
				</TabsContent>

				<TabsContent value="kualitas" className="pt-2">
					<AssessmentQualityPanel
						kualitas={kualitas.kualitas}
						status={kualitas.status}
						pesanGagal={kualitas.pesanGagal}
						bolehMengevaluasi={kualitas.bolehMengevaluasi}
						sesiSelesai={kualitas.sesiSelesai}
						adaSesi={sesiAktif !== undefined}
						onJalankan={() => void kualitas.jalankanEvaluasi()}
					/>
				</TabsContent>

				<TabsContent value="riwayat" className="pt-2">
					<AssessmentHistoryList
						daftarSesi={daftarSesi}
						sesiAktifId={sesiAktif?.id}
						onPilih={(sesiId) =>
							gantiParam({ sesi: sesiId, tab: 'penilaian' })
						}
					/>
				</TabsContent>
			</Tabs>

			<AssessmentDetailSheet
				row={rowDibuka}
				posisi={posisiDibuka + 1}
				total={urutanTampil.length}
				bolehMemutuskan={izin.canCorrect && sesiAktif !== undefined}
				onTutup={() => setIndikatorDibuka(null)}
				onPindah={(arah) => {
					const berikutnya = urutanTampil[posisiDibuka + arah];
					if (berikutnya) setIndikatorDibuka(berikutnya.kriteria.no);
				}}
				onSimpan={({ skorFinal, catatan }) => {
					if (!rowDibuka) return;
					simpanKeputusan({
						indikatorNo: rowDibuka.kriteria.no,
						skorFinal,
						catatan,
					});
				}}
				onCabut={() => {
					if (rowDibuka) cabutKeputusan(rowDibuka.kriteria.no);
				}}
			/>

			{/*
			 * Dirender hanya saat terbuka, bukan disembunyikan lewat prop `open`:
			 * membangkitkan PDF adalah pekerjaan yang tidak boleh berjalan untuk
			 * dialog yang belum diminta siapa pun, dan efek di dalamnya memang
			 * dipicu oleh pemasangan komponennya.
			 */}
			{unduhTerbuka && sesiAktif !== undefined && (
				<AssessmentDownloadDialog
					open={unduhTerbuka}
					onOpenChange={setUnduhTerbuka}
					input={{
						baris,
						ringkasan,
						sesi: sesiAktif,
						ledProject,
						namaUniversitas: tenant.universityName,
						melihatSesiTerbaru,
					}}
				/>
			)}
		</div>
	);
}
