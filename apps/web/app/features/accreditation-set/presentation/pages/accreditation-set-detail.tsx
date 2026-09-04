import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router';
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CopySimpleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { useConfirmDialog } from '~/core/components/ui/confirm-dialog';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import {
	updateAccreditationSetSchema,
	type UpdateAccreditationSetDto,
} from '../../domain/dtos/update-accreditation-set.dto';
import {
	SET_DOCUMENT_TYPES,
	deriveSetCompleteness,
	deriveSetReadiness,
	findSetDocument,
	type SetDocumentType,
} from '../../domain/entities/accreditation-set.entity';
import { EvidenceStatusBadge } from '~/features/evidence/presentation/components/evidence-status-badge';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { AccreditationSetFormFields } from '../components/accreditation-set-form-fields';
import { DocumentSlotCard } from '../components/document-slot-card';
import { SetLockNotice } from '../components/set-lock-notice';
import { SetStatusBadge } from '../components/set-status-badge';
import { useAccreditationSet } from '../hooks/use-accreditation-set';
import { useAccreditationSetPermission } from '../hooks/use-accreditation-set-permission';

export function AccreditationSetDetail() {
	const navigate = useNavigate();
	const { setId } = useParams<{ setId: string }>();
	const { canView, canManage, session } = useAccreditationSetPermission();
	const { set, dipakai, lock, notFound, memuat, reload } =
		useAccreditationSet(setId);
	const { konfirmasi, confirmDialog } = useConfirmDialog();
	const [formError, setFormError] = React.useState<string | null>(null);
	const [aksiError, setAksiError] = React.useState<string | null>(null);

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting, isDirty },
	} = useForm<UpdateAccreditationSetDto>({
		resolver: zodResolver(updateAccreditationSetSchema),
		defaultValues: {
			nama: '',
			lembaga: '',
			tahunSiklus: new Date().getFullYear(),
		},
	});

	// Formulir diisi ulang hanya saat identitas setnya berubah, bukan tiap kali
	// daftar berkas berubah — mengunggah berkas tidak boleh membuang isian yang
	// belum sempat disimpan.
	React.useEffect(() => {
		if (set) {
			reset({
				nama: set.nama,
				lembaga: set.lembaga,
				tahunSiklus: set.tahunSiklus,
			});
		}
	}, [set?.id, set?.nama, set?.lembaga, set?.tahunSiklus, reset]);

	const onSubmit = async (data: UpdateAccreditationSetDto) => {
		if (!setId) return;
		setFormError(null);

		try {
			await accreditationSetRepository.update(setId, data);
			reload();
		} catch {
			setFormError('Gagal menyimpan perubahan.');
		}
	};

	const handleUpload = React.useCallback(
		async (tipe: SetDocumentType, file: File) => {
			if (!setId) return;
			setAksiError(null);

			try {
				await accreditationSetRepository.attachDocument(
					setId,
					tipe,
					file,
					session?.namaLengkap ?? 'Tidak diketahui',
				);
				reload();
			} catch (e) {
				setAksiError(
					e instanceof Error ? e.message : 'Gagal mengunggah berkas.',
				);
			}
		},
		[setId, session?.namaLengkap, reload],
	);

	// Penolakan repository harus mendarat di layar, bukan di konsol. Slot berkas
	// punya penolakan yang tidak bisa ditebak dari tampilannya: menghapus berkas
	// dari set yang sudah siap membuatnya tidak lagi memenuhi syarat siap, dan
	// tombolnya sendiri tetap terlihat wajar sampai ditekan.
	const handleRemove = React.useCallback(
		async (tipe: SetDocumentType) => {
			if (!setId) return;

			const lanjut = await konfirmasi({
				judul: 'Hapus berkas pada slot ini?',
				deskripsi:
					'Slotnya jadi kosong dan berkasnya harus diunggah ulang bila masih dibutuhkan.',
				labelAksi: 'Hapus Berkas',
				merusak: true,
			});
			if (!lanjut) return;

			setAksiError(null);

			try {
				await accreditationSetRepository.removeDocument(setId, tipe);
				reload();
			} catch (e) {
				setAksiError(e instanceof Error ? e.message : 'Gagal menghapus berkas.');
			}
		},
		[setId, reload, konfirmasi],
	);

	const duplikat = React.useCallback(async () => {
		if (!setId) return;
		setAksiError(null);

		try {
			const salinan = await accreditationSetRepository.duplicate(setId);
			navigate(`/dashboard/accreditation-sets/${salinan.id}`);
		} catch (e) {
			setAksiError(e instanceof Error ? e.message : 'Gagal menduplikasi set.');
		}
	}, [setId, navigate]);

	// Alasan sama dengan halaman daftarnya: lapis tenant meloloskan Admin, jadi
	// alamat ini masih terbuka langsung walau menunya tidak ada.
	if (!canView) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Set akreditasi adalah bagian dari konten akreditasi, di luar kewenangan
				Admin.
			</div>
		);
	}

	if (notFound) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Set akreditasi tidak ditemukan.
			</div>
		);
	}

	if (memuat || !set || !lock) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Memuat set akreditasi...
			</div>
		);
	}

	const { terisi } = deriveSetCompleteness(set);

	// Label aksi ikut dua syarat, bukan satu: Pimpinan yang membuka set draf tetap
	// hanya meninjau, jadi menawarinya "koreksi" adalah janji yang tidak ditepati
	// begitu halamannya terbuka.
	const bolehKoreksi = canManage && lock.terbuka;
	const readiness = deriveSetReadiness(set);
	const ringkasKriteria =
		set.kriteria.length === 0
			? 'belum ada kriteria'
			: `${set.kriteria.length} kriteria`;

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-4">
					<Button
						variant="outline"
						size="icon"
						title="Kembali ke daftar set"
						onClick={() => navigate('/dashboard/accreditation-sets')}
						className="cursor-pointer"
					>
						<ArrowLeftIcon className="size-4" />
					</Button>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="font-heading text-2xl font-bold tracking-tight">
								{set.nama}
							</h2>
							<SetStatusBadge status={set.status} />
							{/* Cuma tampil selagi ada yang perlu diketahui pengguna -- ekstraksi
							    lagi jalan, atau gagal. Status "Siap" tenggelam di antara badge
							    lain kalau selalu ditampilkan, padahal itu keadaan diam yang
							    sudah cukup diwakili munculnya kriteria di bawah. */}
							{(set.criteriaParseStatus === 'DIPROSES' || set.criteriaParseStatus === 'GAGAL') && (
								<EvidenceStatusBadge status={set.criteriaParseStatus} />
							)}
							{(set.structureParseStatus === 'DIPROSES' || set.structureParseStatus === 'GAGAL') && (
								<EvidenceStatusBadge status={set.structureParseStatus} />
							)}
						</div>
						{/* Jumlah kriteria ikut di sini, bukan di kartu tersendiri di dasar
						    halaman: ia keterangan tentang set ini, sama seperti lembaga dan
						    siklusnya, dan kartu yang memuatnya dulu terkubur di bawah tiga
						    slot berkas yang pada set terkunci tidak bisa disentuh sama
						    sekali. */}
						<p className="text-sm text-muted-foreground">
							{set.lembaga} · siklus {set.tahunSiklus} · {ringkasKriteria}
							{dipakai > 0 && ` · dipakai ${dipakai} Dokumen LED`}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{/* Aksi utama halaman ini, jadi ia yang berwarna penuh: pada set yang
					    sudah terkunci, membuka isi rubrik adalah satu-satunya hal yang
					    masih bisa dilakukan siapa pun di sini. */}
					<Button
						onClick={() =>
							navigate(`/dashboard/accreditation-sets/${set.id}/criteria`)
						}
						className="cursor-pointer gap-2"
					>
						{bolehKoreksi ? 'Tinjau dan Koreksi Isi' : 'Tinjau Isi Rubrik'}
						<ArrowRightIcon className="size-4" />
					</Button>

					{/* Duplikasi ditawarkan kapan pun, bukan hanya saat setnya terkunci:
					    siklus berikutnya hampir selalu berangkat dari set tahun lalu, dan
					    memaksa orang mengunci dulu supaya tombolnya muncul akan membuat
					    penguncian dipakai sebagai jalan pintas, bukan sebagai keputusan. */}
					{canManage && (
						<Button
							variant="outline"
							onClick={duplikat}
							className="cursor-pointer gap-2"
						>
							<CopySimpleIcon className="size-4" />
							Duplikat jadi Versi Baru
						</Button>
					)}
				</div>
			</div>

			{aksiError && (
				<p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{aksiError}
				</p>
			)}

			<SetLockNotice lock={lock} />

			{set.criteriaParseStatus === 'DIPROSES' && (
				<div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
					Memproses ekstraksi kriteria dari berkas Dokumen Rubrik yang baru diunggah — halaman ini akan
					memperbarui diri begitu selesai.
				</div>
			)}

			{set.criteriaParseStatus === 'GAGAL' && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					Ekstraksi kriteria otomatis gagal: {set.criteriaParseError ?? 'penyebab tidak diketahui'}. Isi
					kriteria manual lewat "Tinjau dan Koreksi Isi", atau unggah ulang Dokumen Rubrik.
				</div>
			)}

			{set.structureParseStatus === 'DIPROSES' && (
				<div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
					Memproses ekstraksi struktur bab dari berkas Panduan Penulisan yang baru diunggah — halaman ini
					akan memperbarui diri begitu selesai.
				</div>
			)}

			{set.structureParseStatus === 'GAGAL' && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					Ekstraksi struktur bab otomatis gagal: {set.structureParseError ?? 'penyebab tidak diketahui'}.
					Dokumen LED baru dari set ini tetap memakai struktur bab standar — unggah ulang Panduan
					Penulisan untuk mencoba lagi.
				</div>
			)}

			{/* Kebalikan dari pemberitahuan kunci, dan sama pentingnya: set draf
			    tidak terkunci, tapi juga belum berlaku. Tanpa kalimat ini, set yang
			    berkasnya sudah lengkap terlihat sudah siap dipakai padahal ia tidak
			    akan muncul di daftar pilihan Dokumen LED mana pun. */}
			{set.status === 'DRAF' && (
				<div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
					Masih draf, jadi belum muncul sebagai pilihan acuan di Dokumen LED mana pun.{' '}
					{readiness.halangan ??
						'Tinjau isi rubriknya lalu tandai siap supaya bisa dipakai.'}
				</div>
			)}

			{/* Dua kolom dengan lebar yang sengaja tidak sama, karena kebutuhan
			    keduanya memang berlawanan: Identitas cuma tiga isian pendek dan
			    justru lebih terbaca dalam kolom sempit, sedangkan tiap slot berkas
			    memuat nama berkas beserta ukuran, tanggal, dan pengunggahnya dalam
			    satu baris keterangan yang membungkus tiga baris kalau dipersempit.
			    `items-start` supaya kartu yang lebih pendek tidak ikut ditarik
			    setinggi tetangganya. Menumpuk lagi di bawah `lg`, karena di lebar
			    itu dua kolom hanya menyempitkan keduanya. */}
			<div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Identitas Set</CardTitle>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
							{formError && (
								<p className="text-sm text-destructive">{formError}</p>
							)}

							<AccreditationSetFormFields
								register={register}
								errors={errors}
								disabled={!canManage || !lock.terbuka || isSubmitting}
							/>

							{canManage && lock.terbuka && (
								<div className="flex justify-end border-t border-border pt-4">
									<Button
										type="submit"
										disabled={isSubmitting || !isDirty}
										className="cursor-pointer"
									>
										{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
									</Button>
								</div>
							)}
						</form>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						{/* Angka, bukan kalimat: kelengkapan berkas hanya perlu dibandingkan
						    sekilas, dan slot di bawahnya sudah menyebut sendiri mana yang
						    masih kosong. */}
						<CardTitle className="flex items-center justify-between gap-2">
							Berkas Acuan
							<span className="text-sm font-normal tabular-nums text-muted-foreground">
								{terisi.length}/{SET_DOCUMENT_TYPES.length}
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{SET_DOCUMENT_TYPES.map((tipe) => (
							<DocumentSlotCard
								key={tipe}
								tipe={tipe}
								dokumen={findSetDocument(set, tipe)}
								// Terbuka selama set ini belum dipakai dokumen mana pun, termasuk saat
								// statusnya sudah siap: berkas yang telat datang masih bisa menyusul,
								// dan tidak ada skor tersimpan yang bisa dirusaknya.
								canManage={canManage && lock.terbuka}
								onUpload={handleUpload}
								onRemove={handleRemove}
							/>
						))}
					</CardContent>
				</Card>
			</div>

			{confirmDialog}
		</div>
	);
}
