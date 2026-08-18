import * as React from 'react';
import { XIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
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
	React.useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<>
			<div
				className="fixed inset-0 z-40 bg-black/40"
				onClick={onClose}
				aria-hidden
			/>

			<aside
				role="dialog"
				aria-label={label}
				className={cn(
					'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-lg',
					className,
				)}
			>
				{children}
			</aside>
		</>
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
