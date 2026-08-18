import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import UploadZone from "../components/UploadZone.jsx";

const POLL_INTERVAL_MS = 4000;

const STATUS_STYLE = {
  pending:    { dot: "bg-slate-400",              label: "Menunggu" },
  processing: { dot: "bg-blue-500 animate-pulse", label: "Diproses" },
  done:       { dot: "bg-emerald-500",            label: "Selesai" },
  failed:     { dot: "bg-rose-500",               label: "Gagal" },
};

const KIND_TONE = {
  evidence: "text-teal-500",
  panduan:  "text-purple-500",
  lkps:     "text-blue-500",
};

/* Bangun isi 1 level folder dari flat list bukti_dukung (folder_path).
   Folder anak = segmen berikutnya setelah currentFolder; file = folder_path
   persis sama dgn currentFolder. */
function useFolderContents(docList, currentFolder) {
  return useMemo(() => {
    const folderNames = new Set();
    const files = [];
    for (const doc of docList) {
      const path = doc.folder_path || "";
      if (path === currentFolder) {
        files.push(doc);
        continue;
      }
      if (!path.startsWith(currentFolder)) continue;
      const rest = path.slice(currentFolder.length);
      const nextSeg = rest.split("/").filter(Boolean)[0];
      if (nextSeg) folderNames.add(nextSeg);
    }
    return {
      folders: [...folderNames].sort(),
      files: files.sort((a, b) => a.nama_dokumen.localeCompare(b.nama_dokumen)),
    };
  }, [docList, currentFolder]);
}

export default function DocumentsPage() {
  const docList    = useStore((s) => s.docList);
  const setDocList = useStore((s) => s.setDocList);
  const pushToast  = useStore((s) => s.pushToast);
  const navigate   = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolder = searchParams.get("folder") || "";
  const [uploadOpen, setUploadOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.listDocuments()
        .then((data) => { if (!cancelled) setDocList(data); })
        .catch((e) => {
          if (!cancelled) {
            console.error("listDocuments", e);
            pushToast({ kind: "error", title: "Gagal memuat dokumen", message: e.message });
          }
        });
    }
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Halaman ini murni file manager utk evidence (bukti_dukung) -- pedoman/
  // rubrik ("intruction/") & LKPS ("data/") adalah referensi sistem, bukan
  // bukti dukung, jadi tidak ikut tampil di sini (tetap bisa diakses lewat
  // tab Pedoman/Rubric/LKPS di editor section).
  const evidenceDocList = useMemo(
    () => docList.filter((d) => d.kind === "evidence"),
    [docList],
  );
  const { folders, files } = useFolderContents(evidenceDocList, currentFolder);
  const q = query.trim().toLowerCase();
  const visibleFolders = q ? folders.filter((f) => f.toLowerCase().includes(q)) : folders;
  const visibleFiles = q ? files.filter((f) => f.nama_dokumen.toLowerCase().includes(q)) : files;

  const breadcrumbSegments = currentFolder.split("/").filter(Boolean);
  const hasInFlight = evidenceDocList.some((d) => d.status === "pending" || d.status === "processing");

  function goToFolder(path) {
    setQuery("");
    if (path) setSearchParams({ folder: path });
    else setSearchParams({});
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-1 text-xs text-slate-400 mb-2 flex-wrap">
          <button onClick={() => goToFolder("")} className="hover:text-blue-600 hover:underline font-medium">
            Home
          </button>
          {breadcrumbSegments.map((seg, i) => {
            const pathSoFar = breadcrumbSegments.slice(0, i + 1).join("/") + "/";
            return (
              <span key={i} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => goToFolder(pathSoFar)} className="hover:text-blue-600 hover:underline">
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari di folder ini…"
            className="flex-1 max-w-xs text-sm px-3 py-1.5 border border-slate-300 rounded-lg
                       focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-xs text-slate-400">
            {evidenceDocList.length} dokumen{hasInFlight && " · memantau status…"}
          </span>
          <button
            onClick={() => setUploadOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                       bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Upload
          </button>
        </div>
      </div>

      {/* Grid isi folder */}
      <div className="flex-1 overflow-y-auto p-5">
        {visibleFolders.length === 0 && visibleFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
            <FolderIcon size={40} className="text-slate-300" />
            {q ? "Tidak ada hasil yang cocok." : "Folder ini kosong. Upload file untuk memulai."}
          </div>
        )}

        {visibleFolders.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1 mb-4">
            {visibleFolders.map((name) => (
              <button
                key={name}
                onClick={() => goToFolder(`${currentFolder}${name}/`)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg
                           hover:bg-slate-100 transition-colors text-center"
              >
                <FolderIcon size={40} className="text-amber-500" />
                <span className="text-xs text-slate-700 line-clamp-2 leading-snug w-full" title={name}>{name}</span>
              </button>
            ))}
          </div>
        )}

        {visibleFiles.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1">
            {visibleFiles.map((doc) => {
              const st = STATUS_STYLE[doc.status] || STATUS_STYLE.pending;
              const iconTone = KIND_TONE[doc.kind] || KIND_TONE.evidence;
              return (
                <button
                  key={doc.id}
                  onClick={() => navigate(`/documents/${doc.id}`, { state: { kind: doc.kind } })}
                  title={doc.status === "failed" ? doc.error_message : doc.nama_dokumen}
                  className="relative flex flex-col items-center gap-1.5 p-3 rounded-lg
                             hover:bg-slate-100 transition-colors text-center"
                >
                  <span className={`absolute top-2 right-3 w-2 h-2 rounded-full ${st.dot}`} title={st.label} />
                  <FileIcon size={40} className={iconTone} />
                  <span className="text-xs text-slate-700 line-clamp-2 leading-snug w-full">{doc.nama_dokumen}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setUploadOpen(false); }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Upload dokumen</h3>
              <button
                onClick={() => setUploadOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <UploadZone />
          </div>
        </div>
      )}
    </div>
  );
}

function FolderIcon({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 ${className}`}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function FileIcon({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 ${className}`}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
