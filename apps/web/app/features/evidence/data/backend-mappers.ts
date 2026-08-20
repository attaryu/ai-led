import {
	type EvidenceEntity,
	type EvidenceOwnerType,
	type EvidenceStatus,
} from '../domain/entities/evidence.entity';

/** Bentuk baris `GET/POST /bukti-dukung` — nama kolom asli NestJS/Prisma. */
export type BuktiDukungApiRow = {
	id: string;
	ownerTipe: EvidenceOwnerType;
	tenantId: string | null;
	programStudiId: string | null;
	namaDokumen: string;
	fileUrl: string;
	tipeFile: string;
	ukuranBytes: number;
	statusEkstraksi: EvidenceStatus;
	catatanGagal: string | null;
	diunggahOlehUserId: string;
	diunggahOlehNama: string;
	waktuDiunggah: string;
};

/**
 * `programStudi.nama` tidak ikut di-join backend (`bukti-dukung.service.ts`
 * cuma menyimpan `programStudiId`) — `studyProgramName` selalu `null` di sini.
 * Satu-satunya tempat yang benar-benar menampilkannya (Detail Panel, level
 * PROGRAM_STUDI) jatuh ke placeholder "-", bukan nama karangan.
 */
export function mapBuktiDukungToEvidence(row: BuktiDukungApiRow): EvidenceEntity {
	return {
		id: row.id,
		ownerTipe: row.ownerTipe,
		tenantId: row.ownerTipe === 'TENANT' ? row.tenantId : null,
		studyProgramId: row.programStudiId,
		studyProgramName: null,
		namaDokumen: row.namaDokumen,
		fileUrl: row.fileUrl,
		tipeFile: row.tipeFile,
		ukuranBytes: row.ukuranBytes,
		status: row.statusEkstraksi,
		catatanGagal: row.catatanGagal,
		uploadedByUserId: row.diunggahOlehUserId,
		uploadedByName: row.diunggahOlehNama,
		waktuDiunggah: row.waktuDiunggah,
	};
}
