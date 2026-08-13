import { useEffect } from "react";
import { useStore } from "./lib/store.js";
import { api } from "./lib/api.js";
import TopBar from "./components/TopBar.jsx";
import Outline from "./components/Outline.jsx";
import DocumentPane from "./components/DocumentPane.jsx";
import ChatPane from "./components/ChatPane.jsx";
import Toaster from "./components/Toaster.jsx";

export default function App() {
  const model       = useStore((s) => s.model);
  const setSections = useStore((s) => s.setSections);
  const pushToast   = useStore((s) => s.pushToast);

  useEffect(() => {
    api.listSections(model)
      .then(setSections)
      .catch((e) => {
        console.error("listSections", e);
        pushToast({
          kind: "error",
          title: "Gagal memuat outline",
          message: e.message,
        });
      });
  }, [model, setSections, pushToast]);

  return (
    <div className="h-screen flex flex-col bg-slate-100 text-slate-900">
      <TopBar />
      <div className="grid grid-cols-4 flex-1 overflow-hidden">
        {/* Kiri: outline + dokumen (3/4) */}
        <div className="col-span-3 grid grid-cols-[320px_1fr] overflow-hidden">
          <Outline />
          <DocumentPane />
        </div>
        {/* Kanan: chatbot (1/4) */}
        <div className="col-span-1 border-l border-slate-200 bg-white overflow-hidden shadow-inner">
          <ChatPane />
        </div>
      </div>
      <Toaster />
    </div>
  );
}
