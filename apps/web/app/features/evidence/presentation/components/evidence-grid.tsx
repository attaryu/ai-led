import { type EvidenceEntity } from '../../domain/entities/evidence.entity';
import { EvidenceCard } from './evidence-card';

/** Tampilan kartu; datanya sudah dipotong per halaman oleh repository. */
export function EvidenceGrid({
	items,
	showOwner,
	canDelete,
	canRetry,
	onOpen,
	onDelete,
	onRetry,
}: {
	items: EvidenceEntity[];
	showOwner: boolean;
	canDelete: (evidence: EvidenceEntity) => boolean;
	canRetry: (evidence: EvidenceEntity) => boolean;
	onOpen: (evidence: EvidenceEntity) => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
}) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{items.map((evidence) => (
				<EvidenceCard
					key={evidence.id}
					evidence={evidence}
					showOwner={showOwner}
					canDelete={canDelete(evidence)}
					canRetry={canRetry(evidence)}
					onOpen={onOpen}
					onDelete={onDelete}
					onRetry={onRetry}
				/>
			))}
		</div>
	);
}
