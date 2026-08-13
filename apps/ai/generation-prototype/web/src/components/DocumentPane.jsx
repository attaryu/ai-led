import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

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

const TABS = [
  { id: "draft",     label: "Draft",     hint: "Narasi LED yang di-generate" },
  { id: "pedoman",   label: "Pedoman",   hint: "RAG 1 — aturan penulisan" },
  { id: "rubric",    label: "Rubric",    hint: "RAG 2 — kriteria skor 4" },
  { id: "checklist", label: "Checklist", hint: "Pertanyaan faktual" },
  { id: "evidence",  label: "Evidence",  hint: "RAG 3+4 — LKPS & dokumen" },
  { id: "judge",     label: "Judge",     hint: "Evaluasi RAGAS" },
];

const STATUS_PILL = {
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300" },
  draft:    { label: "Draft",    cls: "bg-amber-100   text-amber-700   ring-1 ring-amber-300" },
};

/* ----------------------------------------- */

export default function DocumentPane() {
  const activeId         = useStore((s) => s.activeId);
  const model            = useStore((s) => s.model);
  const sectionDetail    = useStore((s) => s.sectionDetail);
  const setSectionDetail = useStore((s) => s.setSectionDetail);
  const sections         = useStore((s) => s.sections);
  const setSections      = useStore((s) => s.setSections);
  const setChatHistory   = useStore((s) => s.setChatHistory);
  const markGenerating   = useStore((s) => s.markGenerating);
  const pushToast        = useStore((s) => s.pushToast);
  const updateToast      = useStore((s) => s.updateToast);
  const removeToast      = useStore((s) => s.removeToast);

  const [tab, setTab]         = useState("draft");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [loading, setLoading]   = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    if (!activeId) return setSectionDetail(null);
    api.getSection(activeId, model)
      .then(setSectionDetail)
      .catch(() => setSectionDetail(null));
  }, [activeId, model, setSectionDetail]);

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

  async function handleGenerate(force = false) {
    setLoading(true);
    markGenerating(activeId, true);
    const tid = pushToast({
      kind: "progress",
      title: force ? `Regenerate ${activeId}…` : `Generate ${activeId}…`,
      message: "Menjalankan pipeline RAG…",
    });
    try {
      await api.generate(activeId, model, force);
      const fresh = await api.getSection(activeId, model);
      setSectionDetail(fresh);
      const freshList = await api.listSections(model);
      setSections(freshList);
      if (force) {
        try {
          const hist = await api.getChatHistory(activeId, model);
          setChatHistory(hist);
        } catch {
          setChatHistory([]);
        }
      }
      updateToast(tid, {
        kind: "success",
        title: force ? "Regenerate selesai" : "Generate selesai",
        message: `Section ${activeId} siap dibaca.`,
        duration: 4500,
      });
      setTimeout(() => removeToast(tid), 4500);
    } catch (e) {
      updateToast(tid, {
        kind: "error",
        title: "Generate gagal",
        message: e.message,
        duration: 7000,
      });
      setTimeout(() => removeToast(tid), 7000);
    } finally {
      setLoading(false);
      markGenerating(activeId, false);
    }
  }

  async function handleSave() {
    try {
      await api.updateDraft(activeId, model, editText);
      const fresh = await api.getSection(activeId, model);
      setSectionDetail(fresh);
      setEditing(false);
      pushToast({ kind: "success", title: "Draft disimpan" });
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal menyimpan", message: e.message });
    }
  }

  async function handleApprove() {
    try {
      await api.approve(activeId, model);
      const fresh = await api.getSection(activeId, model);
      setSectionDetail(fresh);
      const freshList = await api.listSections(model);
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

  function askDelete() {
    setConfirmState({
      tone: "danger",
      title: `Hapus draft ${activeId}?`,
      message:
        `Draft dan riwayat chat untuk section ini (model "${model}") akan dihapus. ` +
        "Aksi ini tidak bisa di-undo.",
      confirmText: "Ya, hapus",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const r = await api.deleteDraft(activeId, model);
          const fresh = await api.getSection(activeId, model);
          setSectionDetail(fresh);
          const freshList = await api.listSections(model);
          setSections(freshList);
          setChatHistory([]);
          pushToast({
            kind: "success",
            title: "Draft dihapus",
            message: `${r.drafts_deleted || 0} draft, ${r.chats_deleted || 0} chat dibersihkan.`,
          });
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
            {!draft && (
              <Btn variant="primary" onClick={() => handleGenerate(false)} disabled={loading}>
                {loading ? (
                  <Spinner />
                ) : (
                  <Bolt />
                )}
                {loading ? "Generating…" : "Generate"}
              </Btn>
            )}
            {draft && !editing && (
              <>
                <Btn variant="ghost" onClick={() => handleGenerate(true)} disabled={loading}
                     title="Hapus & regenerate draft section ini">
                  <Refresh />
                  Regenerate
                </Btn>
                <Btn variant="danger" onClick={askDelete} disabled={loading} title="Hapus draft + chat history">
                  <Trash />
                  Hapus
                </Btn>
                <Btn onClick={() => { setEditing(true); setEditText(draft.draft_text); }}>
                  <Pencil />
                  Edit
                </Btn>
                <Btn variant="success" onClick={handleApprove} disabled={draft.status === "approved"}>
                  <Check />
                  {draft.status === "approved" ? "Approved" : "Approve"}
                </Btn>
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

      {/* Tabs */}
      <div className="px-6 border-b border-slate-200 flex gap-1 text-sm overflow-x-auto bg-white sticky top-0 z-10">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.hint}
              className={`relative py-3 px-3 whitespace-nowrap font-medium transition-colors
                          ${active ? "text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
              {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-blue-500 rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {tab === "draft" && (
          editing ? (
            <textarea
              className="w-full min-h-[60vh] border border-slate-300 rounded-xl p-4 font-mono text-sm bg-white shadow-inner
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
          ) : draft ? (
            <article className="prose-led max-w-4xl bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-200">
              <ReactMarkdown>{draft.draft_text}</ReactMarkdown>
            </article>
          ) : (
            <EmptyState
              icon={<Bolt />}
              title="Belum ada draft"
              message="Klik tombol Generate untuk menjalankan pipeline RAG."
            />
          )
        )}

        {tab === "pedoman" && (
          <CardList
            hint="RAG 1 — Aturan / struktur penulisan dari pedoman LED-PS."
            items={draft?.pedoman_used || []}
            renderItem={(p, i) => (
              <Card key={i} accent="blue" badge={`[${i + 1}]`} title={p.id}>
                {p.text}
              </Card>
            )}
            emptyMessage="Belum ada pedoman."
          />
        )}

        {tab === "rubric" && (
          <CardList
            hint="RAG 2 — Rubrik penilaian skor 4 dari matrik penilaian."
            items={draft?.rubric_used || []}
            renderItem={(r, i) => (
              <Card key={i} accent="amber" badge={`[${i + 1}]`} title={r.id}>
                {r.text}
              </Card>
            )}
            emptyMessage="Belum ada rubric."
          />
        )}

        {tab === "checklist" && (
          <div className="max-w-3xl">
            <p className="text-sm text-slate-500 mb-3">
              Daftar pertanyaan faktual yang LLM bikin dari pedoman + rubrik.
            </p>
            {draft?.checklist?.length ? (
              <ol className="space-y-2">
                {draft.checklist.map((q, i) => (
                  <li key={i}
                      className="flex gap-3 bg-white rounded-lg p-3 ring-1 ring-slate-200 shadow-sm">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-blue-100 text-blue-700
                                     flex items-center justify-center font-semibold text-xs">
                      {i + 1}
                    </span>
                    <span className="text-slate-800 leading-snug">{q}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="Belum ada checklist." />
            )}
          </div>
        )}

        {tab === "evidence" && <EvidenceTab draft={draft} />}

        {tab === "judge" && <JudgeTab draft={draft} />}
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

function CardList({ hint, items, renderItem, emptyMessage }) {
  return (
    <div className="max-w-3xl">
      {hint && <p className="text-sm text-slate-500 mb-3">{hint}</p>}
      {items.length ? (
        <div className="space-y-2">{items.map(renderItem)}</div>
      ) : (
        <EmptyState title={emptyMessage} />
      )}
    </div>
  );
}

function Card({ accent = "blue", badge, title, children }) {
  const ACCENT = {
    blue:   "bg-blue-50/60   ring-blue-200",
    amber:  "bg-amber-50/60  ring-amber-200",
    purple: "bg-purple-50/60 ring-purple-200",
    teal:   "bg-teal-50/60   ring-teal-200",
    slate:  "bg-slate-100    ring-slate-200",
  };
  return (
    <div className={`ring-1 ${ACCENT[accent]} rounded-lg p-3 text-sm shadow-sm`}>
      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
        {badge && <span className="font-semibold">{badge}</span>}
        <span className="truncate">{title}</span>
      </div>
      <div className="mt-1.5 text-slate-800 whitespace-pre-wrap leading-relaxed">{children}</div>
    </div>
  );
}

function EvidenceTab({ draft }) {
  const all   = draft?.chunks_used || [];
  const lkps  = all.filter((c) => c.kind === "lkps");
  const ev    = all.filter((c) => c.kind === "evidence");
  const other = all.filter((c) => !c.kind);

  const Item = ({ c, i, accent, badge }) => (
    <div className={`ring-1 rounded-lg p-3 shadow-sm ${
      accent === "purple" ? "bg-purple-50/60 ring-purple-200"
      : accent === "teal" ? "bg-teal-50/60 ring-teal-200"
      : "bg-slate-100 ring-slate-200"
    }`}>
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-1.5 py-0.5 rounded text-white font-semibold ${
          accent === "purple" ? "bg-purple-600" : accent === "teal" ? "bg-teal-600" : "bg-slate-500"
        }`}>
          {badge}
        </span>
        <span className="font-mono text-slate-600 truncate">
          [{i + 1}] {c.filename || c.id}
        </span>
      </div>
      {c.query && (
        <div className="mt-1 text-xs italic text-blue-600 truncate">↳ "{c.query}"</div>
      )}
      <div className="mt-1.5 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
        {c.text}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-sm text-slate-500">
        RAG 3 (<span className="font-medium text-purple-700">LKPS</span> — data kuantitatif) + RAG 4
        (<span className="font-medium text-teal-700">Evidence</span> — bukti dokumen), di-retrieve per item checklist.
      </p>
      {lkps.length > 0 && (
        <section>
          <SectionTitle color="purple">RAG 3 · LKPS ({lkps.length})</SectionTitle>
          <div className="space-y-2 mt-2">
            {lkps.map((c, i) => <Item key={c.id || i} c={c} i={i} accent="purple" badge="LKPS" />)}
          </div>
        </section>
      )}
      {ev.length > 0 && (
        <section>
          <SectionTitle color="teal">RAG 4 · Evidence ({ev.length})</SectionTitle>
          <div className="space-y-2 mt-2">
            {ev.map((c, i) => <Item key={c.id || i} c={c} i={i} accent="teal" badge="EV" />)}
          </div>
        </section>
      )}
      {other.length > 0 && (
        <section>
          <SectionTitle color="slate">Other ({other.length})</SectionTitle>
          <div className="space-y-2 mt-2">
            {other.map((c, i) => <Item key={c.id || i} c={c} i={i} accent="slate" badge="?" />)}
          </div>
        </section>
      )}
      {all.length === 0 && <EmptyState title="Belum ada chunks." />}
    </div>
  );
}

function SectionTitle({ color, children }) {
  const COLOR = {
    purple: "text-purple-700 border-purple-200",
    teal:   "text-teal-700   border-teal-200",
    slate:  "text-slate-700  border-slate-200",
  };
  return (
    <div className={`text-xs uppercase tracking-wider font-bold pb-1 border-b ${COLOR[color]}`}>
      {children}
    </div>
  );
}

function JudgeTab({ draft }) {
  const jr = draft?.judge_result;
  if (!jr) return <EmptyState title="Belum ada hasil judge." />;

  const METRICS = [
    { key: "faithfulness",      label: "Faithfulness",      desc: "% klaim ter-dukung context" },
    { key: "answer_relevancy",  label: "Answer Relevancy",  desc: "relevansi dgn section" },
    { key: "context_precision", label: "Context Precision", desc: "% chunk relevan" },
    { key: "context_recall",    label: "Context Recall",    desc: "coverage fakta ground-truth" },
  ];

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between bg-white rounded-lg p-3 ring-1 ring-slate-200">
        <p className="text-xs text-slate-500">
          LLM-as-Judge (RAGAS-style) · model{" "}
          <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
            {jr._judge_model || "—"}
          </code>
        </p>
        {jr._judge_latency != null && (
          <span className="text-xs text-slate-500 font-mono">{jr._judge_latency}s</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {METRICS.map(({ key, label, desc }) => {
          const val = jr[key];
          if (val == null) return null;
          const num = parseFloat(val);
          const pct = Math.round(num * 100);
          const tone = num >= 0.7 ? "green" : num >= 0.4 ? "amber" : "rose";
          const TONE = {
            green: { text: "text-emerald-600", bar: "bg-emerald-500", ring: "ring-emerald-200" },
            amber: { text: "text-amber-600",   bar: "bg-amber-500",   ring: "ring-amber-200"   },
            rose:  { text: "text-rose-600",    bar: "bg-rose-500",    ring: "ring-rose-200"    },
          }[tone];
          return (
            <div key={key} className={`bg-white rounded-xl p-4 ring-1 ${TONE.ring} shadow-sm`}>
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-slate-800">{label}</span>
                <span className={`text-3xl font-bold tabular-nums ${TONE.text}`}>
                  {num.toFixed(2)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full ${TONE.bar} transition-all duration-500 rounded-full`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 mt-1.5">{desc}</div>
              {jr.reasoning?.[key] && (
                <div className="text-xs text-slate-700 mt-3 italic border-l-2 border-slate-200 pl-3 leading-relaxed">
                  {jr.reasoning[key]}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {jr.missing_facts?.length > 0 && (
        <Alert tone="rose" title="Missing facts (gap di retrieval)">
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {jr.missing_facts.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </Alert>
      )}

      {jr.hallucinated?.length > 0 && (
        <Alert tone="amber" title="Hallucinated (klaim tanpa basis)">
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {jr.hallucinated.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </Alert>
      )}

      {jr.error && (
        <Alert tone="rose" title="Judge error">
          {jr.error}
        </Alert>
      )}

      {jr.raw && (
        <details className="bg-white rounded-lg p-3 ring-1 ring-slate-200 text-xs">
          <summary className="cursor-pointer font-medium text-slate-600">
            Raw response (parse failed)
          </summary>
          <pre className="mt-2 bg-slate-50 p-3 rounded text-xs whitespace-pre-wrap font-mono text-slate-700">
            {jr.raw}
          </pre>
        </details>
      )}
    </div>
  );
}

function Alert({ tone = "rose", title, children }) {
  const T = {
    rose:  { wrap: "bg-rose-50  ring-rose-200  text-rose-800",  icon: "text-rose-500"  },
    amber: { wrap: "bg-amber-50 ring-amber-200 text-amber-800", icon: "text-amber-500" },
    blue:  { wrap: "bg-blue-50  ring-blue-200  text-blue-800",  icon: "text-blue-500"  },
  }[tone];
  return (
    <div className={`flex gap-3 rounded-lg p-3.5 ring-1 ${T.wrap}`}>
      <svg className={`w-5 h-5 shrink-0 mt-0.5 ${T.icon}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M10.29 3.86l-8.18 14.18A2 2 0 003.83 21h16.34a2 2 0 001.72-3l-8.17-14.14a2 2 0 00-3.43 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className="flex-1 text-sm">
        <div className="font-semibold mb-0.5">{title}</div>
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

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
const Spinner= () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
