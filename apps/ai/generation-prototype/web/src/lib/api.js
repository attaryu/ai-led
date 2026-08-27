const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function req(path, options = {}) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`${r.status}: ${err}`);
  }
  return r.json();
}

export const api = {
  health:        ()                   => req("/health"),
  getMe:         ()                   => req("/me"),

  /* ----- multi-dokumen LED: daftar + CRUD dokumen_led ----- */
  listLedDocuments:  ()                => req("/led-documents"),
  createLedDocument: (judul, tahun_akademik) =>
                                          req("/led-documents", {
                                            method: "POST",
                                            body: JSON.stringify({ judul, tahun_akademik }),
                                          }),
  getLedDocument:    (dokumenId)       => req(`/led-documents/${encodeURIComponent(dokumenId)}`),

  /* ----- sections/chat/export, semua discope ke 1 dokumenId (dari URL /led/:dokumenId) ----- */
  listSections:  (dokumenId, model)   => req(`/led-documents/${encodeURIComponent(dokumenId)}/sections${model ? `?model=${model}` : ""}`),
  getSection:    (dokumenId, id, model) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}${model ? `?model=${model}` : ""}`),
  // `signal` opsional — lewatkan AbortController.signal supaya request bisa
  // dibatalkan di tengah jalan (mis. tombol Stop saat batch generate).
  // `selected_bukti_dukung_ids` -- file evidence yg dikonfirmasi user di
  // tahap rekomendasi (lihat recommend/confirmRecommendation di bawah).
  // `draft_id` opsional -- kalau diisi, TIMPA versi bab_draft itu langsung
  // (dipakai "Regenerate" dari tab Dokumen Pendukung, bukan bikin versi baru).
  generate:      (dokumenId, id, model, overwrite=false, selected_bukti_dukung_ids=[], signal=null, draft_id=null) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/generate`, {
                                            method: "POST",
                                            body: JSON.stringify({ model, overwrite, selected_bukti_dukung_ids, draft_id }),
                                            signal,
                                          }),
  /* ----- alur rekomendasi dokumen (Tahap 1 sebelum generate) ----- */
  // `draft_id` opsional -- kalau diisi ("Rekomendasikan Ulang" pada draft yg
  // SUDAH kosong), reuse draft itu (jgn bikin bab_draft baru).
  recommend:     (dokumenId, id, model, draft_id=null) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/recommend`, {
                                            method: "POST",
                                            body: JSON.stringify({ model, draft_id }),
                                          }),
  // Ambil rekomendasi TERSIMPAN terakhir (recommended/confirmed) MILIK
  // draftId ini -- rekomendasi sekarang terikat ke draft, bukan section.
  // Kalau draftId tidak diisi, fallback ke draft aktif section via model.
  getRecommendation: (dokumenId, id, draftId, model) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/recommendation?${draftId ? `draft_id=${encodeURIComponent(draftId)}` : `model=${encodeURIComponent(model)}`}`),
  // "Buat Draft Baru (Kosong)": bikin bab_draft kosong manual (sumber=MANUAL),
  // tanpa lewat alur rekomendasi -- langsung jadi checkpoint aktif.
  createEmptyDraft: (dokumenId, id, model) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/draft-versions/empty`, {
                                            method: "POST",
                                            body: JSON.stringify({ model }),
                                          }),
  confirmRecommendation: (dokumenId, id, recommendation_id, bukti_dukung_ids, folder_paths) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/recommend/confirm`, {
                                            method: "POST",
                                            body: JSON.stringify({ recommendation_id, bukti_dukung_ids, folder_paths }),
                                          }),
  getDocumentRegistry: ()              => req("/documents/registry"),
  /* ----- histori versi draft (bab_draft) -- card "Draft 1"/"Draft 2" dst ----- */
  listDraftVersions: (dokumenId, id, model) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/draft-versions?model=${encodeURIComponent(model)}`),
  getDraftVersion: (dokumenId, id, draftId) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/draft-versions/${encodeURIComponent(draftId)}`),
  // "Simpan Sebagai Draft": salin isi versi yg sedang dibuka jadi versi BARU
  // (tidak otomatis aktif).
  duplicateDraftVersion: (dokumenId, id, draftId) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/draft-versions/${encodeURIComponent(draftId)}/duplicate`, {
                                            method: "POST",
                                          }),
  // "Jadikan Draft Aktif": set checkpoint_aktif_id ke versi ini.
  activateDraftVersion: (dokumenId, id, draftId) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/draft-versions/${encodeURIComponent(draftId)}/activate`, {
                                            method: "POST",
                                          }),
  // "Hapus Draft": hapus 1 versi (kalau versi aktif, versi terbaru lain
  // otomatis jadi aktif baru -- lihat sections.py::delete_draft_version).
  deleteDraftVersion: (dokumenId, id, draftId) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/draft-versions/${encodeURIComponent(draftId)}`, {
                                            method: "DELETE",
                                          }),
  updateDraft:   (dokumenId, id, model, draft_text) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/draft`, {
                                            method: "PUT",
                                            body: JSON.stringify({ model, draft_text }),
                                          }),
  approve:       (dokumenId, id, model) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/approve`, {
                                            method: "POST",
                                            body: JSON.stringify({ model }),
                                          }),
  deleteDraft:   (dokumenId, id, model) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}${model ? `?model=${encodeURIComponent(model)}` : ""}`, {
                                            method: "DELETE",
                                          }),
  deleteAllDrafts: (dokumenId, model) => req(`/led-documents/${encodeURIComponent(dokumenId)}/sections${model ? `?model=${encodeURIComponent(model)}` : ""}`, {
                                            method: "DELETE",
                                          }),
  getChatHistory: (dokumenId, id, model) =>
                                          req(`/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(id)}/chat${model ? `?model=${model}` : ""}`),

  /* ----- halaman Document ----- */
  listDocuments:   ()                 => req("/documents"),
  getDocument:     (id, kind)         => req(`/documents/${encodeURIComponent(id)}${kind ? `?kind=${kind}` : ""}`),
  getDocumentChunks: (id, kind)       => req(`/documents/${encodeURIComponent(id)}/chunks${kind ? `?kind=${kind}` : ""}`),
  deleteDocument:  (id)               => req(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  // multipart -- tidak lewat helper req() krn tidak boleh set Content-Type manual (browser
  // yg mengisi boundary multipart otomatis).
  uploadDocuments: async (files) => {
    const formData = new FormData();
    for (const f of files) {
      formData.append("files", f);
      formData.append("paths", f.webkitRelativePath || f.name);
    }
    const r = await fetch(`${BASE}/documents/upload`, { method: "POST", body: formData });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`${r.status}: ${err}`);
    }
    return r.json();
  },
};

// SSE chat stream — returns abort controller
export function streamChat(dokumenId, sectionId, model, message, onToken, onDone, onError) {
  const url = `${BASE}/led-documents/${encodeURIComponent(dokumenId)}/sections/${encodeURIComponent(sectionId)}/chat`;
  const ctrl = new AbortController();

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, message }),
    signal: ctrl.signal,
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // SSE: split per "\n\n"
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) onToken(data.token);
            if (data.done) onDone();
          } catch (e) {
            // ignore bad chunks
          }
        }
      }
      onDone();
    })
    .catch((e) => {
      if (e.name !== "AbortError") onError(e);
    });

  return ctrl;
}
