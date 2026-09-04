import { useEffect, useState } from "react";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import { formatDuration, recommendationFailed } from "../lib/format.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import ProseEditor from "./ProseEditor.jsx";

/* ---------- shared button helper ---------- */

function Btn({ variant = "default", className = "", children, ...props }) {
  const base =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg " +
    "transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50 " +
    "disabled:cursor-not-allowed";
  const VARIANTS = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400",
    danger:  "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400",
    ghost:   "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 focus-visible:ring-slate-400",
    default: "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-400",
  };
  return (
    <button className={`${base} ${VARIANTS[variant] || VARIANTS.default} ${className}`} {...props}>
      {children}
    </button>
  );
}

const STATUS_PILL = {
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300" },
  draft:    { label: "Draft",    cls: "bg-amber-100   text-amber-700   ring-1 ring-amber-300" },
};

/* ----------------------------------------- */

export default function DocumentPane() {
  const dokumenId        = useStore((s) => s.activeDokumenId);
  const activeId         = useStore((s) => s.activeId);
  const model            = useStore((s) => s.model);
  const sectionDetail    = useStore((s) => s.sectionDetail);
  const setSectionDetail = useStore((s) => s.setSectionDetail);
  const setSections      = useStore((s) => s.setSections);
  const pushToast        = useStore((s) => s.pushToast);
  const updateToast      = useStore((s) => s.updateToast);
  const removeToast      = useStore((s) => s.removeToast);

  const recommendation           = useStore((s) => s.recommendation);
  const setRecommendation        = useStore((s) => s.setRecommendation);
  const recommendationStatus     = useStore((s) => s.recommendationStatus);
  const setRecommendationStatus  = useStore((s) => s.setRecommendationStatus);
  const setConfirmedBuktiDukungIds = useStore((s) => s.setConfirmedBuktiDukungIds);
  // Versi draft yg sedang dipilih (diubah dari tab "Draft" panel kanan,
  // SectionInfoPane.jsx -- sibling terpisah, makanya di store global).
  // null = belum ditentukan -> fallback ke draft AKTIF (lihat effect di bawah).
  const selectedDraftId    = useStore((s) => s.selectedDraftId);
  const setSelectedDraftId = useStore((s) => s.setSelectedDraftId);
  // Isi LENGKAP versi yg sedang ditampilkan di panel tengah -- di store
  // (bukan useState lokal) supaya tab Pedoman/Rubric/LKPS/Query di panel
  // KANAN (SectionInfoPane.jsx) ikut baca referensi dari VERSI YANG SAMA.
  const openVersion    = useStore((s) => s.openDraftVersion);
  const setOpenVersion = useStore((s) => s.setOpenDraftVersion);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(null); // ProseMirror doc JSON, bukan string
  const [loading, setLoading]   = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [recommending, setRecommending] = useState(false);

  useEffect(() => {
    if (!activeId) return setSectionDetail(null);
    api.getSection(dokumenId, activeId, model)
      .then(setSectionDetail)
      .catch(() => setSectionDetail(null));
  }, [dokumenId, activeId, model]);

  // Reset pilihan versi tiap pindah section -- versi section sebelumnya
  // tidak relevan lagi.
  useEffect(() => {
    setSelectedDraftId(null);
    setOpenVersion(null);
  }, [activeId, dokumenId, model, setSelectedDraftId, setOpenVersion]);

  // Muat isi versi yg dipilih: kalau user sudah pilih eksplisit (klik card
  // di tab kanan) pakai itu, kalau belum (baru masuk section) fallback ke
  // draft AKTIF (bab_dokumen.checkpoint_aktif_id, lihat listDraftVersions).
  useEffect(() => {
    if (!activeId || !dokumenId) { setOpenVersion(null); return; }
    let cancelled = false;
    async function load() {
      try {
        let draftId = selectedDraftId;
        if (!draftId) {
          const r = await api.listDraftVersions(dokumenId, activeId, model);
          draftId = r.active_draft_id;
        }
        if (!draftId) { if (!cancelled) setOpenVersion(null); return; }
        const full = await api.getDraftVersion(dokumenId, activeId, draftId);
        // Tag section_id asal fetch ini -- dipakai SectionInfoPane.jsx
        // memvalidasi openVersion memang milik activeId SAAT INI sebelum
        // fetch rekomendasi (cegah race: activeId sudah pindah section
        // tapi openVersion masih closure lama dari fetch yg baru resolve).
        if (!cancelled) setOpenVersion({ ...full, _section_id: activeId });
      } catch {
        if (!cancelled) setOpenVersion(null);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumenId, activeId, model, selectedDraftId]);

  async function refreshAfterChange({ backToActive = false, draftId: draftIdOverride } = {}) {
    const fresh = await api.getSection(dokumenId, activeId, model);
    setSectionDetail(fresh);
    const freshList = await api.listSections(dokumenId, model);
    setSections(freshList);
    if (backToActive) setSelectedDraftId(null);
    // Re-trigger effect pemuatan versi (selectedDraftId sama nilainya kalau
    // sudah null, jadi paksa reload manual di sini). draftIdOverride dipakai
    // caller yg BARU SAJA memanggil setSelectedDraftId(x) di baris sebelumnya
    // -- closure `selectedDraftId` di sini MASIH nilai LAMA (setState React
    // async, belum re-render), jadi TIDAK BOLEH diandalkan utk kasus itu.
    // Tanpa override, refreshAfterChange bisa fetch draft yg SALAH (mis.
    // draft yg baru dihapus) sehingga openVersion.id tidak berubah dan
    // SectionInfoPane/RecommendationPanel di panel kanan tidak ikut refresh.
    try {
      let draftId = backToActive ? null : (draftIdOverride !== undefined ? draftIdOverride : selectedDraftId);
      if (!draftId) {
        const r = await api.listDraftVersions(dokumenId, activeId, model);
        draftId = r.active_draft_id;
      }
      if (draftId) {
        const full = await api.getDraftVersion(dokumenId, activeId, draftId);
        setOpenVersion({ ...full, _section_id: activeId });
      } else {
        setOpenVersion(null);
      }
    } catch {
      setOpenVersion(null);
    }
  }

  // Reset state rekomendasi lokal tiap pindah section -- rekomendasi
  // sebelumnya tidak relevan lagi utk section yg baru dipilih. SectionInfoPane
  // yg akan memuat ulang rekomendasi tersimpan (kalau ada) utk section baru.
  useEffect(() => {
    setRecommendation(null);
    setConfirmedBuktiDukungIds([]);
  }, [activeId, setRecommendation, setConfirmedBuktiDukungIds]);

  if (!activeId) {
    return (
      <main className="flex flex-col items-center justify-center text-center p-10 overflow-y-auto bg-slate-50">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600
                        flex items-center justify-center text-white shadow-lg mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Pilih section di sebelah kiri</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Outline LED ada di panel kiri. Klik salah satu BAB/sub-bab untuk melihat draft, evidence, dan hasil judge.
        </p>
      </main>
    );
  }

  const draft = sectionDetail?.drafts?.find((d) => d.model === model);
  const statusPill = STATUS_PILL[draft?.status] || null;
  // Draft "kosong" (baru dibuat via Rekomendasikan Dokumen/Buat Draft Baru,
  // belum ada narasi) vs "terisi" (sudah pernah generate) -- dibedakan dari
  // openVersion.status ('EMPTY'/'FILLED'), BUKAN dari ada/tidaknya baris
  // draft (draft kosong TETAP punya baris bab_dokumen/bab_draft sejak
  // rekomendasi dibuat, lihat generator.py::_save_recommendation).
  const isEmpty = !openVersion || openVersion.status === "EMPTY";

  // Sumber kebenaran tombol header: DATA SERVER (recommendation, hasil
  // GET/POST .../recommend yg selalu men-set section_id match activeId),
  // BUKAN recommendationStatus[activeId] (state client-only yg terbukti
  // bisa nyangkut di 'recommending'/nilai basi lain saat request terputus,
  // reload di tengah jalan, atau race antar effect -- sudah 3x jadi
  // penyebab tombol hilang total). recommendationStatus TETAP dipakai utk
  // hal lain (mis. spinner sesaat proses berjalan), tapi render final di
  // sini murni turunan dari recommendation + recommendationCards.length.
  // Rekomendasi sekarang MILIK draft (bab_draft_id), jadi turut dicocokkan
  // ke openVersion.id -- rekomendasi draft LAIN tidak relevan di sini.
  const activeRecommendation =
    recommendation?.section_id === activeId &&
    recommendation?.bab_draft_id === (openVersion?.id ?? null)
      ? recommendation : null;
  // Kartu kosong (recommendation_items.length === 0) TIDAK SELALU berarti
  // gagal -- katalog dokumen sekarang closed-set, LLM bisa sah memutuskan
  // "tidak ada dokumen relevan" utk section murni naratif. Kegagalan
  // sungguhan ditandai backend via FALLBACK_RECOMMENDATION_TEXT (lihat
  // recommendationFailed() di lib/format.js).
  const activeRecFailed = recommendationFailed(activeRecommendation);
  // 'none'       : draft ini blm pernah punya rekomendasi tersimpan sama sekali
  // 'recommended': ada rekomendasi TAPI gagal (activeRecFailed) ATAU valid (termasuk valid-kosong)
  // 'confirmed'  : rekomendasi sudah dikonfirmasi user (bisa msh 'recommended' scr card kalau backend blm update)
  const recState = !activeRecommendation
    ? "none"
    : activeRecommendation.status === "confirmed"
      ? "confirmed"
      : "recommended";

  async function handleRecommend() {
    const previousStatus = recommendationStatus[activeId] || "none";
    setRecommending(true);
    setRecommendationStatus(activeId, "recommending");
    const tid = pushToast({
      kind: "progress",
      title: `Menganalisis kebutuhan dokumen ${activeId}…`,
    });
    try {
      // Kalau SUDAH ada draft kosong terbuka (retry rekomendasi), reuse --
      // jangan bikin draft kosong kedua yg menumpuk.
      const reuseDraftId = isEmpty && openVersion ? openVersion.id : null;
      const result = await api.recommend(dokumenId, activeId, model, reuseDraftId);
      setRecommendation(result);
      setRecommendationStatus(activeId, "recommended");
      // Rekomendasi baru menggantikan yg lama (backend tandai baris lama
      // 'superseded') -- pilihan file lama tidak lagi relevan.
      setConfirmedBuktiDukungIds([]);
      // Draft (baru atau di-reuse) langsung jadi checkpoint aktif di
      // backend -- pilih & muat isinya (kosong, tapi pedoman/rubric sudah
      // terkait) supaya langsung terlihat di panel tengah.
      setSelectedDraftId(result.bab_draft_id);
      await refreshAfterChange({ draftId: result.bab_draft_id });
      updateToast(tid, {
        kind: "success",
        title: "Rekomendasi siap",
        message: `Tinjau dokumen yang disarankan sebelum menulis narasi. (${formatDuration(result.total_latency_sec)})`,
        duration: 12000,
      });
      setTimeout(() => removeToast(tid), 12000);
    } catch (e) {
      setRecommendationStatus(activeId, previousStatus);
      updateToast(tid, { kind: "error", title: "Gagal merekomendasikan dokumen", message: e.message, duration: 7000 });
      setTimeout(() => removeToast(tid), 7000);
    } finally {
      setRecommending(false);
    }
  }

  // "Buat Draft Baru (Kosong)": bikin bab_draft kosong manual, tanpa lewat
  // alur rekomendasi -- tersedia kapan saja (draft kosong ATAU terisi).
  async function handleCreateEmptyDraft() {
    try {
      const r = await api.createEmptyDraft(dokumenId, activeId, model);
      setSelectedDraftId(r.id);
      await refreshAfterChange({ draftId: r.id });
      pushToast({ kind: "success", title: "Draft baru (kosong) dibuat", message: `Draft ${r.versi} siap direkomendasikan/diisi.` });
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal membuat draft baru", message: e.message });
    }
  }

  async function handleSave() {
    try {
      await api.updateDraft(dokumenId, activeId, model, editText);
      await refreshAfterChange();
      setEditing(false);
      pushToast({ kind: "success", title: "Draft disimpan" });
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal menyimpan", message: e.message });
    }
  }

  async function handleApprove() {
    try {
      await api.approve(dokumenId, activeId, model);
      const fresh = await api.getSection(dokumenId, activeId, model);
      setSectionDetail(fresh);
      const freshList = await api.listSections(dokumenId, model);
      setSections(freshList);
      pushToast({
        kind: "success",
        title: "Section di-approve",
        message: `${activeId} sudah ditandai approved.`,
      });
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal approve", message: e.message });
    }
  }

  // "Simpan Sebagai Draft": salin isi versi yg sedang dibuka jadi versi BARU
  // (bukan generate ulang), TIDAK otomatis jadi aktif.
  async function handleSaveAsNewDraft() {
    if (!openVersion) return;
    try {
      const r = await api.duplicateDraftVersion(dokumenId, activeId, openVersion.id);
      // Draft baru TIDAK otomatis aktif (openVersion yg sedang dibuka tetap
      // sama) -- tapi daftar card versi di tab kanan (SectionInfoPane.jsx)
      // perlu di-refresh supaya Draft baru langsung terlihat, bukan cuma
      // muncul setelah pindah section/reload manual.
      await refreshAfterChange();
      pushToast({ kind: "success", title: "Draft baru disimpan", message: `Draft ${r.versi} dibuat dari versi ini.` });
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal menyimpan draft baru", message: e.message });
    }
  }

  // "Jadikan Draft Aktif": versi yg sedang dibuka (bukan aktif) jadi checkpoint aktif.
  async function handleActivateVersion() {
    if (!openVersion) return;
    try {
      await api.activateDraftVersion(dokumenId, activeId, openVersion.id);
      setSelectedDraftId(openVersion.id);
      await refreshAfterChange({ draftId: openVersion.id });
      pushToast({ kind: "success", title: `Draft ${openVersion.versi} sekarang aktif` });
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal mengaktifkan draft", message: e.message });
    }
  }

  // "Hapus Draft": hapus versi yg sedang dibuka (bukan hapus section
  // sepenuhnya -- itu ada di askDeleteSection di bawah).
  function askDeleteVersion() {
    if (!openVersion) return;
    setConfirmState({
      tone: "danger",
      title: `Hapus Draft ${openVersion.versi}?`,
      message: "Versi draft ini akan dihapus permanen. Aksi ini tidak bisa di-undo.",
      confirmText: "Ya, hapus",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const r = await api.deleteDraftVersion(dokumenId, activeId, openVersion.id);
          setSelectedDraftId(r.new_active_id || null);
          await refreshAfterChange({ backToActive: !r.new_active_id, draftId: r.new_active_id || null });
          if (!r.new_active_id) {
            // Section kembali ke "belum ada draft sama sekali" -- rekomendasi
            // MILIK draft yg baru dihapus ikut ter-CASCADE di DB (lihat
            // bab_document_recommendation.bab_draft_id ON DELETE CASCADE),
            // jadi cukup reset status lokal ke 'none' supaya tombol
            // "Rekomendasikan Dokumen" muncul lagi.
            setRecommendationStatus(activeId, "none");
          }
          pushToast({ kind: "success", title: "Draft dihapus" });
        } catch (e) {
          pushToast({ kind: "error", title: "Gagal hapus draft", message: e.message });
        }
      },
    });
  }

  return (
    <main className="flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                {activeId}
              </span>
              {statusPill && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPill.cls}`}>
                  {statusPill.label}
                </span>
              )}
              {draft && (
                <span className="text-xs text-slate-500">
                  · {draft.model} · {(draft.latency_sec || 0).toFixed(1)}s
                </span>
              )}
            </div>
            <h2 className="font-semibold text-lg whitespace-pre-line leading-tight text-slate-900">
              {sectionDetail?.title || activeId}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isEmpty && recState === "none" && (
              <Btn variant="primary" onClick={handleRecommend} disabled={recommending}>
                {recommending ? <Spinner /> : <Bolt />}
                {recommending ? "Menganalisis…" : "Rekomendasikan Dokumen"}
              </Btn>
            )}
            {isEmpty && recState === "recommended" && !activeRecFailed && (
              <Btn variant="ghost" onClick={handleRecommend} disabled={recommending}
                   title="Analisis ulang kebutuhan dokumen dari awal">
                {recommending ? <Spinner /> : <Refresh />}
                {recommending ? "Menganalisis…" : "Rekomendasikan Ulang"}
              </Btn>
            )}
            {/* Rekomendasi BENAR-BENAR gagal (LLM error/parse gagal, bukan
                sekadar 0 dokumen relevan) -- satu2nya aksi valid adalah retry. */}
            {isEmpty && recState === "recommended" && activeRecFailed && (
              <>
                <span className="text-xs text-rose-500 italic">
                  Rekomendasi sebelumnya tidak lengkap.
                </span>
                <Btn variant="primary" onClick={handleRecommend} disabled={recommending}>
                  {recommending ? <Spinner /> : <Refresh />}
                  {recommending ? "Menganalisis…" : "Rekomendasikan Ulang"}
                </Btn>
              </>
            )}
            {/* Status 'confirmed' tanpa narasi: satu2nya aksi generate adalah
                "Konfirmasi & Tulis Narasi" di panel kanan (tab Dokumen
                Pendukung) -- tidak ada lagi tombol "Tulis Narasi" terpisah
                di sini, cuma retry rekomendasi kalau perlu. */}
            {isEmpty && recState === "confirmed" && (
              <Btn variant="ghost" onClick={handleRecommend} disabled={recommending}
                   title="Analisis ulang kebutuhan dokumen dari awal">
                {recommending ? <Spinner /> : <Refresh />}
                {recommending ? "Menganalisis…" : "Rekomendasikan Ulang"}
              </Btn>
            )}
            {/* Selalu tersedia -- user bisa mulai versi kosong baru kapan
                saja, lepas dari alur rekomendasi. */}
            <Btn variant="ghost" onClick={handleCreateEmptyDraft} disabled={loading}
                 title="Buat versi draft baru yang kosong (tanpa lewat alur rekomendasi)">
              <Plus />
              Buat Draft Baru (Kosong)
            </Btn>
            {!isEmpty && !editing && openVersion && (
              <>
                {!openVersion.is_active && (
                  <span className="text-xs text-amber-600 italic">Melihat versi lama</span>
                )}
                <Btn variant="ghost" onClick={handleSaveAsNewDraft} disabled={loading}
                     title="Salin isi versi ini jadi draft baru (tidak otomatis aktif)">
                  <Copy />
                  Simpan Sebagai Draft
                </Btn>
                {!openVersion.is_active && (
                  <Btn variant="primary" onClick={handleActivateVersion} disabled={loading}>
                    <Check />
                    Jadikan Draft Aktif
                  </Btn>
                )}
                <Btn variant="danger" onClick={askDeleteVersion} disabled={loading} title="Hapus versi draft ini">
                  <Trash />
                  Hapus Draft
                </Btn>
                {openVersion.is_active && (
                  <>
                    <Btn onClick={() => { setEditing(true); setEditText(openVersion.draft_text); }}>
                      <Pencil />
                      Edit
                    </Btn>
                    <Btn variant="success" onClick={handleApprove} disabled={draft?.status === "approved"}>
                      <Check />
                      {draft?.status === "approved" ? "Approved" : "Approve"}
                    </Btn>
                  </>
                )}
              </>
            )}
            {editing && (
              <>
                <Btn variant="primary" onClick={handleSave}>
                  <Check />Save
                </Btn>
                <Btn variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Btn>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Body: SELALU tampilkan 1 versi draft (default = aktif, atau versi
          yg dipilih dari tab "Draft" panel kanan) -- daftar card versi ada
          di panel kanan (SectionInfoPane.jsx), bukan di sini. */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {editing ? (
          <ProseEditor
            content={editText}
            editable={true}
            onChange={setEditText}
            className="w-full min-h-[60vh] border border-slate-300 rounded-xl p-4 bg-white shadow-inner
                       focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-400"
          />
        ) : openVersion && openVersion.status === "FILLED" ? (
          <article className="max-w-4xl bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-200">
            <ProseEditor content={openVersion.draft_text} editable={false} />
          </article>
        ) : openVersion ? (
          <EmptyState
            icon={<Bolt />}
            title="Draft ini masih kosong"
            message='Pilih dokumen di tab "Dokumen Pendukung" lalu klik "Konfirmasi & Tulis Narasi" untuk mengisi draft ini.'
          />
        ) : (
          <EmptyState
            icon={<Bolt />}
            title="Belum ada draft"
            message="Klik tombol Rekomendasikan Dokumen untuk memulai."
          />
        )}
      </div>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmText={confirmState?.confirmText}
        tone={confirmState?.tone}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />
    </main>
  );
}

/* ---------- sub components ---------- */

function EmptyState({ icon, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message && <p className="text-xs text-slate-500 mt-1 max-w-xs">{message}</p>}
    </div>
  );
}

/* ---------- inline icons ---------- */

const _svg = (children, props = {}) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
);
const Bolt   = () => _svg(<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />);
const Copy   = () => _svg(<>
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
</>);
const Refresh= () => _svg(<>
  <path d="M1 4v6h6M23 20v-6h-6" />
  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
</>);
const Trash  = () => _svg(<>
  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
</>);
const Pencil = () => _svg(<>
  <path d="M12 20h9" />
  <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
</>);
const Check  = () => _svg(<path d="M5 13l4 4L19 7" />);
const Plus   = () => _svg(<path d="M12 5v14M5 12h14" />);
const Spinner= () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
