import { type Icon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { cn } from '~/core/lib/utils';

/**
 * Tombol ikon toolbar Editor Bab dengan status tertekan.
 *
 * Ditulis di atas `Button` yang sudah ada alih-alih memasang primitif `toggle`
 * atau `toggle-group`, mengikuti preseden pemilih tampilan di
 * `core/components/ui/collection-toolbar.tsx` yang juga memakai `aria-pressed`
 * plus warna primary. Proyek ini belum punya primitif tooltip, jadi `title`
 * (kursor) dan `aria-label` (pembaca layar) yang memberi nama tombolnya.
 */
export function ChapterToolbarButton({
	label,
	icon: IconGlyph,
	active = false,
	disabled = false,
	onClick,
}: {
	label: string;
	icon: Icon;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'cursor-pointer',
				active && 'bg-primary text-primary-foreground hover:bg-primary/80',
			)}
		>
			<IconGlyph className="size-4" />
		</Button>
	);
}
