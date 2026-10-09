-- Hierarki rubrik: tiga tingkat di ATAS indikator, dari ekstraksi
-- ekstrak_mineru_rubrik.ipynb (contoh keluaran: rubrik_hierarki.json).
--
-- Matriks LAM Teknik punya empat tingkat:
--   A. KRITERIA                        <- kelompok     (2 nilai unik)
--   └─ IV. Sumber Daya Manusia         <- kriteria     (7 nilai unik, romawi)
--       └─ 4.1 Profil Dosen ...        <- IKU          (8 nilai unik, bernomor N.N)
--           └─ Profil Dosen            <- sub_kriteria (46 nilai, kolom "Kriteria")
--               └─ no.26 Kecukupan ... <- indikator    (rubric_criteria)
--
-- Tiga tingkat teratas masuk tabel ini sebagai adjacency list (`parent_id`
-- self-FK) -- pola yang sama dipakai sub_bab_templates dan
-- writing_chapter_sections di repo ini, jadi kedalamannya tidak dipatok dan
-- tidak ada kolom level/path yang perlu dijaga konsisten.
--
-- sub_kriteria TIDAK ikut ke sini: ia milik baris indikatornya sendiri (teks
-- kolom "Kriteria"), sudah tersimpan di rubric_criteria.criterion_group.
--
-- rubric_criteria.group_id NULL = indikator belum dikelompokkan. Dibuat
-- nullable + ON DELETE SET NULL supaya menghapus pohon grup tidak pernah
-- menghapus kriteria maupun riwayat skornya.

CREATE TABLE "rubric_criterion_groups" (
    "id" TEXT NOT NULL,
    "accreditation_set_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "level" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "marker" TEXT,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubric_criterion_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rubric_criterion_groups_accreditation_set_id_idx"
    ON "rubric_criterion_groups"("accreditation_set_id");
CREATE INDEX "rubric_criterion_groups_parent_id_idx"
    ON "rubric_criterion_groups"("parent_id");

-- Satu label hanya boleh muncul sekali di bawah induk yang sama. Tidak memakai
-- UNIQUE(parent_id, order) karena parent_id NULL (tingkat teratas) membuat
-- constraint unik tidak menjaga apa pun di Postgres -- NULL != NULL. Judul yang
-- sama di induk BERBEDA tetap jadi dua baris, dan itu memang benar: "Profil
-- Dosen dan Tenaga Kependidikan (IKU)" muncul di bawah kriteria III dan IV.
CREATE UNIQUE INDEX "rubric_criterion_groups_parent_label_key"
    ON "rubric_criterion_groups"("accreditation_set_id", COALESCE("parent_id", ''), "label");

ALTER TABLE "rubric_criterion_groups" ADD CONSTRAINT "rubric_criterion_groups_accreditation_set_id_fkey"
    FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rubric_criterion_groups" ADD CONSTRAINT "rubric_criterion_groups_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "rubric_criterion_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: pola yang sama dengan tabel rubrik lain (discope lewat accreditation_set,
-- yang sendirinya sudah ber-tenant_id), jadi tabel ini tidak menyimpan tenant_id.

ALTER TABLE "rubric_criteria" ADD COLUMN "group_id" TEXT;
CREATE INDEX "rubric_criteria_group_id_idx" ON "rubric_criteria"("group_id");
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "rubric_criterion_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- sub_no: sub-indikator komposit (I, II, III) yang di matriks adalah baris
-- TERPISAH dengan rubrik skor masing-masing, tapi tidak punya nomor sendiri --
-- sebelumnya keduanya menyatu jadi satu teks. Lihat `sub_no` di
-- ekstrak_mineru_rubrik.ipynb. NULL = indikator tanpa sub-indikator.
ALTER TABLE "rubric_criteria" ADD COLUMN "sub_no" TEXT;

-- UNIQUE lama (set, indicator_no) tidak lagi memadai: satu indicator_no kini
-- boleh punya beberapa baris, dibedakan sub_no. COALESCE supaya baris tanpa
-- sub-indikator tetap terjaga unik.
DROP INDEX IF EXISTS "rubric_criteria_accreditation_set_id_indicator_no_key";
CREATE UNIQUE INDEX "rubric_criteria_set_indicator_sub_key"
    ON "rubric_criteria"("accreditation_set_id", "indicator_no", COALESCE("sub_no", ''));
