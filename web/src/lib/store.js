import { create } from "zustand";

export const useStore = create((set, get) => ({
  model:        "deepseek-r1:32b",
  activeId:     null,
  sections:     [],
  sectionDetail: null,   // { id, title, drafts: [...] }
  generating:   {},      // { [sectionId]: true }
  chatHistory:  [],

  /* ----- multi-dokumen LED: daftar dokumen + dokumen aktif di editor ----- */
  dokumenList:      [],   // hasil GET /led-documents, dipakai LedListPage
  activeDokumenId:  null, // :dokumenId dari route /led/:dokumenId, dipakai LedEditorPage

  /* ----- profil user statis (belum ada login sungguhan, lihat lib/auth.py) ----- */
  me:      null,   // { id, nama_lengkap, email, role, tenant_nama, program_studi_nama } | null (belum dimuat)
  meError: false,  // true kalau GET /me gagal -- fail-closed, anggap tidak punya akses LED

  /* ----- halaman Document ----- */
  docList:      [],      // flat list bukti_dukung dari GET /documents
  activeDocId:  null,
  docChunks:    [],      // hasil GET /documents/{id}/chunks

  /* ----- alur rekomendasi dokumen (Tahap 1 sebelum generate) ----- */
  recommendation:       null,  // hasil terakhir POST /sections/{id}/recommend utk activeId
  recommendationStatus: {},    // { [sectionId]: 'none'|'recommending'|'recommended'|'confirmed' }
  // File bukti_dukung yg dikonfirmasi user di tab "Dokumen Pendukung"
  // (dirender SectionInfoPane.jsx) -- dibaca DocumentPane.jsx::handleGenerate
  // (sibling terpisah), makanya perlu di store global, bukan state lokal.
  confirmedBuktiDukungIds: [],

  /* ----- histori versi draft (bab_draft) -- card "Draft 1"/"Draft 2" dst ----- */
  // ID versi yg dipilih user (klik card di tab "Draft", SectionInfoPane.jsx).
  // null = belum ditentukan eksplisit -> DocumentPane.jsx fallback ke draft
  // AKTIF (default saat pertama masuk section).
  selectedDraftId: null,
  // Isi LENGKAP versi yg sedang ditampilkan di panel TENGAH (hasil fetch
  // GET .../draft-versions/{id}, atau draft aktif kalau selectedDraftId
  // null) -- disimpan di sini (bukan cuma di DocumentPane.jsx) supaya tab
  // Pedoman/Rubric/LKPS/Query (SectionInfoPane.jsx, sibling terpisah) bisa
  // ikut tampilkan referensi RAG dari VERSI YANG SAMA yg sedang dibaca,
  // bukan selalu draft aktif.
  openDraftVersion: null,

  /* ----- toast system ----- */
  toasts: [],            // [{ id, kind, title, message, duration }]

  setMe:           (me) => set({ me, meError: false }),
  setMeError:      () => set({ me: null, meError: true }),

  setModel:        (model) => set({ model }),
  setActiveId:     (activeId) => set({ activeId }),
  setDokumenList:     (dokumenList) => set({ dokumenList }),
  setActiveDokumenId: (activeDokumenId) => set({ activeDokumenId }),
  setSections:     (sections) => set({ sections }),
  setSectionDetail: (sectionDetail) => set({ sectionDetail }),
  setChatHistory:  (chatHistory) => set({ chatHistory }),
  markGenerating:  (id, v=true) => set((s) => ({ generating: { ...s.generating, [id]: v } })),

  setDocList:      (docList) => set({ docList }),
  setActiveDocId:  (activeDocId) => set({ activeDocId }),
  setDocChunks:    (docChunks) => set({ docChunks }),

  setRecommendation:      (recommendation) => set({ recommendation }),
  setRecommendationStatus: (id, v) => set((s) => ({
    recommendationStatus: { ...s.recommendationStatus, [id]: v },
  })),
  setConfirmedBuktiDukungIds: (ids) => set({ confirmedBuktiDukungIds: ids }),
  setSelectedDraftId: (id) => set({ selectedDraftId: id }),
  setOpenDraftVersion: (v) => set({ openDraftVersion: v }),

  /* push a toast. kind ∈ 'success' | 'error' | 'info' | 'warning' | 'progress'.
     'progress' toasts have no auto-dismiss until you call updateToast / removeToast. */
  pushToast: (toast) => {
    const id = toast.id || `t_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const t = { id, kind: "info", duration: 4500, ...toast };
    set((s) => ({ toasts: [...s.toasts, t] }));
    if (t.kind !== "progress" && t.duration > 0) {
      setTimeout(() => get().removeToast(id), t.duration);
    }
    return id;
  },
  updateToast: (id, patch) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
