import * as React from 'react';
import {
	CaretDownIcon,
	CaretRightIcon,
	CheckIcon,
	FolderIcon,
	FolderOpenIcon,
	HouseIcon,
} from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import {
	folderAnak,
	jalurFolder,
	type EvidenceFolderEntity,
} from '../../domain/entities/evidence-folder.entity';

/**
 * Pemilih folder tujuan berbentuk pohon ciut (docs/application_flow.md §4.6a).
 *
 * Dipakai dua tempat yang pertanyaannya sama persis — "folder mana?" — yaitu
 * dialog "Pindahkan ke…" dan modal unggah. Menyalinnya berarti memelihara dua
 * pohon yang harus tetap berperilaku sama tanpa satu pun mekanisme yang
 * memaksanya, kesalahan yang sudah diperbaiki saat `Sheet` diangkat dari
 * `evidence-detail-panel.tsx`.
 *
 * **Akar selalu jadi pilihan pertama**, berlabel nama perpustakaannya —
 * "Bukti Dukung Universitas", bukan "/" atau "Akar". Pengguna tidak sedang
 * memikirkan sistem berkas; ia sedang memikirkan perpustakaan mana.
 *
 * **Kenapa tidak memakai `core/ui/accordion`.** Primitif itu untuk kumpulan
 * bagian yang jumlah dan susunannya diketahui saat menulis JSX; yang ini rekursif
 * dengan kedalaman yang baru diketahui saat berjalan.
 *
 * **Yang sengaja tidak ada:** kotak pencarian. Pohonnya sedalam yang dibuat
 * penggunanya sendiri, dan menambah pencarian di dalam dialog kecil ini menambah
 * satu mode tanpa menghemat langkah — folder yang jauh tetap perlu dilihat
 * jalurnya sebelum dipilih, dan pohon yang membentang sudah menunjukkannya.
 */
export function EvidenceFolderPicker({
	folders,
	labelAkar,
	nilai,
	onPilih,
	sembunyikan,
}: {
	/** Seluruh folder satu cakupan; pohon disusun di sini. */
	folders: EvidenceFolderEntity[];
	labelAkar: string;
	/** Folder terpilih; `null` = akar. */
	nilai: string | null;
	onPilih: (id: string | null) => void;
	/**
	 * Folder yang beserta seluruh keturunannya tidak dirender sama sekali —
	 * dipakai saat yang dipindahkan folder, supaya ia tidak bisa dipindahkan ke
	 * dalam dirinya sendiri.
	 *
	 * **Disembunyikan, bukan dinonaktifkan.** Tujuan yang tampak ada tapi tidak
	 * bisa dipilih mengabarkan pilihan yang sebenarnya tidak pernah ada.
	 */
	sembunyikan?: Set<string>;
}) {
	// Jalur ke pilihan awal dibentangkan sekali saat dialog dibuka, supaya folder
	// yang sedang dibuka tidak tersembunyi di dalam cabang yang tertutup.
	const [terbuka, setTerbuka] = React.useState<Set<string>>(
		() => new Set(jalurFolder(folders, nilai).map((simpul) => simpul.id)),
	);

	const alihkan = (id: string) =>
		setTerbuka((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			if (berikutnya.has(id)) berikutnya.delete(id);
			else berikutnya.add(id);
			return berikutnya;
		});

	const akar = folderAnak(folders, null).filter(
		(folder) => !sembunyikan?.has(folder.id),
	);

	return (
		<div className="max-h-72 overflow-y-auto rounded-md border border-border p-1">
			<BarisPilihan
				label={labelAkar}
				Ikon={HouseIcon}
				kedalaman={0}
				terpilih={nilai === null}
				onPilih={() => onPilih(null)}
			/>

			{akar.map((folder) => (
				<CabangFolder
					key={folder.id}
					folder={folder}
					folders={folders}
					kedalaman={1}
					nilai={nilai}
					onPilih={onPilih}
					terbuka={terbuka}
					onAlihkan={alihkan}
					sembunyikan={sembunyikan}
				/>
			))}

			{akar.length === 0 && (
				<p className="px-2 py-3 text-center text-xs text-muted-foreground">
					Belum ada folder di perpustakaan ini.
				</p>
			)}
		</div>
	);
}

/** Satu folder beserta anaknya, dirender ulang untuk tiap tingkat. */
function CabangFolder({
	folder,
	folders,
	kedalaman,
	nilai,
	onPilih,
	terbuka,
	onAlihkan,
	sembunyikan,
}: {
	folder: EvidenceFolderEntity;
	folders: EvidenceFolderEntity[];
	kedalaman: number;
	nilai: string | null;
	onPilih: (id: string | null) => void;
	terbuka: Set<string>;
	onAlihkan: (id: string) => void;
	sembunyikan?: Set<string>;
}) {
	const anak = folderAnak(folders, folder.id).filter(
		(kandidat) => !sembunyikan?.has(kandidat.id),
	);
	const mekar = terbuka.has(folder.id);

	return (
		<>
			<BarisPilihan
				label={folder.nama}
				Ikon={mekar ? FolderOpenIcon : FolderIcon}
				kedalaman={kedalaman}
				terpilih={nilai === folder.id}
				onPilih={() => onPilih(folder.id)}
				punyaAnak={anak.length > 0}
				mekar={mekar}
				onAlihkan={() => onAlihkan(folder.id)}
			/>

			{mekar &&
				anak.map((kandidat) => (
					<CabangFolder
						key={kandidat.id}
						folder={kandidat}
						folders={folders}
						kedalaman={kedalaman + 1}
						nilai={nilai}
						onPilih={onPilih}
						terbuka={terbuka}
						onAlihkan={onAlihkan}
						sembunyikan={sembunyikan}
					/>
				))}
		</>
	);
}

/**
 * Satu baris pemilih. Tombol mekar berdiri sendiri di dalam baris yang juga
 * tombol — bersarang tidak boleh, jadi keduanya bersebelahan dan hanya barisnya
 * yang melebar penuh.
 */
function BarisPilihan({
	label,
	Ikon,
	kedalaman,
	terpilih,
	onPilih,
	punyaAnak = false,
	mekar = false,
	onAlihkan,
}: {
	label: string;
	Ikon: React.ComponentType<{ className?: string; weight?: 'fill' }>;
	kedalaman: number;
	terpilih: boolean;
	onPilih: () => void;
	punyaAnak?: boolean;
	mekar?: boolean;
	onAlihkan?: () => void;
}) {
	return (
		<div
			className="flex items-center"
			style={{ paddingLeft: `${kedalaman * 1.15}rem` }}
		>
			{punyaAnak && onAlihkan ? (
				<button
					type="button"
					onClick={onAlihkan}
					aria-label={mekar ? `Tutup ${label}` : `Buka ${label}`}
					aria-expanded={mekar}
					className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
				>
					{mekar ? (
						<CaretDownIcon className="size-3.5" />
					) : (
						<CaretRightIcon className="size-3.5" />
					)}
				</button>
			) : (
				// Ruang kosong selebar tombolnya, supaya nama folder tanpa anak tetap
				// sejajar dengan yang punya anak.
				<span className="size-6 shrink-0" aria-hidden="true" />
			)}

			<button
				type="button"
				onClick={onPilih}
				aria-pressed={terpilih}
				className={cn(
					'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
					terpilih ? 'bg-primary/10 font-medium' : 'hover:bg-accent',
				)}
			>
				<Ikon weight="fill" className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate">{label}</span>
				{terpilih && <CheckIcon className="ml-auto size-4 shrink-0 text-primary" />}
			</button>
		</div>
	);
}
