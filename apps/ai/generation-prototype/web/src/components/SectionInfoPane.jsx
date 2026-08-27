import { useEffect, useState } from "react";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import RecommendationPanel from "./RecommendationPanel.jsx";
import ChatPane from "./ChatPane.jsx";

/* Panel kanan editor (menggantikan ChatPane sbg satu2nya isi) -- tab bar
 * "Dokumen Pendukung | Draft | Query | Pedoman | LKPS | Kualitas AI | Chat".
 * Tab Rubric dihapus -- LED sekarang disusun tanpa acuan rubrik penilaian
 * (lihat RUBRIK_WRITING di generator.py).
 * TIDAK ada tombol aksi generate/regenerate di sini -- itu tetap di panel
 * TENGAH (DocumentPane.jsx). Tab "Draft" di sini murni daftar CARD versi
 * (bukan isi teks) -- klik card pilih versi mana yg tampil di panel TENGAH
 * (via store.selectedDraftId, dibaca DocumentPane.jsx). Panel ini juga
 * menampilkan referensi RAG yang dipakai (sebelum ATAU sesudah narasi ada),
 * query checklist, kualitas hasil AI, dan chat revisi. */

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const TABS = [
  { id: "recommendation", label: "Dokumen Pendukung", hint: "Rekomendasi dokumen sebelum narasi ditulis" },
  { id: "draft",          label: "Draft",             hint: "Histori versi draft (klik utk pilih)" },
  { id: "query",          label: "Query",             hint: "Checklist query yg dipakai RAG saat generate" },
  { id: "pedoman",        label: "Pedoman",            hint: "RAG 1 — aturan penulisan" },
  { id: "lkps",           label: "Referensi",          hint: "RAG 2 — LKPS (kuantitatif) + Evidence (bukti dukung)" },
  { id: "judge",          label: "Kualitas AI",        hint: "Evaluasi RAGAS" },
  { id: "chat",           label: "Chat",               hint: "Revisi draft via chat" },
];

export default function SectionInfoPane() {
  const dokumenId     = useStore((s) => s.activeDokumenId);
  const activeId      = useStore((s) => s.activeId);
  const model         = useStore((s) => s.model);
  const sectionDetail = useStore((s) => s.sectionDetail);

  const recommendation          = useStore((s) => s.recommendation);
  const setRecommendation       = useStore((s) => s.setRecommendation);
  const setRecommendationStatus = useStore((s) => s.setRecommendationStatus);
  const selectedDraftId         = useStore((s) => s.selectedDraftId);
  const setSelectedDraftId      = useStore((s) => s.setSelectedDraftId);
  // Isi versi yg SEDANG DIBUKA di panel tengah (DocumentPane.jsx) -- dipakai
  // sbg sumber referensi RAG (Pedoman/LKPS/Query) supaya konsisten
  // 1-ke-1 dgn narasi yg sedang dibaca, BUKAN selalu draft aktif.
  const openVersion             = useStore((s) => s.openDraftVersion);

  const [tab, setTab] = useState("recommendation");
  const [draftVersions, setDraftVersions] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);

  // Daftar card versi utk tab "Draft" -- reload tiap pindah section/model
  // ATAU tiap kali panel TENGAH selesai suatu aksi (generate/duplicate/
  // activate/delete) -- deteksi via sectionDetail berubah (di-refresh
  // DocumentPane.jsx setelah tiap aksi).
  useEffect(() => {
    if (!dokumenId || !activeId) { setDraftVersions([]); setActiveDraftId(null); return; }
    api.listDraftVersions(dokumenId, activeId, model)
      .then((r) => { setDraftVersions(r.drafts || []); setActiveDraftId(r.active_draft_id || null); })
      .catch(() => { setDraftVersions([]); setActiveDraftId(null); });
  }, [dokumenId, activeId, model, sectionDetail]);

  // Muat ulang rekomendasi tersimpan saat pindah section/draft balik/reload
  // -- state `recommendation` di store cuma di-set langsung stlh POST
  // /recommend sukses (di DocumentPane.jsx), hilang kalau ganti section/
  // draft ATAU reload halaman (memory Zustand kosong lagi). Rekomendasi
  // sekarang MILIK draft (bab_draft_id), jadi di-scope ke openVersion.id --
  // pindah versi draft (tab "Draft") harus memuat ulang rekomendasi milik
  // versi itu, bukan tetap pakai rekomendasi draft sebelumnya. Kalau belum
  // ada draft sama sekali (openVersion null), tidak ada rekomendasi utk
  // dimuat -- reset ke 'none' tanpa fetch.
  //
  // GUARD RACE: openVersion di-update ASYNC oleh DocumentPane.jsx (sibling
  // terpisah) -- begitu activeId pindah section, ada jeda sebelum openVersion
  // ikut ter-update ke draft section BARU (masih closure/state draft section
  // LAMA sesaat). Tanpa guard ini, effect sempat fetch getRecommendation
  // pakai draftId section lama tapi activeId section baru -- rekomendasi
  // section lama sempat "nyangkut" tampil di section baru. openVersion
  // ditag `_section_id` (lihat DocumentPane.jsx setOpenVersion) supaya bisa
  // dibedakan "openVersion sudah utk activeId ini" vs "masih closure lama".
  useEffect(() => {
    if (!dokumenId || !activeId) return;
    if (openVersion && openVersion._section_id !== activeId) return; // masih closure lama, tunggu
    const draftId = openVersion?.id || null;
    if (recommendation?.section_id === activeId && recommendation?.bab_draft_id === draftId) return;
    if (!draftId) {
      setRecommendation(null);
      setRecommendationStatus(activeId, "none");
      return;
    }
    api.getRecommendation(dokumenId, activeId, draftId)
      .then((result) => {
        setRecommendation(result);
        setRecommendationStatus(activeId, result.status);
      })
      .catch(() => {
        setRecommendation(null);
        // 404 = belum PERNAH ada rekomendasi tersimpan utk draft ini --
        // reset status ke 'none' supaya tombol "Rekomendasikan Dokumen" di
        // panel tengah muncul lagi. Tanpa ini, status basi (mis.
        // 'recommending' dari percobaan yg terputus/reload di tengah jalan)
        // bisa nyangkut selamanya krn tidak match kondisi render manapun.
        setRecommendationStatus(activeId, "none");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumenId, activeId, model, openVersion?.id, openVersion?._section_id]);

  if (!activeId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <p className="text-sm font-medium text-slate-700">Belum ada section aktif</p>
        <p className="text-xs text-slate-500 mt-1 max-w-[220px]">
          Pilih section di sebelah kiri untuk melihat dokumen pendukung, referensi RAG, dan chat revisi.
        </p>
      </div>
    );
  }

  // Alias: referensi RAG (Pedoman/LKPS/Query/Judge) ikut VERSI YANG
  // SEDANG DIBUKA di panel tengah (openVersion dari store), bukan selalu
  // draft aktif -- lihat komentar deklarasi openVersion di atas.
  const draft = openVersion;

  // Prioritas sumber data: kalau draft SUDAH ada, pakai chunk yg BENAR2
  // dipakai sintesis (draft.pedoman_used dst). Kalau draft BELUM ada tapi
  // rekomendasi sudah dianalisis, pakai chunk dari tahap rekomendasi
  // (recommendation.pedoman_used dst) -- supaya user bisa lihat referensi
  // SEBELUM narasi ditulis.
  const pedomanItems = draft?.pedoman_used || recommendation?.pedoman_used || [];
  const lkpsItems    = draft
    ? (draft.chunks_used || []).filter((c) => c.kind === "lkps")
    : (recommendation?.lkps_used || []);
  // Chunk Evidence (bukti dukung) yg BENAR2 dipakai LLM menulis narasi --
  // hasil search_evidence per checklist item, di-scope ke file yg dikonfirmasi
  // user di tahap rekomendasi (lihat _retrieve_facts di generator.py).
  // Hanya tersedia setelah narasi ditulis (belum ada equivalent pra-narasi
  // spt pedoman/rubric/lkps, krn evidence baru di-search stlh checklist ada).
  const evidenceItems = draft
    ? (draft.chunks_used || []).filter((c) => c.kind === "evidence")
    : [];

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-3 border-b border-slate-200 flex gap-1 text-sm overflow-x-auto bg-white sticky top-0 z-10 shrink-0">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.hint}
              className={`relative py-2.5 px-2.5 whitespace-nowrap font-medium text-xs transition-colors
                          ${active ? "text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
              {active && <span className="absolute left-1.5 right-1.5 -bottom-px h-0.5 bg-blue-500 rounded-full" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "recommendation" && (
          recommendation ? (
            <RecommendationPanel dokumenId={dokumenId} sectionId={activeId} recommendation={recommendation} openVersion={draft} />
          ) : (
            <EmptyState
              title="Belum ada rekomendasi"
              message='Klik "Rekomendasikan Dokumen" di panel tengah untuk memulai.'
            />
          )
        )}

        {tab === "draft" && (
          <div className="p-6">
            {draftVersions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-500 mb-3">
                  Klik salah satu versi untuk ditampilkan di panel tengah.
                </p>
                {draftVersions.map((v) => {
                  const isSelected = (selectedDraftId || activeDraftId) === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedDraftId(v.id)}
                      className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl bg-white shadow-sm
                                  ring-1 transition-all
                                  ${isSelected ? "ring-blue-400 shadow-md" : "ring-slate-200 hover:ring-blue-300 hover:shadow-md"}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-semibold text-sm">
                        {v.versi}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800 text-sm">Draft {v.versi}</span>
                          {v.id === activeDraftId && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300">
                              Aktif
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatDate(v.dibuat_pada)}
                        </p>
                        {v.preview && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{v.preview}…</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="Belum ada draft" message="Histori versi akan muncul di sini setelah narasi ditulis." />
            )}
          </div>
        )}

        {tab === "query" && (
          <div className="p-6">
            <p className="text-sm text-slate-500 mb-3">
              Checklist query yang dipakai LLM untuk RAG LKPS + Evidence saat generate narasi (draft aktif).
            </p>
            {draft?.checklist?.length > 0 ? (
              <div className="space-y-2">
                {draft.checklist.map((q, i) => (
                  <div key={i} className="ring-1 ring-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-white shadow-sm">
                    {q}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Belum ada query" message="Muncul setelah narasi ditulis." />
            )}
          </div>
        )}

        {tab === "pedoman" && (
          <div className="p-6">
            <CardList
              hint="RAG 1 — Aturan / struktur penulisan dari pedoman LED-PS."
              items={pedomanItems}
              renderItem={(p, i) => (
                <Card key={i} accent="blue" badge={`[${i + 1}]`} title={p.id}>
                  {p.text}
                </Card>
              )}
              emptyMessage="Belum ada pedoman."
            />
          </div>
        )}

        {tab === "lkps" && (
          <div className="p-6">
            <LkpsTab lkpsItems={lkpsItems} evidenceItems={evidenceItems} usingDraft={!!draft} />
          </div>
        )}

        {tab === "judge" && (
          <div className="p-6">
            <JudgeTab draft={draft} />
          </div>
        )}

        {tab === "chat" && (
          <ChatPane />
        )}
      </div>
    </div>
  );
}

/* ---------- sub components (dipindah/disederhanakan dari DocumentPane.jsx) ---------- */

function CardList({ hint, items, renderItem, emptyMessage }) {
  return (
    <div>
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

const CHUNK_KIND_STYLE = {
  lkps:     { label: "LKPS",     wrap: "bg-purple-50/60 ring-purple-200", badge: "bg-purple-600" },
  evidence: { label: "EVIDENCE", wrap: "bg-teal-50/60   ring-teal-200",   badge: "bg-teal-600"   },
};

function ChunkItem({ c, i, kind = "lkps" }) {
  const style = CHUNK_KIND_STYLE[kind] || CHUNK_KIND_STYLE.lkps;
  return (
    <div className={`ring-1 rounded-lg p-3 shadow-sm ${style.wrap}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-1.5 py-0.5 rounded text-white font-semibold ${style.badge}`}>{style.label}</span>
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
}

function LkpsTab({ lkpsItems, evidenceItems, usingDraft }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          RAG 3 — <span className="font-medium text-purple-700">LKPS</span> (data kuantitatif,
          sitasi berdasarkan sheet), {usingDraft ? "di-retrieve per item checklist." : "hasil tahap rekomendasi dokumen."}
        </p>
        {lkpsItems.length > 0 ? (
          <div className="space-y-2">
            {lkpsItems.map((c, i) => <ChunkItem key={c.id || i} c={c} i={i} kind="lkps" />)}
          </div>
        ) : (
          <EmptyState title="Belum ada data LKPS." />
        )}
      </div>

      <div className="space-y-3 pt-4 border-t border-slate-100">
        <p className="text-sm text-slate-500">
          RAG 4 — <span className="font-medium text-teal-700">Evidence</span> (bukti dukung),
          top chunk dari dokumen yang dipilih di tahap rekomendasi, di-retrieve per item checklist saat narasi ditulis.
        </p>
        {evidenceItems.length > 0 ? (
          <div className="space-y-2">
            {evidenceItems.map((c, i) => <ChunkItem key={c.id || i} c={c} i={i} kind="evidence" />)}
          </div>
        ) : (
          <EmptyState
            title="Belum ada evidence dipakai."
            message={usingDraft ? "Tidak ada dokumen terpilih, atau belum ada chunk relevan ditemukan." : "Muncul setelah narasi ditulis."}
          />
        )}
      </div>
    </div>
  );
}

function JudgeTab({ draft }) {
  const jr = draft?.judge_result;
  if (!jr) return <EmptyState title="Belum ada hasil judge." message="Muncul setelah narasi ditulis." />;

  const METRICS = [
    { key: "faithfulness",      label: "Faithfulness",      desc: "% klaim ter-dukung context" },
    { key: "answer_relevancy",  label: "Answer Relevancy",  desc: "relevansi dgn section" },
    { key: "context_precision", label: "Context Precision", desc: "% chunk relevan" },
    { key: "context_recall",    label: "Context Recall",    desc: "coverage fakta ground-truth" },
  ];

  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-1 gap-3">
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
                <span className="font-medium text-slate-800 text-sm">{label}</span>
                <span className={`text-2xl font-bold tabular-nums ${TONE.text}`}>
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
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
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
