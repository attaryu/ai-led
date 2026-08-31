import * as React from 'react';
import { CaretRightIcon } from '@phosphor-icons/react';

import { ScrollArea } from '~/core/components/ui/scroll-area';
import { cn } from '~/core/lib/utils';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	useChapterGuidance,
	type BarisPanduan,
	type KelompokPanduan,
} from '../hooks/use-chapter-guidance';
import { ChapterGuidanceDetailSheet } from './chapter-guidance-detail-sheet';

/**
 * Isi tab "Panduan" — panduan LAM Teknik yang jadi rujukan bab ini
 * (docs/application_flow.md §11.1c), dalam dua kelompok: pedoman penulisan
 * (RAG 1) dan rubrik penilaian (RAG 2).
 *
 * Murni **read-only**, seperti tab Bukti: tidak ada satu pun aksi di sini, jadi
 * tidak ada cabang `izin.canEdit` sama sekali. §12.2 menuntut seluruh tab tetap
 * terbaca saat bab dikunci, dan membuka laci kutipan tidak mengubah apa pun.
 *
 * **Kenapa tab sendiri, bukan bagian kedua tab Bukti.** §11.1 merancang keduanya
 * sebagai dua bagian satu tab, dan itu ditulis saat bagian panduan belum punya
 * apa pun untuk ditampilkan. Begitu tiap butirnya membawa kutipan sendiri,
 * menumpuk keduanya di satu panel 320 px membuat hitungan di kepala tab Bukti
 * berhenti berarti "berapa berkas" — kesalahan yang sama yang sudah ditolak
 * §11.1a. Keduanya juga menjawab pertanyaan berbeda: "apa yang seharusnya
 * ditulis" versus "dari mana tulisannya berasal".
 *
 * **Kenapa dua kelompok, bukan satu daftar.** Bukan pilihan tampilan: pipeline
 * sungguhan menyimpannya di dua kolom terpisah (`generation_runs.pedoman_used`
 * dan `rubric_used`) dan mengambilnya lewat dua fungsi retrieval berbeda.
 * Menyatukannya berarti membuang perbedaan yang backend-nya sendiri pelihara.
 *
 * **Kenapa kartu, dan kenapa judul kelompoknya polos.** Dua kali salah sebelum
 * sampai ke bentuk ini, dan keduanya layak dicatat supaya tidak diulang:
 *
 * 1. Baris rata dengan judul kelompok berupa eyebrow 10 px. Barisnya menyatu
 *    jadi satu blok teks — tiap butir sendiri sudah dua baris — dan judul
 *    kelompoknya tenggelam sehingga batas pedoman/rubrik tidak terbaca.
 * 2. Kartu, tapi judul kelompoknya jadi pita `bg-muted` berikon. Itu kotak di
 *    dalam kotak: pita berkotak yang berdiri tepat di atas deretan kartu
 *    berkotak menambah garis, bukan memperjelas batas.
 *
 * Yang dipakai sekarang: satu kartu berbingkai per butir — bentuk yang sama
 * dengan kartu saran bukti dukung di tab Generasi (§12.1b) — dan judul kelompok
 * berupa teks polos yang menyalin baris kepala panel. Yang memisahkan kelompok
 * jaraknya, bukan garis maupun latar.
 *
 * **Yang sengaja tidak ada:**
 * - Pemilih lingkup aktif-vs-checkpoint — alasannya di JSDoc
 *   {@link ../hooks/use-chapter-guidance useChapterGuidance}.
 * - Tombol membuka dokumen sumbernya. `PanduanReferensi.file_url` memang ada di
 *   skema, tapi berkasnya belum ada di mana pun, dan tombol unduh yang mati
 *   lebih buruk daripada tidak ada tombol.
 */
export function ChapterGuidancePanel({ chapter }: { chapter: ChapterEntity }) {
	const { kelompok, semuaBaris } = useChapterGuidance({
		urutanBab: chapter.urutanBab,
		ledProjectId: chapter.ledProjectId,
	});

	/**
	 * Yang dipegang id barisnya, bukan objeknya — pola yang sama dengan tab Bukti
	 * dan halaman Penilaian AMI. Di sini barisnya memang tidak pernah dirakit
	 * ulang, tapi menyimpan objeknya akan membuat pola kedua tab berbeda tanpa
	 * alasan.
	 */
	const [dibukaId, setDibukaId] = React.useState<string | null>(null);
	const posisiDibuka = semuaBaris.findIndex((baris) => baris.id === dibukaId);
	const barisDibuka = posisiDibuka === -1 ? null : semuaBaris[posisiDibuka];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 px-5 pt-4 pb-2">
				<p className="text-sm font-medium">Panduan LAM Teknik</p>
				<span className="text-xs text-muted-foreground">
					{semuaBaris.length === 0
						? 'Tidak dicocoki panduan'
						: `${semuaBaris.length} butir`}
				</span>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="px-5">
					{kelompok.length === 0 ? (
						/*
						 * Kalimat keduanya yang menahan bacaannya: panel kosong tanpa
						 * keterangan terbaca seperti pemuatan yang gagal, padahal bab tanpa
						 * poin panduan memang keadaan yang sah — aturan yang sama sudah
						 * ditulis `findKriteriaForBab` untuk larik kosongnya.
						 */
						<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
							Bab ini tidak dicocoki poin panduan maupun indikator rubrik mana
							pun. Panduan LAM Teknik memang tidak mengatur setiap bab.
						</p>
					) : (
						/*
						 * Jaraknya yang memisahkan kelompok, bukan garis atau latar.
						 * `pt-1` memberi napas dari kepala panel supaya judul kelompok
						 * pertama tidak menempel padanya dan terbaca sederajat.
						 */
						<div className="space-y-6 pt-1 pb-2">
							{kelompok.map((grup) => (
								<KelompokBaris
									key={grup.kunci}
									grup={grup}
									dibukaId={dibukaId}
									onBuka={setDibukaId}
								/>
							))}
						</div>
					)}
				</div>
			</ScrollArea>

			<ChapterGuidanceDetailSheet
				baris={barisDibuka}
				posisi={posisiDibuka + 1}
				total={semuaBaris.length}
				onTutup={() => setDibukaId(null)}
				onPindah={(arah) => {
					const berikutnya = semuaBaris[posisiDibuka + arah];
					if (berikutnya) setDibukaId(berikutnya.id);
				}}
			/>
		</div>
	);
}

/**
 * Satu kelompok: judul polos, lalu kartu-kartunya.
 *
 * **Kepalanya sengaja tanpa latar maupun bingkai.** Versi sebelumnya memakai
 * pita `bg-muted` berikon; hasilnya kotak di dalam kotak — kepala berkotak yang
 * berdiri tepat di atas deretan kartu berkotak justru menambah garis, bukan
 * memperjelas batas. Yang memisahkan kelompok cukup **jarak** (`space-y-6` di
 * induknya) plus judul yang bobotnya sama dengan judul panel.
 *
 * Bentuknya sengaja menyalin baris kepala panel — judul di kiri, hitungan redup
 * di kanan — yang sudah jadi kebiasaan kelima panel sidebar.
 *
 * Kelompok kosong tidak pernah sampai ke sini; hook-nya sudah menyaringnya.
 */
function KelompokBaris({
	grup,
	dibukaId,
	onBuka,
}: {
	grup: KelompokPanduan;
	dibukaId: string | null;
	onBuka: (id: string) => void;
}) {
	return (
		<section>
			<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
				<p className="text-sm font-medium">{grup.label}</p>
				{/*
				 * Angkanya telanjang, tanpa satuan. Kepala panel di atas sudah memakai
				 * "N butir"; mengulang satuan yang sama di sini membuat judul kelompok
				 * dan judul panel terbaca sebagai dua hal sejajar, padahal yang satu
				 * memayungi yang lain.
				 */}
				<span className="text-xs text-muted-foreground tabular-nums">
					{grup.baris.length}
				</span>
			</div>
			<p className="mt-0.5 text-xs text-muted-foreground">{grup.sumber}</p>

			<ul className="mt-2 space-y-1.5">
				{grup.baris.map((baris) => (
					<KartuButirPanduan
						key={baris.id}
						baris={baris}
						terpilih={baris.id === dibukaId}
						onBuka={() => onBuka(baris.id)}
					/>
				))}
			</ul>
		</section>
	);
}

/**
 * Satu butir panduan sebagai kartu.
 *
 * Berbingkai sendiri, bukan baris rata: tiap butir isinya dua baris teks, dan
 * deretan dua-baris tanpa bingkai menyatu jadi paragraf — persis alasan yang
 * membuat saran bukti dukung di tab Generasi juga dikartukan.
 *
 * Judulnya tidak dipotong `truncate`: baris rubrik memakai `deskripsi` kriteria
 * yang memang satu kalimat penuh, dan memotongnya di tengah membuat butir itu
 * berhenti bisa dibedakan dari butir lain dalam kriteria yang sama.
 */
function KartuButirPanduan({
	baris,
	terpilih,
	onBuka,
}: {
	baris: BarisPanduan;
	/** Sedang dibuka di laci; kartunya ditandai supaya tempatnya tidak hilang. */
	terpilih: boolean;
	onBuka: () => void;
}) {
	return (
		<li>
			<button
				type="button"
				onClick={onBuka}
				aria-label={`Lihat ${baris.kutipan.length} kutipan untuk ${baris.judul}`}
				className={cn(
					'flex w-full cursor-pointer items-start gap-2 rounded-md border p-2.5 text-left transition-colors',
					terpilih
						? 'border-primary/50 bg-muted/60'
						: 'border-border hover:border-primary/30 hover:bg-muted/40',
				)}
			>
				<span className="min-w-0 flex-1">
					<span className="block text-sm leading-tight font-medium">
						{baris.judul}
					</span>
					{/*
					 * Jejak dan hitungan kutipan digabung satu baris. Dua baris terpisah
					 * membuat kartunya setinggi empat baris teks, dan keduanya sama-sama
					 * keterangan pendukung yang dibaca sekali lalu ditinggalkan.
					 */}
					<span className="mt-1 block text-xs text-muted-foreground">
						{baris.jejak} · {baris.kutipan.length} kutipan
					</span>
				</span>

				<CaretRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			</button>
		</li>
	);
}
