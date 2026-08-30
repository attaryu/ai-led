import * as React from 'react';
import { ArrowLeftIcon, ListIcon, type Icon } from '@phosphor-icons/react';
import { Link, NavLink, useLocation } from 'react-router';

import { Button } from '~/core/components/ui/button';
import { useEscapeLayer } from '~/core/lib/escape-layer';
import { cn } from '~/core/lib/utils';
import {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '~/core/components/ui/breadcrumb';
import { SidebarProfileCard } from '~/features/auth/presentation/components/sidebar-profile-card';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export type AppShellNavItem = {
	name: string;
	path: string;
	icon: Icon;
	/** Cocokkan persis, dipakai untuk item index agar tidak ikut aktif di anaknya. */
	end?: boolean;
};

export type AppShellSidebar = {
	/** Nama universitas */
	universityName: string;
	/** `null` → tombol kembali tidak dirender (role tanpa lapis di atasnya, §2). */
	backTo?: string | null;
	/** Label kecil di atas nama konteks, mis. "Dashboard Program Studi". */
	eyebrow?: string;
	/**
	 * Nama prodi/dokumen yang sedang dibuka. Lapis 1 tidak mengisinya — ia memang
	 * tidak punya konteks di bawah nama aplikasi, jadi blok konteksnya tidak
	 * dirender sama sekali.
	 */
	contextTitle?: string;
	/** Sudah tersaring per role oleh pemanggil. */
	items: AppShellNavItem[];
};

export type AppShellBreadcrumb = {
	/** Tanpa `to` → dirender sebagai halaman aktif, bukan tautan. */
	to?: string;
	label: string;
};

/**
 * Chrome bersama ketiga lapis ruang kerja (docs/application_flow.md §3).
 *
 * Bentuknya sengaja sama di semua lapis — yang berganti total adalah isi
 * sidebar dan breadcrumb, dan itulah yang dimaksud §3 dengan "navigasi berbeda
 * total": prodi bukan sub-tab di dalam Dashboard Utama, melainkan ruang kerja
 * sendiri dengan daftar menunya sendiri.
 */
export function AppShell({
	sidebar,
	breadcrumbs,
	headerAction,
	children,
}: {
	sidebar: AppShellSidebar;
	breadcrumbs: AppShellBreadcrumb[];
	headerAction?: React.ReactNode;
	children: React.ReactNode;
}) {
	/**
	 * Laci sidebar, hanya berlaku di bawah `lg`.
	 *
	 * State lokal, bukan store: tidak ada konsumen lain, dan nilainya justru tidak
	 * boleh bertahan lintas navigasi — lihat efek penutup di bawah.
	 */
	const [laciTerbuka, setLaciTerbuka] = React.useState(false);
	const { pathname } = useLocation();

	// Mengklik menu berarti pindah halaman, dan laci yang tertinggal terbuka akan
	// menutupi halaman yang barusan diminta.
	React.useEffect(() => {
		setLaciTerbuka(false);
	}, [pathname]);

	useEscapeLayer(laciTerbuka, () => setLaciTerbuka(false));

	return (
		<div className="min-h-screen bg-background">
			{/*
			 * Backdrop hanya ada saat lacinya terbuka. `lg:hidden` menjaga kasus
			 * "buka di 768 lalu lebarkan jendela": tanpa itu ia tertinggal menutupi
			 * tata letak yang sudah kembali normal.
			 */}
			{laciTerbuka && (
				<div
					className="fixed inset-0 z-30 bg-black/40 lg:hidden"
					onClick={() => setLaciTerbuka(false)}
					aria-hidden
				/>
			)}

			<aside
				className={cn(
					'fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
					// Gaya laci ditulis `max-lg:`, bukan dibatalkan lagi dengan `lg:`,
					// supaya di ≥ lg elemen ini benar-benar tidak punya properti
					// `translate` — alasan lengkapnya di `chapter-editor-toc.tsx`.
					'max-lg:z-40 max-lg:shadow-lg max-lg:transition-transform max-lg:duration-200 max-lg:ease-out max-lg:motion-reduce:transition-none',
					laciTerbuka ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
				)}
			>
				{/*
				 * Identitas aplikasi, sama persis di ketiga lapis. Tingginya dikunci
				 * `h-16` agar garis bawahnya sebidang dengan header konten di kanan.
				 */}
				<div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6 w-full">
					{/* Logo sengaja dibiarkan kosong sampai asetnya ada. */}
					<div
						aria-hidden
						className="size-9 shrink-0 rounded-md border border-sidebar-border bg-primary"
					/>

					<div className="flex flex-col overflow-hidden">
						<span className="font-heading font-bold tracking-tight text-sidebar-primary">
							AI LED
						</span>

						{/*
						 * Teks tooltip ditaruh langsung di trigger-nya, bukan dibungkus
						 * `<span>` di dalamnya: trigger adalah `<button>` yang mewarisi
						 * `line-height` body (preflight `font: inherit`), jadi struts-nya
						 * lebih tinggi dari `text-xs` dan menyisipkan jarak liar di bawah
						 * "AI LED". `leading-4` mengunci tinggi barisnya sama seperti saat
						 * ia masih `<span>` biasa.
						 */}
						<Tooltip>
							<TooltipTrigger
								aria-label={sidebar.universityName}
								className="block w-fit max-w-full truncate text-left font-light text-xs leading-4"
							>
								{sidebar.universityName}
							</TooltipTrigger>
							<TooltipContent side="right" className="leading-relaxed">
								{sidebar.universityName}
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{/*
				 * Blok konteks: milik lapis yang punya subjek (prodi, dokumen). Tombol
				 * kembali dipisah dari eyebrow+judul dengan `gap-3` supaya tidak terbaca
				 * sebagai satu tumpukan, dan padding-nya ditarik keluar `-mx-2` agar
				 * teksnya tetap segaris `px-6` sementara area kliknya lebih lapang.
				 */}
				{(sidebar.backTo || sidebar.eyebrow || sidebar.contextTitle) && (
					<div className="flex gap-3 border-b border-sidebar-border px-6 py-3">
						{sidebar.backTo && (
							<Link
								to={sidebar.backTo}
								className="-mx-2 flex w-fit max-w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
							>
								<ArrowLeftIcon className="size-4 shrink-0" />
							</Link>
						)}

						{(sidebar.eyebrow || sidebar.contextTitle) && (
							<div className="flex flex-col gap-1 overflow-hidden">
								{sidebar.eyebrow && (
									<p className="text-[10px] font-medium tracking-wide text-sidebar-foreground/60 uppercase">
										{sidebar.eyebrow}
									</p>
								)}
								{sidebar.contextTitle && (
									<Tooltip>
										<TooltipTrigger
											aria-label={sidebar.contextTitle}
											className="h-fit"
										>
											<h1 className="truncate font-heading font-bold text-sm tracking-tight text-sidebar-primary">
												{sidebar.contextTitle}
											</h1>
										</TooltipTrigger>
										<TooltipContent side="left" className="leading-relaxed">
											{sidebar.contextTitle}
										</TooltipContent>
									</Tooltip>
								)}
							</div>
						)}
					</div>
				)}

				<nav className="flex-1 space-y-1.5 px-4 py-6">
					{sidebar.items.map((item) => {
						const Icon = item.icon;
						return (
							<NavLink
								key={item.path}
								to={item.path}
								end={item.end}
								/*
								 * Penanda aktif: latar bertinta tipis + batang aksen di
								 * tepi kiri, bukan slab warna penuh.
								 *
								 * Slab jenuh selebar item adalah tinta paling banyak di
								 * seluruh sidebar, padahal yang perlu disampaikannya
								 * hanya "kamu di sini" — satu bit. Batang 3 px
								 * menyampaikan bit yang sama, dan sisa perbedaannya
								 * diambil alih oleh berat huruf dan warna teks.
								 *
								 * Item non-aktif ikut diredupkan ke `/70`. Tanpa itu
								 * penanda yang lebih halus ini harus bersaing dengan
								 * lima tetangga sekelam dirinya; jarak kontraslah yang
								 * membuatnya terbaca, bukan kepekatan penandanya
								 * sendiri.
								 *
								 * `before:` diposisikan `-left-1` supaya batangnya jatuh
								 * di dalam padding `px-4` milik `<nav>`, sebidang di
								 * semua item.
								 */
								className={({ isActive }) =>
									`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
										isActive
											? 'bg-sidebar-accent font-semibold text-sidebar-primary before:absolute before:inset-y-1.5 before:-left-1 before:w-[3px] before:rounded-full before:bg-sidebar-primary'
											: 'font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
									}`
								}
							>
								<Icon className="size-5" />
								{item.name}
							</NavLink>
						);
					})}
				</nav>

				<div className="border-t border-sidebar-border p-3">
					<SidebarProfileCard />
				</div>
			</aside>

			<div className="lg:pl-64">
				<header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-6 lg:px-8">
					<Button
						variant="ghost"
						size="icon"
						aria-label="Buka navigasi"
						aria-expanded={laciTerbuka}
						onClick={() => setLaciTerbuka(true)}
						className="-ml-2 shrink-0 cursor-pointer lg:hidden"
					>
						<ListIcon className="size-5" />
					</Button>

					{/*
					 * `min-w-0` supaya breadcrumb lapis 3 yang bertingkat tiga menyusut
					 * alih-alih mendorong `headerAction` keluar layar di 768 px.
					 */}
					{/*
					 * `flex-nowrap`: bawaan `BreadcrumbList` adalah `flex-wrap`, dan di
					 * 768 px trail lapis 3 (`Dashboard › Teknik Informatika › Akreditasi
					 * LED Teknik Informatika 2026`, 469 px) tidak muat di 412 px yang
					 * tersisa — ia melipat, dan judulnya jatuh ke baris kedua di dalam
					 * header setinggi `h-16`. Dua baris sesak itu lebih buruk daripada
					 * trail yang diringkas.
					 *
					 * Yang diciutkan bagian **tengahnya**, bukan judulnya: nama dokumen
					 * adalah satu-satunya jawaban atas "ini dokumen yang mana", dan di
					 * bawah `lg` blok konteks sidebar yang biasanya ikut menyebutkannya
					 * sedang tersembunyi di dalam laci. Hasilnya 361 px — muat dengan
					 * sisa 51 px, dan jalan naik tetap ada lewat crumb pertama.
					 */}
					<Breadcrumb className="min-w-0 flex-1">
						<BreadcrumbList className="flex-nowrap">
							{breadcrumbs.map((breadcrumb, index) => {
								const terakhir = index === breadcrumbs.length - 1;
								const diTengah = index > 0 && !terakhir;

								return (
									<React.Fragment
										key={`${breadcrumb.to ?? 'current'}-${breadcrumb.label}`}
									>
										<BreadcrumbItem
											className={cn(
												// `sr-only`, bukan `hidden`: crumb tengah tidak perlu
												// memakan lebar, tapi tidak ada alasan mencabutnya
												// dari pohon aksesibilitas juga — pembaca layar tetap
												// mendapat trail yang utuh. Pemisahnya boleh benar-benar
												// hilang; ia memang `aria-hidden` sejak awal.
												diTengah && 'max-lg:sr-only',
												// `min-w-0` supaya `truncate` di bawahnya punya
												// sesuatu untuk dipotong; tanpa itu nama dokumen yang
												// sangat panjang tetap mendorong header.
												terakhir && 'min-w-0',
											)}
										>
											{breadcrumb.to && !terakhir ? (
												<BreadcrumbLink render={<Link to={breadcrumb.to} />}>
													{breadcrumb.label}
												</BreadcrumbLink>
											) : (
												<BreadcrumbPage className="truncate">
													{breadcrumb.label}
												</BreadcrumbPage>
											)}
										</BreadcrumbItem>

										{!terakhir && (
											<BreadcrumbSeparator
												className={cn(
													'shrink-0',
													diTengah && 'max-lg:hidden',
												)}
											/>
										)}

										{/*
										 * Elipsis pengganti seluruh crumb tengah. Dirender sekali,
										 * tepat sesudah crumb pertama, dan hanya kalau memang ada
										 * yang disembunyikan.
										 */}
										{index === 0 && breadcrumbs.length > 2 && (
											<>
												<BreadcrumbItem className="shrink-0 lg:hidden">
													<BreadcrumbEllipsis />
												</BreadcrumbItem>
												<BreadcrumbSeparator className="shrink-0 lg:hidden" />
											</>
										)}
									</React.Fragment>
								);
							})}
						</BreadcrumbList>
					</Breadcrumb>

					{headerAction}
				</header>

				{/*
				 * Bingkai halaman. `lg:p-10` — bukan `lg:p-8` — karena di lebar
				 * penuh isi halaman menempel ke tepi jendela, dan margin adalah
				 * satu-satunya hal yang memberi tahu mata di mana halaman
				 * berakhir. Di bawah `lg` tetap 24 px: di sana ruang mendatar
				 * sedang langka, dan margin tebal memakannya dari tabel.
				 */}
				<main className="p-6 lg:p-10">{children}</main>
			</div>
		</div>
	);
}
