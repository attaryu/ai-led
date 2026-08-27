import { useMemo, useState } from "react";
import { useStore } from "../lib/store.js";

/* ---------- styling per level ---------- */

// Lebar indent per kedalaman (px). 0 = BAB, naik per level.
const INDENT_PX = 14;

// Style chip marker per level — biar mata bisa cepat lihat tingkatan.
const LEVEL_STYLE = {
  bab:            { chip: "bg-slate-900 text-white",         label: "BAB",         dot: "bg-slate-900" },
  sub_bab:        { chip: "bg-blue-700 text-white",          label: "Sub-bab",     dot: "bg-blue-600" },
  sub_sub_bab:    { chip: "bg-indigo-600 text-white",        label: "C.x",         dot: "bg-indigo-500" },
  subsub_num:     { chip: "bg-violet-500 text-white",        label: "x.y",         dot: "bg-violet-400" },
  list_num:       { chip: "bg-emerald-500 text-white",       label: "n)",          dot: "bg-emerald-400" },
  list_dot:       { chip: "bg-teal-500 text-white",          label: "n.",          dot: "bg-teal-400" },
  list_alpha:     { chip: "bg-amber-500 text-white",         label: "a)",          dot: "bg-amber-400" },
  list_alpha_dot: { chip: "bg-orange-500 text-white",        label: "a.",          dot: "bg-orange-400" },
  list_roman_up:  { chip: "bg-rose-600 text-white",          label: "I.",          dot: "bg-rose-500" },
  list_roman_lo:  { chip: "bg-pink-500 text-white",          label: "i.",          dot: "bg-pink-400" },
};

const DEFAULT_STYLE = { chip: "bg-gray-400 text-white", label: "—", dot: "bg-gray-400" };
const styleFor = (lv) => LEVEL_STYLE[lv] || DEFAULT_STYLE;

/* ---------- helpers ---------- */

// Bangun struktur grup: tiap entry root = BAB, children-nya semua section di
// bawahnya secara berurutan (flat tapi tetap dengan depth).
function groupByBab(sections) {
  const groups = [];
  let cur = null;
  for (const s of sections) {
    if (s.level === "bab") {
      cur = { bab: s, items: [] };
      groups.push(cur);
    } else if (cur) {
      cur.items.push(s);
    } else {
      // section sebelum BAB pertama (jarang, tapi safety)
      if (!groups.length || groups[0].bab !== null) {
        groups.unshift({ bab: null, items: [] });
      }
      groups[0].items.push(s);
    }
  }
  return groups;
}

/* ---------- komponen ---------- */

export default function Outline() {
  const sections    = useStore((s) => s.sections);
  const activeId    = useStore((s) => s.activeId);
  const setActiveId = useStore((s) => s.setActiveId);
  const model       = useStore((s) => s.model);
  const generating  = useStore((s) => s.generating);

  const groups = useMemo(() => groupByBab(sections), [sections]);
  const [collapsed, setCollapsed] = useState({});  // { babId: true }
  const [query, setQuery] = useState("");

  const toggleBab = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const matchesQuery = (s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (s.full_title || "").toLowerCase().includes(q) ||
      (s.marker     || "").toLowerCase().includes(q) ||
      (s.id         || "").toLowerCase().includes(q)
    );
  };

  return (
    <aside className="border-r border-gray-200 bg-white overflow-y-auto w-[320px] flex flex-col">
      {/* sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 py-2">
        <div className="text-xs font-semibold uppercase text-gray-500 mb-1.5">
          Outline LED
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari marker/judul… (mis. C.3.3)"
          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded
                     focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <div className="text-[10px] text-gray-400 mt-1">
          {sections.length} entri · {groups.length} BAB
        </div>
      </div>

      {/* tree */}
      <div className="flex-1 overflow-y-auto pb-4">
        {groups.map((g, gi) => {
          const babKey = g.bab ? g.bab.id : `__noroot_${gi}`;
          const isOpen = !collapsed[babKey];
          const visibleItems = g.items.filter(matchesQuery);
          const babMatches   = g.bab ? matchesQuery(g.bab) : false;

          // sembunyikan grup tanpa hit saat filtering
          if (query.trim() && !babMatches && visibleItems.length === 0) return null;

          return (
            <div key={babKey} className="mt-1">
              {/* BAB header */}
              {g.bab && (
                <BabHeader
                  section={g.bab}
                  isOpen={isOpen}
                  onToggle={() => toggleBab(babKey)}
                  model={model}
                  generating={generating[g.bab.id]}
                />
              )}
              {/* children */}
              {isOpen && (
                <ul className="relative">
                  {(query.trim() ? visibleItems : g.items).map((s, idx, arr) => (
                    <OutlineNode
                      key={s.id}
                      section={s}
                      isActive={s.id === activeId}
                      onClick={() => setActiveId(s.id)}
                      model={model}
                      isGen={generating[s.id]}
                      isLast={idx === arr.length - 1}
                      prevDepth={arr[idx - 1]?.depth ?? 0}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {sections.length === 0 && (
          <div className="px-3 py-6 text-xs text-gray-400 text-center">
            Memuat outline…
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------- BAB header (collapsible SAJA -- Heading 1 tidak punya narasi,
   tidak bisa jadi activeId/section aktif, lihat lib/generator.py
   SectionNotGeneratableError) ---------- */

function BabHeader({ section, isOpen, onToggle, model, generating }) {
  const approved = (section.drafts || []).some((d) => d.model === model && d.status === "approved");
  const hasDraft = (section.drafts || []).some((d) => d.model === model);

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-stretch text-left bg-slate-50 border-y border-gray-200 hover:bg-slate-100"
      aria-label={isOpen ? "Sembunyikan" : "Tampilkan"}
      title={isOpen ? "Sembunyikan" : "Tampilkan"}
    >
      <span className="px-2 py-2 text-slate-500">
        <Chevron open={isOpen} />
      </span>
      <span className="flex-1 py-2 pr-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ${styleFor("bab").chip}`}>
            {section.marker}
          </span>
          {approved && <span className="text-green-600 text-xs">✓</span>}
          {!approved && hasDraft && <span className="text-gray-400 text-xs">●</span>}
          {generating && <span className="text-blue-500 text-xs animate-pulse">…</span>}
          <span className="text-[10px] text-gray-400 ml-auto">p.{section.page}</span>
        </div>
        <div className="text-sm font-semibold text-slate-800 mt-0.5">
          {section.title}
        </div>
      </span>
    </button>
  );
}

/* ---------- node (non-BAB) ---------- */

function OutlineNode({ section, isActive, onClick, model, isGen }) {
  const approved = (section.drafts || []).some((d) => d.model === model && d.status === "approved");
  const hasDraft = (section.drafts || []).some((d) => d.model === model);
  const lvSt     = styleFor(section.level);
  // BAB sudah jadi root; child mulai depth=1 (sub_bab). Geser supaya rapat ke kiri.
  const visualDepth = Math.max(0, (section.depth ?? 1) - 1);
  const indent      = visualDepth * INDENT_PX;

  return (
    <li className="relative">
      <button
        onClick={onClick}
        style={{ paddingLeft: 8 + indent }}
        className={`group w-full text-left pr-3 py-1.5 text-sm border-l-2 transition-colors
                    hover:bg-blue-50/60 ${
                      isActive
                        ? "bg-blue-50 border-blue-500"
                        : "border-transparent"
                    }`}
      >
        {/* guide lines kiri (untuk setiap level di atas) */}
        <GuideLines depth={visualDepth} />

        <div className="relative flex items-start gap-2">
          {/* dot connector */}
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${lvSt.dot}`}
          />
          {/* marker chip */}
          <span
            className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 ${lvSt.chip}`}
            title={section.level}
          >
            {section.marker}
          </span>
          {/* title */}
          <span className="flex-1 text-slate-700 leading-snug">
            {section.title || <span className="text-gray-400 italic">(tanpa judul)</span>}
          </span>
          {/* status icons */}
          <span className="flex items-center gap-1 shrink-0">
            {approved && <span className="text-green-600 text-xs" title="Approved">✓</span>}
            {!approved && hasDraft && <span className="text-gray-400 text-xs" title="Has draft">●</span>}
            {isGen && <span className="text-blue-500 text-xs animate-pulse">…</span>}
            <span className="text-[10px] text-gray-400 group-hover:text-gray-500">
              p.{section.page}
            </span>
          </span>
        </div>
      </button>
    </li>
  );
}

/* ---------- guide lines: garis vertikal samar untuk setiap level di atas node ---------- */

function GuideLines({ depth }) {
  if (depth <= 0) return null;
  return (
    <>
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute top-0 bottom-0 border-l border-dashed border-gray-200"
          style={{ left: 8 + i * INDENT_PX + 6 /* offset agar nyambung ke dot */ }}
        />
      ))}
    </>
  );
}

/* ---------- chevron ---------- */

function Chevron({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12"
      className={`transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
