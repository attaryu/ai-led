import { z } from 'zod';
import { accreditationSetSchema } from '../entities/accreditation-set.entity';

/**
 * Identitas set saja, sama seperti saat dibuat. Daftar berkas punya jalurnya
 * sendiri (unggah dan hapus per slot) supaya formulir identitas tidak ikut
 * menimpanya, dan `status` berpindah lewat aksi tersendiri, bukan lewat
 * formulir ini.
 */
export const updateAccreditationSetSchema = accreditationSetSchema.pick({
	nama: true,
	lembaga: true,
	tahunSiklus: true,
});

export type UpdateAccreditationSetDto = z.infer<
	typeof updateAccreditationSetSchema
>;
