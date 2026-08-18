-- notes attar.md #2: hapus prodi tidak boleh diam-diam mengosongkan
-- program_studi_id penghuninya (Penyusun) lewat ON DELETE SET NULL — itu
-- membuat pesan error P2003 yang sudah ditangkap ProgramStudiService.remove()
-- tidak pernah menyala untuk user, dan Penyusun berakhir tanpa prodi.

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_program_studi_id_fkey";

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_program_studi_id_fkey" FOREIGN KEY ("program_studi_id") REFERENCES "program_studi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
