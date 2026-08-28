import * as React from 'react';
import {
	ClipboardTextIcon,
	ListChecksIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Card, CardContent } from '~/core/components/ui/card';
import { Checkbox } from '~/core/components/ui/checkbox';
import {
	CollectionToolbar,
	type CollectionSortOption,
} from '~/core/components/ui/collection-toolbar';
import { Input } from '~/core/components/ui/input';
import { cn } from '~/core/lib/utils';
import {
	type PenilaianFinalRow,
	type RingkasanPenilaian,
} from '../../domain/entities/assessment-session.entity';
import { type useAssessmentIndicatorSelection } from '../hooks/use-assessment-indicator-selection';
import { AssessmentResultRow } from './assessment-result-row';

/**
 * Penyaring daftar — status peninjauan plus satu penanda risiko.
 *
 * `perlu-diperiksa` sengaja berdiri sejajar dengan ketiga status walau jenisnya
 * berbeda (dugaan AI, bukan fakta pekerjaan): keduanya sama-sama menjawab
 * "tunjukkan yang mana saja", dan memisahkannya jadi dua deret kontrol hanya
 * menambah yang harus dipelajari.
 */
const SARINGAN = [
	{ id: 'semua', label: 'Semua' },
	{ id: 'belum', label: 'Belum ditinjau' },
	{ id: 'tinjau-ulang', label: 'Perlu ditinjau ulang' },
	{ id: 'disetujui', label: 'Disetujui' },
	{ id: 'dikoreksi', label: 'Dikoreksi' },
	{ id: 'perlu-diperiksa', label: 'Perlu diperiksa' },
] as const;

type SaringanId = (typeof SARINGAN)[number]['id'];

const SORT_OPTIONS: CollectionSortOption[] = [
	{ id: 'nomor', label: 'Nomor indikator' },
	{ id: 'skor', label: 'Skor' },
	{ id: 'keyakinan', label: 'Keyakinan' },
];

function cocokSaringan(row: PenilaianFinalRow, saringan: SaringanId): boolean {
	switch (saringan) {
		case 'belum':
			return row.statusTinjau === 'BELUM';
		case 'tinjau-ulang':
			return row.statusTinjau === 'TINJAU_ULANG';
		case 'disetujui':
			return row.statusTinjau === 'DISETUJUI';
		// Dua saringan terakhir memotong melintang ketiga status di atas, dan itu
		// disengaja: "yang mana yang saya ubah" dan "yang mana yang angkanya
		// meragukan" adalah pertanyaan yang sah, dan keduanya tidak punya tempat
		// lain selain di deret yang sama.
		case 'dikoreksi':
			return row.mengubahSkor;
		case 'perlu-diperiksa':
			return row.perluDiperiksa;
		default:
			return true;
	}
}

/**
 * Daftar hasil penilaian beserta pencarian dan penyaringnya.
 *
 * **Pencarian dan penyaring adalah alasan daftar ini tetap terpakai pada 78
 * indikator.** Delapan belas baris masih bisa dibaca semuanya; tujuh puluh
 * delapan tidak. Yang dicari pembaca selalu sama — mana yang belum saya lihat,
 * dan mana yang angkanya meragukan — jadi kedua pertanyaan itu yang diberi
 * kontrol, bukan disembunyikan di balik pengurutan kolom.
 *
 * Keadaan penyaring hidup sebagai state komponen, bukan di URL. Berbeda dari
 * Pustaka Bukti Dukung yang menaruhnya di query string, halaman ini sudah memakai
 * `?tab=` dan `?sesi=` untuk hal yang benar-benar layak dibagikan sebagai tautan;
 * menambah tiga parameter penyaringan sesaat di atasnya membuat URL-nya jadi
 * sulit dibaca tanpa menambah apa pun yang berguna untuk dikirim ke orang lain.
 */
export function AssessmentResultList({
	baris,
	ringkasan,
	barisTerpilihNo,
	onBuka,
	onDaftarTampilBerubah,
	pemilihan,
	bolehMemilih,
}: {
	baris: PenilaianFinalRow[];
	ringkasan: RingkasanPenilaian;
	barisTerpilihNo: number | null;
	onBuka: (row: PenilaianFinalRow) => void;
	/** Dipakai halaman untuk menavigasi ‹ › mengikuti urutan yang terlihat. */
	onDaftarTampilBerubah: (rows: PenilaianFinalRow[]) => void;
	/** Indikator mana yang mau dinilai — dipakai selama dokumen belum pernah
	 * dinilai (`baris` kosong, lihat `useAssessmentResults`). Sesudah ada
	 * sesi, daftar ini berubah jadi daftar hasil dan pemilihan tidak lagi
	 * ditampilkan — dua daftar indikator yang sama tidak perlu dua tempat. */
	pemilihan: ReturnType<typeof useAssessmentIndicatorSelection>;
	bolehMemilih: boolean;
}) {
	const [cari, setCari] = React.useState('');
	const [saringan, setSaringan] = React.useState<SaringanId>('semua');
	const [sortId, setSortId] = React.useState('nomor');
	const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

	const jumlahPerSaringan: Record<SaringanId, number> = {
		semua: ringkasan.total,
		belum: ringkasan.jumlahBelumDitinjau,
		'tinjau-ulang': ringkasan.jumlahTinjauUlang,
		disetujui: ringkasan.jumlahDitinjau,
		dikoreksi: ringkasan.jumlahDikoreksi,
		'perlu-diperiksa': ringkasan.jumlahPerluDiperiksa,
	};

	const tampil = React.useMemo(() => {
		const kata = cari.trim().toLowerCase();

		const disaring = baris.filter((row) => {
			if (!cocokSaringan(row, saringan)) return false;
			if (kata === '') return true;

			// Nomor, kode, kelompok kriteria, dan bunyinya sekaligus — pengguna
			// mengingat indikator lewat salah satu dari keempatnya, dan tidak ada
			// alasan memaksanya menebak yang mana yang dicari kotak ini.
			return (
				String(row.kriteria.no).includes(kata) ||
				row.kriteria.kodeKriteria.toLowerCase().includes(kata) ||
				row.kriteria.kriteria.toLowerCase().includes(kata) ||
				row.kriteria.deskripsi.toLowerCase().includes(kata)
			);
		});

		const arah = sortDir === 'desc' ? -1 : 1;

		return [...disaring].sort((a, b) => {
			switch (sortId) {
				case 'skor':
					// Yang belum punya skor selalu di bawah, apa pun arah urutannya:
					// mereka bukan "skor nol", dan menaruhnya di puncak daftar skor
					// terendah akan menyembunyikan indikator yang benar-benar buruk.
					if (a.skorFinal === null || b.skorFinal === null) {
						return a.skorFinal === b.skorFinal
							? 0
							: a.skorFinal === null
								? 1
								: -1;
					}
					return (a.skorFinal - b.skorFinal) * arah;
				case 'keyakinan': {
					const ca = a.hasil?.confidence ?? -1;
					const cb = b.hasil?.confidence ?? -1;
					return (ca - cb) * arah;
				}
				default:
					return (a.kriteria.no - b.kriteria.no) * arah;
			}
		});
	}, [baris, cari, saringan, sortId, sortDir]);

	// Laci menavigasi mengikuti urutan yang **terlihat**, bukan urutan aslinya —
	// menekan ‹ › lalu mendarat di indikator yang tidak ada di layar akan membuat
	// pengguna kehilangan tempatnya.
	React.useEffect(() => {
		onDaftarTampilBerubah(tampil);
	}, [tampil, onDaftarTampilBerubah]);

	/*
	 * Dokumen yang belum pernah dinilai: `baris` kosong (lihat catatan di
	 * `useAssessmentResults`), jadi daftar ini belum punya hasil apa pun untuk
	 * ditampilkan. Daripada kartu kosong plus kartu pemilih indikator terpisah
	 * di tempat lain — dua daftar 78 indikator yang sama pada satu halaman —
	 * slot yang sama ini dipakai untuk memilih indikator mana yang mau
	 * dinilai. Begitu ada sesi, kartu ini kembali jadi daftar hasil seperti
	 * biasa; pemilihannya sendiri tetap dipegang `pemilihan` untuk dipakai
	 * "Nilai Ulang" berikutnya.
	 */
	if (baris.length === 0) {
		const { daftar, tersaring, terpilih, cari: cariIndikator, setCari: setCariIndikator, toggle, pilihSemua, kosongkan } =
			pemilihan;
		const semuaTerpilih = daftar.length > 0 && terpilih.size === daftar.length;
		// Matriks resmi ada puluhan indikator (~78); jauh di bawah itu berarti
		// matriks di sisi AI service belum lengkap — bukan soal dokumen/berkas
		// yang dipilih pengguna, jadi ditandai di sini alih-alih dibiarkan diam.
		const matriksBelumLengkap = daftar.length > 0 && daftar.length < 30;

		return (
			<Card>
				<CardContent className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<p className="text-sm font-medium">Indikator yang Dinilai</p>
						<p className="text-xs text-muted-foreground">
							{daftar.length === 0
								? 'Memuat daftar indikator…'
								: semuaTerpilih
									? `Menilai seluruh ${daftar.length} indikator.`
									: `${terpilih.size} dari ${daftar.length} indikator dipilih.`}
						</p>
					</div>

					{matriksBelumLengkap && (
						<div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
							<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
							<p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
								Matriks penilaian sepertinya belum lengkap — cuma{' '}
								{daftar.length} indikator yang termuat, padahal biasanya
								puluhan. Penilaian tetap bisa dijalankan, tapi cakupannya
								belum tentu mewakili seluruh matriks LAM.
							</p>
						</div>
					)}

					{bolehMemilih && (
						<>
							<div className="flex flex-wrap items-center gap-2">
								<Input
									value={cariIndikator}
									onChange={(event) => setCariIndikator(event.target.value)}
									placeholder="Cari nomor atau kriteria..."
									aria-label="Cari indikator AMI"
									className="h-8 flex-1 text-sm"
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={pilihSemua}
									disabled={semuaTerpilih}
									className="cursor-pointer"
								>
									Pilih Semua
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={kosongkan}
									disabled={terpilih.size === 0}
									className="cursor-pointer"
								>
									Kosongkan
								</Button>
							</div>

							<div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1.5">
								{tersaring.map((indikator) => (
									<label
										key={indikator.no}
										className="flex cursor-pointer items-start gap-2 rounded-sm px-1.5 py-1 hover:bg-accent/40"
									>
										<Checkbox
											checked={terpilih.has(indikator.no)}
											onCheckedChange={() => toggle(indikator.no)}
											className="mt-0.5"
										/>
										<span className="text-xs leading-snug">
											<span className="font-medium">{indikator.no}.</span>{' '}
											{indikator.kriteria}
										</span>
									</label>
								))}
								{tersaring.length === 0 && (
									<p className="py-3 text-center text-xs text-muted-foreground">
										Tidak ada indikator yang cocok.
									</p>
								)}
							</div>

							{terpilih.size === 0 && (
								<p className="flex items-center gap-1.5 text-xs leading-relaxed text-destructive">
									<ListChecksIcon className="size-3.5 shrink-0" />
									Pilih minimal satu indikator sebelum menjalankan penilaian.
								</p>
							)}
						</>
					)}
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<CollectionToolbar
					searchValue={cari}
					onSearchChange={setCari}
					searchPlaceholder="Cari indikator, kode, atau kriteria..."
					sortOptions={SORT_OPTIONS}
					activeSortId={sortId}
					activeSortDir={sortDir}
					onSortChange={(id, dir) => {
						setSortId(id);
						setSortDir(dir);
					}}
					onClearAll={() => {
						setCari('');
						setSortId('nomor');
						setSortDir('asc');
						setSaringan('semua');
					}}
				/>

				<div className="flex flex-wrap items-center gap-1.5">
					{SARINGAN.map((item) => {
						const aktif = saringan === item.id;
						const jumlah = jumlahPerSaringan[item.id];

						return (
							<button
								key={item.id}
								type="button"
								onClick={() => setSaringan(item.id)}
								aria-pressed={aktif}
								disabled={jumlah === 0 && item.id !== 'semua'}
								className={cn(
									'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
									aktif
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border text-muted-foreground hover:bg-accent',
									jumlah === 0 &&
										item.id !== 'semua' &&
										'cursor-not-allowed opacity-50 hover:bg-transparent',
								)}
							>
								{item.label}
								<span className="tabular-nums opacity-80">{jumlah}</span>
							</button>
						);
					})}
				</div>

				{tampil.length === 0 ? (
					<div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
						<ClipboardTextIcon className="size-7 text-muted-foreground/50" />
						<p className="text-xs leading-relaxed text-muted-foreground">
							{baris.length === 0
								? 'Belum ada hasil untuk sesi ini.'
								: 'Tidak ada indikator yang cocok dengan pencarian dan penyaring ini.'}
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-1">
						{tampil.map((row) => (
							<AssessmentResultRow
								key={row.kriteria.no}
								row={row}
								terpilih={row.kriteria.no === barisTerpilihNo}
								onBuka={() => onBuka(row)}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
