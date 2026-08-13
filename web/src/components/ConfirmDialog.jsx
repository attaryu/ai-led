import { useEffect, useRef } from "react";

/* Modal konfirmasi pengganti window.confirm().
 *
 * Props:
 *   open       : bool
 *   title      : str
 *   message    : str | ReactNode
 *   confirmText: default "Konfirmasi"
 *   cancelText : default "Batal"
 *   tone       : 'danger' | 'primary' (warna tombol konfirmasi)
 *   onConfirm  : () => void
 *   onCancel   : () => void
 */
export default function ConfirmDialog({
  open, title, message,
  confirmText = "Konfirmasi", cancelText = "Batal",
  tone = "primary",
  onConfirm, onCancel,
}) {
  const cancelRef = useRef(null);

  // ESC to cancel, autofocus on cancel button
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter")  onConfirm?.();
    };
    window.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const confirmClasses = tone === "danger"
    ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500"
    : "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500";

  const iconColor = tone === "danger" ? "text-rose-500 bg-rose-50" : "text-blue-500 bg-blue-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                    bg-slate-900/50 backdrop-blur-sm
                    animate-[fadeIn_150ms_ease-out]">
      <div
        role="dialog" aria-modal="true" aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-slate-200
                   animate-[popIn_180ms_cubic-bezier(.22,1,.36,1)]"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconColor}`}>
              {tone === "danger" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86l-8.18 14.18A2 2 0 003.83 21h16.34a2 2 0 001.72-3l-8.17-14.14a2 2 0 00-3.43 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8"  x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="confirm-title" className="text-base font-semibold text-slate-900">
                {title}
              </h3>
              <div className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {message}
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-3 bg-slate-50 rounded-b-xl border-t border-slate-100
                        flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg
                       text-slate-700 bg-white border border-slate-300
                       hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
                       transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white
                        focus:outline-none focus-visible:ring-2 transition-colors
                        ${confirmClasses}`}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes popIn  { from{opacity:0; transform:scale(.95)} to{opacity:1; transform:scale(1)} }
      `}</style>
    </div>
  );
}
