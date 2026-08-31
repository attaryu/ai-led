import * as React from 'react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';

export type ConfirmOptions = {
	judul: string;
	/** Akibat yang perlu diketahui sebelum menekan tombolnya. */
	deskripsi?: string;
	/** Bunyi tombol yang melanjutkan; sebutkan kata kerjanya, bukan "Ya". */
	labelAksi?: string;
	labelBatal?: string;
	/** Mewarnai tombol aksi merah, untuk yang menghapus atau tidak bisa dibatalkan. */
	merusak?: boolean;
};

function ConfirmDialog({
	opsi,
	onSelesai,
}: {
	opsi: ConfirmOptions;
	onSelesai: (lanjut: boolean) => void;
}) {
	return (
		<Dialog
			open
			onOpenChange={(terbuka) => {
				if (!terbuka) onSelesai(false);
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{opsi.judul}</DialogTitle>
					{opsi.deskripsi && (
						<DialogDescription>{opsi.deskripsi}</DialogDescription>
					)}
				</DialogHeader>

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						className="cursor-pointer"
						onClick={() => onSelesai(false)}
					>
						{opsi.labelBatal ?? 'Batal'}
					</Button>
					<Button
						variant={opsi.merusak ? 'destructive' : 'default'}
						className="cursor-pointer"
						onClick={() => onSelesai(true)}
					>
						{opsi.labelAksi ?? 'Lanjutkan'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Konfirmasi berbentuk dialog aplikasi, pengganti `window.confirm`.
 *
 * Sengaja berbentuk janji, bukan sepasang keadaan yang harus diurus pemanggil.
 * Dengan begini bentuk pemanggilnya tetap sama seperti dulu —
 * `if (!(await konfirmasi({...}))) return;` — dan tidak ada aksi yang perlu
 * disimpan dulu di `useState` sambil menunggu jawaban. Tanpa itu, tiap tombol
 * hapus akan menumbuhkan satu keadaan "sedang menunggu konfirmasi apa" sendiri,
 * dan halaman yang punya tiga tombol hapus menumbuhkan tiga.
 *
 * `window.confirm` diganti karena tiga hal yang tidak bisa diperbaiki: bunyinya
 * ditentukan peramban ("OK"/"Cancel", tanpa kata kerja), tampilannya tidak
 * mengikuti tema aplikasi, dan ia **menghentikan seluruh utas** — animasi dan
 * pemuatan latar ikut membeku selama kotaknya terbuka.
 *
 * Cara pakai:
 *
 * ```tsx
 * const { konfirmasi, confirmDialog } = useConfirmDialog();
 * // ...
 * if (!(await konfirmasi({ judul: 'Hapus berkas ini?', merusak: true }))) return;
 * // ...
 * return <>{confirmDialog}</>;
 * ```
 */
export function useConfirmDialog() {
	const [opsi, setOpsi] = React.useState<ConfirmOptions | null>(null);
	const penjawab = React.useRef<((lanjut: boolean) => void) | null>(null);

	const konfirmasi = React.useCallback((pilihan: ConfirmOptions) => {
		setOpsi(pilihan);
		return new Promise<boolean>((resolve) => {
			// Permintaan yang belum dijawab dianggap dibatalkan. Tanpa ini,
			// konfirmasi kedua yang dibuka sebelum yang pertama dijawab akan
			// meninggalkan janji pertama menggantung selamanya.
			penjawab.current?.(false);
			penjawab.current = resolve;
		});
	}, []);

	const selesai = React.useCallback((lanjut: boolean) => {
		penjawab.current?.(lanjut);
		penjawab.current = null;
		setOpsi(null);
	}, []);

	const confirmDialog = opsi ? (
		<ConfirmDialog opsi={opsi} onSelesai={selesai} />
	) : null;

	return { konfirmasi, confirmDialog };
}
