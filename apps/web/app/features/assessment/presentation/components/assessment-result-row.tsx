import { CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import { rubricScoreTypeLabels } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { type PenilaianFinalRow } from '../../domain/entities/assessment-session.entity';
import { AssessmentConfidenceBadge } from './assessment-confidence-badge';
import { AssessmentScoreChip } from './assessment-score-chip';
import { AssessmentStatusBadge } from './assessment-status-badge';

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
					 * Tanpa `title`, berbeda dari badge keyakinan di bawahnya. Label ini
					 * sebuah **instruksi**, bukan istilah yang perlu didefinisikan —
					 * "periksa" sudah menyatakan apa yang harus dilakukan, dan sebab
					 * persisnya (skor rendah, penilai ragu, atau gagal dinilai) terbaca
					 * langsung di laci begitu barisnya dibuka. Keterangan melayang yang
					 * mengulang ketiga kemungkinan tanpa menyebut mana yang berlaku justru
					 * menambah langkah tanpa menambah jawaban.
					 */}
					{row.perluDiperiksa && (
						<span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
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

				{/*
				 * Skor AI sengaja **tidak** disebut di sini, bahkan saat berbeda dari
				 * yang berlaku. Baris ini menjawab "berapa nilai indikator ini", dan
				 * jawabannya skor final — siapa yang menghitungnya urusan detail, dan
				 * detail itu sudah lengkap di laci beserta alasan AI, catatan koreksi,
				 * dan atribusinya.
				 */}
				<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<AssessmentConfidenceBadge nilai={row.hasil?.confidence ?? null} />
					<span className="text-xs text-muted-foreground">
						{rubricScoreTypeLabels[kriteria.tipeSkor]}
					</span>
				</span>
			</span>

			<CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}
