"""Chunking bukti dukung v2 -- port dari ekstraksi_mineru (1).ipynb (sel 12, 14, 16).

Menggantikan evidence_chunking.py (heading-based tanpa batas ukuran). Perbedaan
pokok yang membuatnya dibuat:

  - Batas chunk MAX_TOKENS=1000 bersatuan TOKEN, bukan karakter. Versi lama
    tidak punya batas sama sekali: besar chunk mengikuti panjang isi di bawah
    satu heading, sehingga ada chunk 51.176 karakter (Renstra PENS 2015-2019).
  - Penggabungan chunk (MERGE_CHUNKS): dari awal ke akhir, tiap chunk digabung
    dengan chunk berikutnya selama total token (isi + konteks) masih <= batas,
    boleh 3 chunk atau lebih. Menggantikan aturan versi notebook sebelumnya yang
    hanya menggabung chunk di bawah MIN_TOKENS=100. Chunk yang berasal dari H1
    lain membawa judul H1-nya; dua chunk tabel tidak digabung.
  - Tabel dipecah per <tr> (HTML) atau per baris (pipe), header diulang di tiap
    bagian -- versi lama meratakan seluruh tabel jadi satu blok.
  - Header/footer berulang antar halaman dideteksi dan dibuang (langkah 2).
  - Pemisah kalimat sadar singkatan Indonesia (dr, Ir, hlm, dsb) supaya chunk
    tidak terbelah di tengah "No. 12" atau "Dr. Budi".
  - Blok "lengket": heading-saja atau teks berakhiran ':' digabung ke blok
    berikutnya, tidak berdiri sebagai chunk tanpa isi.

Bentuk keluaran `chunk_document()` TIDAK dipakai apa adanya oleh worker --
evidence_pipeline.py::_process_pdf yang memetakannya ke kolom lama
{entity, text, chunk_id, confidence}, jadi skema database tidak berubah.
"""
from __future__ import annotations

MAX_TOKENS = 1000      # batas token per chunk (teks + awalan konteks)
MERGE_CHUNKS = True    # True: chunk digabung dengan chunk berikutnya selama total token masih <= MAX_TOKENS
USE_TIKTOKEN = False   # True -> tiktoken (cl100k_base); False -> pendekatan (kata ~ 4 huruf per token)
STRUCTURAL_HEADINGS = True  # True: BAB = H1 & Bagian/Paragraf/Pasal = H2 dikenali dari isinya; False: murni '#' = H1, lainnya = H2


import math, re, sys
from collections import Counter

HF_MAX_CHARS = 80      # blok "pendek" untuk header/footer


HF_EDGE_BLOCKS = 2     # periksa 2 blok teratas & 2 blok terbawah tiap halaman


HF_MIN_PAGES = 3


HF_MIN_RATIO = 0.30


PROTECT_HEADINGS = True    # blok heading (#) tidak pernah dianggap header/footer (perbaikan A)


_TOKRE = re.compile(r"[^\W\d_]+|\d+|[^\w\s]|_", re.U)


_tiktoken = None


def approx_tokens(s: str) -> int:
    """Pseudo-tokenizer: kata = ceil(len/4), angka = ceil(len/3), tiap tanda baca = 1."""
    n = 0
    for m in _TOKRE.finditer(s):
        w = m.group()
        if w[0].isalpha():
            n += math.ceil(len(w) / 4)
        elif w[0].isdigit():
            n += math.ceil(len(w) / 3)
        else:
            n += 1
    return n


def count_tokens(s: str) -> int:
    if _tiktoken is not None:
        return len(_tiktoken.encode(s))
    return approx_tokens(s)


PAGE_RE = re.compile(r"<!--\s*page\s+(\d+)\s+of\s+(\d+)\s*-->", re.I)


COMMENT_RE = re.compile(r"<!--.*?-->")


HEAD_RE = re.compile(r"^(#+)\s*(.*)$")


ONLY_NUM = re.compile(r"^\s*\d+\s*$")


REPEAT_PUNCT = re.compile(r"([.,:;!?])\1+")


def heading_level(text: str) -> int:
    """Langkah 6: '#' -> 1, '##'+ -> 2, selain itu 0."""
    m = HEAD_RE.match(text)
    if not m or not m.group(2).strip():
        return 0
    return 1 if len(m.group(1)) == 1 else 2


def heading_title(text: str) -> str:
    m = HEAD_RE.match(text)
    return m.group(2).strip() if m else text.strip()


def norm_key(s: str) -> str:
    s = re.sub(r"^#+\s*", "", s.strip())
    s = re.sub(r"\d", "#", s.lower())
    return re.sub(r"\s+", " ", s)


def blocks_of(lines):
    """Blok = baris-baris berurutan tanpa baris kosong. Mengembalikan list of list[idx]."""
    out, cur = [], []
    for i, (t, _) in enumerate(lines):
        if t.strip():
            cur.append(i)
        elif cur:
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    return out


def clean(md: str, log: Counter):
    # Langkah 1: hapus baris ber-komentar HTML (nomor halaman dicatat dulu)
    lines, page = [], 1
    for ln in md.split("\n"):
        m = PAGE_RE.search(ln)
        if m:
            page = int(m.group(1))
        if COMMENT_RE.search(ln):
            log["1_komentar_html"] += 1
            continue
        lines.append((ln.rstrip(), page))

    # Langkah 2: header/footer berulang
    pages = sorted({p for _, p in lines})
    npages = len(pages)
    by_page = {p: [] for p in pages}
    for i, (_, p) in enumerate(lines):
        by_page[p].append(i)
    cand = {}   # page -> list of (block idx list, key)
    keycount = Counter()
    for p in pages:
        sub = [lines[i] for i in by_page[p]]
        bl = blocks_of(sub)
        edge = bl[:HF_EDGE_BLOCKS] + bl[-HF_EDGE_BLOCKS:] if len(bl) > HF_EDGE_BLOCKS else bl
        seen = []
        for b in edge:
            if b in seen:
                continue
            seen.append(b)
            txt = " ".join(sub[j][0].strip() for j in b)
            if len(txt) > HF_MAX_CHARS:
                continue
            if PROTECT_HEADINGS and txt.lstrip().startswith('#'):
                continue
            key = norm_key(txt)
            cand.setdefault(p, []).append(([by_page[p][j] for j in b], key, txt))
        for _, key, _ in cand.get(p, []):
            pass
    for p, lst in cand.items():
        for key in {k for _, k, _ in lst}:
            keycount[key] += 1
    drop = set()
    for p, lst in cand.items():
        for idxs, key, txt in lst:
            digits_only = bool(re.fullmatch(r"[\d\s.\-/]+", txt))
            repeated = keycount[key] >= HF_MIN_PAGES and keycount[key] / max(npages, 1) >= HF_MIN_RATIO
            if digits_only or repeated:
                drop.update(idxs)
                log["2_header_footer"] += len(idxs)
                log.setdefault("2_contoh", [])
                if len(log["2_contoh"]) < 6 and txt not in log["2_contoh"]:
                    log["2_contoh"].append(txt)
    lines = [l for i, l in enumerate(lines) if i not in drop]

    out = []
    for t, p in lines:
        # Langkah 3
        if "[Image block]" in t:
            log["3_image_block"] += 1
            continue
        # Langkah 4
        t2 = REPEAT_PUNCT.sub(r"\1", t)
        if t2 != t:
            log["4_tanda_baca_diubah"] += 1
        t = t2
        # Langkah 5
        if ONLY_NUM.match(t):
            log["5_angka_tunggal"] += 1
            continue
        out.append((t, p))
    # rapikan baris kosong beruntun & di tepi
    res = []
    for t, p in out:
        if not t.strip() and (not res or not res[-1][0].strip()):
            continue
        res.append((t, p))
    while res and not res[-1][0].strip():
        res.pop()
    return res


def text_of(lines) -> str:
    return "\n".join(t for t, _ in lines).strip()


def pages_of(lines):
    ps = [p for t, p in lines if t.strip()]
    return (min(ps), max(ps)) if ps else (None, None)


def strip_md(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"^#+\s*", "", s.strip())
    return re.sub(r"[*_\\]", "", s).strip()


def title_candidate(lines):
    """Langkah 13: 5 baris (non-kosong) pertama; ambil baris pertama dengan > 2 kata."""
    first = [t for t, _ in lines if t.strip()][:5]
    for t in first:
        s = strip_md(t)
        if len(s.split()) > 2:
            return s
    return None


class Piece:
    """Atom teks (blok / kalimat / unit H2) + rentang halaman."""
    __slots__ = ("text", "p0", "p1")

    def __init__(self, text, p0, p1):
        self.text, self.p0, self.p1 = text, p0, p1



import re
from collections import Counter

def text_of(lines) -> str:
    """Gabung baris dengan SATU newline; baris kosong (enter ganda) dibuang."""
    return "\n".join(t for t, _ in lines if t.strip()).strip()


def single_newline(s: str) -> str:
    return re.sub(r"\n{2,}", "\n", re.sub(r"[ \t]+\n", "\n", s)).strip()


STICKY_UNIT_TOKENS = 25


RE_BAB = re.compile(r"^(?:#+\s*)?(BAB\s+[IVXLC]+)\.?\s*$", re.I)


RE_SUB = re.compile(r"^(?:#+\s*)?((?:Bagian|Paragraf)\s+[A-Za-z0-9 ]{1,25}|Pasal\s+\d+[A-Za-z]?)\s*$")


def normalize_headings(lines):
    out, n = [], 0
    for t, p in lines:
        s = t.strip()
        m = RE_BAB.match(s)
        if m and len(s) < 20:
            new = "# " + re.sub(r"^#+\s*", "", s); n += new != t
            out.append((new, p)); continue
        m = RE_SUB.match(s)
        if m and len(s) < 40:
            new = "## " + re.sub(r"^#+\s*", "", s); n += new != t
            out.append((new, p)); continue
        out.append((t, p))
    return out, n


ABBR = {"dr", "ir", "no", "st", "mt", "mm", "prof", "hlm", "jl", "sdr", "drs", "hj", "tgl", "dsb", "dst",
        "yth", "ttd", "cq", "mis", "spt", "al", "vs", "kab", "kec", "kel", "ds", "sh", "mh", "se", "ak", "mp"}


SENT_CAND = re.compile(r"([.?!])(\s+)")


def split_sentences(text: str):
    parts, last = [], 0
    for m in SENT_CAND.finditer(text):
        before = text[last:m.start()]
        prev = re.findall(r"[A-Za-z]+$", text[:m.start()])
        word = prev[0].lower() if prev else ""
        nxt = text[m.end():m.end() + 1]
        if m.group(1) == "." and (word in ABBR or (len(word) == 1 and word.isalpha()) or re.search(r"\b[A-Za-z]\.[A-Za-z]$", text[:m.start()])):
            continue
        if nxt and nxt.islower():
            continue
        parts.append(text[last:m.end(1)])
        last = m.end()
    parts.append(text[last:])
    return [p for p in parts if p.strip()]


def html_table_parts(line: str, limit: int):
    """Pecah tabel HTML per <tr>; baris pertama (header) diulang di tiap bagian; tag selalu seimbang."""
    rows = re.findall(r"<tr>.*?</tr>", line, flags=re.S)
    if len(rows) < 2:
        return [line]
    head, body = rows[0], rows[1:]
    parts, cur = [], []
    for r in body:
        if cur and count_tokens("<table>" + head + "".join(cur) + r + "</table>") > limit:
            parts.append("<table>" + head + "".join(cur) + "</table>"); cur = []
        cur.append(r)
    if cur:
        parts.append("<table>" + head + "".join(cur) + "</table>")
    return parts


def pipe_table_parts(lines, limit):
    head, rows = lines[:2], lines[2:]
    parts, cur = [], []
    for r in rows:
        if cur and count_tokens("\n".join(head + cur + [r])) > limit:
            parts.append("\n".join(head + cur)); cur = []
        cur.append(r)
    if cur:
        parts.append("\n".join(head + cur))
    return parts or ["\n".join(lines)]


def is_table_text(t: str) -> bool:
    s = t.lstrip()
    return s.startswith("<table") or s.startswith("|")


def block_pieces(lines):
    """Blok -> Piece, dengan E (lengket): heading-saja / berakhiran ':' digabung ke blok berikutnya."""
    raw = []
    for b in blocks_of(lines):
        sub = [lines[i] for i in b]
        raw.append((sub, "\n".join(t for t, _ in sub).strip()))
    out, i = [], 0
    while i < len(raw):
        sub, txt = raw[i]
        sticky = all(heading_level(t) for t, _ in sub) or txt.rstrip().endswith(":")
        if sticky and i + 1 < len(raw):
            nsub, ntxt = raw[i + 1]
            if count_tokens(txt + "\n" + ntxt) <= LIMIT_NOW[0]:
                raw[i + 1] = (sub + [("", sub[-1][1])] + nsub, txt + "\n" + ntxt)
                i += 1
                continue
        out.append(Piece(txt, *pages_of(sub)))
        i += 1
    return out


LIMIT_NOW = [1000]


def sentence_pack(text, p0, p1, limit):
    res, cur = [], []

    def flush():
        nonlocal cur
        if cur:
            res.append((Piece(" ".join(x.strip() for x in cur), p0, p1), "kalimat", []))
            cur = []

    for s in split_sentences(text):
        tk = count_tokens(s)
        if tk > limit:
            flush(); res.append((Piece(s.strip(), p0, p1), "kalimat", ["oversize"])); continue
        if cur and count_tokens(" ".join(x.strip() for x in cur) + " " + s) > limit:
            flush()
        cur.append(s)
    flush()
    return res


def big_block(pc: Piece, limit):
    """Blok > batas: tabel -> per baris; teks -> per kalimat."""
    lines = pc.text.split("\n")
    segs, cur, kind = [], [], None
    for ln in lines:
        k = "t" if is_table_text(ln) else "x"
        if cur and k != kind:
            segs.append((kind, cur)); cur = []
        kind = k; cur.append(ln)
    if cur:
        segs.append((kind, cur))
    out = []
    for kind, ls in segs:
        if kind == "t":
            if ls[0].lstrip().startswith("<table"):
                parts = [p for l in ls for p in html_table_parts(l, limit)]
            else:
                parts = pipe_table_parts(ls, limit)
            for p in parts:
                out.append((Piece(p, pc.p0, pc.p1), "tabel", ["oversize"] if count_tokens(p) > limit else []))
        else:
            txt = "\n".join(ls).strip()
            if count_tokens(txt) <= limit:
                out.append((Piece(txt, pc.p0, pc.p1), "blok", []))
            else:
                out.extend(sentence_pack(txt, pc.p0, pc.p1, limit))
    return out


def greedy(pieces, sep, limit, unit_label, big, leads=frozenset()):
    """Gabung berurutan <= limit. Piece 'lead' (heading pendek) tidak boleh jadi elemen terakhir chunk."""
    out, cur = [], []

    def emit(items):
        out.append((Piece(sep.join(x.text for x in items), items[0].p0, items[-1].p1), unit_label, []))

    def flush(final=False):
        nonlocal cur
        if not cur:
            return
        carry = None
        if not final and len(cur) > 1 and id(cur[-1]) in leads:
            carry = cur.pop()
        emit(cur)
        cur = [carry] if carry else []

    for pc in pieces:
        if count_tokens(pc.text) > limit:
            flush(); 
            if cur:
                emit(cur); cur = []
            out.extend(big(pc)); continue
        if cur and count_tokens(sep.join(x.text for x in cur) + sep + pc.text) > limit:
            flush()
        cur.append(pc)
    flush(final=True)
    return out


def block_chunks(lines, limit):
    return greedy(block_pieces(lines), "\n", limit, "blok", lambda b: big_block(b, limit))


def with_heading(lines, limit):
    """block_chunks + heading terdekat ditulis ulang di awal tiap chunk lanjutan (juga di `text`)."""
    heads = [t.strip() for t, _ in lines if heading_level(t)]
    if not heads:
        return block_chunks(lines, limit)
    reserve = max(count_tokens(h) for h in heads) + 1
    out, last = [], None
    for p, s_, f in block_chunks(lines, limit - reserve):
        first = [l for l in p.text.split("\n") if l.strip()]
        if last and first and heading_level(first[0]) == 0:
            p = Piece(last + "\n" + p.text, p.p0, p.p1)
        for l in p.text.split("\n"):
            if heading_level(l):
                last = l.strip()
        out.append((p, s_, f))
    return out


def is_lead(u):
    """Unit 'lead': sangat pendek, atau baris terakhirnya heading (heading tanpa isi)."""
    nz = [t for t, _ in u if t.strip()]
    return count_tokens(text_of(u)) < STICKY_UNIT_TOKENS or (bool(nz) and heading_level(nz[-1]) > 0)


def chunk_section(lines, limit, reserve):
    txt = text_of(lines)
    if count_tokens(txt) <= limit:
        return [(Piece(txt, *pages_of(lines)), "h1", [])]
    eff = limit - reserve
    units, cur = [], []
    for ln in lines:
        if heading_level(ln[0]) == 2 and any(x[0].strip() for x in cur):
            units.append(cur); cur = []
        cur.append(ln)
    if cur:
        units.append(cur)
    if len(units) == 1:
        return [(p, "h1>" + s, f) for p, s, f in with_heading(lines, eff)]
    # E: unit sangat pendek (heading + sedikit teks) lengket ke unit berikutnya
    merged, lead_flags = [], []
    i = 0
    while i < len(units):
        u = units[i]
        if i + 1 < len(units) and is_lead(u) \
                and count_tokens(text_of(u + [("", 0)] + units[i + 1])) <= eff:
            units[i + 1] = u + [("", u[-1][1])] + units[i + 1]
        else:
            merged.append(u)
            lead_flags.append(is_lead(u))
        i += 1
    pieces = [Piece(text_of(u), *pages_of(u)) for u in merged]
    leads = {id(pc) for pc, lf in zip(pieces, lead_flags) if lf}
    lookup = {id(pc): u for pc, u in zip(pieces, merged)}
    return greedy(pieces, "\n", eff, "h2",
                  lambda pc: [(p, "h2>" + s, f) for p, s, f in with_heading(lookup[id(pc)], eff)], leads)


def chunk_document(md: str, doc: str, limit=MAX_TOKENS, merge=True, structural=True):
    prefix = f"Dokumen: {doc}"
    limit_total = limit
    limit = limit_total - count_tokens(prefix) - 1    # awalan doc_id ikut dihitung dalam batas
    LIMIT_NOW[0] = limit
    log = Counter()
    lines = clean(md, log)
    lines, promoted = normalize_headings(lines) if structural else (lines, 0)   # B (structural=False: murni '#'=H1, lainnya H2)
    log["B_heading_diubah"] = promoted
    has_h1 = any(heading_level(t) == 1 for t, _ in lines)
    has_h2 = any(heading_level(t) == 2 for t, _ in lines)
    title = title_candidate(lines)
    if not lines:
        return [], log, {}
    res = []   # (Piece, strategy, flags, ctx)

    def reserve_for(ctx):
        return (count_tokens(ctx) + 2) if ctx else 0

    if not has_h1:
        if has_h2:                                    # C
            for p, s, f in chunk_section(lines, limit, reserve_for(title)):
                res.append((p, "H1virtual>" + s, f, title))
        else:
            for p, s, f in block_chunks(lines, limit - reserve_for(title)):
                res.append((p, "tanpaH>" + s, f, title))
    else:
        first = next(i for i, (t, _) in enumerate(lines) if heading_level(t) == 1)
        pre, rest = lines[:first], lines[first:]
        if text_of(pre):
            ctx = title_candidate(pre)               # langkah 13
            for p, s, f in chunk_section(pre, limit, reserve_for(ctx)):
                res.append((p, "preamble>" + s, f + ([] if ctx else ["tanpa_judul"]), ctx))
        sec = []
        secs = []
        for ln in rest:
            if heading_level(ln[0]) == 1 and sec:
                secs.append(sec); sec = []
            sec.append(ln)
        secs.append(sec)
        for s_ in secs:
            ctx = heading_title(s_[0][0])
            for p, s, f in chunk_section(s_, limit, reserve_for(ctx)):
                res.append((p, s, f, ctx))

    # H. penggabungan chunk: dari awal ke akhir, chunk digabung dengan chunk berikutnya
    #    selama total token (isi + konteks) masih <= batas. Boleh menggabung 3 chunk atau lebih.
    if merge and res:
        def starts_with_ctx(text, ctx):
            return (not ctx) or re.sub(r"^#+\s*", "", text.split("\n", 1)[0]).strip() == ctx or text.startswith(ctx[:40])
        out = [res[0]]
        for pb, sb, fb, cb in res[1:]:
            pa, sa, fa, ca = out[-1]
            can = not ("tabel" in sa and "tabel" in sb) and "oversize" not in fa and "oversize" not in fb
            if can:
                tb = pb.text
                heads_a = [l.strip() for l in pa.text.split("\n") if heading_level(l)]
                first_b = tb.split("\n", 1)[0].strip()
                if heading_level(first_b) and heads_a and heads_a[-1] == first_b and "\n" in tb:
                    tb = tb.split("\n", 1)[1]                    # heading yang sama diulang -> jangan dobel
                elif cb != ca and not starts_with_ctx(tb, cb):
                    tb = f"# {cb}\n{tb}"                          # chunk lanjutan dari H1 lain: bawa judul H1-nya
                joined = pa.text + "\n" + tb
                if count_tokens(joined) + reserve_for(ca) <= limit:
                    out[-1] = (Piece(joined, pa.p0, pb.p1), "gabung", sorted(set(fa + fb)), ca)
                    continue
            out.append((pb, sb, fb, cb))
        res = out

    chunks = []
    for i, (p, strat, flags, ctx) in enumerate(res, 1):
        body = single_newline(p.text)
        head0 = re.sub(r"^#+\s*", "", body.split("\n")[0]).strip()
        flags = list(flags)
        text = f"{prefix}\n{body}"
        need_ctx = bool(ctx) and not (head0 == ctx or body.startswith(ctx[:40]))
        embed = f"{prefix}\n{ctx}\n{body}" if need_ctx else text
        if need_ctx and count_tokens(embed) > limit_total:      # konteks tidak muat -> dilewati
            embed = text
            flags.append("konteks_dilewati")
        t_text, t_emb = count_tokens(text), count_tokens(embed)
        if t_emb > limit_total and "oversize" not in flags:
            flags.append("oversize")
        if "<table" in body:
            flags.append("html_table")
        if count_tokens(body) < 30:
            flags.append("sangat_pendek")
        chunks.append({
            "doc_id": doc, "chunk_id": f"{doc}#{i:03d}", "strategy": strat, "context": ctx,
            "headings": [heading_title(x) for x in body.split("\n") if heading_level(x)][:8],
            "page_start": p.p0, "page_end": p.p1, "tokens": t_text, "tokens_embed": t_emb,
            "flags": flags, "text": text, "embed_text": embed, "content": body,
        })
    return chunks, log, {"has_h1": has_h1, "has_h2": has_h2, "title": title}
