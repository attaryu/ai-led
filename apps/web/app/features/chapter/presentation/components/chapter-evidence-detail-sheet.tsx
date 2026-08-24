import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Sheet, SheetBody, SheetHeader } from '~/core/components/ui/sheet';
import { formatRelativeTime } from '~/core/lib/format-time';
import { EvidenceStatusBadge } from '~/features/evidence/presentation/components/evidence-status-badge';
import {
	formatBytes,
	getFileVisual,
} from '~/features/evidence/presentation/utils/evidence-format';
import { type BarisRujukan } from '../hooks/use-chapter-reference';

/**
 * Laci kutipan satu bukti dukung (docs/application_flow.md §11.1a).
 *
 * **Kenapa laci, bukan baris berulang.** Satu berkas bisa menyumbang beberapa
 * bagian, dan menampilkannya sebagai baris terpisah membuat hitungan di kepala
 * panel berhenti berarti "berapa berkas" — padahal itu pertanyaan pertama yang
 * dijawab tab ini. Daftarnya tetap satu baris per dokumen; kutipannya pindah ke
 * sini, tempat teksnya dapat lebar yang layak dibaca.
 *
 * **Kenapa bukan dibuka di tempat.** Sidebarnya bisa turun sampai 320 px, dan
 * petikan sepanjang dua-tiga kalimat di kolom selebar itu berhenti terbaca
 * sebagai kutipan, mulai terbaca sebagai paragraf yang terjepit.
 *
 * Bentuknya menyalin {@link ../../../assessment/presentation/components/assessment-detail-sheet AssessmentDetailSheet}
 * sampai ke navigasi ‹ ›-nya: meninjau berkas berurutan tidak boleh menuntut
 * tutup-buka satu per satu. Ini juga yang menjawab satu-satunya kelemahan laci
 * di sini — `sheet.tsx` membenarkan dirinya dengan "menyisakan daftar di kirinya
 * tetap terlihat", dan itu tidak berlaku saat daftarnya sendiri ada di sidebar
 * kanan; ‹ › menggantikan kebutuhan melihat daftar itu.
 *
 * **Yang sengaja tidak ada:** skor kemiripan per kutipan. Kontrak retrieval
 * sungguhan memang membawanya (`distance` di `apps/ai/vectorstore`), tapi angka
 * karangan yang tampak presisi lebih menyesatkan daripada tidak ada.
 */
export function ChapterEvidenceDetailSheet({
	baris,
	posisi,
	total,
	onTutup,
	onPindah,
}: {
	/** `null` menutup lacinya — tidak ada prop `open` terpisah. */
	baris: BarisRujukan | null;
	/** Urutan ke berapa dalam daftar yang sedang tampil, mulai 1. */
	posisi: number;
	total: number;
	onTutup: () => void;
	onPindah: (arah: -1 | 1) => void;
}) {
	if (!baris) return null;

	const { ref, live, kutipan } = baris;
	const { Icon: FileTypeIcon, className: iconClassName } = getFileVisual(
		ref.tipeFile,
	);
	const hilang = live === undefined;

	return (
		<Sheet
			open
			onClose={onTutup}
			label={`Kutipan dari ${ref.namaDokumen}`}
			className="max-w-lg"
		>
			<SheetHeader onClose={onTutup}>
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Bukti dukung sebelumnya"
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
							aria-label="Bukti dukung berikutnya"
							onClick={() => onPindah(1)}
							disabled={posisi >= total}
							className="cursor-pointer"
						>
							<CaretRightIcon className="size-4" />
						</Button>
					</div>

					<div className="flex items-start gap-2.5">
						<FileTypeIcon
							weight="fill"
							className={`mt-0.5 size-5 shrink-0 ${iconClassName}`}
						/>
						<div className="min-w-0 flex-1">
							<p className="text-sm leading-tight font-medium break-words">
								{ref.namaDokumen}
							</p>
							<p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
								{hilang ? (
									<>
										<span className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
											Sudah dihapus
										</span>
										<span className="text-xs text-muted-foreground">
											Tercatat sebagai {ref.tipeFile.toUpperCase()}
										</span>
									</>
								) : (
									<>
										<EvidenceStatusBadge status={live.status} />
										<span className="text-xs text-muted-foreground">
											{live.tipeFile.toUpperCase()} ·{' '}
											{formatBytes(live.ukuranBytes)} ·{' '}
											{formatRelativeTime(live.waktuDiunggah)}
										</span>
									</>
								)}
							</p>
						</div>
					</div>
				</div>
			</SheetHeader>

			<SheetBody className="space-y-2">
				<p className="text-xs leading-relaxed text-muted-foreground">
					{kutipan.length} bagian berkas ini dipakai saat menyusun bab tersebut.
				</p>

				<ul className="space-y-2">
					{kutipan.map((potongan) => (
						<li
							key={potongan.id}
							className="rounded-md border border-border bg-muted/40 p-2.5"
						>
							<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
								{potongan.halamanMulai === potongan.halamanSelesai
									? `hlm. ${potongan.halamanMulai}`
									: `hlm. ${potongan.halamanMulai}–${potongan.halamanSelesai}`}
								{potongan.judulBagian && ` · ${potongan.judulBagian}`}
							</p>
							<p className="mt-1.5 text-sm leading-relaxed">
								{potongan.kutipan}
							</p>
						</li>
					))}
				</ul>

				{/*
				 * Dinyatakan, bukan didiamkan: pembaca yang melihat petikan selengkap
				 * ini berhak tahu ia belum berasal dari berkasnya sendiri. §11.1 sudah
				 * memakai nada yang sama untuk bagian Panduan yang belum ada.
				 */}
				<p className="pt-1 text-xs leading-relaxed text-muted-foreground">
					Kutipan masih contoh: pencarian ke isi berkas yang sebenarnya menyusul
					bersama vector database-nya.
				</p>
			</SheetBody>
		</Sheet>
	);
}
