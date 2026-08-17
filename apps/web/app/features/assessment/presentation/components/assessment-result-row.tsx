import { CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import { rubricScoreTypeLabels } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { type PenilaianFinalRow } from '../../domain/entities/assessment-session.entity';
import { AssessmentConfidenceBadge } from './assessment-confidence-badge';
import { AssessmentScoreChip } from './assessment-score-chip';
import { AssessmentStatusBadge } from './assessment-status-badge';
import { formatSkor } from '../utils/assessment-format';

/**
 * Satu indikator sebagai baris berpengait, bukan accordion.
 *
 * **Tingginya tetap, dan itu perubahan yang paling terasa.** Versi sebelumnya
 * mengembang di tempat: satu baris terbuka setinggi ±450px karena memuat
 * justifikasi, rekomendasi, dan lima level sekaligus, sehingga delapan belas
 * indikator menuntut empat layar penuh gulir. Detailnya kini pindah ke laci
 * kanan, dan daftarnya kembali jadi daftar.
 *
 * **Bukan grid kartu.** Pernah dipertimbangkan, lalu ditolak dengan dua alasan
 * yang keduanya penting: pada empat kolom, bunyi indikator terpotong sehingga
 * pembaca tidak bisa membedakan satu indikator dari yang lain tanpa membukanya —
 * dan kepadatan yang mengundang pandangan menyapu justru mendorong peninjauan
 * yang tidak teliti, padahal ketelitian itulah seluruh gunanya peran Penjamin
 * Mutu.
 *
 * Urutan nyaringnya disengaja: **skor** (chip berwarna) → **status peninjauan**
 * (badge) → keyakinan (titik kecil). Yang paling menentukan paling terlihat.
 */
export function AssessmentResultRow({
	row,
	terpilih,
	onBuka,
}: {
	row: PenilaianFinalRow;
	/** Sedang dibuka di laci; barisnya ditandai supaya tempatnya tidak hilang. */
	terpilih: boolean;
	onBuka: () => void;
}) {
	const { kriteria } = row;

	return (
		<button
			type="button"
			onClick={onBuka}
			aria-label={`Buka detail indikator ${kriteria.no}`}
			className={cn(
				'flex w-full cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors',
				'hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
				terpilih && 'border-primary/30 bg-primary/5 hover:bg-primary/10',
			)}
		>
			<AssessmentScoreChip skor={row.skorFinal} maksimal={row.skorMaksimal} />

			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
						{kriteria.no}
					</span>
					<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
						{kriteria.kodeKriteria}
					</span>

					<AssessmentStatusBadge status={row.statusTinjau} />

					{/*
					 * Penanda "perlu diperiksa" hanya muncul saat ia menambah sesuatu.
					 * Pada baris yang belum ditinjau ia hampir selalu menyala, dan dua
					 * penanda yang selalu muncul bersamaan berhenti menandakan apa pun.
					 */}
					{row.perluDiperiksa && (
						<span
							title="Keyakinan rendah, skor rendah, atau gagal dinilai"
							className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"
						>
							<MagnifyingGlassIcon className="size-3.5" />
							Perlu diperiksa
						</span>
					)}
				</span>

				{/*
				 * Bunyi indikatornya dibiarkan membungkus penuh, tidak dipotong: daftar
				 * tertutup harus bisa dipakai membedakan satu indikator dari yang lain
				 * tanpa membuka satu per satu. Inilah yang hilang kalau daftarnya jadi
				 * grid empat kolom.
				 */}
				<span className="text-xs leading-relaxed text-muted-foreground">
					{kriteria.deskripsi}
				</span>

				<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<AssessmentConfidenceBadge nilai={row.hasil?.confidence ?? null} />
					<span className="text-xs text-muted-foreground">
						{rubricScoreTypeLabels[kriteria.tipeSkor]}
					</span>
					{/*
					 * **Ini yang menggantikan badge "Dikoreksi".** Fakta bahwa angka yang
					 * berlaku bukan angka mesin paling berguna dibaca tepat di samping
					 * angkanya, bukan sebagai badge keempat yang menuntut pembaca
					 * menghubungkannya sendiri ke skor di ujung baris.
					 *
					 * Syaratnya **selisih yang berlaku sekarang**, bukan `mengubahSkor`.
					 * Keduanya bisa berbeda: koreksi 3→4 yang kemudian disusul penilaian
					 * ulang bernilai 4 tetap terhitung sebagai koreksi, tapi menuliskan
					 * "mesin menilai 4" di sebelah chip yang juga berbunyi 4 hanya
					 * menimbulkan pertanyaan yang tidak ada.
					 */}
					{row.skorMesin !== row.skorFinal && (
						<span className="text-xs text-muted-foreground">
							mesin menilai {formatSkor(row.skorMesin)}
						</span>
					)}
				</span>
			</span>

			<CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}
