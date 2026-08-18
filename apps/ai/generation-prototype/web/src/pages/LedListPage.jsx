import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";

const STATUS_STYLE = {
  DRAFT:   { label: "Draft",    cls: "bg-amber-100 text-amber-700" },
  REVIEW:  { label: "Review",   cls: "bg-blue-100 text-blue-700" },
  SELESAI: { label: "Selesai",  cls: "bg-emerald-100 text-emerald-700" },
};

/* Halaman utama: tabel semua dokumen LED milik prodi aktif. Klik judul
   masuk ke editor (/led/:dokumenId) -- sidebar disembunyikan di sana,
   lihat App.jsx. */
export default function LedListPage() {
  const dokumenList    = useStore((s) => s.dokumenList);
  const setDokumenList = useStore((s) => s.setDokumenList);
  const pushToast      = useStore((s) => s.pushToast);
  const navigate        = useNavigate();

  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [judul, setJudul] = useState("");
  const [tahunAkademik, setTahunAkademik] = useState("");
  const [creating, setCreating] = useState(false);

  function loadList() {
    api.listLedDocuments()
      .then((data) => { setDokumenList(data); setLoading(false); })
      .catch((e) => {
        setLoading(false);
        pushToast({ kind: "error", title: "Gagal memuat daftar dokumen LED", message: e.message });
      });
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!judul.trim() || !tahunAkademik.trim()) return;
    setCreating(true);
    try {
      const doc = await api.createLedDocument(judul.trim(), tahunAkademik.trim());
      pushToast({ kind: "success", title: "Dokumen LED dibuat", message: doc.judul });
      setCreateOpen(false);
      setJudul("");
      setTahunAkademik("");
      navigate(`/led/${doc.id}`);
    } catch (err) {
      pushToast({ kind: "error", title: "Gagal membuat dokumen LED", message: err.message });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dokumen LED</h1>
          <p className="text-sm text-slate-500">Laporan Evaluasi Diri yang sedang dikerjakan.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg
                     bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Dokumen LED Baru
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <p className="text-sm text-slate-400 text-center py-10">Memuat…</p>
        )}
        {!loading && dokumenList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <DocIcon size={40} className="text-slate-300" />
            <p className="text-sm">Belum ada dokumen LED. Buat yang pertama.</p>
          </div>
        )}
        {!loading && dokumenList.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Judul</th>
                  <th className="text-left font-medium px-5 py-3">Tahun Akademik</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dokumenList.map((doc) => {
                  const st = STATUS_STYLE[doc.status_keseluruhan] || STATUS_STYLE.DRAFT;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <button
                          onClick={() => navigate(`/led/${doc.id}`)}
                          className="font-medium text-blue-700 hover:underline text-left"
                        >
                          {doc.judul}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{doc.tahun_akademik}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Dokumen LED Baru</h3>
              <button
                onClick={() => setCreateOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Judul</label>
                <input
                  type="text"
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  placeholder="Laporan Evaluasi Diri Program Studi ..."
                  autoFocus
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg
                             focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tahun Akademik</label>
                <input
                  type="text"
                  value={tahunAkademik}
                  onChange={(e) => setTahunAkademik(e.target.value)}
                  placeholder="2025/2026"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg
                             focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creating || !judul.trim() || !tahunAkademik.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? "Membuat…" : "Buat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocIcon({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`shrink-0 ${className}`}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}
