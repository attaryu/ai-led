import {
	Sheet,
	SheetBody,
	SheetHeader,
	SheetNav,
} from '~/core/components/ui/sheet';
import { type BarisPanduan } from '../hooks/use-chapter-guidance';
import { ChapterChunkList } from './chapter-chunk-list';

/**
 * Laci kutipan satu butir panduan (docs/application_flow.md §11.1b).
 *
 * Kembarannya `chapter-evidence-detail-sheet.tsx`, dan sengaja **bukan** hasil
 * menggeneralisasi berkas itu: kepalanya merender badge status berkas, ukuran,
 * waktu unggah, dan cabang "sudah dihapus" — tidak satu pun berlaku untuk poin
 * panduan. Menyatukannya berarti satu render-prop atau satu union bertipe yang
 * lebih besar daripada saudara sepanjang berkas ini, dan keduanya akan berpisah
 * lagi begitu baris rubrik menuntut badge tipe skornya sendiri. Yang benar-benar
 * sama — navigasi ‹ › dan daftar kartu kutipannya — sudah diangkat ke
 * `sheet.tsx` dan `chapter-chunk-list.tsx`.
 *
 * **Navigasinya melintasi kedua kelompok.** Pedoman dan rubrik berjalan sebagai
 * satu daftar, karena `{posisi}/{total}` yang berganti penyebut di tengah jalan
 * tidak bisa dibaca sebagai apa pun. Kelompok mana yang sedang dibuka dikabarkan
 * baris `jejak` di kepalanya.
 *
 * Catatan kaki: kedua kelompok data nyata sekarang; pedoman ringkasan LLM, rubrik verbatim.
 */
export function ChapterGuidanceDetailSheet({
	baris,
	posisi,
	total,
	onTutup,
	onPindah,
}: {
	/** `null` menutup lacinya — tidak ada prop `open` terpisah. */
	baris: BarisPanduan | null;
	posisi: number;
	total: number;
	onTutup: () => void;
	onPindah: (arah: -1 | 1) => void;
}) {
	if (!baris) return null;

	return (
		<Sheet
			open
			onClose={onTutup}
			label={`Kutipan panduan untuk ${baris.judul}`}
			className="max-w-lg"
		>
			<SheetHeader onClose={onTutup}>
				<div className="flex flex-col gap-2">
					<SheetNav
						posisi={posisi}
						total={total}
						label="Butir panduan"
						onPindah={onPindah}
					/>

					<div className="min-w-0">
						<p className="text-sm leading-tight font-medium break-words">
							{baris.judul}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">{baris.jejak}</p>
					</div>
				</div>
			</SheetHeader>

			<SheetBody className="space-y-2">
				<ChapterChunkList
					potongan={baris.kutipan}
					pengantar={baris.pengantar}
					catatanKaki="Poin pedoman penulisan adalah ringkasan LLM (1-2 kalimat) dari dokumen Panduan Penulisan yang diunggah, bukan kutipan kata-demi-kata. Poin rubrik penilaian diambil verbatim dari Matriks Penilaian."
				/>
			</SheetBody>
		</Sheet>
	);
}
