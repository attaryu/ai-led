"""Ekstraksi & chunking dokumen Evidence -- diadaptasi dari
code/new_extract_mechanism.ipynb (Bagian 4) dan code/mineru_extract_chunk.ipynb,
direfaktor jadi modul importable supaya bisa dipakai worker_tasks.py per 1
dokumen (bukan batch 1691 file spt notebook).

Fasad publik: process_file() -- terima 1 path file evidence, kembalikan list
chunk dict {entity, text, chunk_id, ...} siap diinsert ke chunk_bukti_dukung
dan diembed ke Chroma.
"""
from .pipeline import process_file, resolve_file_kind, UnsupportedFileError

__all__ = ["process_file", "resolve_file_kind", "UnsupportedFileError"]
