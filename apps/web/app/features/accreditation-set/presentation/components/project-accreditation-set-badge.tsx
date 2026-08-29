import { WarningIcon } from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { useProjectAccreditationSet } from '../hooks/use-project-accreditation-set';

/**
 * Penanda ringkas acuan penilaian, dipasang sebaris dengan judul halaman.
 *
 * Hanya menyatakan, tidak melakukan apa pun: memilih dan mengganti acuan
 * dikerjakan di kartu detail pada kolom kanan. Pembagiannya begitu karena
 * pertanyaan "dokumen ini dinilai dengan apa" muncul setiap kali halaman dibuka,
 * sedangkan "ganti acuannya" muncul sekali seumur dokumen.
 *
 * Bentuknya lencana, mengikuti status bab dan status set — bukan kartu
 * berbingkai, yang untuk satu potong teks sependek ini jadi terlalu banyak
 * perabot dan berebut perhatian dengan judul di sebelahnya.
 */
export function ProjectAccreditationSetBadge({
	project,
}: {
	project: LedProjectEntity;
}) {
	const { set } = useProjectAccreditationSet(project);

	const gaya = cn(
		'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
		set
			? 'border-border bg-muted text-muted-foreground'
			: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
	);

	if (!set) {
		return (
			<span className={gaya} title="Acuan penilaian dipilih di kartu Acuan Penilaian">
				<WarningIcon className="size-3.5 shrink-0" />
				Akreditasi belum dipilih
			</span>
		);
	}

	return (
		<span className={gaya} title={`${set.lembaga} · siklus ${set.tahunSiklus}`}>
			{set.nama}
		</span>
	);
}
