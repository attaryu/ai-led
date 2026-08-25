import { CheckCircleIcon } from '@phosphor-icons/react';
import * as React from 'react';

import { formatDateTime, formatRelativeTime } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { type AutosaveStatus } from '../hooks/use-chapter-autosave';

/** Sesering apa label diperbarui; satuan terkecil yang ditampilkan adalah menit. */
const DETAK_MS = 30_000;

/**
 * Selama ini penyimpanan masih terhitung "barusan" dan ditandai hijau. Sesudahnya
 * ia cuma fakta, bukan kabar — lihat alasannya di bawah.
 */
const MASIH_BARU_MS = 60_000;

/**
 * Bentuk dasar yang sama untuk semua keadaan.
 *
 * `whitespace-nowrap` dan `shrink-0` bukan pemanis: tanpa keduanya label ini
 * melipat di dalam pilnya sendiri saat header sempit — di 768 px untuk Penjamin
 * Mutu (satu-satunya role yang ikut membawa tombol kunci bab) ia jadi gumpalan
 * tiga baris setinggi 56 px di dalam header setinggi 64 px.
 */
const DASAR = 'inline-flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap';

/**
 * Indikator simpan di header Editor Bab (docs/application_flow.md §7.2).
 *
 * **Nadanya ikut menua.** Pil hijau bercentang adalah kosakata untuk peristiwa
 * yang baru saja berhasil; dipakai untuk simpanan dua hari lalu, ia terbaca
 * seperti sistem yang menyelamati dirinya sendiri atas sesuatu yang sudah lewat,
 * sekaligus berebut bacaan pertama dengan judul dokumen di sebelahnya. Jadi
 * hijaunya hanya bertahan semenit; sesudah itu label turun jadi teks biasa yang
 * meredup, dan judul menang telak sebagai yang pertama dibaca.
 *
 * Teksnya juga memendek seiring itu — "Tersimpan" tanpa embel-embel selagi baru,
 * lalu "Disimpan 2 hari lalu" (bukan "yang lalu") sesudahnya. Waktu persisnya
 * tidak hilang, ia pindah ke `title`.
 *
 * Detaknya ditaruh di sini, bukan di hook autosave, karena label ini menua
 * sendiri: `savedAt` tidak berubah, yang berubah "sekarang". Dengan begitu satu
 * detak me-render ulang sepotong teks, bukan seluruh kanvas editor.
 */
export function ChapterSaveIndicator({
	status,
	savedAt,
}: {
	status: AutosaveStatus;
	savedAt: string | null;
}) {
	const [, detak] = React.useReducer((n: number) => n + 1, 0);

	React.useEffect(() => {
		const id = window.setInterval(detak, DETAK_MS);
		return () => window.clearInterval(id);
	}, []);

	if (status === 'menyimpan') {
		return (
			<span className={cn(DASAR, 'rounded-full bg-muted px-3 py-1 text-muted-foreground')}>
				Menyimpan…
			</span>
		);
	}

	if (!savedAt) {
		return (
			<span className={cn(DASAR, 'rounded-full bg-muted px-3 py-1 text-muted-foreground')}>
				Belum disimpan
			</span>
		);
	}

	// Ambang umurnya dihitung di sini, bukan di `format-time`: berapa lama sebuah
	// simpanan pantas dirayakan adalah keputusan indikator ini, bukan aturan
	// pemformatan yang berlaku untuk seluruh aplikasi.
	const masihBaru = Date.now() - new Date(savedAt).getTime() < MASIH_BARU_MS;
	const waktuPersis = `Disimpan ${formatDateTime(savedAt)}`;

	if (masihBaru) {
		return (
			<span
				title={waktuPersis}
				className={cn(
					DASAR,
					'rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
				)}
			>
				<CheckCircleIcon weight="fill" className="size-3.5" />
				Tersimpan
			</span>
		);
	}

	return (
		<span title={waktuPersis} className={cn(DASAR, 'text-muted-foreground')}>
			{/*
			 * Kata kerjanya ikut dilepas di layar sempit. Yang ditanyakan pengguna
			 * saat melirik ke sini adalah "kapan", dan kolom ini duduk tepat di
			 * sebelah judul dokumen yang sudah harus dipotong di 768 px.
			 */}
			<span className="max-lg:hidden">Disimpan</span>
			{formatRelativeTime(savedAt)}
		</span>
	);
}
