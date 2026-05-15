import { useEffect, useRef, useState } from "react";
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

export default function TopBar() {
  const model            = useStore((s) => s.model);
  const setModel         = useStore((s) => s.setModel);
  const sections         = useStore((s) => s.sections);
  const markGenerating   = useStore((s) => s.markGenerating);
  const setSections      = useStore((s) => s.setSections);
  const setSectionDetail = useStore((s) => s.setSectionDetail);
  const setActiveId      = useStore((s) => s.setActiveId);
  const pushToast        = useStore((s) => s.pushToast);
  const updateToast      = useStore((s) => s.updateToast);
  const removeToast      = useStore((s) => s.removeToast);

  const [health, setHealth]             = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 }); // utk label tombol
  const [confirmState, setConfirmState] = useState(null); // { title, message, tone, onConfirm }

  // Ref ke AbortController + flag stop — dipakai utk Stop generate.
  // Pakai ref (bukan state) supaya tidak trigger re-render dan loop bisa
  // baca nilai terbaru secara sinkron.
  const stopRef = useRef({ aborted: false, controller: null });

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ api: "ok", ollama: "unreachable" }));
  }, []);

  const totalSections = sections.length;
  const doneCount = sections.filter(
    (s) => (s.drafts || []).some((d) => d.model === model)
  ).length;
  const pct = totalSections ? Math.round((doneCount / totalSections) * 100) : 0;
  const allDone = totalSections > 0 && doneCount === totalSections;

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
      const r = await api.deleteAllDrafts(model);
      const fresh = await api.listSections(model);
      setSections(fresh);
      updateToast(tid, {
        kind: "success",
        title: "Berhasil dihapus",
        message: `${r.drafts_deleted} draft + ${r.chats_deleted} chat dibersihkan.`,
        duration: 5000,
      });
      setTimeout(() => removeToast(tid), 5000);
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

  /* Tombol tunggal "Generate":
     - Kalau masih ada section kosong → jalan generate untuk yang kosong saja (tanpa konfirm).
     - Kalau SEMUA sudah ada draft → minta konfirmasi regenerate (overwrite). */
  function askGenerate() {
    if (sections.length === 0) {
      pushToast({
        kind: "info",
        title: "Outline belum siap",
        message: "Belum ada section yang bisa di-generate.",
      });
      return;
    }
    if (!allDone) {
      // Langsung jalan; tidak push toast info tambahan — toast progress
      // di dalam runGenerateAll sudah informatif dan progress-bar live.
      runGenerateAll(false);
      return;
    }
    // Semua sudah punya draft — konfirmasi regenerate (overwrite)
    setConfirmState({
      tone: "danger",
      title: `Semua ${totalSections} section sudah ada draft`,
      message:
        `Regenerate akan menimpa SEMUA draft model "${model}" dan menghapus riwayat chat-nya.\n\n` +
        `Estimasi waktu: ~${Math.ceil(totalSections * 1.5)} menit.`,
      confirmText: "Ya, regenerate semua",
      onConfirm: () => {
        setConfirmState(null);
        runGenerateAll(true);
      },
    });
  }

  /* Stop generate yang sedang berjalan.
     - Set flag aborted=true supaya loop berhenti sebelum iterasi berikutnya.
     - Abort fetch yang sedang in-flight via AbortController, sehingga
       request HTTP segera batal (bukan menunggu selesai). */
  function stopGenerate() {
    stopRef.current.aborted = true;
    try {
      stopRef.current.controller?.abort();
    } catch {}
  }

  async function runGenerateAll(force = false) {
    const todo = force
      ? sections
      : sections.filter((s) => !(s.drafts || []).some((d) => d.model === model));

    if (todo.length === 0) {
      pushToast({
        kind: "info",
        title: "Tidak ada yang perlu di-generate",
        message: "Semua section sudah punya draft.",
      });
      return;
    }

    // Reset flag stop tiap kali batch baru dimulai
    stopRef.current = { aborted: false, controller: null };

    setBatchRunning(true);
    setBatchProgress({ done: 0, total: todo.length });

    const verb = force ? "Regenerate" : "Generate";
    const tid = pushToast({
      kind: "progress",
      title: `${verb} 0/${todo.length} section`,
      message: "Memulai…",
      progress: 0,
    });

    let done = 0;
    let failed = 0;
    let stopped = false;
    for (const s of todo) {
      // Cek flag stop sebelum iterasi berikutnya
      if (stopRef.current.aborted) {
        stopped = true;
        break;
      }
      const label = (s.full_title || s.title || s.id).split("\n").pop().slice(0, 50);
      updateToast(tid, {
        title: `${verb} ${done + 1}/${todo.length} section`,
        message: `${s.id} — ${label}`,
        progress: Math.round((done / todo.length) * 100),
      });

      // Controller per-request supaya bisa di-abort dari luar
      const controller = new AbortController();
      stopRef.current.controller = controller;

      try {
        markGenerating(s.id, true);
        await api.generate(s.id, model, force, controller.signal);
        const fresh = await api.listSections(model);
        setSections(fresh);
        setActiveId(s.id);
        try {
          const detail = await api.getSection(s.id, model);
          setSectionDetail(detail);
        } catch {}
      } catch (e) {
        // AbortError = user menekan Stop → break loop, jangan dianggap gagal
        if (e.name === "AbortError" || stopRef.current.aborted) {
          stopped = true;
          markGenerating(s.id, false);
          break;
        }
        failed += 1;
        console.error("generate", s.id, e);
        pushToast({
          kind: "error",
          title: `Gagal: ${s.id}`,
          message: e.message,
          duration: 6000,
        });
      } finally {
        markGenerating(s.id, false);
        if (!stopRef.current.aborted) {
          done += 1;
          setBatchProgress({ done, total: todo.length });
          updateToast(tid, {
            title: `${verb} ${done}/${todo.length} section`,
            progress: Math.round((done / todo.length) * 100),
          });
        }
      }
    }

    // Toast akhir — pesan tergantung apakah dihentikan, sukses, atau ada gagal
    if (stopped) {
      updateToast(tid, {
        kind: "warning",
        title: `${verb} dihentikan`,
        message: `${done}/${todo.length} section selesai sebelum di-stop.`,
        progress: Math.round((done / todo.length) * 100),
        duration: 6000,
      });
      setTimeout(() => removeToast(tid), 6000);
    } else {
      updateToast(tid, {
        kind: failed === 0 ? "success" : "warning",
        title: `${verb} selesai`,
        message:
          failed === 0
            ? `${done}/${todo.length} section berhasil.`
            : `${done - failed} berhasil, ${failed} gagal dari ${todo.length}.`,
        progress: 100,
        duration: 8000,
      });
      setTimeout(() => removeToast(tid), 8000);
    }
    setBatchRunning(false);
    setBatchProgress({ done: 0, total: 0 });
    stopRef.current = { aborted: false, controller: null };
  }

  /* ----- render ----- */

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur
                         flex items-center px-5 gap-4 shadow-sm">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600
                          flex items-center justify-center text-white font-bold text-sm shadow-sm">
            L
          </div>
          <div className="leading-tight">
            <h1 className="font-bold text-base text-slate-900">LED Generator</h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Akreditasi PS · RAG pipeline
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-slate-200" />

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

        {/* Tombol Generate pintar — 3 mode:
            - Idle, ada kosong       → biru   "Generate semua"   [done/total]
            - Idle, semua sudah ada  → merah  "Regenerate semua" (konfirm)
            - Sedang berjalan        → merah  "Stop generate"    [done/target] */}
        <Btn
          variant={batchRunning || allDone ? "danger" : "primary"}
          onClick={batchRunning ? stopGenerate : askGenerate}
          disabled={!batchRunning && sections.length === 0}
          title={
            batchRunning
              ? "Hentikan proses generate"
              : allDone
                ? "Semua section sudah punya draft — klik untuk regenerate (overwrite)"
                : `Generate ${totalSections - doneCount} section yang belum punya draft`
          }
        >
          {batchRunning ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
              Stop generate
              <span className="ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono tabular-nums">
                {batchProgress.done}/{batchProgress.total}
              </span>
            </>
          ) : allDone ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              Regenerate semua
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Generate semua
              <span
                className="ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono tabular-nums"
                title={`${doneCount} dari ${totalSections} section sudah ada draft`}
              >
                {doneCount}/{totalSections}
              </span>
            </>
          )}
        </Btn>

        <Btn variant="danger" onClick={askDeleteAll} disabled={batchRunning}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
          Hapus draft
        </Btn>

        <a
          href={api.exportDocxUrl(model, false)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                     bg-emerald-600 text-white hover:bg-emerald-700
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export .docx
        </a>

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
