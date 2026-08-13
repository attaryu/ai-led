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
  listSections:  (model)              => req(`/sections${model ? `?model=${model}` : ""}`),
  getSection:    (id, model)          => req(`/sections/${encodeURIComponent(id)}${model ? `?model=${model}` : ""}`),
  // `signal` opsional — lewatkan AbortController.signal supaya request bisa
  // dibatalkan di tengah jalan (mis. tombol Stop saat batch generate).
  generate:      (id, model, overwrite=false, signal=null) =>
                                          req(`/sections/${encodeURIComponent(id)}/generate`, {
                                            method: "POST",
                                            body: JSON.stringify({ model, overwrite }),
                                            signal,
                                          }),
  updateDraft:   (id, model, draft_text) =>
                                          req(`/sections/${encodeURIComponent(id)}/draft`, {
                                            method: "PUT",
                                            body: JSON.stringify({ model, draft_text }),
                                          }),
  approve:       (id, model)          => req(`/sections/${encodeURIComponent(id)}/approve`, {
                                            method: "POST",
                                            body: JSON.stringify({ model }),
                                          }),
  deleteDraft:   (id, model)          => req(`/sections/${encodeURIComponent(id)}${model ? `?model=${encodeURIComponent(model)}` : ""}`, {
                                            method: "DELETE",
                                          }),
  deleteAllDrafts: (model)            => req(`/sections${model ? `?model=${encodeURIComponent(model)}` : ""}`, {
                                            method: "DELETE",
                                          }),
  getChatHistory: (id, model)        => req(`/sections/${encodeURIComponent(id)}/chat${model ? `?model=${model}` : ""}`),
  exportDocxUrl: (model, only_approved=false) =>
                                          `${BASE}/export?model=${encodeURIComponent(model)}&only_approved=${only_approved}`,
};

// SSE chat stream — returns abort controller
export function streamChat(sectionId, model, message, onToken, onDone, onError) {
  const url = `${BASE}/sections/${encodeURIComponent(sectionId)}/chat`;
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
