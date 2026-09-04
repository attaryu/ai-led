import { CheckIcon, MinusIcon } from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import {
	SET_DOCUMENT_TYPES,
	SET_DOCUMENT_TYPE_LABEL,
	deriveSetCompleteness,
	type AccreditationSetEntity,
} from '../../domain/entities/accreditation-set.entity';

/**
 * Kelengkapan berkas satu set sebagai tiga penanda berdampingan, supaya
 * pertanyaan "set ini kurang apa" terjawab dari daftar tanpa membuka detailnya
 * satu per satu.
 *
 * Memakai ikon plus `title`, bukan sekadar warna: perbedaan terisi dan kosong
 * tidak boleh hanya bersandar pada warna.
 */
export function SetCompletenessCell({ set }: { set: AccreditationSetEntity }) {
	const { terisi, lengkap } = deriveSetCompleteness(set);

	return (
		<div className="flex items-center gap-1.5">
			{SET_DOCUMENT_TYPES.map((tipe) => {
				const ada = terisi.includes(tipe);
				const label = SET_DOCUMENT_TYPE_LABEL[tipe];

				return (
					<span
						key={tipe}
						title={ada ? `${label}: sudah ada` : `${label}: belum diunggah`}
						className={cn(
							'flex size-5 items-center justify-center rounded-full border text-[10px]',
							ada
								? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
								: 'border-border text-muted-foreground',
						)}
					>
						{ada ? (
							<CheckIcon className="size-3" weight="bold" />
						) : (
							<MinusIcon className="size-3" weight="bold" />
						)}
					</span>
				);
			})}
			<span className="ml-1 text-xs text-muted-foreground">
				{lengkap ? 'Lengkap' : `${terisi.length}/${SET_DOCUMENT_TYPES.length}`}
			</span>
		</div>
	);
}
