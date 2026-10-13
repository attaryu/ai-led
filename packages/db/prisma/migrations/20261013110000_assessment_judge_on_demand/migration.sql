-- Judge AMI kini dijalankan on-demand, bukan di tengah scoring.
--
-- judge_evidence: cuplikan bukti (<=3000 karakter) yang dilihat penilai, disimpan saat scoring sebagai masukan judge.
--   NULL = baris lama / baris galat; '' = penilai tidak mengambil bukti apa pun.
-- judge_verdict: hasil judge (JSON). NULL = belum dijudge; dikosongkan saat baris dinilai ulang.
ALTER TABLE "assessment_indicator_results" ADD COLUMN "judge_evidence" TEXT;
ALTER TABLE "assessment_indicator_results" ADD COLUMN "judge_verdict" JSONB;
