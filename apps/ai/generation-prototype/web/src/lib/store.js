import { create } from "zustand";

export const useStore = create((set, get) => ({
  model:        "deepseek-r1:32b",
  activeId:     null,
  sections:     [],
  sectionDetail: null,   // { id, title, drafts: [...] }
  generating:   {},      // { [sectionId]: true }
  chatHistory:  [],

  /* ----- toast system ----- */
  toasts: [],            // [{ id, kind, title, message, duration }]

  setModel:        (model) => set({ model }),
  setActiveId:     (activeId) => set({ activeId }),
  setSections:     (sections) => set({ sections }),
  setSectionDetail: (sectionDetail) => set({ sectionDetail }),
  setChatHistory:  (chatHistory) => set({ chatHistory }),
  markGenerating:  (id, v=true) => set((s) => ({ generating: { ...s.generating, [id]: v } })),

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
