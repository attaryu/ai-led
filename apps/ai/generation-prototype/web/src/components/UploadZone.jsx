import { useRef, useState } from "react";
import { useStore } from "../lib/store.js";
import { api } from "../lib/api.js";

/* Kumpulkan semua File dari sebuah DataTransferItemList (drag&drop), termasuk
   isi folder secara rekursif via webkitGetAsEntry(). */
async function collectFilesFromDataTransfer(dataTransfer) {
  const items = [...dataTransfer.items];
  const files = [];

  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      // Tempel relative path manual krn File dari FileSystemEntry tidak
      // otomatis punya webkitRelativePath terisi.
      Object.defineProperty(file, "webkitRelativePath", {
        value: prefix + entry.name,
        writable: true,
      });
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const child of entries) {
        await walk(child, `${prefix}${entry.name}/`);
      }
    }
  }

  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length > 0) {
    for (const entry of entries) {
      await walk(entry, "");
    }
  } else {
    // Fallback browser tanpa dukungan webkitGetAsEntry
    files.push(...dataTransfer.files);
  }
  return files;
}

export default function UploadZone() {
  const setDocList = useStore((s) => s.setDocList);
  const pushToast  = useStore((s) => s.pushToast);
  const updateToast = useStore((s) => s.updateToast);
  const removeToast  = useStore((s) => s.removeToast);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  async function doUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const tid = pushToast({
      kind: "progress",
      title: `Mengunggah ${files.length} file…`,
    });
    try {
      const created = await api.uploadDocuments(files);
      const fresh = await api.listDocuments();
      setDocList(fresh);
      updateToast(tid, {
        kind: "success",
        title: "Upload berhasil",
        message: `${created.length} file masuk antrean pemrosesan.`,
        duration: 12000,
      });
      setTimeout(() => removeToast(tid), 12000);
    } catch (e) {
      updateToast(tid, {
        kind: "error",
        title: "Upload gagal",
        message: e.message,
        duration: 7000,
      });
      setTimeout(() => removeToast(tid), 7000);
    } finally {
      setUploading(false);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const files = await collectFilesFromDataTransfer(e.dataTransfer);
    doUpload(files);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`m-4 border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white"
      }`}
    >
      <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor"
           strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M7 16a4 4 0 01-.88-7.9A5.5 5.5 0 0117 5.5a5.5 5.5 0 01.5 11H7z" />
        <path d="M12 12v6M9 15l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-sm text-slate-600 mb-1">
        Seret file/folder ke sini, atau
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white
                     hover:bg-blue-700 disabled:opacity-50"
        >
          Pilih file
        </button>
        <button
          onClick={() => folderInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-slate-700
                     border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
        >
          Pilih folder
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        pdf, doc(x), ppt(x), xls(x), txt — maks 200MB/file
      </p>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => doUpload([...e.target.files])}
      />
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => doUpload([...e.target.files])}
      />
    </div>
  );
}
