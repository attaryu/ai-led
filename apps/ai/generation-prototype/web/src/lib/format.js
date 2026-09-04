/** Format durasi (detik, dari backend total_latency_sec) jadi teks singkat
 * spt "45 detik" atau "2 menit 5 detik" -- dipakai di toast sukses
 * rekomendasi/generate supaya user tahu berapa lama proses berjalan. */
export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "";
  const total = Math.round(seconds);
  if (total < 60) return `${total} detik`;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return sec === 0 ? `${min} menit` : `${min} menit ${sec} detik`;
}

/** Persis sama dgn FALLBACK_RECOMMENDATION_TEXT di api/lib/generator.py --
 * SATU-SATUNYA penanda valid bahwa tahap rekomendasi BENAR-BENAR gagal
 * (LLM invoke error / JSON tidak bisa diparse), BUKAN sekadar
 * recommendation_items kosong. Katalog dokumen sekarang closed-set, jadi
 * LLM bisa sah memutuskan "tidak ada dokumen relevan" utk section murni
 * naratif -- items=[] dgn recommendation_text penjelasan itu valid, bukan
 * kegagalan. */
export const FALLBACK_RECOMMENDATION_TEXT =
  "LLM gagal menghasilkan rekomendasi yang valid untuk subbab ini. " +
  'Klik "Rekomendasikan Ulang" untuk mencoba lagi.';

export function recommendationFailed(recommendation) {
  return recommendation?.recommendation_text === FALLBACK_RECOMMENDATION_TEXT;
}
