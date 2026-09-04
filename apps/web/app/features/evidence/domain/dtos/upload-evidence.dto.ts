import { z } from 'zod';

import { evidenceSchema } from '../entities/evidence.entity';

/**
 * Target satu batch unggahan — satu pilihan berlaku untuk seluruh berkas dalam
 * batch itu (§4.4). Di lapis prodi target dikunci ke prodi yang sedang dibuka,
 * jadi bentuk ini yang sama dipakai kedua halaman.
 *
 * Murni diturunkan dari entity; tidak ada aturan validasi baru yang ditulis di
 * sini selain hubungan antar field yang memang tidak bisa hidup di entity.
 */
export const uploadEvidenceTargetSchema = evidenceSchema
	.pick({ ownerTipe: true, studyProgramId: true })
	.refine(
		(target) =>
			target.ownerTipe === 'TENANT' ? true : Boolean(target.studyProgramId),
		{
			message: 'Program studi wajib dipilih untuk unggahan level prodi',
			path: ['studyProgramId'],
		},
	);

export type UploadEvidenceTargetDto = z.infer<typeof uploadEvidenceTargetSchema>;
