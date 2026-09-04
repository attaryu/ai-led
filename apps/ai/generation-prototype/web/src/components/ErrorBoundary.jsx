import { Component } from "react";

/* Tanpa error boundary, exception render APAPUN (mis. dari ProseEditor/TipTap
   saat state berubah cepat -- delete draft, ganti section, dst) membuat React
   unmount SELURUH tree tanpa jejak apapun di layar -- user cuma lihat halaman
   putih kosong, tidak ada info sama sekali. Boundary ini menangkapnya di
   level cukup rendah (dibungkus di LedEditorPage.jsx per-panel) supaya sisa
   UI (mis. Outline/Toolbar) tetap hidup, dan user dapat pesan + cara pulih
   TANPA reload penuh (window.location.reload() dulu satu2nya jalan keluar --
   itu sendiri yg bikin user merasa "harus mulai ulang halaman").

   Dua jalur pulih otomatis, tanpa reload:
   1. `resetKey` (opsional) -- kalau prop ini berubah (mis. activeId section
      pindah, ATAU DocumentPane.jsx sengaja menaikkan angka counter setiap
      berhasil refresh data), boundary reset sendiri via
      getDerivedStateFromProps (dibandingkan snapshot terakhir).
   2. Tombol "Coba Lagi" -- reset manual TANPA reload, cukup remount children
      (kebanyakan crash TipTap/state race bersifat sesaat, percobaan render
      ulang berikutnya biasanya sukses krn datanya sudah konsisten). */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, lastResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.lastResetKey) {
      return { error: null, lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Render crash:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-slate-50">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M10.29 3.86l-8.18 14.18A2 2 0 003.83 21h16.34a2 2 0 001.72-3l-8.17-14.14a2 2 0 00-3.43 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Terjadi kesalahan saat menampilkan halaman</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-sm">
            {this.state.error.message || "Error tidak diketahui."}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Coba Lagi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
