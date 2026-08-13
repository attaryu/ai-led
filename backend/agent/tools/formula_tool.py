"""Tool: compute_formula_score — evaluate quantitative indicator formulas safely."""

from __future__ import annotations

import json
import re

from langchain_core.tools import tool

# Allowlist: digits, arithmetic operators, parentheses, dot, whitespace, word chars
_SAFE_EXPR = re.compile(r"[^0-9\+\-\*/\(\)\.\s\w]")


@tool
def compute_formula_score(formula_expression: str, variables: dict) -> str:
    """Hitung skor numerik menggunakan rumus dari Matriks Penilaian.

    formula_expression: rumus aritmatika Python (gunakan / untuk bagi, * untuk kali).
    variables: dict berisi nilai variabel dari LKPS, mis. {"BOP": 25000000}.
    Contoh: formula_expression="BOP / 5000000", variables={"BOP": 25000000}
    Hasilnya di-clamp ke range 0-4.
    """
    try:
        # Strip anything that isn't a safe arithmetic character
        clean = _SAFE_EXPR.sub("", formula_expression)
        result = eval(clean, {"__builtins__": {}}, variables)  # noqa: S307
        clamped = max(0.0, min(4.0, float(result)))
        return json.dumps(
            {
                "formula": formula_expression,
                "variables": variables,
                "raw_result": float(result),
                "clamped_score": round(clamped, 2),
            }
        )
    except Exception as exc:
        return json.dumps({"error": str(exc), "formula": formula_expression})
