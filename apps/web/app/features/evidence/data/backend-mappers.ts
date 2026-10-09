import {
	type EvidenceEntity,
	type EvidenceOwnerType,
	type EvidenceStatus,
} from '../domain/entities/evidence.entity';

/** Bentuk baris `GET/POST /bukti-dukung` — nama kolom asli NestJS/Prisma. */
export type BuktiDukungApiRow = {
	id: string;
	ownerType: EvidenceOwnerType;
	tenantId: string | null;
	studyProgramId: string | null;
	documentName: string;
	fileUrl: string;
	fileType: string;
	sizeBytes: number;
	extractionStatus: EvidenceStatus;
	failureNote: string | null;
	uploadedByUserId: string;
	uploadedByName: string;
	uploadedAt: string;
	folderId: string | null;
	/** Tahun/periode LKPS; `null` untuk Bukti Dukung. Baris lama bisa tidak memuatnya sama sekali. */
	period?: string | null;
};

/**
 * `studyProgram.name` tidak ikut di-join backend (`bukti-dukung.service.ts`
 * cuma menyimpan `studyProgramId`) — `studyProgramName` selalu `null` di sini.
 * Satu-satunya tempat yang benar-benar menampilkannya (Detail Panel, level
 * PROGRAM_STUDI) jatuh ke placeholder "-", bukan nama karangan.
 */
export function mapBuktiDukungToEvidence(row: BuktiDukungApiRow): EvidenceEntity {
	return {
		id: row.id,
		ownerTipe: row.ownerType,
		tenantId: row.ownerType === 'TENANT' ? row.tenantId : null,
		studyProgramId: row.studyProgramId,
		studyProgramName: null,
		folderId: row.folderId,
		namaDokumen: row.documentName,
		fileUrl: row.fileUrl,
		tipeFile: row.fileType,
		ukuranBytes: row.sizeBytes,
		status: row.extractionStatus,
		catatanGagal: row.failureNote,
		periode: row.period ?? null,
		uploadedByUserId: row.uploadedByUserId,
		uploadedByName: row.uploadedByName,
		waktuDiunggah: row.uploadedAt,
	};
}
