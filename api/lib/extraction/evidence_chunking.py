"""Chunking heading-based (Langkah 1-8) untuk dokumen Evidence hasil MinerU.
Diadaptasi persis dari code/new_extract_mechanism.ipynb Cell 14 (html_table_to_rows)
dan Cell 35-40 (Langkah 1,2,4,5,6,7 + driver Langkah 3)."""
import re

from bs4 import BeautifulSoup


def _empty(val) -> bool:
    return val is None or (isinstance(val, str) and val.strip() == "")


# ---- html table -> grid (dipakai Langkah 1 table flattening) ----

def html_table_to_rows(table_html: str):
    soup = BeautifulSoup(table_html, "html.parser")
    table = soup.find("table")
    trs = table.find_all("tr", recursive=False)
    n_rows = len(trs)
    grid = [dict() for _ in range(n_rows)]
    occupied = set()
    max_col = 0
    for r, tr in enumerate(trs):
        c = 0
        for td in tr.find_all("td", recursive=False):
            while (r, c) in occupied:
                c += 1
            rowspan = int(td.get("rowspan", 1) or 1)
            colspan = int(td.get("colspan", 1) or 1)
            text = re.sub(r"\s+", " ", td.get_text(separator=" ")).strip()
            for rr in range(r, min(r + rowspan, n_rows)):
                for cc in range(c, c + colspan):
                    grid[rr][cc] = text if (rr == r and cc == c) else grid[rr].get(cc, "")
                    occupied.add((rr, cc))
            max_col = max(max_col, c + colspan)
            c += colspan
    return [[grid[r].get(c, "") for c in range(max_col)] for r in range(n_rows)]


# ---- LANGKAH 1: TABLE FLATTENING ----

def _flatten_split_colspan(text: str, colspan: int):
    parts = re.split(r"\s{2,}", text.strip())
    return parts if len(parts) == colspan else None


def _table_mode_and_rows(col_names, data_rows_raw, header_rows_raw):
    """Tentukan mode (a) KEY-VALUE / (b) HEADER+DATA / (c) FALLBACK, hasil satu string baris."""
    n_cols = len(col_names)

    if n_cols == 2:
        all_rows = header_rows_raw + data_rows_raw
        n_colon = sum(1 for row in all_rows if re.match(r"^[:：]", str(row[1]).strip()))
        cond1 = len(all_rows) > 0 and (n_colon / len(all_rows)) >= 0.5
        col1_short = all(len(str(row[0]).strip()) <= 25 for row in all_rows)
        col0_long = len(str(all_rows[0][1]).strip()) > 15 if all_rows else False
        cond2 = col1_short and col0_long
        if cond1 or cond2:
            pairs = []
            for row in all_rows:
                key = str(row[0]).strip()
                val = re.sub(r"^[:：]\s*", "", str(row[1]).strip())
                pairs.append(f"{key} : {val}")
            return "a", "; ".join(p + ";" for p in pairs) if pairs else ""

    header_ok = bool(col_names) and all(
        str(h).strip() != "" and not re.match(r"^[:：]|^\d+$", str(h).strip()) for h in col_names
    )
    if header_ok:
        row_strs = []
        for row in data_rows_raw:
            pairs = [f"{col_names[i]} : {row[i]}" for i in range(n_cols)
                     if i < len(row) and not _empty(row[i])]
            if pairs:
                row_strs.append(", ".join(pairs))
        return "b", "; ".join(row_strs)

    row_strs = []
    for row in data_rows_raw:
        pairs = [f"{col_names[i] if i < len(col_names) else f'col_{i}'} : {row[i]}"
                 for i in range(len(row)) if not _empty(row[i])]
        if pairs:
            row_strs.append(", ".join(pairs))
    return "c", "; ".join(row_strs)


def flatten_one_table(table_html: str):
    """Langkah 1.1-1.6 untuk 1 blok <table>. Return (flat_text, confidence_low: bool)."""
    grid_rows = html_table_to_rows(table_html)
    grid_rows = [[re.sub(r"\s+", " ", str(cell)).strip() for cell in row] for row in grid_rows]
    if not grid_rows:
        return "", False
    n_cols = len(grid_rows[0])

    row0 = grid_rows[0]
    needs_subheader = False
    if len(grid_rows) >= 1:
        non_empty_idx = [i for i, v in enumerate(row0) if v]
        if len(non_empty_idx) == 1 and n_cols > 1:
            parts = _flatten_split_colspan(row0[non_empty_idx[0]], n_cols)
            if parts:
                row0 = parts
            else:
                needs_subheader = True

    if needs_subheader and len(grid_rows) >= 3:
        col_names = [f"{row0[i] if i < len(row0) else ''} {grid_rows[1][i]}".strip()
                     for i in range(n_cols)]
        data_start = 2
    else:
        col_names = row0
        data_start = 1

    header_rows_raw = [grid_rows[0]] if data_start == 1 else []
    data_rows_raw = grid_rows[data_start:]

    mode, flat = _table_mode_and_rows(col_names, data_rows_raw, header_rows_raw)
    return flat, (mode == "c")


def apply_table_flattening(raw_md: str):
    """Langkah 1: ganti semua blok <table> dgn hasil flatten. Return (new_md, any_fallback_low)."""
    any_low = False

    def _repl(m):
        nonlocal any_low
        flat, is_low = flatten_one_table(m.group(0))
        if is_low:
            any_low = True
        return flat

    new_md = re.sub(r"<table>.*?</table>", _repl, raw_md, flags=re.DOTALL)
    return new_md, any_low


# ---- LANGKAH 2: NORMALISASI NEWLINE ----

def normalize_newlines(text: str) -> str:
    return re.sub(r"\n{2,}", "\n", text)


# ---- LANGKAH 4: KLASIFIKASI SHAPE HEADING ----

def classify_evidence_shape(text: str):
    t = text.strip()
    if re.match(r"^BAB\s+\d+", t, re.IGNORECASE):
        return "BAB", None
    if re.match(r"^Pasal\s+\d+", t, re.IGNORECASE):
        return "PASAL", None
    if re.match(r"^Bagian\s+\S", t, re.IGNORECASE):
        return "BAGIAN", None
    m = re.match(r"^(\d+(?:\.\d+)*)\.?(?=[\s.]|[A-Za-z]|$)", t)
    if m:
        dec = m.group(1)
        d = dec.count(".") + 1
        return f"DEC{d}", d
    return "NONE", None


def parse_evidence_heading_line(line: str):
    m = re.match(r"^(#{1,2})\s+(.*)$", line.rstrip())
    if not m:
        return None
    return m.group(2).strip()


# ---- LANGKAH 5: REKONSTRUKSI HIERARKI (bangun tree) ----

class EvNode:
    __slots__ = ("text", "shape", "depth", "content_lines", "children", "parent")

    def __init__(self, text, shape, depth, parent=None):
        self.text = text
        self.shape = shape
        self.depth = depth
        self.content_lines = []
        self.children = []
        self.parent = parent

    def add_child(self, node):
        node.parent = self
        self.children.append(node)


def build_evidence_tree(lines):
    root = None
    stack = []  # list of (node, depth)

    def top():
        return stack[-1] if stack else None

    for raw in lines:
        heading_text = parse_evidence_heading_line(raw)
        if heading_text is None:
            if stack:
                if raw.strip():
                    stack[-1][0].content_lines.append(raw.strip())
            elif root is not None:
                if raw.strip():
                    root.content_lines.append(raw.strip())
            continue

        shape, dec_d = classify_evidence_shape(heading_text)

        if root is None:
            root = EvNode(heading_text, shape, 1)
            stack = [(root, 1)]
            continue

        if shape == "BAB":
            node = EvNode(heading_text, shape, 2)
            root.add_child(node)
            stack = [(root, 1), (node, 2)]
            continue

        if shape in ("PASAL", "BAGIAN"):
            matched_i = None
            for i in range(len(stack) - 1, -1, -1):
                if stack[i][0].shape == shape:
                    matched_i = i
                    break
            if matched_i is not None:
                stack = stack[:matched_i]
                parent_node = stack[-1][0] if stack else root
                depth = stack[-1][1] + 1 if stack else 2
                node = EvNode(heading_text, shape, depth)
                parent_node.add_child(node)
                stack.append((node, depth))
            elif shape == "BAGIAN":
                bab_i = None
                for i in range(len(stack) - 1, -1, -1):
                    if stack[i][0].shape == "BAB":
                        bab_i = i
                        break
                if bab_i is not None:
                    stack = stack[:bab_i + 1]
                    parent_node, parent_depth = stack[-1]
                    node = EvNode(heading_text, shape, parent_depth + 1)
                    parent_node.add_child(node)
                    stack.append((node, parent_depth + 1))
                else:
                    parent_node, parent_depth = top()
                    node = EvNode(heading_text, shape, parent_depth + 1)
                    parent_node.add_child(node)
                    stack.append((node, parent_depth + 1))
            else:
                parent_node, parent_depth = top()
                node = EvNode(heading_text, shape, parent_depth + 1)
                parent_node.add_child(node)
                stack.append((node, parent_depth + 1))
            continue

        if shape.startswith("DEC"):
            d = dec_d
            target_depth = d + 1
            while stack and stack[-1][1] >= target_depth:
                stack.pop()
            parent_node = stack[-1][0] if stack else root
            node = EvNode(heading_text, shape, target_depth)
            parent_node.add_child(node)
            stack.append((node, target_depth))
            continue

        if len(stack) == 1 and stack[0][0] is root:
            node = EvNode(heading_text, shape, 2)
            root.add_child(node)
            stack.append((node, 2))
        else:
            _, top_depth = top()
            while stack and stack[-1][1] >= top_depth:
                stack.pop()
            parent_node = stack[-1][0] if stack else root
            node = EvNode(heading_text, shape, top_depth)
            parent_node.add_child(node)
            stack.append((node, top_depth))

    return root


# ---- LANGKAH 6: PEMISAHAN BLOK PENGESAHAN/PENUTUP ----

DITETAPKAN_RE = re.compile(r"(?im)^Ditetapkan di\b.*$")


def _last_content_node(node):
    for child in reversed(node.children):
        found = _last_content_node(child)
        if found is not None:
            return found
    if node.content_lines and "\n".join(node.content_lines).strip():
        return node
    return None


def split_pengesahan_block(root):
    if root is None:
        return
    target = _last_content_node(root)
    if target is None:
        return
    joined = "\n".join(target.content_lines)
    m = DITETAPKAN_RE.search(joined)
    if not m:
        return
    idx = m.start()
    content_asli = joined[:idx].strip()
    content_pengesahan = joined[idx:].strip()
    target.content_lines = content_asli.split("\n") if content_asli else []
    pengesahan_node = EvNode("(Blok Pengesahan)", "NONE", 2)
    pengesahan_node.content_lines = content_pengesahan.split("\n")
    root.add_child(pengesahan_node)


# ---- LANGKAH 7: EMIT CHUNK ----

def emit_evidence_chunks(root, filename: str):
    """Traversal pre-order. Return list of dict(H1, breadcrumb, konten, confidence)."""
    if root is None:
        return []
    chunks = []
    pending_titles = []
    H1 = root.text

    def visit(node, ancestors_labels):
        nonlocal pending_titles
        is_leaf = len(node.children) == 0
        content_text = "\n".join(node.content_lines).strip()

        if is_leaf:
            if content_text == "":
                pending_titles.append(node.text)
                return
            if pending_titles:
                own_label = ".".join(pending_titles + [node.text])
                pending_titles = []
            else:
                own_label = node.text
            breadcrumb = ancestors_labels + [own_label]
            chunks.append({
                "H1": H1,
                "breadcrumb": " > ".join(breadcrumb),
                "konten": content_text,
                "confidence": False,
            })
        else:
            if node.children:
                first_child = node.children[0]
                if content_text:
                    first_child.content_lines = node.content_lines + first_child.content_lines
            own_label = node.text
            for child in node.children:
                visit(child, ancestors_labels + [own_label] if node is not root else ancestors_labels)

    if not root.children:
        content_text = "\n".join(root.content_lines).strip()
        if content_text:
            chunks.append({"H1": H1, "breadcrumb": H1, "konten": content_text, "confidence": False})
        return chunks

    if root.content_lines and root.children:
        first_child = root.children[0]
        first_child.content_lines = root.content_lines + first_child.content_lines

    for child in root.children:
        visit(child, [])

    return chunks


# ---- LANGKAH 3 + DRIVER: gate dokumen pendek, lalu Langkah 4-8 ----

def clean_entity_evidence(text: str) -> str:
    text = re.sub(r"[,;:]+(?=[.\s]|$)", "", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text


def chunk_evidence_markdown(raw_md: str, filename: str, fallback_low: bool = False):
    """Jalankan Langkah 1-8 penuh utk 1 dokumen markdown MinerU (sudah watermark-removed).
    Return list of dict {entity, konten, confidence}."""
    flat_md, table_fallback_low = apply_table_flattening(raw_md)
    flat_md = normalize_newlines(flat_md)

    all_lines = flat_md.splitlines()
    content_len = len(" ".join(l.strip() for l in all_lines if l.strip()))

    if content_len < 3000:
        first_heading = None
        for raw in all_lines:
            h = parse_evidence_heading_line(raw)
            if h is not None:
                first_heading = h
                break
        H1 = first_heading if first_heading else filename
        konten = "\n".join(all_lines).strip()
        entity = clean_entity_evidence(f"{filename.replace('_', ' ')} {H1}")
        return [{"entity": entity, "konten": konten, "confidence": "HIGH"}]

    root = build_evidence_tree(all_lines)
    split_pengesahan_block(root)
    raw_chunks = emit_evidence_chunks(root, filename)

    out = []
    for c in raw_chunks:
        entity_mentah = f"{filename.replace('_', ' ')} {c['H1']} {c['breadcrumb']}"
        entity = clean_entity_evidence(entity_mentah)
        confidence = "LOW" if (c["confidence"] or table_fallback_low or fallback_low) else "HIGH"
        out.append({"entity": entity, "konten": c["konten"], "confidence": confidence})
    return out
