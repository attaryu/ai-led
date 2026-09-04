import * as React from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '~/core/components/ui/breadcrumb';
import { type EvidenceFolderEntity } from '../../domain/entities/evidence-folder.entity';

/**
 * Remah tautan folder (docs/application_flow.md §4.6a) — satu-satunya alat
 * navigasi naik, karena perpustakaan ini sengaja tidak punya kolom pohon di
 * kiri: halamannya sudah berada di dalam sidebar `AppShell`, dan sidebar kedua
 * membuat isinya terjepit di layar sempit.
 *
 * **Saat mencari, remahnya diganti keterangan.** Hasil pencarian merata ke
 * seluruh cakupan, jadi jalur folder yang tetap terpampang akan berbohong tentang
 * asal baris-baris yang sedang tampil. Yang menggantikannya sekaligus menjelaskan
 * kenapa daftarnya tiba-tiba memuat berkas dari mana-mana.
 *
 * **Di akar ia tidak dirender sama sekali.** Remah satu ruas yang isinya persis
 * judul halaman satu baris di atasnya bukan navigasi — tidak ada tempat untuk
 * dituju, dan pengulangannya terbaca seperti cacat tampilan. Ia baru muncul
 * begitu benar-benar ada jalan pulang.
 */
export function EvidenceBreadcrumb({
	labelAkar,
	jalur,
	mencari,
	onPindah,
}: {
	labelAkar: string;
	/** Dari akar sampai folder aktif; kosong berarti sedang di akar. */
	jalur: EvidenceFolderEntity[];
	mencari: boolean;
	onPindah: (id: string | null) => void;
}) {
	if (!mencari && jalur.length === 0) return null;

	if (mencari) {
		return (
			<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
				<MagnifyingGlassIcon className="size-4 shrink-0" />
				Hasil pencarian di seluruh {labelAkar}
			</p>
		);
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					{jalur.length === 0 ? (
						<BreadcrumbPage>{labelAkar}</BreadcrumbPage>
					) : (
						<BreadcrumbLink
							render={
								<button
									type="button"
									onClick={() => onPindah(null)}
									className="cursor-pointer"
								/>
							}
						>
							{labelAkar}
						</BreadcrumbLink>
					)}
				</BreadcrumbItem>

				{jalur.map((folder, urutan) => {
					const terakhir = urutan === jalur.length - 1;

					return (
						// Pemisah adalah `<li>` tersendiri, bukan anak `BreadcrumbItem` yang
						// juga `<li>` — pola yang sama dengan `app-shell.tsx`.
						<React.Fragment key={folder.id}>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								{terakhir ? (
									<BreadcrumbPage className="max-w-[16rem] truncate">
										{folder.nama}
									</BreadcrumbPage>
								) : (
									<BreadcrumbLink
										render={
											<button
												type="button"
												onClick={() => onPindah(folder.id)}
												className="max-w-[12rem] cursor-pointer truncate"
											/>
										}
									>
										{folder.nama}
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
						</React.Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
