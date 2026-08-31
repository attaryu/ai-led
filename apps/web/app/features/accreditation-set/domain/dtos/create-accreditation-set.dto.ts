import { z } from 'zod';
import { accreditationSetSchema } from '../entities/accreditation-set.entity';

/**
 * Identitas set saja. `status` dan `dokumen` tidak ikut: set selalu lahir
 * sebagai draf tanpa berkas, lalu berkasnya diunggah dari halaman detail.
 */
export const createAccreditationSetSchema = accreditationSetSchema.pick({
	nama: true,
	lembaga: true,
	tahunSiklus: true,
});

export type CreateAccreditationSetDto = z.infer<
	typeof createAccreditationSetSchema
>;
