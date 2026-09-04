import * as React from 'react';
import { ClipboardTextIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Card, CardContent } from '~/core/components/ui/card';
import {
	CollectionToolbar,
	type CollectionSortOption,
} from '~/core/components/ui/collection-toolbar';
import { cn } from '~/core/lib/utils';
import {
	type PenilaianFinalRow,
	type RingkasanPenilaian,
} from '../../domain/entities/assessment-session.entity';
import { type useAssessmentIndicatorPicks } from '../hooks/use-assessment-indicator-picks';
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
 * Daftar 64 indikator — hasil penilaian SEKALIGUS pemilih indikator untuk run
 * berikutnya, satu daftar yang sama, bukan dua.
 *
 * **Kenapa satu, bukan kartu pemilih terpisah sebelum run pertama.** Versi
 * sebelumnya menunda daftar ini sampai ada sesi, dan menaruh kartu pemilih
 * indikator sederhana (nama + checkbox doang) di tempatnya sampai saat itu —
 * dua tampilan berbeda untuk 64 indikator yang sama, salah satunya cuma
 * hidup sebelum run pertama lalu hilang selamanya begitu ada sesi (tidak
 * ada lagi cara mempersempit indikator run berikutnya). Sekarang baris
 * (`useAssessmentResults`) selalu berisi seluruh matriks, sesi ada atau
 * belum — baris yang belum dinilai cuma tampil dengan skor "—", bukan
 * ditandai "perlu diperiksa" (lihat catatan `gagal` di gabungPenilaian).
 * Checkbox pemilihnya menempel di baris yang sama selamanya, bukan cuma di
 * satu momen siklus hidupnya.
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
	/** Indikator mana yang ikut di run "Mulai Penilaian Otomatis"/"Nilai
	 * Ulang" berikutnya — lepas dari sesi mana pun (lihat
	 * use-assessment-indicator-picks.ts). */
	pemilihan: ReturnType<typeof useAssessmentIndicatorPicks>;
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

	const semuaTerpilih =
		baris.length > 0 && pemilihan.terpilih.size === baris.length;

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

				{bolehMemilih && baris.length > 0 && (
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
						<p className="text-xs text-muted-foreground">
							{pemilihan.terpilih.size === 0
								? 'Pilih indikator mana yang mau dinilai (bisa dicicil, kapan saja).'
								: semuaTerpilih
									? `Seluruh ${baris.length} indikator dipilih untuk dinilai.`
									: `${pemilihan.terpilih.size} dari ${baris.length} indikator dipilih untuk dinilai.`}
						</p>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={pemilihan.pilihSemua}
								disabled={semuaTerpilih}
								className="cursor-pointer"
							>
								Pilih Semua
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={pemilihan.kosongkan}
								disabled={pemilihan.terpilih.size === 0}
								className="cursor-pointer"
							>
								Kosongkan
							</Button>
						</div>
					</div>
				)}

				{tampil.length === 0 ? (
					<div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
						<ClipboardTextIcon className="size-7 text-muted-foreground/50" />
						<p className="text-xs leading-relaxed text-muted-foreground">
							{baris.length === 0
								? 'Memuat daftar indikator…'
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
								untukDinilai={
									bolehMemilih
										? pemilihan.terpilih.has(row.kriteria.no)
										: undefined
								}
								onToggleUntukDinilai={() => pemilihan.toggle(row.kriteria.no)}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
