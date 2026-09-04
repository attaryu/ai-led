import * as React from 'react';

/**
 * Tumpukan permukaan yang menanggapi Escape, terurut sesuai urutan pemasangan.
 *
 * Tanpa ini, dua permukaan bertumpuk yang masing-masing memasang `keydown` di
 * `window` akan tertutup bersamaan oleh satu tekan — dan yang hilang justru yang
 * di bawah, yang tidak diminta pengguna untuk ditutup. Kasus nyatanya di Editor
 * Bab: di bawah `lg` sidebar kanan menjadi laci, sementara panel Bukti dan
 * Panduan membuka {@link ../components/ui/sheet Sheet} kutipan di atasnya.
 *
 * Yang menjawab Escape hanya lapis paling atas, yaitu yang terakhir dipasang.
 */
const tumpukan: Array<() => void> = [];

function onKeyDown(event: KeyboardEvent) {
	if (event.key !== 'Escape') return;
	const teratas = tumpukan.at(-1);
	if (!teratas) return;
	event.stopPropagation();
	teratas();
}

export function useEscapeLayer(aktif: boolean, onEscape: () => void) {
	// Callback disimpan di ref supaya identitasnya yang berubah tiap render tidak
	// mendaftarkan ulang lapis ini ke puncak tumpukan — kalau itu terjadi, laci
	// yang di bawah akan mencuri Escape dari laci yang dibuka sesudahnya.
	const terkini = React.useRef(onEscape);
	React.useLayoutEffect(() => {
		terkini.current = onEscape;
	});

	React.useEffect(() => {
		if (!aktif) return;

		const tutup = () => terkini.current();
		if (tumpukan.length === 0) window.addEventListener('keydown', onKeyDown);
		tumpukan.push(tutup);

		return () => {
			tumpukan.splice(tumpukan.indexOf(tutup), 1);
			if (tumpukan.length === 0) {
				window.removeEventListener('keydown', onKeyDown);
			}
		};
	}, [aktif]);
}
