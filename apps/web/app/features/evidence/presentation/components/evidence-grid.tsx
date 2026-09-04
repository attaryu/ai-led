import { type EvidenceEntity } from '../../domain/entities/evidence.entity';
import { type EvidenceNode } from '../../domain/entities/evidence-folder.entity';
import { EvidenceCard } from './evidence-card';
import { EvidenceFolderCard } from './evidence-folder-card';

/**
 * Tampilan kartu; datanya sudah dipotong per halaman oleh repository, dan folder
 * sudah diurutkan di depan berkas di sana — grid ini tidak menyusun ulang apa
 * pun, hanya memilih kartu mana yang dirender per baris.
 */
export function EvidenceGrid({
	items,
	showOwner,
	canManage,
	canDelete,
	canRetry,
	terpilih,
	onPilih,
	onBukaFolder,
	onOpen,
	onDelete,
	onRetry,
	onGantiNama,
	onPindahkan,
	onHapusFolder,
}: {
	items: EvidenceNode[];
	showOwner: boolean;
	canManage: boolean;
	canDelete: (evidence: EvidenceEntity) => boolean;
	canRetry: (evidence: EvidenceEntity) => boolean;
	terpilih: Set<string>;
	onPilih: (id: string, aktif: boolean) => void;
	onBukaFolder: (id: string) => void;
	onOpen: (evidence: EvidenceEntity) => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
	onGantiNama: (node: EvidenceNode) => void;
	onPindahkan: (node: EvidenceNode) => void;
	onHapusFolder: (node: EvidenceNode) => void;
}) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{items.map((node) =>
				node.tipe === 'FOLDER' ? (
					<EvidenceFolderCard
						key={node.id}
						folder={node.folder}
						jumlahBerkas={node.jumlahBerkas}
						jumlahPerluPerhatian={node.jumlahPerluPerhatian}
						terpilih={terpilih.has(node.id)}
						canManage={canManage}
						onBuka={() => onBukaFolder(node.id)}
						onPilih={(aktif) => onPilih(node.id, aktif)}
						onGantiNama={() => onGantiNama(node)}
						onPindahkan={() => onPindahkan(node)}
						onHapus={() => onHapusFolder(node)}
					/>
				) : (
					<EvidenceCard
						key={node.id}
						evidence={node.evidence}
						jalur={node.jalur}
						showOwner={showOwner}
						canManage={canManage}
						canDelete={canDelete(node.evidence)}
						canRetry={canRetry(node.evidence)}
						terpilih={terpilih.has(node.id)}
						onPilih={(aktif) => onPilih(node.id, aktif)}
						onOpen={onOpen}
						onDelete={onDelete}
						onRetry={onRetry}
						onPindahkan={() => onPindahkan(node)}
					/>
				),
			)}
		</div>
	);
}
