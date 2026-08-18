import { useEffect } from "react";
import { Routes, Route, useLocation, matchPath } from "react-router-dom";
import { useStore } from "./lib/store.js";
import { api } from "./lib/api.js";
import Sidebar from "./components/Sidebar.jsx";
import Toaster from "./components/Toaster.jsx";
import LedListPage from "./pages/LedListPage.jsx";
import LedEditorPage from "./pages/LedEditorPage.jsx";
import DocumentsPage from "./pages/DocumentsPage.jsx";
import DocumentDetailPage from "./pages/DocumentDetailPage.jsx";

function AccessDenied() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-500">Anda tidak memiliki akses ke halaman ini.</p>
    </div>
  );
}

export default function App() {
  const me = useStore((s) => s.me);
  const meError = useStore((s) => s.meError);
  const setMe = useStore((s) => s.setMe);
  const setMeError = useStore((s) => s.setMeError);

  useEffect(() => {
    api.getMe().then(setMe).catch(() => setMeError());
  }, [setMe, setMeError]);

  // Fail-closed: sebelum /me termuat ATAU kalau gagal dimuat, anggap TIDAK
  // punya akses LED (jangan tampilkan daftar LED dulu sebelum role dikonfirmasi).
  const canSeeLed = !!me && me.role !== "ADMIN";

  const location = useLocation();
  // Sidebar navigasi disembunyikan saat masuk editor 1 dokumen LED, supaya
  // editor terasa full-screen/fokus-menulis (tombol kembali ada di
  // LedEditorPage.jsx sendiri).
  const hideSidebar = !!matchPath("/led/:dokumenId", location.pathname);

  return (
    <div className="h-screen flex bg-slate-100 text-slate-900">
      {!hideSidebar && <Sidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={canSeeLed ? <LedListPage /> : (me || meError) ? <AccessDenied /> : null} />
          <Route path="/led/:dokumenId" element={canSeeLed ? <LedEditorPage /> : (me || meError) ? <AccessDenied /> : null} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
        </Routes>
        <Toaster />
      </div>
    </div>
  );
}
