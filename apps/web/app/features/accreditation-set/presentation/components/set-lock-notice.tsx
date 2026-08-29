import { LockSimpleIcon } from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import { type SetLock } from '../../domain/entities/accreditation-set.entity';

/**
 * Kenapa sebuah set tidak bisa diubah lagi.
 *
 * Selalu ditampilkan berdampingan dengan kontrol yang hilang, bukan sebagai
 * pesan yang baru muncul saat disimpan: tombol yang lenyap tanpa keterangan
 * terbaca seperti fitur yang rusak, dan pengguna tidak punya cara menebak bahwa
 * penyebabnya keputusan yang ia ambil sendiri kemarin.
 */
export function SetLockNotice({
	lock,
	className,
}: {
	lock: SetLock;
	className?: string;
}) {
	if (!lock.alasan) return null;

	return (
		<div
			className={cn(
				'flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground',
				className,
			)}
		>
			<LockSimpleIcon className="mt-0.5 size-4 shrink-0" />
			<p>{lock.alasan}</p>
		</div>
	);
}
