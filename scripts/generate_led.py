"""T2/T4: Loop semua section utk satu model. Resume-able via SQLite.

Pola:
  for section in outline:
      if (section_id, model) ada di drafts: SKIP
      else: generate + INSERT
  ungenerate
"""
import argparse
import sys

sys.path.insert(0, "/app")

from lib.db import init_db, conn
from lib.outline import get_sections
from lib.generator import generate_section
from lib.ollama_client import unload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True,
                    help="Model Ollama, mis. deepseek-r1:7b atau qwen3.5:9b")
    ap.add_argument("--force", action="store_true",
                    help="Re-generate semua section (overwrite)")
    ap.add_argument("--section", default=None,
                    help="Generate 1 section saja (mis. C.2)")
    args = ap.parse_args()

    init_db()
    outline = get_sections()
    if args.section:
        outline = [s for s in outline if s["id"] == args.section]
        if not outline:
            print(f"Section {args.section} tidak dikenali.")
            sys.exit(1)

    print(f"=== Generate LED dengan {args.model} ===")
    print(f"Total section: {len(outline)} (force={args.force})\n")

    for s in outline:
        sid = s["id"]
        # Pre-check (supaya log lebih jelas, walau generate_section juga cek lagi)
        with conn() as con:
            row = con.execute(
                "SELECT id, length(draft_text) AS L FROM drafts "
                "WHERE section_id=? AND model=?",
                (sid, args.model)).fetchone()
        if row and not args.force:
            print(f"  [SKIP] {sid:<8} sudah ada di DB ({row['L']} chars)")
            continue

        print(f"  [GEN ] {sid:<8} {s['title'][:60]}...", flush=True)
        try:
            r = generate_section(sid, args.model, overwrite=args.force)
            print(f"         → {len(r['draft_text'])} chars, {r.get('latency_sec', 0):.1f}s")
        except Exception as e:
            print(f"         ERROR: {e}")

    print(f"\nMembebaskan VRAM (unload {args.model})…")
    unload(args.model)
    print("✅ Selesai.")


if __name__ == "__main__":
    main()
