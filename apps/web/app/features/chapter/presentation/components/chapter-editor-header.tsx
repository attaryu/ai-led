import { ArrowLeftIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { initials } from '~/core/lib/initials';
import { ProfileMenu } from '~/features/auth/presentation/components/profile-menu';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type AutosaveStatus } from '../hooks/use-chapter-autosave';
import { type ChapterPermission } from '../hooks/use-chapter-permission';
import { ChapterLockButton } from './chapter-lock-button';
import { ChapterSaveIndicator } from './chapter-save-indicator';

/**
 * Header Editor Bab.
 */
export function ChapterEditorHeader({
	projectId,
	judulDokumen,
	chapter,
	izin,
	onReviewed,
	status,
	savedAt,
}: {
	projectId: string;
	judulDokumen: string;
	/** Bab yang sedang dibuka — dipakai tombol kunci review (§12.2). */
	chapter: ChapterEntity;
	izin: ChapterPermission;
	onReviewed: (diperbarui: ChapterEntity) => void;
	status: AutosaveStatus;
	savedAt: string | null;
}) {
	const session = useSession();

	// Perampingan `max-lg:` di baris ini dipasang setelah diukur, bukan ditebak:
	// di 768 px header muat untuk Penyusun, tapi meluber 49 px untuk Penjamin
	// Mutu — role satu-satunya yang ikut membawa tombol kunci bab. Yang dilepas
	// hanya teks yang sudah punya kembaran: label tautan yang ikonnya sudah
	// bicara, dan nama yang inisialnya tampil tepat di sebelahnya.
	return (
		<header className="flex h-16 shrink-0 items-center gap-5 border-b border-border bg-card px-5 max-lg:gap-3 max-lg:px-3">
			{/*
			 * Kembali ke Dashboard Project LED, bukan ke `/dashboard` harfiah seperti
			 * tulisan di rancangan: lapis tenant tidak boleh diakses Penyusun (§2),
			 * jadi tautan harfiah akan dipantulkan `useRoleGuard` untuknya. Satu
			 * lapis ke atas benar untuk semua role (§3) dan tetap terbaca "Dashboard".
			 */}
			<Link
				to={`/led-projects/${projectId}`}
				className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeftIcon className="size-4" />
				{/* `sr-only`, bukan `hidden`: panahnya sendiri tidak menyebut ke mana. */}
				<span className="max-lg:sr-only">Dashboard</span>
			</Link>

			{/*
			 * `min-w-0 flex-1`: tanpa ini judul adalah satu-satunya anak yang boleh
			 * menyusut — sisanya `shrink-0` — sehingga di 360 px ia tergencet jadi
			 * 0 px dan nama dokumen hilang sama sekali. Editor Bab tidak punya
			 * sidebar berkonteks seperti lapis 3, jadi baris ini satu-satunya
			 * tempat yang menjawab "ini dokumen yang mana".
			 */}
			<h1 className="min-w-0 flex-1 truncate font-heading text-lg font-bold tracking-tight">
				{judulDokumen}
			</h1>

			<ChapterSaveIndicator status={status} savedAt={savedAt} />

			<div className="ml-auto flex shrink-0 items-center gap-4 max-lg:gap-2">
				{/*
				 * Aksi utama Penjamin Mutu di halaman ini, jadi ia berdiri di header
				 * alih-alih terkubur di balik tab yang harus diklik dulu. Catatannya
				 * sendiri tinggal di tab Review. Merender `null` untuk role lain.
				 */}
				<ChapterLockButton
					chapter={chapter}
					izin={izin}
					onReviewed={onReviewed}
				/>

				{session && (
					<div className="flex items-center gap-2">
						{/*
						 * Inisial, bukan foto: `SESSION`/`USER` (docs/database.md) tidak
						 * punya kolom avatar, dan mengarang field demi rancangan hanya
						 * akan jadi data palsu yang harus dibongkar nanti.
						 */}
						<span
							aria-hidden
							className="flex size-8 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
						>
							{initials(session.namaLengkap)}
						</span>
						{/* Inisial di sebelahnya sudah mewakili; nama penuh hadir lagi di
						    menu profil yang dibuka dari sini. */}
						<span className="text-sm font-medium max-lg:hidden">
							{session.namaLengkap}
						</span>

						{/*
						 * Menu yang sama dengan card profil sidebar. Editor Bab tidak
						 * memakai `AppShell`, jadi tanpa ini ia jadi satu-satunya halaman
						 * yang tidak punya jalan keluar.
						 */}
						<ProfileMenu />
					</div>
				)}
			</div>
		</header>
	);
}
