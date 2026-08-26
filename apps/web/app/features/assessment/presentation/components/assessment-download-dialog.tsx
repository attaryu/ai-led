import * as React from 'react';
import {
	DownloadSimpleIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import {
	buatPdfPenilaian,
	namaBerkasPdf,
	type InputPdfPenilaian,
} from '../utils/assessment-pdf';

type Keadaan =
	| { tahap: 'menyiapkan' }
	| { tahap: 'siap'; url: string }
	| { tahap: 'gagal'; pesan: string };

/**
 * Preview PDF hasil penilaian sebelum benar-benar diunduh.
 *
 * **Kenapa preview, bukan langsung mengunduh.** Berkas ini beredar keluar
 * aplikasi — dikirim ke asesor, dilampirkan ke berkas akreditasi — dan sekali
 * terkirim tidak bisa ditarik. Melihatnya lebih dulu jauh lebih murah daripada
 * mendapati kolom yang terpotong sesudah berkasnya dibagikan.
 *
 * **Dialog, bukan laci.** Bentuknya sama persis dengan modal unggah bukti
 * dukung (§4.5): satu tugas sekali jalan yang selesai lalu ditutup, tanpa
 * daftar di belakangnya yang perlu tetap terlihat. Itu justru yang membedakannya
 * dari laci detail indikator, yang ada supaya barisnya bisa ditinjau berurutan.
 *
 * PDF-nya dibangkitkan sekali tiap kali dialog dibuka, lalu dipegang sebagai
 * object URL. URL itu **wajib dilepas** saat ditutup: tanpa itu, tiap pembukaan
 * menyisakan satu Blob di memori sampai tabnya ditutup.
 */
export function AssessmentDownloadDialog({
	open,
	onOpenChange,
	input,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	input: InputPdfPenilaian;
}) {
	const [keadaan, setKeadaan] = React.useState<Keadaan>({
		tahap: 'menyiapkan',
	});

	// `percobaan` hanya penanda supaya "Coba lagi" memicu efek yang sama tanpa
	// menduplikasi logika pembangkitnya di luar efek.
	const [percobaan, setPercobaan] = React.useState(0);

	/**
	 * Bahan PDF dipegang lewat ref, dan efeknya **tidak** bergantung padanya.
	 *
	 * `input` dirakit sebagai objek baru tiap kali halaman induk dirender —
	 * termasuk saat `storage-update` datang dari peninjauan di tab lain. Kalau ia
	 * masuk daftar kebergantungan, tiap render itu akan membangkitkan ulang PDF
	 * dan mencabut object URL yang sedang dipakai iframe: preview berkedip, dan
	 * tombol unduh sesaat menunjuk URL yang sudah mati.
	 *
	 * Lagi pula snapshot memang yang benar di sini — PDF adalah keadaan saat
	 * tombolnya ditekan, bukan aliran yang ikut berubah selagi dilihat.
	 */
	const inputRef = React.useRef(input);
	inputRef.current = input;

	React.useEffect(() => {
		if (!open) return;

		let dibatalkan = false;
		let urlDibuat: string | null = null;

		setKeadaan({ tahap: 'menyiapkan' });

		void buatPdfPenilaian(inputRef.current)
			.then((blob) => {
				// Dialog bisa saja sudah ditutup selagi PDF-nya dibangkitkan; membuat
				// object URL sesudah itu berarti membuat yang tidak akan pernah
				// dilepas siapa pun.
				if (dibatalkan) return;
				urlDibuat = URL.createObjectURL(blob);
				setKeadaan({ tahap: 'siap', url: urlDibuat });
			})
			.catch((galat: unknown) => {
				if (dibatalkan) return;
				setKeadaan({
					tahap: 'gagal',
					pesan:
						galat instanceof Error
							? galat.message
							: 'PDF gagal dibuat. Coba lagi.',
				});
			});

		return () => {
			dibatalkan = true;
			if (urlDibuat) URL.revokeObjectURL(urlDibuat);
		};
	}, [open, percobaan]);

	function unduh() {
		if (keadaan.tahap !== 'siap') return;

		const tautan = document.createElement('a');
		tautan.href = keadaan.url;
		tautan.download = namaBerkasPdf(input.ledProject.judul, new Date());
		document.body.appendChild(tautan);
		tautan.click();
		tautan.remove();

		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>Unduh Hasil Penilaian</DialogTitle>
					<DialogDescription>
						Seluruh {input.baris.length} indikator, urut nomor — tidak
						terpengaruh saringan yang sedang aktif di daftar.
					</DialogDescription>
				</DialogHeader>

				{keadaan.tahap === 'menyiapkan' && (
					<div className="flex h-[60vh] items-center justify-center rounded-md border border-border bg-muted/40">
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<SpinnerGapIcon className="size-4 animate-spin" />
							Menyiapkan PDF…
						</p>
					</div>
				)}

				{keadaan.tahap === 'gagal' && (
					<div className="flex h-[60vh] flex-col items-center justify-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-6 text-center">
						<WarningCircleIcon className="size-6 text-destructive" />
						<p className="text-sm leading-relaxed text-destructive">
							{keadaan.pesan}
						</p>
						<Button
							type="button"
							variant="outline"
							onClick={() => setPercobaan((n) => n + 1)}
							className="cursor-pointer"
						>
							Coba lagi
						</Button>
					</div>
				)}

				{keadaan.tahap === 'siap' && (
					<>
						<iframe
							src={keadaan.url}
							title="Preview PDF hasil Penilaian AMI"
							className="h-[60vh] w-full rounded-md border border-border bg-muted/40"
						/>
						{/*
						 * Tidak semua peramban merender PDF di dalam iframe. Kalimat ini
						 * ada supaya kotak yang kosong tidak terbaca sebagai PDF yang
						 * gagal dibuat — berkasnya tetap utuh, dan tombol unduhnya sama
						 * sekali tidak bergantung pada preview.
						 */}
						<p className="text-xs text-muted-foreground">
							Preview tidak muncul? Sebagian peramban tidak menampilkan PDF di
							dalam halaman. Berkasnya tetap bisa diunduh.
						</p>
					</>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						className="cursor-pointer"
					>
						Batal
					</Button>
					<Button
						type="button"
						onClick={unduh}
						disabled={keadaan.tahap !== 'siap'}
						className="cursor-pointer"
					>
						<DownloadSimpleIcon />
						Unduh Sekarang
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
