"""T6: Parse LED PDF ground-truth → split per section → simpan jadi .txt.

Output: /data/led_existing_split/<section_id>.txt
"""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, "/app")

PDF_DIR = Path("/data/led_existing")
OUT_DIR = Path("/data/led_existing_split")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def find_pdf() -> Path:
    candidates = list(PDF_DIR.glob("**/[Setelah AL]*LED*.pdf"))
    if not candidates:
        candidates = list(PDF_DIR.glob("**/*LED*.pdf"))
    if not candidates:
        candidates = list(PDF_DIR.glob("**/*.pdf"))
    if not candidates:
        raise FileNotFoundError(f"Tidak ada PDF LED di {PDF_DIR}")
    return candidates[0]


def main():
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("PyMuPDF tidak ada. Install: pip install pymupdf")
        sys.exit(1)

    pdf_path = find_pdf()
    print(f"Parse: {pdf_path}")

    doc = fitz.open(str(pdf_path))
    full_text = ""
    for p in doc:
        full_text += "\n" + (p.get_text("text") or "")
    doc.close()

    # Split berdasarkan heading pola yg sama dgn get_subbab.ipynb
    # Pakai pola yg cukup permissive: BAB X | A. ... | C.1 ...
    section_ids = ["BAB-I", "C.1", "C.2", "C.3", "C.4", "C.5", "C.6", "C.7",
                   "BAB-III", "BAB-IV"]
    patterns = {
        "BAB-I":   r"^BAB\s+I\.",
        "BAB-III": r"^BAB\s+III\.",
        "BAB-IV":  r"^BAB\s+IV\.",
        "C.1":     r"^C\.1\b",
        "C.2":     r"^C\.2\b",
        "C.3":     r"^C\.3\b",
        "C.4":     r"^C\.4\b",
        "C.5":     r"^C\.5\b",
        "C.6":     r"^C\.6\b",
        "C.7":     r"^C\.7\b",
    }

    lines = full_text.split("\n")
    # Cari boundary line untuk tiap section
    boundaries = []  # list (section_id, line_idx)
    for i, ln in enumerate(lines):
        s = ln.strip()
        for sid, pat in patterns.items():
            if re.match(pat, s):
                boundaries.append((sid, i))
    boundaries.sort(key=lambda x: x[1])

    # Dedup: first occurrence per sid yg muncul di body (skip TOC).
    # TOC biasanya di 30 halaman pertama → kita ambil occurrence yg muncul
    # paling banyak teks setelahnya (heuristik kasar).
    seen_sid = {}
    for sid, i in boundaries:
        # ambil yg terakhir kali muncul (asumsi: TOC duluan, body belakangan)
        seen_sid[sid] = i

    # Sort by line index
    items = sorted(seen_sid.items(), key=lambda kv: kv[1])
    # Tambah sentinel akhir
    items.append(("__END__", len(lines)))

    for idx in range(len(items) - 1):
        sid, start = items[idx]
        _, end = items[idx + 1]
        body = "\n".join(lines[start:end]).strip()
        if not body or len(body) < 100:
            print(f"  [SKIP] {sid} terlalu pendek ({len(body)} chars)")
            continue
        out = OUT_DIR / f"{sid}.txt"
        out.write_text(body, encoding="utf-8")
        print(f"  [OK]   {sid:<8} -> {out.name} ({len(body)} chars)")

    print(f"\n✅ Output: {OUT_DIR}")


if __name__ == "__main__":
    main()
