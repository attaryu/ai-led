-- Hand-written rename migration (DB naming cleanup, group 1: org_*).
-- `prisma migrate dev` cannot generate this: renaming a table + several
-- columns at once with existing data is indistinguishable, to its diff
-- engine, from DROP + CREATE (which would be data loss). Every statement
-- below is a pure RENAME, matching schema.prisma's Tenant/User/StudyProgram.

-- Tenant -> org_tenants
ALTER TABLE "tenant" RENAME TO "org_tenants";
ALTER TABLE "org_tenants" RENAME COLUMN "nama_universitas" TO "university_name";

-- User -> org_users
ALTER TABLE "user" RENAME TO "org_users";
ALTER TABLE "org_users" RENAME COLUMN "program_studi_id" TO "study_program_id";
ALTER TABLE "org_users" RENAME COLUMN "nama_lengkap" TO "full_name";
ALTER TABLE "org_users" RENAME COLUMN "dibuat_pada" TO "created_at";

-- ProgramStudi -> StudyProgram / org_study_programs
ALTER TABLE "program_studi" RENAME TO "org_study_programs";
ALTER TABLE "org_study_programs" RENAME COLUMN "nama" TO "name";
ALTER TABLE "org_study_programs" RENAME COLUMN "kode" TO "code";
ALTER TABLE "org_study_programs" RENAME COLUMN "jenjang" TO "level";
ALTER TABLE "org_study_programs" RENAME COLUMN "fakultas" TO "faculty";
ALTER TABLE "org_study_programs" RENAME COLUMN "ketua_prodi" TO "program_head";
ALTER TABLE "org_study_programs" RENAME COLUMN "peringkat_akreditasi" TO "accreditation_rank";
ALTER TABLE "org_study_programs" RENAME COLUMN "nomor_sk_akreditasi" TO "accreditation_decree_number";
ALTER TABLE "org_study_programs" RENAME COLUMN "berlaku_sampai_akreditasi" TO "accreditation_valid_until";
ALTER TABLE "org_study_programs" RENAME COLUMN "dibuat_pada" TO "created_at";

-- Ripple: FK columns on dependent tables that reference org_study_programs.
-- These tables' own rename (dokumen_led, bukti_dukung -> writing_*/evidence_*)
-- happens in later group migrations; only the FK column name changes here.
ALTER TABLE "dokumen_led" RENAME COLUMN "program_studi_id" TO "study_program_id";
ALTER TABLE "bukti_dukung" RENAME COLUMN "program_studi_id" TO "study_program_id";
