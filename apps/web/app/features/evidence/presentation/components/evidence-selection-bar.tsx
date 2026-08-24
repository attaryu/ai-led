import { ArrowsOutCardinalIcon, TrashIcon, XIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';

/**
 * Bilah aksi untuk baris yang sedang terpilih (docs/application_flow.md §4.6a).
 *
 * Hanya dirender saat ada yang terpilih. Bilah kosong yang selalu terpampang
 * menyita satu baris penuh untuk mengabarkan ketiadaan, dan itu justru membuat
 * bilah yang sungguhan muncul jadi tidak terasa berubah.
 *
 * **Kenapa hapus bisa mati sementara pindah tidak.** Hak hapus melekat pada tiap
 * berkas — Penyusun hanya boleh membuang unggahannya sendiri (§15) — sehingga
 * seleksi campuran tidak punya jawaban tunggal. Yang dipilih di sini menonaktifkan
 * tombolnya beserta alasannya, bukan menghapus sebagian diam-diam: membuang
 * sebagian dari yang terpilih adalah hasil yang tidak diminta siapa pun.
 * Memindahkan tidak menghilangkan apa pun, jadi ia tidak dijaga sekeras itu.
 */
export function EvidenceSelectionBar({
	jumlah,
	bolehHapus,
	alasanTakBolehHapus,
	onPindahkan,
	onHapus,
	onBersihkan,
}: {
	jumlah: number;
	bolehHapus: boolean;
	/** Ditampilkan saat `bolehHapus` bernilai salah; tanpa ini tombol mati tak terjelaskan. */
	alasanTakBolehHapus?: string;
	onPindahkan: () => void;
	onHapus: () => void;
	onBersihkan: () => void;
}) {
	if (jumlah === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
			<span className="text-sm font-medium">{jumlah} terpilih</span>

			<div className="ml-auto flex flex-wrap items-center gap-2">
				{!bolehHapus && alasanTakBolehHapus && (
					<span className="text-xs text-muted-foreground">
						{alasanTakBolehHapus}
					</span>
				)}

				<Button
					variant="outline"
					size="sm"
					onClick={onPindahkan}
					className="h-8 cursor-pointer gap-1.5"
				>
					<ArrowsOutCardinalIcon className="size-4" />
					Pindahkan
				</Button>

				<Button
					variant="destructive"
					size="sm"
					onClick={onHapus}
					disabled={!bolehHapus}
					className="h-8 cursor-pointer gap-1.5"
				>
					<TrashIcon className="size-4" />
					Hapus
				</Button>

				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Batalkan pilihan"
					onClick={onBersihkan}
					className="size-8 cursor-pointer"
				>
					<XIcon className="size-4" />
				</Button>
			</div>
		</div>
	);
}
