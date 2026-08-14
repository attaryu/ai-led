import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

function Btn({ variant = "default", className = "", children, ...props }) {
  const base =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg " +
    "transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50 " +
    "disabled:cursor-not-allowed";
  const VARIANTS = {
    danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400",
    ghost:  "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 focus-visible:ring-slate-400",
  };
  return (
    <button className={`${base} ${VARIANTS[variant] || VARIANTS.ghost} ${className}`} {...props}>
      {children}
    </button>
  );
}

const STATUS_LABEL = {
  pending:    { text: "Menunggu diproses", tone: "text-slate-500" },
  processing: { text: "Sedang diproses…",  tone: "text-blue-600" },
  done:       { text: "Selesai diproses",  tone: "text-emerald-600" },
  failed:     { text: "Gagal diproses",    tone: "text-rose-600" },
};

const POLL_INTERVAL_MS = 4000;

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const pushToast = useStore((s) => s.pushToast);
  // `kind` dioper via router state saat klik file di grid Documents (evidence/panduan/lkps).
  // Kalau kosong (mis. akses langsung/refresh), backend fallback cari di ketiga tabel.
  const kind = location.state?.kind;

  const [doc, setDoc] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Fetch metadata dokumen; poll berkala selama masih pending/processing.
  useEffect(() => {
    let cancelled = false;

    function loadDoc() {
      api.getDocument(id, kind)
        .then((d) => { if (!cancelled) setDoc(d); })
        .catch((e) => {
          if (cancelled) return;
          if (String(e.message).startsWith("404")) {
            setNotFound(true);
          } else {
            pushToast({ kind: "error", title: "Gagal memuat dokumen", message: e.message });
          }
        });
    }

    loadDoc();
    const interval = setInterval(() => {
      if (doc && (doc.status === "done" || doc.status === "failed")) return;
      loadDoc();
    }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind, doc?.status]);

  // Fetch chunk begitu status jadi done.
  useEffect(() => {
    if (!doc || doc.status !== "done") {
      setChunks([]);
      return;
    }
    let cancelled = false;
    setLoadingChunks(true);
    api.getDocumentChunks(id, kind)
      .then((data) => { if (!cancelled) setChunks(data); })
      .catch((e) => {
        if (!cancelled) pushToast({ kind: "error", title: "Gagal memuat chunk", message: e.message });
      })
      .finally(() => { if (!cancelled) setLoadingChunks(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, doc?.status]);

  async function handleDelete() {
    setConfirmOpen(false);
    try {
      await api.deleteDocument(id);
      pushToast({ kind: "success", title: "Dokumen dihapus" });
      navigate(doc?.folder_path ? `/documents?folder=${encodeURIComponent(doc.folder_path)}` : "/documents");
    } catch (e) {
      pushToast({ kind: "error", title: "Gagal menghapus", message: e.message });
    }
  }

  if (notFound) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
        <p className="text-sm">Dokumen tidak ditemukan.</p>
        <Link to="/documents" className="text-sm text-blue-600 hover:underline">
          Kembali ke daftar dokumen
        </Link>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        Memuat…
      </div>
    );
  }

  const st = STATUS_LABEL[doc.status] || STATUS_LABEL.pending;
  const folderSegments = (doc.folder_path || "").split("/").filter(Boolean);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-slate-400 mb-2 flex-wrap">
          <Link to="/documents" className="hover:text-blue-600 hover:underline">Documents</Link>
          {folderSegments.map((seg, i) => {
            const pathSoFar = folderSegments.slice(0, i + 1).join("/") + "/";
            return (
              <span key={i} className="flex items-center gap-1">
                <span>/</span>
                <Link
                  to={`/documents?folder=${encodeURIComponent(pathSoFar)}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {seg}
                </Link>
              </span>
            );
          })}
          <span>/</span>
          <span className="text-slate-600 font-medium">{doc.nama_dokumen}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            title="Kembali"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900 truncate">{doc.nama_dokumen}</h2>
            <p className="text-xs text-slate-400 truncate">{doc.tipe_file}</p>
          </div>
          <span className={`text-sm font-medium ${st.tone}`}>{st.text}</span>
          {doc.kind === "evidence" && (
            <Btn variant="danger" onClick={() => setConfirmOpen(true)}>
              Hapus
            </Btn>
          )}
        </div>
      </div>

      <div className="p-5">
        {doc.status === "failed" && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
            <strong>Error:</strong> {doc.error_message || "Tidak diketahui"}
          </div>
        )}
        {(doc.status === "pending" || doc.status === "processing") && (
          <div className="p-6 text-center text-sm text-slate-400">
            Dokumen sedang {doc.status === "pending" ? "menunggu" : "diproses"}…
            Halaman akan otomatis memperbarui hasil chunk setelah selesai.
          </div>
        )}
        {doc.status === "done" && loadingChunks && (
          <div className="p-6 text-center text-sm text-slate-400">Memuat chunk…</div>
        )}
        {doc.status === "done" && !loadingChunks && chunks.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">
            Tidak ada chunk dihasilkan dari dokumen ini.
          </div>
        )}
        {doc.status === "done" && !loadingChunks && chunks.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{chunks.length} chunk</p>
            {chunks.map((c) => (
              <div key={c.chunk_id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <div className="text-xs font-mono text-slate-400 mb-1">{c.chunk_id}</div>
                <div className="font-semibold text-slate-800 text-sm mb-2">{c.entity}</div>
                <div className="text-sm text-slate-600 whitespace-pre-wrap prose-led">{c.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Hapus "${doc.nama_dokumen}"?`}
        message="File asli dan seluruh chunk hasil ekstraksinya akan dihapus permanen."
        confirmText="Ya, hapus"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
