import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store.js";
import { api, streamChat } from "../lib/api.js";

export default function ChatPane() {
  const dokumenId        = useStore((s) => s.activeDokumenId);
  const activeId         = useStore((s) => s.activeId);
  const model            = useStore((s) => s.model);
  const sectionDetail    = useStore((s) => s.sectionDetail);
  const setSectionDetail = useStore((s) => s.setSectionDetail);
  const chatHistory      = useStore((s) => s.chatHistory);
  const setChatHistory   = useStore((s) => s.setChatHistory);
  const pushToast        = useStore((s) => s.pushToast);

  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial]     = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!activeId) return setChatHistory([]);
    api.getChatHistory(dokumenId, activeId, model)
      .then(setChatHistory)
      .catch(() => setChatHistory([]));
  }, [dokumenId, activeId, model, setChatHistory]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, partial]);

  function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || streaming || !activeId) return;
    const userMsg = input.trim();
    setChatHistory([...chatHistory, { role: "user", message: userMsg }]);
    setInput("");
    setStreaming(true);
    setPartial("");

    let acc = "";
    streamChat(
      dokumenId, activeId, model, userMsg,
      (tok) => { acc += tok; setPartial(acc); },
      async () => {
        setStreaming(false);
        const hist  = await api.getChatHistory(dokumenId, activeId, model);
        setChatHistory(hist);
        const fresh = await api.getSection(dokumenId, activeId, model);
        setSectionDetail(fresh);
        setPartial("");
      },
      (err) => {
        setStreaming(false);
        setPartial("");
        pushToast({ kind: "error", title: "Chat gagal", message: err.message });
      },
    );
  }

  if (!activeId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700">Belum ada section aktif</p>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
          Pilih section di sebelah kiri untuk mulai chat revisi.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Chat revisi
        </div>
        <div className="text-sm font-mono font-semibold text-slate-800 mt-0.5 truncate">
          {activeId}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 text-sm bg-slate-50/40">
        {chatHistory.map((m, i) => (
          <Bubble key={i} role={m.role}>{m.message}</Bubble>
        ))}
        {streaming && partial && (
          <Bubble role="assistant" streaming>
            {partial}
          </Bubble>
        )}
        {streaming && !partial && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-slate-200/70 text-slate-500 text-xs flex items-center gap-2">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{animationDelay:"0ms"}} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{animationDelay:"150ms"}} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{animationDelay:"300ms"}} />
              </span>
              menghasilkan…
            </div>
          </div>
        )}
        {chatHistory.length === 0 && !streaming && (
          <div className="text-center text-xs text-slate-400 mt-6 px-2 leading-relaxed">
            Mulai minta revisi, mis. <em>“tambahkan data jumlah kerja sama internasional”</em>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="border-t border-slate-200 p-2 bg-white">
        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Minta revisi…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none
                       bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
                       placeholder:text-slate-400"
            disabled={streaming}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl
                       bg-blue-600 text-white hover:bg-blue-700
                       disabled:opacity-40 disabled:cursor-not-allowed
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                       transition-colors"
            title="Kirim (Enter)"
          >
            {streaming ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <div className="text-[10px] text-slate-400 mt-1 px-1">
          Enter untuk kirim · Shift+Enter untuk baris baru
        </div>
      </form>
    </div>
  );
}

function Bubble({ role, streaming, children }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-3.5 py-2 rounded-2xl shadow-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-white text-slate-800 ring-1 ring-slate-200 rounded-tl-sm"
        }`}
      >
        {children}
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 align-baseline bg-slate-500 ml-0.5 animate-pulse" />
        )}
      </div>
    </div>
  );
}
