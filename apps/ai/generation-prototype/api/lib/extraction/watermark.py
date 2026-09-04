"""Watermark removal -- Hybrid Levenshtein + ROUGE-L. Diadaptasi persis dari
code/new_extract_mechanism.ipynb Cell 33 (algoritma dari rancangan.txt)."""

WATERMARK_REF = "EDUTECH"
WATERMARK_THETA = 0.68
_W_MIN, _W_MAX = 4, len(WATERMARK_REF) + 3  # [4, 10]


def _levenshtein_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[-1]


def _lcs_len(a: str, b: str) -> int:
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    for ca in a:
        curr = [0] * (len(b) + 1)
        for j, cb in enumerate(b, 1):
            curr[j] = prev[j - 1] + 1 if ca == cb else max(prev[j], curr[j - 1])
        prev = curr
    return prev[-1]


def _watermark_score(s: str, r: str = WATERMARK_REF) -> float:
    s_l, r_l = s.lower(), r.lower()
    lev_ratio = 1 - _levenshtein_distance(s_l, r_l) / max(len(s_l), len(r_l))
    rouge_recall = _lcs_len(s_l, r_l) / len(r_l)
    return max(lev_ratio, rouge_recall)


def _clean_token_watermark(token: str, r: str = WATERMARK_REF, theta: float = WATERMARK_THETA) -> str:
    """Hapus segmen watermark dari 1 token (hasil split spasi), iteratif."""
    t = token
    while len(t) >= _W_MIN:
        candidates = []  # (-score, w, i) -- sort key: score tertinggi, lalu w terkecil, lalu i terkecil
        for w in range(_W_MIN, min(_W_MAX, len(t)) + 1):
            for i in range(0, len(t) - w + 1):
                score = _watermark_score(t[i:i + w], r)
                candidates.append((-score, w, i))
        if not candidates:
            break
        neg_score, w, i = min(candidates)
        score = -neg_score
        if score < theta:
            break
        t = t[:i] + t[i + w:]
    return t


def remove_watermark_text(text: str, r: str = WATERMARK_REF, theta: float = WATERMARK_THETA) -> str:
    """Terapkan pembersihan watermark ke seluruh string (per token hasil split spasi)."""
    tokens = text.split(" ")
    cleaned = [_clean_token_watermark(tok, r, theta) if tok else tok for tok in tokens]
    return " ".join(cleaned)
