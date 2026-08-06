import * as React from 'react';

/** Sama dengan `w-80`, lebar sidebar sebelum ia bisa diseret. */
export const LEBAR_PANEL_MIN = 320;
/**
 * Batas atas dipasang demi kanvas, bukan demi sidebarnya: di layar 1280 px,
 * sidebar 560 px plus Daftar Isi 288 px menyisakan sekitar 430 px untuk "kertas"
 * — sudah di ambang tempat mengetik jadi tidak nyaman.
 */
export const LEBAR_PANEL_MAKS = 560;
/** Cukup untuk satu baris bukti dukung lengkap dengan badge statusnya. */
export const LEBAR_PANEL_AWAL = 380;

const STORAGE_KEY = 'chapter_panel_width';
/** Satu langkah papan tik; cukup terasa tanpa perlu ditahan lama. */
const LANGKAH_PX = 16;

function jepit(nilai: number): number {
	return Math.min(LEBAR_PANEL_MAKS, Math.max(LEBAR_PANEL_MIN, Math.round(nilai)));
}

function bacaTersimpan(): number {
	// Halaman ini dirender di server lebih dulu (SPA mode React Router), jadi
	// lebar awalnya harus nilai tetap — membaca localStorage di sini akan membuat
	// markup server dan klien berbeda.
	if (typeof window === 'undefined') return LEBAR_PANEL_AWAL;

	const tersimpan = window.localStorage.getItem(STORAGE_KEY);
	if (tersimpan === null) return LEBAR_PANEL_AWAL;

	const angka = Number.parseInt(tersimpan, 10);
	// Nilai rusak atau warisan rentang lama tidak boleh membekukan tata letak.
	return Number.isFinite(angka) ? jepit(angka) : LEBAR_PANEL_AWAL;
}

/**
 * Lebar sidebar kanan Editor Bab yang bisa diseret.
 *
 * Ditaruh di fitur `chapter`, bukan `core/`, mengikuti aturan yang sudah
 * tertulis di `chapter-editor-panels.tsx`: sesuatu naik ke `core/` saat fitur
 * kedua memakainya, seperti yang sudah terjadi pada `StatCard` dan
 * `format-time`.
 *
 * Penyeretannya memakai pointer capture, bukan pemasang `mousemove` di
 * `window`. Bedanya bukan gaya: dengan capture, gerakan tetap sampai walau
 * kursor melintasi iframe atau keluar jendela, dan pelepasannya dijamin lewat
 * `lostpointercapture` sehingga tidak ada listener yang tertinggal saat
 * komponennya dilepas di tengah seretan.
 */
export function usePanelResize() {
	const [lebar, setLebar] = React.useState(LEBAR_PANEL_AWAL);
	const seretRef = React.useRef<{ xAwal: number; lebarAwal: number } | null>(
		null,
	);

	// Nilai tersimpan diadopsi setelah hidrasi, dengan alasan di `bacaTersimpan`.
	React.useEffect(() => setLebar(bacaTersimpan()), []);

	const simpan = React.useCallback((nilai: number) => {
		window.localStorage.setItem(STORAGE_KEY, String(nilai));
	}, []);

	const onPointerDown = React.useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			// Tombol tengah dan klik kanan tidak menyeret apa pun.
			if (event.button !== 0) return;

			event.preventDefault();
			event.currentTarget.setPointerCapture(event.pointerId);
			seretRef.current = { xAwal: event.clientX, lebarAwal: lebar };
		},
		[lebar],
	);

	const onPointerMove = React.useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const seret = seretRef.current;
			if (!seret) return;

			// Sidebarnya di kanan: menyeret ke kiri berarti melebarkan.
			setLebar(jepit(seret.lebarAwal + (seret.xAwal - event.clientX)));
		},
		[],
	);

	const akhiriSeret = React.useCallback(() => {
		if (!seretRef.current) return;
		seretRef.current = null;
		// Dibaca lewat pembaruan state supaya nilai yang ditulis pasti yang
		// terakhir dirender, bukan salinan basi dari lingkup callback ini.
		setLebar((terakhir) => {
			simpan(terakhir);
			return terakhir;
		});
	}, [simpan]);

	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			const arah =
				event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
			if (arah === 0) return;

			event.preventDefault();
			setLebar((sebelumnya) => {
				const berikutnya = jepit(sebelumnya + arah * LANGKAH_PX);
				simpan(berikutnya);
				return berikutnya;
			});
		},
		[simpan],
	);

	return {
		lebar,
		/** Disebar ke elemen pembatas di tepi kiri sidebar. */
		handleProps: {
			role: 'separator' as const,
			'aria-orientation': 'vertical' as const,
			'aria-label': 'Ubah lebar panel',
			'aria-valuenow': lebar,
			'aria-valuemin': LEBAR_PANEL_MIN,
			'aria-valuemax': LEBAR_PANEL_MAKS,
			tabIndex: 0,
			onPointerDown,
			onPointerMove,
			onPointerUp: akhiriSeret,
			onLostPointerCapture: akhiriSeret,
			onKeyDown,
		},
	};
}
