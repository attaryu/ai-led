import {
	ArchiveIcon,
	ArrowRightIcon,
	GaugeIcon,
	type Icon,
	NotePencilIcon,
	SparkleIcon,
	UsersThreeIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { cn } from '~/core/lib/utils';
import {
	LandingBrand,
	LandingNavbar,
} from '../components/landing-navbar';

/**
 * Empat kemampuan yang paling membedakan platform ini, diambil dari
 * docs/application_flow.md — bukan daftar lengkap menu, melainkan alasan
 * seseorang mau mendaftar.
 */
const features: { title: string; description: string; icon: Icon }[] = [
	{
		title: 'Editor Bab',
		description:
			'Kanvas tiga kolom: daftar isi di kiri, tulisan di tengah, dan panel bantuan penyusunan di kanan.',
		icon: NotePencilIcon,
	},
	{
		title: 'Perpustakaan Bukti Dukung',
		description:
			'Unggah bukti sekali di level universitas atau prodi, lalu pakai ulang di bab mana pun yang membutuhkannya.',
		icon: ArchiveIcon,
	},
	{
		title: 'Penilaian AMI',
		description:
			'Audit mutu internal menilai dokumen terhadap indikator LAM-Teknik, lalu Penjamin Mutu mengoreksinya — sebelum diserahkan, bukan sesudah.',
		icon: GaugeIcon,
	},
	{
		title: 'Kolaborasi Berperan',
		description:
			'Pimpinan, Penjamin Mutu, dan Penyusun bekerja di dokumen yang sama dengan hak akses masing-masing.',
		icon: UsersThreeIcon,
	},
];

export function Landing() {
	return (
		<div className="flex min-h-screen flex-col bg-background">
			<LandingNavbar />

			<main className="flex-1">
				{/* HERO */}
				<section className="relative overflow-hidden px-6 pt-20 pb-20 sm:pt-28 sm:pb-24">
					{/*
					 * Cahaya latar. Sengaja lingkaran ber-blur alih-alih gradien
					 * kustom: ia memakai warna `primary` dari tema, jadi ikut berubah
					 * sendiri di mode gelap tanpa nilai warna kedua yang harus dijaga.
					 *
					 * `z-0` di sini, bukan `-z-10`: pembungkus halaman punya
					 * `bg-background` yang buram, jadi apa pun yang dikirim ke belakang
					 * lapisan nol akan tertimbun olehnya dan cahayanya hilang sama
					 * sekali. Isi hero yang dinaikkan ke `z-10`, bukan cahayanya yang
					 * diturunkan.
					 *
					 * Topengnya wajib. `overflow-hidden` di section memotong sisa blur
					 * tepat di batas bawah section, dan karena tinggi section ikut
					 * panjang teks yang membungkus di layar sempit, potongan itu jatuh
					 * di tempat cahayanya masih pekat — meninggalkan garis mendatar yang
					 * kentara. Topeng membuatnya sudah habis sebelum dipotong, berapa
					 * pun tinggi section-nya.
					 */}
					<div
						aria-hidden
						className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[700px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_35%,transparent_85%)]"
					>
						<div className="absolute top-[-340px] left-1/2 size-[900px] -translate-x-1/2 rounded-full bg-primary/12 blur-[140px]" />
					</div>

					<div className="relative z-10 mx-auto max-w-3xl text-center">
						<span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
							<SparkleIcon weight="fill" className="size-3.5 text-primary" />
							Platform penyusunan dokumen LED
						</span>

						<h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
							Susun Dokumen LED tanpa kehilangan jejak buktinya.
						</h1>

						<p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
							Satu ruang kerja untuk menulis Laporan Evaluasi Diri akreditasi
							LAM-Teknik: dari mengumpulkan bukti dukung, menyusun tiap bab,
							sampai melihat perkiraan skornya sebelum diserahkan.
						</p>

						<div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
							<Link
								to="/register"
								className={cn(
									buttonVariants({ size: 'lg' }),
									'w-full cursor-pointer sm:w-auto',
								)}
							>
								Mulai Sekarang
								<ArrowRightIcon className="size-4" />
							</Link>
							<Link
								to="/login"
								className={cn(
									buttonVariants({ variant: 'outline', size: 'lg' }),
									'w-full cursor-pointer sm:w-auto',
								)}
							>
								Masuk ke akun
							</Link>
						</div>
					</div>
				</section>

				{/* FITUR */}
				<section className="px-6 pb-24">
					<div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{features.map((feature) => (
							<Card key={feature.title} className="h-full">
								<CardHeader>
									<span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
										<feature.icon className="size-5" />
									</span>
									<CardTitle>{feature.title}</CardTitle>
									<CardDescription className="mt-1 leading-relaxed">
										{feature.description}
									</CardDescription>
								</CardHeader>
							</Card>
						))}
					</div>
				</section>

				{/* AJAKAN PENUTUP */}
				<section className="px-6 pb-24">
					<div className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-2xl border border-border bg-muted/40 px-6 py-14 text-center">
						<div className="space-y-2">
							<h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
								Siap menyiapkan akreditasi berikutnya?
							</h2>
							<p className="text-sm text-pretty text-muted-foreground sm:text-base">
								Daftarkan universitas Anda, lalu undang tim penyusun tiap
								program studi.
							</p>
						</div>
						<Link
							to="/register"
							className={cn(buttonVariants({ size: 'lg' }), 'cursor-pointer')}
						>
							Daftar Sekarang
							<ArrowRightIcon className="size-4" />
						</Link>
					</div>
				</section>
			</main>

			<footer className="border-t border-border/60 px-6 py-8">
				<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
					<LandingBrand />
					<p className="text-xs text-muted-foreground">
						Platform Penyusunan Dokumen LED LAM-Teknik
					</p>
				</div>
			</footer>
		</div>
	);
}
