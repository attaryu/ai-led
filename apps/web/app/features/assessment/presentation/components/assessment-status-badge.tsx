import {
	ArrowsClockwiseIcon,
	CheckCircleIcon,
	CircleDashedIcon,
	type Icon,
} from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import {
	statusTinjauLabels,
	type StatusTinjau,
} from '../../domain/entities/assessment-verdict.entity';

const visual: Record<
	StatusTinjau,
	{ icon: Icon; className: string; judul: string }
> = {
	BELUM: {
		icon: CircleDashedIcon,
		className: 'bg-muted text-muted-foreground border-border',
		judul: 'Belum ada yang meninjau indikator ini.',
	},
	DISETUJUI: {
		icon: CheckCircleIcon,
		className:
			'bg-emerald-100 text-emerald-800 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
		judul: 'Skor yang berlaku sudah disetujui Penjamin Mutu.',
	},
	TINJAU_ULANG: {
		icon: ArrowsClockwiseIcon,
		className:
			'bg-amber-100 text-amber-800 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
		judul:
			'Sudah pernah ditinjau, tapi penilaian ulang mengubah hitungan AI-nya — keputusan lamanya perlu ditegaskan atau diperbaiki.',
	},
};

/**
 * Status peninjauan Penjamin Mutu — **tiga, dan ketiganya soal pekerjaan**.
 *
 * **Menjawab pertanyaan yang sebelumnya tidak punya jawaban.** Sebelum status ini
 * ada, "tidak ada koreksi" berarti dua hal sekaligus: belum ada yang melihat,
 * atau sudah dilihat dan AI-nya dianggap benar. Untuk dokumen akreditasi
 * keduanya sangat berbeda — yang satu pekerjaan yang belum selesai, yang lain
 * angka yang sudah dipertanggungjawabkan seseorang.
 *
 * **Tidak ada badge "Dikoreksi".** Rancangan sebelumnya punya lima varian di
 * layar dan itu kebanyakan. Menyetujui dan mengoreksi sama-sama berarti "sudah
 * saya tangani", dan angka yang berlaku sudah tertera sebagai skor barisnya —
 * siapa yang menghitungnya adalah rincian, dan rincian itu tempatnya di laci.
 *
 * **`TINJAU_ULANG` menggantikan "· basi".** Menempelkan "basi" pada "Disetujui"
 * menghasilkan kontradiksi yang harus dibaca dua kali; keadaan itu sebenarnya
 * pekerjaan yang belum selesai, jadi namanya menyatakan itu.
 */
export function AssessmentStatusBadge({
	status,
	className,
}: {
	status: StatusTinjau;
	className?: string;
}) {
	const { icon: StatusIcon, className: warna, judul } = visual[status];

	return (
		<span
			title={judul}
			className={cn(
				'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
				warna,
				className,
			)}
		>
			<StatusIcon className="size-3.5" />
			{statusTinjauLabels[status]}
		</span>
	);
}
