import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";
import LedToolbar from "../components/LedToolbar.jsx";
import Outline from "../components/Outline.jsx";
import DocumentPane from "../components/DocumentPane.jsx";
import SectionInfoPane from "../components/SectionInfoPane.jsx";

/* Editor 1 dokumen LED (route /led/:dokumenId) -- sidebar navigasi utama
   disembunyikan selama di halaman ini (lihat App.jsx), digantikan tombol
   "Kembali" di header supaya editor terasa full-screen/fokus-menulis. */
export default function LedEditorPage() {
  const { dokumenId } = useParams();
  const navigate        = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const model             = useStore((s) => s.model);
  const activeId          = useStore((s) => s.activeId);
  const setSections       = useStore((s) => s.setSections);
  const setActiveDokumenId = useStore((s) => s.setActiveDokumenId);
  const setActiveId       = useStore((s) => s.setActiveId);
  const pushToast         = useStore((s) => s.pushToast);

  // Simpan section aktif ke URL (?section=...) supaya refresh/reload tidak
  // kehilangan posisi -- Outline.jsx cuma manggil setActiveId(store), jadi
  // sinkronisasi ke URL dilakukan di sini (satu arah: store -> URL).
  useEffect(() => {
    if (!activeId) return;
    if (searchParams.get("section") === activeId) return;
    setSearchParams({ section: activeId }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Setelah outline termuat, restore section aktif dari URL (kalau ada) --
  // sinkronisasi arah sebaliknya: URL -> store, hanya sekali per dokumenId.
  const restoredRef = useRef(false);

  useEffect(() => {
    setActiveDokumenId(dokumenId);
    restoredRef.current = false;
    return () => {
      setActiveDokumenId(null);
      setActiveId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumenId]);

  useEffect(() => {
    if (!dokumenId) return;
    api.listSections(dokumenId, model)
      .then((sections) => {
        setSections(sections);
        if (!restoredRef.current) {
          restoredRef.current = true;
          const fromUrl = searchParams.get("section");
          if (fromUrl && sections.some((s) => s.id === fromUrl)) {
            setActiveId(fromUrl);
          }
        }
      })
      .catch((e) => {
        console.error("listSections", e);
        pushToast({
          kind: "error",
          title: "Gagal memuat outline",
          message: e.message,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumenId, model, setSections, pushToast]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-11 shrink-0 border-b border-slate-200 bg-white flex items-center px-4">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg
                     text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Kembali ke daftar LED
        </button>
      </div>
      <LedToolbar />
      <div className="grid grid-cols-4 flex-1 overflow-hidden">
        {/* Kiri: outline + dokumen (3/4) */}
        <div className="col-span-3 grid grid-cols-[320px_1fr] overflow-hidden">
          <Outline />
          <DocumentPane />
        </div>
        {/* Kanan: dokumen pendukung/pedoman/rubric/lkps/kualitas AI/chat (1/4) */}
        <div className="col-span-1 border-l border-slate-200 bg-white overflow-hidden shadow-inner">
          <SectionInfoPane />
        </div>
      </div>
    </div>
  );
}
