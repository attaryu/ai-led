import { useStore } from "../lib/store.js";

/* ----- per-kind styling ----- */
const KIND = {
  success: {
    ring:  "ring-emerald-500/20",
    bar:   "bg-emerald-500",
    icon:  "text-emerald-500",
    iconPath: "M5 13l4 4L19 7",     // checkmark
  },
  error: {
    ring:  "ring-rose-500/30",
    bar:   "bg-rose-500",
    icon:  "text-rose-500",
    iconPath: "M6 18L18 6M6 6l12 12", // x
  },
  warning: {
    ring:  "ring-amber-500/30",
    bar:   "bg-amber-500",
    icon:  "text-amber-500",
    iconPath: "M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 003.83 21h16.34a2 2 0 001.72-3l-8.17-14.14a2 2 0 00-3.43 0z",
  },
  info: {
    ring:  "ring-sky-500/20",
    bar:   "bg-sky-500",
    icon:  "text-sky-500",
    iconPath: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  progress: {
    ring:  "ring-blue-500/30",
    bar:   "bg-blue-500",
    icon:  "text-blue-500",
    iconPath: null, // spinner instead
  },
};

function Icon({ kind }) {
  const s = KIND[kind] || KIND.info;
  if (kind === "progress") {
    return (
      <svg
        className={`w-5 h-5 ${s.icon} animate-spin`}
        fill="none" viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      className={`w-5 h-5 ${s.icon}`}
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
    >
      <path d={s.iconPath} />
    </svg>
  );
}

export default function Toaster() {
  const toasts      = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]"
    >
      {toasts.map((t) => {
        const s = KIND[t.kind] || KIND.info;
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto relative overflow-hidden rounded-lg bg-white shadow-lg ring-1 ${s.ring}
                        animate-[slideIn_220ms_ease-out] flex items-start gap-3 p-3 pr-9`}
            style={{
              animation: "toast-in 220ms cubic-bezier(.22,1,.36,1)",
            }}
          >
            {/* left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />

            <div className="pl-1.5 pt-0.5 shrink-0">
              <Icon kind={t.kind} />
            </div>

            <div className="flex-1 min-w-0 text-sm">
              {t.title && (
                <div className="font-semibold text-slate-800 leading-snug">
                  {t.title}
                </div>
              )}
              {t.message && (
                <div className="text-slate-600 mt-0.5 break-words leading-snug">
                  {t.message}
                </div>
              )}
              {t.progress !== undefined && (
                <div className="mt-2 h-1 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${s.bar} transition-all duration-300`}
                    style={{ width: `${Math.max(0, Math.min(100, t.progress))}%` }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 rounded p-1
                         hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Tutup"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        );
      })}

      {/* keyframes — inline supaya tak perlu modif tailwind.config */}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px) scale(.96); }
          to   { opacity: 1; transform: translateX(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}
