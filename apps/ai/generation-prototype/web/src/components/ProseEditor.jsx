import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Editor TipTap tunggal dipakai DocumentPane.jsx utk mode BACA (editable=false,
 * menggantikan <ReactMarkdown>) DAN mode EDIT (editable=true, menggantikan
 * <textarea>). `content` = ProseMirror doc JSON (dari openVersion.draft_text
 * atau editText). `onChange(json)` dipanggil dgn editor.getJSON() setiap kali
 * user mengetik (HANYA relevan saat editable=true).
 */
export default function ProseEditor({ content, editable = false, onChange, className = "" }) {
  // onChange dibungkus ref supaya identitas callback yg dipakai di dalam
  // onUpdate SELALU yg terbaru (closure onUpdate dibuat 1x saat editor
  // dibuat, deps [] di bawah) -- tanpa ini, kalau parent (DocumentPane)
  // mengganti fungsi onChange antar render, editor lama tetap manggil
  // versi PERTAMA yg sudah stale (bisa manggil setEditText milik draft
  // yg SUDAH tidak ada lagi setelah hapus, race yg jadi salah satu
  // pemicu crash render).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: content || EMPTY_DOC,
    editable,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "prose-led focus:outline-none",
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkron ulang isi editor kalau `content` berubah dari LUAR (mis. pindah
  // section, pindah versi draft, atau balik dari edit->save) -- TANPA ini,
  // TipTap tetap menampilkan doc lama krn instance editor tidak re-render
  // otomatis dari prop content berubah (beda dari controlled <textarea>).
  // Guard `editor.isDestroyed`: parent (DocumentPane) bisa unmount komponen
  // ini mendadak (mis. openVersion jadi null setelah draft dihapus) SAAT
  // effect ini masih tertunda -- manggil method di instance yg sudah
  // di-destroy TipTap/ProseMirror throw, dan krn tidak ada Error Boundary
  // sebelumnya, itu bikin SELURUH halaman jadi putih kosong.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = content || EMPTY_DOC;
    try {
      // Hindari overwrite kursor user kalau isi sebenarnya sama (mis.
      // re-render tanpa perubahan data nyata).
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
        editor.commands.setContent(next, false);
      }
    } catch {
      // Instance sempat destroyed di antara guard di atas & panggilan ini
      // (race async) -- aman diabaikan, komponen sedang unmount.
    }
  }, [content, editor]);

  // Sinkron editable flag kalau berubah (mode baca <-> edit di komponen yg sama).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  if (!editor || editor.isDestroyed) return null;

  return (
    <div className={className}>
      {editable && <ProseToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

/* Toolbar minimal -- bold/italic/heading/bullet+ordered list SAJA (sesuai
   apa yg memang bisa muncul dari output LLM + edit manual, bukan CMS umum). */
function ProseToolbar({ editor }) {
  const btn = (active, onClick, label, title) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // jangan curi fokus dari editor
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-sm rounded font-medium ${
        active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1 mb-2 pb-2 border-b border-slate-200">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "B", "Bold")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "I", "Italic")}
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2", "Heading")}
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "•", "Bullet list")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "1.", "Numbered list")}
    </div>
  );
}
