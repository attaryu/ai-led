"""USANG (ponytail, migrasi 20261007090000_drop_minilm_embeddings).

Kolom `embedding_ami` sudah di-DROP: seluruh sistem kini memakai satu model
embedding (bge-m3) di kolom `embedding`. Skrip ini akan GAGAL kalau dijalankan
-- dibiarkan sebagai jejak, bukan untuk dipakai. Untuk mengisi ulang embedding
sekarang, re-index lewat jalur ingestion biasa.

Isi aslinya di bawah, dikomentari.
"""

# """Fill `embedding_ami` (AMI assessment, ariel's MiniLM 384-d) for LED/evidence chunks indexed before
# migration 20260922080000. Embeds the stored chunk text -- no re-extraction, writing's bge-m3 column untouched.
# Only rows still NULL are touched, so re-running is safe.
#
#     python -m scripts.backfill_ami_embeddings      # from apps/ai, DATABASE_URL set
# """
#
# from __future__ import annotations
#
# import logging
#
# logger = logging.getLogger("backfill_ami")
#
# _TABLES = ("writing_led_chunk_embeddings", "evidence_chunk_embeddings")
# _BATCH = 64
#
#
# def main() -> None:
#     from db.connection import tenant_cursor
#     from vectorstore.pgvector_store import _cursor, embed_documents_ami
#
#     for table in _TABLES:
#         with tenant_cursor(None) as cur:
#             cur.execute(f"SELECT DISTINCT tenant_id FROM {table} WHERE embedding_ami IS NULL")
#             tenants = [r["tenant_id"] for r in cur.fetchall()]
#         for tenant_id in tenants:
#             with _cursor(tenant_id) as cur:
#                 cur.execute(f"SELECT id, text FROM {table} WHERE tenant_id = %s AND embedding_ami IS NULL", (tenant_id,))
#                 rows = cur.fetchall()
#             for i in range(0, len(rows), _BATCH):
#                 batch = rows[i : i + _BATCH]
#                 vectors = embed_documents_ami([r["text"] for r in batch])
#                 with _cursor(tenant_id) as cur:
#                     for r, v in zip(batch, vectors):
#                         cur.execute(f"UPDATE {table} SET embedding_ami = %s WHERE id = %s", (v, r["id"]))
#             logger.info("%s tenant=%s: %d rows", table, tenant_id, len(rows))
#
#
# if __name__ == "__main__":
#     from dotenv import load_dotenv
#
#     load_dotenv()
#     logging.basicConfig(level=logging.INFO)
#     main()
