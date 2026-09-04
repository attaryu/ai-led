import { useEffect, useState } from "react";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

const KNOWN_MODELS = ["deepseek-r1:32b", "qwen3.5:35b"];

/* small UI helpers --------------------------------------------------- */

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

function Pill({ tone = "slate", children }) {
  const TONE = {
    slate:   "bg-slate-100 text-slate-700",
    green:   "bg-emerald-100 text-emerald-700",
    red:     "bg-rose-100   text-rose-700",
    amber:   "bg-amber-100  text-amber-700",
    blue:    "bg-blue-100   text-blue-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TONE[tone] || TONE.slate}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- */

export default function LedToolbar() {
  const dokumenId        = useStore((s) => s.activeDokumenId);
  const model            = useStore((s) => s.model);
  const setModel         = useStore((s) => s.setModel);
  const sections         = useStore((s) => s.sections);
  const setSections      = useStore((s) => s.setSections);
  const pushToast        = useStore((s) => s.pushToast);
  const updateToast      = useStore((s) => s.updateToast);
  const removeToast      = useStore((s) => s.removeToast);

  const [health, setHealth]             = useState(null);
  const [confirmState, setConfirmState] = useState(null); // { title, message, tone, onConfirm }

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ api: "ok", ollama: "unreachable" }));
  }, []);

  const totalSections = sections.length;
  const doneCount = sections.filter(
    (s) => (s.drafts || []).some((d) => d.model === model)
  ).length;
  const pct = totalSections ? Math.round((doneCount / totalSections) * 100) : 0;

  /* ----- actions ----- */

  function askDeleteAll() {
    setConfirmState({
      tone: "danger",
      title: `Hapus semua draft untuk "${model}"?`,
      message:
        "Semua draft dan riwayat chat untuk model ini akan dihapus permanen. " +
        "Aksi ini tidak bisa di-undo.",
      confirmText: "Ya, hapus semua",
      onConfirm: () => {
        setConfirmState(null);
        doDeleteAll();
      },
    });
  }

  async function doDeleteAll() {
    const tid = pushToast({
      kind: "progress",
      title: `Menghapus draft "${model}"…`,
    });
    try {
      const r = await api.deleteAllDrafts(dokumenId, model);
      const fresh = await api.listSections(dokumenId, model);
      setSections(fresh);
      updateToast(tid, {
        kind: "success",
        title: "Berhasil dihapus",
        message: `${r.drafts_deleted} draft + ${r.chats_deleted} chat dibersihkan.`,
        duration: 12000,
      });
      setTimeout(() => removeToast(tid), 12000);
    } catch (e) {
      updateToast(tid, {
        kind: "error",
        title: "Gagal menghapus",
        message: e.message,
        duration: 7000,
      });
      setTimeout(() => removeToast(tid), 7000);
    }
  }

  /* ----- render ----- */

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur
                         flex items-center px-5 gap-4 shadow-sm">
        {/* Model picker */}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Model</span>
          <div className="relative">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="appearance-none pr-8 pl-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg
                         font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
                         hover:border-slate-400 transition-colors"
            >
              {KNOWN_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                 viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
            </svg>
          </div>
        </label>

        <Btn variant="danger" onClick={askDeleteAll}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
          Hapus semua draft
        </Btn>

        {/* Right-side status */}
        <div className="ml-auto flex items-center gap-3 min-w-0">
          {/* Progress bar */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono tabular-nums">
              {doneCount}/{totalSections}
            </span>
            <div className="w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono tabular-nums w-9 text-right">{pct}%</span>
          </div>

          {/* Ollama health */}
          {health && (
            <Pill tone={health.ollama === "ok" ? "green" : "red"}>
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  health.ollama === "ok" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`} />
                Ollama
              </span>
            </Pill>
          )}
        </div>
      </header>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmText={confirmState?.confirmText}
        tone={confirmState?.tone}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
}
