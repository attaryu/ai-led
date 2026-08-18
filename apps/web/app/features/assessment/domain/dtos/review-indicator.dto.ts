import { z } from 'zod';

import { assessmentVerdictSchema } from '../entities/assessment-verdict.entity';

/**
 * Bekal menyimpan satu keputusan Penjamin Mutu — menyetujui maupun mengoreksi.
 *
 * `.pick()` dari entitas, jadi pesan validasinya datang dari sana dan tidak
 * perlu ditulis dua kali.
 *
 * `skorMesinSaatDitinjau` dan `sesiIdSaatDitinjau` **tidak** diminta pemanggil
 * walau keduanya ada di entitas: repository yang mengisinya dari sesi yang sedang
 * dibuka. Kalau formulir yang menyetorkannya, dua nilai yang harus bersesuaian —
 * skor mesin dan sesi asalnya — bisa dikirim tidak sepasang, dan penanda "sudah
 * basi" akan berbohong tanpa ada yang bisa menangkapnya.
 *
 * Tidak ada field status maupun "menyetujui atau mengoreksi": keduanya diturunkan
 * dari perbandingan `skorFinal` dan snapshot skor mesin terhadap hasil yang
 * berlaku (lihat `statusTinjauDari` dan `mengubahSkor`).
 */
export const reviewIndicatorSchema = assessmentVerdictSchema.pick({
	dokumenId: true,
	indikatorNo: true,
	skorFinal: true,
	catatan: true,
	ditinjauOlehUserId: true,
	ditinjauOlehNama: true,
});

export type ReviewIndicatorDto = z.infer<typeof reviewIndicatorSchema>;
