import * as React from 'react';
import { createPortal } from 'react-dom';
import { CaretLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { useEscapeLayer } from '~/core/lib/escape-layer';
import { cn } from '~/core/lib/utils';

/**
 * Laci kanan untuk detail satu baris daftar.
 *
 * Diangkat dari `features/evidence/.../evidence-detail-panel.tsx` saat Penilaian
 * AMI membutuhkan bentuk yang sama persis — backdrop, panel kanan setinggi layar,
 * kepala berjudul, badan yang bisa digulir, dan kaki aksi opsional. Menyalinnya
 * berarti memelihara dua laci yang harus tetap terlihat sama tanpa satu pun
 * mekanisme yang memaksanya, dan itu kesalahan yang sama seperti `KartuMetrik`
 * sebelum diangkat jadi {@link ../metric-meter MetricMeter}.
 *
 * **Kenapa laci, bukan modal tengah.** Keduanya menutup layar, tapi laci
 * menyisakan daftar di kirinya tetap terlihat — dan saat pekerjaannya meninjau
 * puluhan baris berurutan, "di mana tadi saya" adalah pertanyaan yang harus
 * dijawab tanpa menutup apa pun lebih dulu.
 */
export function Sheet({
	open,
	onClose,
	label,
	className,
	children,
}: {
	open: boolean;
	onClose: () => void;
	/** Nama aksesibel panelnya; wajib karena `role="dialog"` tanpa nama tidak berarti. */
	label: string;
	className?: string;
	children: React.ReactNode;
}) {
	// Lapis Escape bersama, bukan listener `window` sendiri: sejak Editor Bab
	// menjadikan sidebar kanannya laci di bawah `lg`, laci ini bisa terbuka di
	// atas laci lain. Dua listener di target yang sama berarti satu tekan menutup
	// keduanya — dan yang hilang justru panel di bawahnya, yang tidak diminta
	// siapa pun untuk ditutup.
	useEscapeLayer(open, onClose);

	if (!open || typeof document === 'undefined') return null;

	// Diportalkan ke `body`, bukan dirender di tempat. Elemen ber-`translate`
	// adalah containing block bagi keturunan `position: fixed` — dan sidebar
	// kanan Editor Bab memakai `translate` untuk meluncur masuk di bawah `lg`.
	// Tanpa portal, laci kutipan yang dibuka dari panel Bukti/Panduan berhenti
	// menempel ke viewport dan terkurung di dalam panel yang membukanya. Portal
	// menutup jebakan yang sama untuk pemakai `Sheet` berikutnya, siapa pun ia.
	return createPortal(
		<>
			<div
				className="fixed inset-0 z-40 bg-black/40"
				onClick={onClose}
				aria-hidden
			/>

			<aside
				data-slot="sheet"
				role="dialog"
				aria-label={label}
				className={cn(
					'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-lg',
					className,
				)}
			>
				{children}
			</aside>
		</>,
		document.body,
	);
}

/**
 * Kepala laci. Tombol tutup dirender di sini, bukan diserahkan pemanggil: laci
 * yang bisa dibuka tanpa jalan keluar yang terlihat adalah cacat yang tidak
 * boleh mungkin terjadi karena seseorang lupa menuliskannya.
 */
export function SheetHeader({
	onClose,
	className,
	children,
}: {
	onClose: () => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				'flex items-start justify-between gap-3 border-b border-border p-5',
				className,
			)}
		>
			<div className="min-w-0 flex-1">{children}</div>

			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Tutup"
				onClick={onClose}
				className="shrink-0 cursor-pointer"
			>
				<XIcon className="size-4" />
			</Button>
		</div>
	);
}

/**
 * Navigasi ‹ › antar baris di kepala laci, beserta penunjuk posisinya.
 *
 * Diangkat saat salinan ketiganya akan lahir — dua yang pertama di
 * `assessment-detail-sheet.tsx` dan `chapter-evidence-detail-sheet.tsx`. Alasan
 * mengangkatnya sama dengan alasan `Sheet` sendiri diangkat dari
 * `evidence-detail-panel.tsx`: tiga salinan yang harus tetap berperilaku sama
 * tanpa satu pun mekanisme yang memaksanya.
 *
 * `label` wajib karena nama aksesibelnya menyebut **apa** yang dilewati
 * ("Indikator sebelumnya", "Bukti dukung sebelumnya"). Tiga laci yang seluruh
 * tombolnya bernama "Sebelumnya" tidak berarti apa-apa di pembaca layar.
 */
export function SheetNav({
	posisi,
	total,
	label,
	onPindah,
}: {
	/** Urutan ke berapa dalam daftar yang sedang tampil, mulai 1. */
	posisi: number;
	total: number;
	/** Kata benda tunggal yang dilewati, mis. "Indikator" atau "Butir panduan". */
	label: string;
	onPindah: (arah: -1 | 1) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`${label} sebelumnya`}
				onClick={() => onPindah(-1)}
				disabled={posisi <= 1}
				className="cursor-pointer"
			>
				<CaretLeftIcon className="size-4" />
			</Button>
			<span className="text-xs tabular-nums text-muted-foreground">
				{posisi}/{total}
			</span>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`${label} berikutnya`}
				onClick={() => onPindah(1)}
				disabled={posisi >= total}
				className="cursor-pointer"
			>
				<CaretRightIcon className="size-4" />
			</Button>
		</div>
	);
}

export function SheetBody({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn('flex-1 overflow-y-auto p-5', className)}>{children}</div>
	);
}

export function SheetFooter({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn('border-t border-border p-4', className)}>{children}</div>
	);
}
