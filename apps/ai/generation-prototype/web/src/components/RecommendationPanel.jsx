import { useEffect, useState } from "react";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import UploadZone from "./UploadZone.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

/* Isi tab "Dokumen Pendukung" (SectionInfoPane.jsx) -- alur Document
 * Recommendation. Menampilkan kartu jenis dokumen hasil kesimpulan LLM
 * (read-only, TETAP ada setelah confirm/narasi jadi -- tidak dihapus lagi),
 * lalu user memilih dari dokumen yang sudah ada dan/atau mengunggah dokumen
 * baru. Tombol berlabel "Konfirmasi & Tulis Narasi" (generate pertama kali)
 * atau "Regenerate" (kalau section SUDAH punya draft -- openVersion terisi)
 * -- Regenerate menimpa versi yg SEDANG DIBUKA di panel tengah (bukan bikin
 * versi baru). Kalau ada file terpilih yg masih pending/processing,
 * tampilkan modal peringatan dulu sebelum lanjut. */
export default function RecommendationPanel({ dokumenId, sectionId, recommendation, openVersion }) {
  const model        = useStore((s) => s.model);
  const docList       = useStore((s) => s.docList);
  const setDocList    = useStore((s) => s.setDocList);
  const pushToast     = useStore((s) => s.pushToast);
  const updateToast   = useStore((s) => s.updateToast);
  const removeToast   = useStore((s) => s.removeToast);
  const setSectionDetail        = useStore((s) => s.setSectionDetail);
  const setSections             = useStore((s) => s.setSections);
  const setOpenVersion          = useStore((s) => s.setOpenDraftVersion);
  const markGenerating          = useStore((s) => s.markGenerating);
  const setRecommendationStatus     = useStore((s) => s.setRecommendationStatus);
  const setConfirmedBuktiDukungIds  = useStore((s) => s.setConfirmedBuktiDukungIds);

  const [selected, setSelected] = useState({});   // { [buktiDukungId]: true }
  const [confirming, setConfirming] = useState(false);
  const [pendingWarning, setPendingWarning] = useState(null); // { pendingFiles, readyIds }

  // Poll GET /documents tiap 4 detik SELAMA ada file yg masih pending/
  // processing -- tanpa ini, status ekstraksi baru ter-update setelah user
  // reload manual/pindah section (fetch sebelumnya cuma sekali saat mount).
  // Berhenti otomatis begitu semua file di evidenceDocs sudah 'done'/'failed'
  // (dicek tiap tick, bukan cuma sekali), supaya tidak polling selamanya.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    function tick() {
      api.listDocuments()
        .then((fresh) => {
          if (cancelled) return;
          setDocList(fresh);
          const stillInFlight = fresh.some(
            (d) => d.kind === "evidence" && (d.status === "pending" || d.status === "processing"),
          );
          if (stillInFlight) {
            timer = setTimeout(tick, 4000);
          }
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(tick, 4000);
        });
    }

    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Checklist file PERSISTEN: begitu rekomendasi (server) berubah -- baik
  // krn baru pertama dimuat, ganti section, refresh halaman, ATAU narasi
  // sudah jadi -- inisialisasi ulang checkbox dari selected_bukti_dukung_ids
  // yg tersimpan di DB (bukan lagi murni state lokal yg hilang stlh reload).
  useEffect(() => {
    const ids = recommendation?.selected_bukti_dukung_ids || [];
    setSelected(Object.fromEntries(ids.map((id) => [id, true])));
  }, [recommendation?.recommendation_id, recommendation?.selected_bukti_dukung_ids]);

  const recommendationCards = recommendation?.recommendation_items || [];
  // Card TETAP disimpan server-side setelah confirm (tidak dihapus lagi) --
  // jadi kosong beneran cuma berarti rekomendasi gagal/tidak lengkap.
  const recFailed = recommendationCards.length === 0;
  const recommendationReady = recommendationCards.length > 0;
  // Draft yg sedang dibuka SUDAH terisi narasi -- tombol jadi "Regenerate",
  // menimpa versi yg SEDANG DIBUKA. Draft kosong (status='EMPTY', termasuk
  // yg baru dibuat via Rekomendasikan Dokumen) TETAP "Konfirmasi & Tulis
  // Narasi" krn ini pengisian pertama, bukan regenerasi.
  const isRegenerate = !!openVersion && openVersion.status === "FILLED";
  // Pedoman/Rubrik ("intruction/") & LKPS ("data/") bukan evidence -- jangan
  // ikut tampil di picker "dokumen yang sudah ada" (itu sumber referensi,
  // bukan bukti dukung yg dipilih user per section).
  const evidenceDocs = docList.filter((f) => f.kind === "evidence");

  function toggleFile(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  async function confirmAndGenerate(buktiDukungIds) {
    setConfirming(true);
    try {
      await api.confirmRecommendation(dokumenId, sectionId, recommendation.recommendation_id, buktiDukungIds, []);
      setConfirmedBuktiDukungIds(buktiDukungIds);
      setRecommendationStatus(sectionId, "confirmed");

      markGenerating(sectionId, true);
      const tid = pushToast({
        kind: "progress",
        title: isRegenerate ? `Regenerate ${sectionId}…` : `Generate ${sectionId}…`,
        message: "Menjalankan pipeline RAG…",
      });
      try {
        // draft_id SELALU dikirim -- Rekomendasikan Dokumen sudah membuat
        // (atau reuse) draft sejak awal, jadi openVersion.id selalu ada di
        // titik ini (baik utk isi pertama kali/EMPTY maupun Regenerate/FILLED).
        await api.generate(dokumenId, sectionId, model, false, buktiDukungIds, null,
                            openVersion?.id ?? null);
        const fresh = await api.getSection(dokumenId, sectionId, model);
        setSectionDetail(fresh);
        const freshList = await api.listSections(dokumenId, model);
        setSections(freshList);
        // WAJIB refresh openDraftVersion (bukan cuma sectionDetail/sections) --
        // DocumentPane.jsx menampilkan narasi berdasarkan openVersion.status/
        // draft_text, BUKAN sectionDetail. Tanpa ini, UI tetap menampilkan
        // "Draft ini masih kosong" walau generate sudah selesai di backend
        // (openVersion di store masih snapshot lama status='EMPTY').
        if (openVersion?.id) {
          const full = await api.getDraftVersion(dokumenId, sectionId, openVersion.id);
          setOpenVersion({ ...full, _section_id: sectionId });
        }
        updateToast(tid, {
          kind: "success",
          title: isRegenerate ? "Regenerate selesai" : "Generate selesai",
          message: `Section ${sectionId} siap dibaca.`,
          duration: 4500,
        });
        setTimeout(() => removeToast(tid), 4500);
      } catch (e) {
        updateToast(tid, { kind: "error", title: "Generate gagal", message: e.message, duration: 7000 });
        setTimeout(() => removeToast(tid), 7000);
      } finally {
        markGenerating(sectionId, false);
      }
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal konfirmasi", message: e.message });
    } finally {
      setConfirming(false);
    }
  }

  function handleConfirm() {
    const buktiDukungIds = Object.keys(selected).filter((id) => selected[id]);
    const pendingFiles = evidenceDocs.filter(
      (f) => buktiDukungIds.includes(f.id) && f.status !== "done",
    );
    if (pendingFiles.length > 0) {
      setPendingWarning({ pendingFiles, allIds: buktiDukungIds });
      return;
    }
    confirmAndGenerate(buktiDukungIds);
  }

  return (
    <div className="p-5 space-y-5">
      {recommendation?.lkps_needed && (
        <p className="text-xs text-slate-500">
          Data LKPS {recommendation.lkps_sufficient ? "sudah cukup" : "perlu bukti pendukung tambahan"} untuk subbab ini.
        </p>
      )}

      <div>
        <h4 className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
          Dokumen yang direkomendasikan
        </h4>
        {recFailed && (
          <p className="text-sm text-rose-500">
            Rekomendasi ini tidak lengkap (kartu kosong). Klik "Rekomendasikan Ulang" di panel tengah untuk mencoba lagi.
          </p>
        )}
        <div className="space-y-2">
          {recommendationCards.map((it, i) => (
            <div key={i} className="ring-1 ring-slate-200 rounded-lg px-3 py-2.5">
              <p className="text-sm font-medium text-slate-700">{it.label}</p>
              {it.reason && (
                <p className="text-xs text-slate-500 mt-0.5">{it.reason}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {recommendationReady && (
        <>
          <div>
            <h4 className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
              Pilih dokumen yang sudah ada
            </h4>
            {evidenceDocs.length === 0 && (
              <p className="text-sm text-slate-400">Belum ada dokumen — silakan unggah di bawah.</p>
            )}
            <div className="ring-1 ring-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {evidenceDocs.map((f) => (
                <label key={f.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!selected[f.id]}
                    onChange={() => toggleFile(f.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 truncate flex-1">{f.nama_dokumen}</span>
                  <span className="text-[10px] text-slate-400">{f.status}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
              Atau unggah dokumen baru
            </h4>
            <div className="ring-1 ring-slate-200 rounded-lg">
              <UploadZone />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              {Object.values(selected).filter(Boolean).length} file dipilih
            </span>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {confirming
                ? (isRegenerate ? "Meregenerasi…" : "Memproses…")
                : (isRegenerate ? "Regenerate" : "Konfirmasi & Tulis Narasi")}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pendingWarning}
        title="Ada file yang masih diproses"
        message={
          pendingWarning && (
            <>
              File berikut belum selesai diproses, isinya belum bisa dipakai narasi:
              <ul className="list-disc list-inside mt-1.5">
                {pendingWarning.pendingFiles.map((f) => (
                  <li key={f.id} className="truncate">{f.nama_dokumen}</li>
                ))}
              </ul>
              <p className="mt-2">Lanjutkan tanpa file ini, atau batal &amp; tunggu sampai selesai?</p>
            </>
          )
        }
        confirmText="Lanjutkan tanpa file pending"
        cancelText="Batal"
        tone="primary"
        onConfirm={() => {
          const pendingIds = new Set(pendingWarning.pendingFiles.map((f) => f.id));
          const readyIds = pendingWarning.allIds.filter((id) => !pendingIds.has(id));
          setPendingWarning(null);
          confirmAndGenerate(readyIds);
        }}
        onCancel={() => setPendingWarning(null)}
      />
    </div>
  );
}
