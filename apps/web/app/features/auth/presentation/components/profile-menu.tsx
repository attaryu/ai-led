import * as React from 'react';
import { DotsThreeVerticalIcon, SignOutIcon } from '@phosphor-icons/react';
import { useNavigate } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/core/components/ui/dropdown-menu';
import { cn } from '~/core/lib/utils';
import { sessionRepository } from '../../data/repositories/session.repository';

/**
 * Menu "aksi lain" milik identitas user, dipakai card profil sidebar maupun
 * header Editor Bab.
 *
 * Dipisah dari kedua pemanggilnya karena keluar adalah satu-satunya jalan
 * mengakhiri sesi: kalau markup-nya disalin, cepat atau lambat salah satu
 * salinan tertinggal saat autentikasi sungguhan menggantikan `navigate`.
 */
export function ProfileMenu({
	/** `top` untuk pemanggil yang menempel di dasar layar (card sidebar). */
	side = 'bottom',
	render,
}: {
	side?: 'top' | 'bottom' | 'right';
	/**
	 * Pemicu pengganti tombol titik tiga. Dipakai sidebar yang menciut, di mana
	 * avatar itu sendiri yang jadi pemicunya — tombol kedua di sebelah avatar
	 * tidak muat di rel 64 px, dan menghilangkannya tanpa pengganti berarti
	 * satu-satunya jalan keluar dari aplikasi ikut hilang.
	 */
	render?: React.ReactElement<Record<string, unknown>>;
}) {
	const navigate = useNavigate();

	return (
		<DropdownMenu>
			{render ? (
				<DropdownMenuTrigger render={render} />
			) : (
				<DropdownMenuTrigger
					aria-label="Aksi lain"
					className={cn(
						buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
						'size-7 shrink-0 cursor-pointer',
					)}
				>
					<DotsThreeVerticalIcon className="size-4" />
				</DropdownMenuTrigger>
			)}

			{/*
			 * Lebarnya dipaksa: bawaan `DropdownMenuContent` adalah
			 * `w-(--anchor-width)`, yang di sini berarti selebar tombol titik tiga.
			 */}
			<DropdownMenuContent
				side={side}
				align="end"
				sideOffset={8}
				className="w-48 bg-popover"
			>
				<DropdownMenuItem
					className="cursor-pointer text-destructive"
					// Sesinya masih mock di localStorage, tapi tetap harus dihapus:
					// landing page membedakan tamu dari pengguna yang sudah masuk lewat
					// ada tidaknya sesi tersimpan. Begitu autentikasi asli jalan,
					// penghapusan token masuk ke `clear()` yang sama.
					onClick={() => {
						sessionRepository.clear();
						navigate('/login');
					}}
				>
					<SignOutIcon className="size-4" />
					Keluar
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
