import { NavLink } from "react-router-dom";
import { useStore } from "../lib/store.js";

/* Menu LED disembunyikan total (bukan disabled) kalau role tidak berhak --
   lihat database.md #2 USER: "komponen yang tidak diizinkan otomatis
   disembunyikan". Sebelum /me termuat (me === null, belum error), LED
   disembunyikan sementara juga -- fail-closed, baru muncul begitu role
   dikonfirmasi berhak. */
export default function Sidebar() {
  const me = useStore((s) => s.me);
  const canSeeLed = !!me && me.role !== "ADMIN";

  return (
    <aside className="w-56 shrink-0 h-full bg-white border-r border-slate-200 flex flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600
                        flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
          L
        </div>
        <div className="leading-tight min-w-0">
          <h1 className="font-bold text-sm text-slate-900 truncate">LED Generator</h1>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 truncate">
            Akreditasi PS
          </p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1">
        {canSeeLed && (
          <SidebarLink to="/" end icon={<LedIcon />} label="LED" />
        )}
        <SidebarLink to="/documents" icon={<DocumentIcon />} label="Document" />
      </nav>

      {me && (
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-700 truncate">{me.nama_lengkap}</p>
          <p className="text-[10px] text-slate-400 truncate">{me.role}</p>
          {me.program_studi_nama && (
            <p className="text-[10px] text-slate-400 truncate mt-0.5">{me.program_studi_nama}</p>
          )}
        </div>
      )}
    </aside>
  );
}

function SidebarLink({ to, end, icon, label }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
          isActive ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function LedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}
