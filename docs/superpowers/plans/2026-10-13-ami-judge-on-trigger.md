# Judge AMI On-Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keluarkan judge dari jalur scoring AMI (kedua graph) dan sediakan pemicu on-demand (per indikator dan per sesi) lengkap dengan penyimpanan verdict dan UI web.

**Architecture:** Saat scoring, node `judge` diganti `evidence_snapshot` (tanpa LLM) yang menyimpan cuplikan bukti ≤3000 karakter ke kolom baru `judge_evidence`. Judge dijalankan kemudian lewat `POST /assessment/{session_id}/judge` di apps/ai (BackgroundTasks, status di dict memori, pola `/eval/run`), diproxy NestJS, dan verdict ditulis ke kolom `judge_verdict`. `confidence` tidak pernah diubah oleh judge.

**Tech Stack:** Python 3.11 / LangGraph / FastAPI / psycopg2 (apps/ai), NestJS 11 + Prisma 6.19 + Jest (apps/backend), React Router + TanStack + zod + vitest (apps/web).

**Spec:** `docs/superpowers/specs/2026-10-13-ami-judge-on-trigger-design.md`

## Global Constraints

- Format keluaran model `SKOR/JUSTIFIKASI/CONFIDENCE` tidak berubah.
- Cakupan: hanya `apps/ai/agent/graph.py` dan `apps/ai/agent/reasoning_graph.py`. `apps/ai/llm/chat_model.py::build_judge_llm` (judge generasi bab, dipakai `worker.py`) tidak boleh berubah.
- Tidak ada job BullMQ baru. **Dilarang menyentuh**: `apps/backend/src/jobs/queue-names.ts`, `apps/backend/src/jobs/jobs.service.ts`, `apps/backend/src/dokumen-led/*`, dispatch di `apps/ai/worker.py`, dan worktree `.claude/worktrees/setor-led`. Satu-satunya file bersama dengan SETOR_LED yang boleh disentuh adalah `packages/db/prisma/schema.prisma` (model `IndicatorResult` saja) beserta satu folder migrasi baru (disetujui di spec §7).
- `judge_evidence`: cuplikan ≤3000 karakter. `NULL` = baris sebelum fitur ini / baris galat; `""` = penilai tidak mengambil bukti apa pun. Semua pemeriksaan memakai `is None`, bukan kebenaran-nilai.
- `confidence` tidak boleh diubah oleh judge di jalur mana pun.
- Verdict tersimpan = keluaran judge + `judge_model` + `judged_at`. Verdict hasil `{"error": ...}` tidak pernah disimpan.
- Penilaian ulang sebuah indikator mengosongkan `judge_verdict` dan mengganti `judge_evidence`.
- Migrasi: `20261013110000_assessment_judge_on_demand`.
- Hasil NestJS tidak boleh membawa `judgeEvidence` ke klien.
- **Jangan commit apa pun** kecuali pengguna meminta. Langkah "Commit" di bawah hanyalah saran pesan Conventional Commits (AGENTS.md: Inggris, `type(scope): subject` huruf kecil tanpa titik) yang dijalankan hanya atas permintaan pengguna.
- Docs/komentar proyek berbahasa Indonesia; ikuti gaya komentar yang ada di file yang diubah.

## Review Focus

Kondisi yang diimplikasikan spec tetapi paling mungkin menggigit pengguna, dengan tes yang mengunci masing-masing:

1. **Penilaian ulang saat judge berjalan** harus tidak ditimpa verdict kedaluwarsa (`set_judge_verdict` mengembalikan `False` bila justifikasi berubah; dihitung `failed`). → Task 3 (db) dan Task 4 (endpoint).
2. **Bukti `""` (agen tidak menemukan apa pun) tetap bisa dijudge**, sedangkan `NULL` dilewati; salah memakai `if not evidence` akan melewatkan baris sah. → Task 1 dan Task 4.
3. **Panggilan juri gagal / tak terbaca** tidak boleh tersimpan sebagai verdict; baris tetap "Belum dijudge" dan dihitung `failed`. → Task 1 (`run_judge`) dan Task 4.
4. **apps/ai restart saat polling** (status memori hilang → 404) tidak boleh menampilkan galat; UI berhenti dan memuat ulang hasil yang sudah tersimpan. → Task 6 (`pollJudge`).
5. **Sesi milik tenant/prodi lain dan kebocoran `judgeEvidence`**: trigger judge pada sesi di luar scope harus 404 tanpa memanggil apps/ai, dan kedua endpoint hasil tidak boleh mengembalikan `judgeEvidence`. → Task 5.

---

## File Structure

| File | Aksi | Tanggung jawab |
|---|---|---|
| `apps/ai/agent/state.py` | ubah | `judge_evidence` ditambah (Task 1); `judge_verdict` dihapus (Task 2) |
| `apps/ai/agent/graph.py` | ubah | fungsi `run_judge`; node `evidence_snapshot` menggantikan `judge` |
| `apps/ai/agent/reasoning_graph.py` | ubah | node `evidence_snapshot` menggantikan `judge`; impor judge dibuang |
| `packages/db/prisma/schema.prisma` | ubah | dua kolom di `IndicatorResult` |
| `packages/db/prisma/migrations/20261013110000_assessment_judge_on_demand/migration.sql` | baru | `ALTER TABLE` ×2 |
| `apps/ai/db/postgres_client.py` | ubah | `log_indicator_result(judge_evidence=…)`, `get_judge_rows`, `set_judge_verdict` |
| `apps/ai/api/routes/assessment.py` | ubah | meneruskan `judge_evidence` ke `log_indicator_result` |
| `apps/ai/api/routes/assessment_judge.py` | baru | endpoint judge + runner + status |
| `apps/ai/main.py` | ubah | `include_router` untuk modul baru |
| `apps/backend/src/assessment/dto/run-judge.dto.ts` | baru | DTO |
| `apps/backend/src/assessment/assessment.service.ts` / `.controller.ts` | ubah | proxy judge, `omit judgeEvidence` |
| `apps/web/app/features/assessment/domain/entities/indicator-result.entity.ts` | ubah | entity `judge` |
| `apps/web/app/features/assessment/data/*` | ubah | tipe backend, mapper, remote source, repository |
| `apps/web/app/features/assessment/presentation/utils/assessment-judge-poll.ts` | baru | `pollJudge`, `ringkasJudge` (logika murni, ditest) |
| `apps/web/app/features/assessment/presentation/hooks/use-assessment-judge.ts` | baru | hook state/polling |
| `.../components/assessment-judge-panel.tsx`, `assessment-judge-bar.tsx` | baru | UI per indikator dan per sesi |
| `.../components/assessment-detail-sheet.tsx`, `assessment-result-row.tsx`, `.../pages/led-project-assessment.tsx`, `.../hooks/use-assessment-results.ts` | ubah | pemasangan |

Perintah tes (dari akar worktree): apps/ai `cd apps/ai && pytest <path> -v` (Python 3.11+, atau di container; lihat CLAUDE.md); backend `cd apps/backend && npx jest <pattern>`; web `cd apps/web && npx vitest run <path>` dan `npm run typecheck`.

---

### Task 1: `run_judge` dan `evidence_snapshot` di graph native

**Files:**
- Modify: `apps/ai/agent/state.py` (tambah `judge_evidence`)
- Modify: `apps/ai/agent/graph.py` (`run_judge` setelah `build_judge_llm`; ganti `judge_node` di dalam `build_graph`)
- Test: `apps/ai/tests/agent/test_graph.py`

**Interfaces:**
- Produces: `agent.graph.run_judge(justification: str, evidence_text: str) -> dict` (verdict dari `parse_judge_verdict`, atau `{"error": str}`; tidak pernah raise). `AssessmentState["judge_evidence"]: Optional[str]`. Hasil `graph.invoke(...)` memuat `judge_evidence` (`str`, ≤3000) saat ada skor.
- Consumes: `JUDGE_PROMPT_TEMPLATE`, `parse_judge_verdict`, `build_judge_llm`, `collect_evidence_text` (sudah ada di `agent/graph.py`).

- [ ] **Step 1: Ganti tes judge lama dengan tes baru**

Di `apps/ai/tests/agent/test_graph.py`, ganti seluruh blok dari komentar `# ── independent judge ───` (baris ~749) sampai akhir `test_judge_failure_does_not_block_result` (baris ~889, tepat sebelum `def test_graph_terminates_when_llm_never_finalizes`) dengan:

```python
# ── judge keluar dari graph scoring ──────────────────────────────────────────
# run_judge dipanggil on-demand dari api/routes/assessment_judge.py; graph hanya
# menyimpan cuplikan bukti (judge_evidence) sebagai masukannya.

_LED_HIT = {
    "text": "Visi misi disusun lewat rapat pimpinan.",
    "metadata": {"page_start": 12, "page_end": 12, "para_start": -1, "para_end": -1, "section_heading": ""},
    "distance": 0.1,
}


def _rubric_call():
    from langchain_core.messages import AIMessage

    return AIMessage(
        content="",
        tool_calls=[{"name": "get_indicator_rubric", "args": {"indicator_no": 1}, "id": "call_1"}],
    )


def _invoke_native_graph(llm_messages, *, led_hits=None):
    """Jalankan graph native dengan LLM palsu; kembalikan (hasil, mock build_judge_llm)."""
    from agent.graph import build_graph
    from llm.ollama_client import OllamaClient

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = llm_messages
    fake_client = OllamaClient(base_url="http://fake:11434", model="test-model", timeout_seconds=30)

    with (
        patch("agent.graph._build_llm", return_value=fake_llm),
        patch("agent.graph.build_judge_llm") as judge_factory,
        patch("agent.tools.rubric_tool._get_rubrics_for_set", return_value=[]),
        patch("agent.tools.led_tool.search_led", return_value=led_hits or []),
    ):
        graph = build_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 60})
    return result, judge_factory


def _evidence_flow():
    """rubrik -> checklist -> pencarian LED -> jawaban final (confidence 0.9)."""
    from langchain_core.messages import AIMessage

    return [
        _rubric_call(),
        AIMessage(content="- Dokumen VMTS tersedia\n- Proses partisipatif"),
        AIMessage(
            content="",
            tool_calls=[{"name": "search_led_evidence", "args": {"query": "visi misi"}, "id": "call_2"}],
        ),
        AIMessage(
            content=(
                "SKOR: 3\nJUSTIFIKASI: Program studi disusun secara partisipatif dengan 100 dosen.\n"
                "CONFIDENCE: 0.9\nREKOMENDASI: Pertahankan praktik baik."
            )
        ),
    ]


def _no_evidence_flow():
    """rubrik -> checklist -> jawaban final tanpa pernah mencari bukti."""
    from langchain_core.messages import AIMessage

    return [
        _rubric_call(),
        AIMessage(content="- Dokumen VMTS tersedia"),
        AIMessage(content="SKOR: 2\nJUSTIFIKASI: Bukti terbatas.\nCONFIDENCE: 0.7\nREKOMENDASI: Lengkapi bukti."),
    ]


def test_scoring_graph_never_builds_the_judge_and_leaves_confidence_alone():
    result, judge_factory = _invoke_native_graph(_evidence_flow(), led_hits=[_LED_HIT])

    assert result["final_score"] == 3.0
    assert result["confidence"] == 0.9  # dulu bisa terpotong ke <=0.3 oleh judge
    assert result.get("judge_verdict") is None
    judge_factory.assert_not_called()


def test_evidence_snapshot_holds_the_evidence_text_the_judge_would_have_seen():
    result, _ = _invoke_native_graph(_evidence_flow(), led_hits=[_LED_HIT])

    assert result["judge_evidence"].startswith("[search_led_evidence] ")
    assert "Visi misi disusun lewat rapat pimpinan." in result["judge_evidence"]


def test_evidence_snapshot_is_capped_at_3000_chars():
    with patch("agent.graph.collect_evidence_text", return_value="x" * 5000):
        result, _ = _invoke_native_graph(_no_evidence_flow())

    assert result["judge_evidence"] == "x" * 3000


def test_evidence_snapshot_is_empty_string_not_none_when_nothing_was_retrieved():
    """"" = penilai memang tidak mengambil bukti (judge tetap boleh jalan); None dicadangkan untuk baris tanpa skor / sesi lama."""
    result, _ = _invoke_native_graph(_no_evidence_flow())

    assert result["final_score"] == 2.0
    assert result["judge_evidence"] == ""


def test_run_judge_returns_the_parsed_verdict_and_feeds_both_inputs_to_the_prompt():
    import json
    from langchain_core.messages import AIMessage
    from agent.graph import run_judge

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.return_value = AIMessage(
        content=json.dumps(
            {"grounded": False, "hallucinated_claims": ["100 dosen"], "missing_facts": [], "notes": "mengada-ada"}
        )
    )

    with patch("agent.graph.build_judge_llm", return_value=fake_judge_llm):
        verdict = run_judge("Ada 100 dosen.", "[search_led_evidence] rapat pimpinan")

    assert verdict["grounded"] is False
    assert verdict["hallucinated_claims"] == ["100 dosen"]
    prompt = fake_judge_llm.invoke.call_args.args[0][0].content
    assert "Ada 100 dosen." in prompt
    assert "[search_led_evidence] rapat pimpinan" in prompt


def test_run_judge_truncates_inputs_like_the_old_inline_judge():
    import json
    from langchain_core.messages import AIMessage
    from agent.graph import run_judge

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.return_value = AIMessage(content=json.dumps({"grounded": True}))

    with patch("agent.graph.build_judge_llm", return_value=fake_judge_llm):
        run_judge("§" * 2000, "¤" * 5000)

    prompt = fake_judge_llm.invoke.call_args.args[0][0].content
    assert "§" * 1500 in prompt and "§" * 1501 not in prompt
    assert "¤" * 3000 in prompt and "¤" * 3001 not in prompt


def test_run_judge_uses_the_placeholder_when_evidence_is_empty():
    import json
    from langchain_core.messages import AIMessage
    from agent.graph import run_judge

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.return_value = AIMessage(content=json.dumps({"grounded": False}))

    with patch("agent.graph.build_judge_llm", return_value=fake_judge_llm):
        run_judge("klaim tanpa bukti", "")

    assert "(tidak ada bukti tercatat)" in fake_judge_llm.invoke.call_args.args[0][0].content


def test_run_judge_returns_an_error_dict_when_the_llm_raises():
    from agent.graph import run_judge

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.side_effect = RuntimeError("judge unreachable")

    with patch("agent.graph.build_judge_llm", return_value=fake_judge_llm):
        verdict = run_judge("klaim", "bukti")

    assert verdict == {"error": "judge unreachable"}


def test_run_judge_returns_an_error_dict_when_the_verdict_is_unparseable():
    from langchain_core.messages import AIMessage
    from agent.graph import run_judge

    fake_judge_llm = MagicMock()
    fake_judge_llm.invoke.return_value = AIMessage(content="bukan json sama sekali")

    with patch("agent.graph.build_judge_llm", return_value=fake_judge_llm):
        verdict = run_judge("klaim", "bukti")

    assert "error" in verdict
```

- [ ] **Step 2: Sesuaikan dua tes lama yang masih menyebut judge**

(a) Di akhir `test_graph_terminates_when_llm_never_finalizes` (setelah `assert result["error"] is not None`) tambahkan:

```python
    assert result.get("judge_evidence") is None  # tanpa skor, tidak ada yang disnapshot
```

(b) Di `test_graph_force_retries_when_skor_present_but_no_justifikasi_marker` hapus blok `fake_judge_llm = MagicMock()` ... `)` (yang mengembalikan `json.dumps({"grounded": True, ...})`), hapus baris `patch("agent.graph.build_judge_llm", return_value=fake_judge_llm),` dari `with (...)`, dan hapus `import json` dari fungsi itu bila tidak dipakai lagi.

- [ ] **Step 3: Jalankan tes, pastikan gagal**

Run: `cd apps/ai && pytest tests/agent/test_graph.py -k "scoring_graph or evidence_snapshot or run_judge or never_finalizes" -v`
Expected: FAIL (`ImportError: cannot import name 'run_judge'`; `KeyError: 'judge_evidence'`; judge masih dipanggil).

- [ ] **Step 4: Tambah `judge_evidence` ke state**

Di `apps/ai/agent/state.py`, tepat setelah baris `judge_verdict: Optional[dict]`, tambahkan:

```python

    # ── Judge input snapshot (graph.py / reasoning_graph.py) ──────────────────
    # Sampai 3000 karakter pertama bukti yang diambil penilai di run ini -- persis
    # yang dibaca judge. Disimpan ke assessment_indicator_results.judge_evidence
    # supaya judge bisa dijalankan belakangan, on-demand
    # (api/routes/assessment_judge.py). "" = penilai tidak mengambil bukti apa pun;
    # None = tidak ada skor (jalur galat).
    judge_evidence: Optional[str]
```

- [ ] **Step 5: Tambah `run_judge`**

Di `apps/ai/agent/graph.py`, tepat setelah `return ChatOllama(**kwargs)` yang menutup `build_judge_llm` (sebelum `def build_graph`), tambahkan:

```python
def run_judge(justification: str, evidence_text: str) -> dict:
    """Cek independen apakah klaim dalam `justification` didukung `evidence_text`,
    memakai model juri terpisah (build_judge_llm). Dulu `judge_node` di dalam
    graph; kini dipanggil on-demand (api/routes/assessment_judge.py).

    Tidak pernah raise: kegagalan panggilan atau verdict yang tak terbaca
    mengembalikan {"error": ...} supaya pemanggil bisa memutuskan (tidak
    menyimpan, menghitung sebagai gagal)."""
    try:
        judge_llm = build_judge_llm()
        prompt = JUDGE_PROMPT_TEMPLATE.format(
            justification=justification[:1500],
            evidence_text=evidence_text[:3000] or "(tidak ada bukti tercatat)",
        )
        response = judge_llm.invoke([HumanMessage(content=prompt)])
        verdict = parse_judge_verdict(response.content or "")
    except Exception as exc:
        return {"error": str(exc)}
    return verdict or {"error": "judge tidak menghasilkan verdict yang bisa dibaca"}
```

- [ ] **Step 6: Ganti `judge_node` dengan `evidence_snapshot_node`**

Di dalam `build_graph` pada `apps/ai/agent/graph.py`, hapus seluruh fungsi `judge_node` beserta komentar kepalanya (`# ── Node: judge (independent post-hoc grounding check) ──…` sampai `return state` penutup fungsi, tepat sebelum `# ── Build graph ──`) dan gantikan dengan:

```python
    # ── Node: evidence_snapshot (masukan judge on-demand, tanpa LLM) ─────────

    def evidence_snapshot_node(state: AssessmentState) -> AssessmentState:
        """Simpan bukti yang dilihat penilai (sampai 3000 karakter) untuk judge
        on-demand. Judge-nya sendiri tidak lagi jalan di sini: run_judge dipicu
        pengguna, dan confidence tidak pernah disentuh olehnya. Tanpa skor
        (parse gagal) tidak ada yang perlu di-judge, sama seperti judge lama."""
        if state.get("final_score") is None:
            return state
        state["judge_evidence"] = collect_evidence_text(state["messages"])[:3000]
        return state
```

Lalu di bagian "Build graph": ubah `graph.add_node("judge", judge_node)` menjadi `graph.add_node("evidence_snapshot", evidence_snapshot_node)`, dan ganti dua edge

```python
    graph.add_edge("decimal_refine", "judge")
    graph.add_edge("judge", END)
```

menjadi

```python
    graph.add_edge("decimal_refine", "evidence_snapshot")
    graph.add_edge("evidence_snapshot", END)
```

- [ ] **Step 7: Jalankan tes, pastikan lulus**

Run: `cd apps/ai && pytest tests/agent/test_graph.py -v`
Expected: semua PASS (termasuk `test_build_judge_llm_*` yang tidak berubah).

- [ ] **Step 8: Commit (hanya bila pengguna meminta)**

```bash
git add apps/ai/agent/state.py apps/ai/agent/graph.py apps/ai/tests/agent/test_graph.py
git commit -m "refactor(ai): replace inline ami judge node with evidence snapshot and run_judge"
```

---

### Task 2: `evidence_snapshot` di graph reasoning dan hapus `judge_verdict`

**Files:**
- Modify: `apps/ai/agent/reasoning_graph.py` (impor, node, edge)
- Modify: `apps/ai/agent/state.py` (hapus `judge_verdict`)
- Test: `apps/ai/tests/agent/test_reasoning_graph.py`

**Interfaces:**
- Consumes: `AssessmentState["judge_evidence"]` (Task 1), `_collect_reasoning_evidence_text` (sudah ada di modul ini, format `[<nama>] <isi>`).
- Produces: hasil `build_reasoning_graph(...).invoke(...)` memuat `judge_evidence` seperti graph native.

- [ ] **Step 1: Ganti dua tes judge lama**

Di `apps/ai/tests/agent/test_reasoning_graph.py`, ganti blok dari `# ── independent judge ───` (baris ~519) sampai akhir `test_judge_failure_does_not_block_result` (tepat sebelum `def test_search_evidence_documents_registered_in_tool_registry`) dengan:

```python
# ── judge keluar dari graph scoring ──────────────────────────────────────────

_LED_HIT = {
    "text": "Visi misi disusun lewat rapat pimpinan.",
    "metadata": {"page_start": 12, "page_end": 12, "para_start": -1, "para_end": -1, "section_heading": ""},
    "distance": 0.1,
}


def _invoke_reasoning_graph(llm_messages, *, led_hits=None):
    """Jalankan graph reasoning dengan LLM palsu; kembalikan (hasil, mock build_judge_llm)."""
    from unittest.mock import MagicMock

    from agent.reasoning_graph import build_reasoning_graph
    from llm.ollama_client import OllamaClient

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = llm_messages
    fake_client = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)

    with (
        patch("agent.reasoning_graph._build_reasoning_llm", return_value=fake_llm),
        patch("agent.graph.build_judge_llm") as judge_factory,
        patch("agent.tools.rubric_tool._get_rubrics_for_set", return_value=[]),
        patch("agent.tools.led_tool.search_led", return_value=led_hits or []),
    ):
        graph = build_reasoning_graph(fake_client)
        result = graph.invoke(_make_state(), config={"recursion_limit": 60})
    return result, judge_factory


def _reasoning_evidence_flow():
    from langchain_core.messages import AIMessage

    return [
        AIMessage(content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'),
        AIMessage(content="- Dokumen VMTS tersedia\n- Proses partisipatif"),
        AIMessage(content='{"action": "search_led_evidence", "args": {"query": "visi misi"}}'),
        AIMessage(
            content=(
                '{"action": "final", "score": 3, '
                '"justification": "Program studi disusun partisipatif dengan 100 dosen.", '
                '"confidence": 0.9, "recommendation": "Pertahankan praktik baik."}'
            )
        ),
    ]


def test_reasoning_graph_never_builds_the_judge_and_stores_the_evidence_snapshot():
    result, judge_factory = _invoke_reasoning_graph(_reasoning_evidence_flow(), led_hits=[_LED_HIT])

    assert result["final_score"] == 3.0
    assert result["confidence"] == 0.9  # dulu bisa terpotong ke <=0.3 oleh judge
    assert result["judge_evidence"].startswith("[search_led_evidence] ")
    assert "Visi misi disusun lewat rapat pimpinan." in result["judge_evidence"]
    judge_factory.assert_not_called()


def test_reasoning_evidence_snapshot_is_empty_string_when_nothing_was_retrieved():
    from langchain_core.messages import AIMessage

    result, _ = _invoke_reasoning_graph(
        [
            AIMessage(content='{"action": "get_indicator_rubric", "args": {"indicator_no": 1}}'),
            AIMessage(content="- Dokumen VMTS tersedia"),
            AIMessage(
                content=(
                    '{"action": "final", "score": 2, "justification": "Bukti terbatas.", '
                    '"confidence": 0.7, "recommendation": "Lengkapi bukti."}'
                )
            ),
        ]
    )

    assert result["final_score"] == 2.0
    assert result["judge_evidence"] == ""
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd apps/ai && pytest tests/agent/test_reasoning_graph.py -k "never_builds_the_judge or evidence_snapshot" -v`
Expected: FAIL (`KeyError: 'judge_evidence'`, judge masih terbangun lewat impor lama).

- [ ] **Step 3: Ubah impor dan node**

Di `apps/ai/agent/reasoning_graph.py`: dari blok `from agent.graph import (...)` hapus tiga baris `JUDGE_PROMPT_TEMPLATE,`, `build_judge_llm,`, dan `parse_judge_verdict,`.

Hapus seluruh fungsi `judge_node` (dari `def judge_node(state: AssessmentState)` sampai `return state` penutupnya, tepat sebelum `def route_after_tools`) dan gantikan dengan:

```python
    def evidence_snapshot_node(state: AssessmentState) -> AssessmentState:
        """Padanan graph.evidence_snapshot_node untuk format hasil-tool graph ini
        (HumanMessage berawalan "Tool result (<nama>):"): simpan bukti sampai
        3000 karakter untuk judge on-demand. Tanpa LLM, tanpa menyentuh confidence."""
        if state.get("final_score") is None:
            return state
        state["judge_evidence"] = _collect_reasoning_evidence_text(state["messages"])[:3000]
        return state
```

Di bagian build graph: `graph.add_node("judge", judge_node)` menjadi `graph.add_node("evidence_snapshot", evidence_snapshot_node)`; dua edge

```python
    graph.add_edge("decimal_refine", "judge")
    graph.add_edge("judge", END)
```

menjadi

```python
    graph.add_edge("decimal_refine", "evidence_snapshot")
    graph.add_edge("evidence_snapshot", END)
```

- [ ] **Step 4: Hapus `judge_verdict` dari state**

Di `apps/ai/agent/state.py` hapus blok komentar "Independent judge verdict" beserta baris `judge_verdict: Optional[dict]`.

- [ ] **Step 5: Verifikasi tidak ada rujukan tersisa, jalankan tes**

Run: `cd apps/ai && grep -rn "judge_verdict\|judge_node" --include=*.py agent api db worker.py | grep -v "parse_judge_verdict"`
Expected: tidak ada keluaran (rujukan `judge_verdict` baru akan datang dari `db/` di Task 3 sebagai kolom SQL, bukan state).

Run: `cd apps/ai && pytest tests/agent -v`
Expected: PASS.

- [ ] **Step 6: Commit (hanya bila pengguna meminta)**

```bash
git add apps/ai/agent apps/ai/tests/agent
git commit -m "refactor(ai): drop judge node from ami reasoning graph"
```

---

### Task 3: Skema, migrasi, dan penyimpanan di apps/ai

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `IndicatorResult`)
- Create: `packages/db/prisma/migrations/20261013110000_assessment_judge_on_demand/migration.sql`
- Modify: `apps/ai/db/postgres_client.py` (`log_indicator_result`, `get_judge_rows`, `set_judge_verdict`)
- Modify: `apps/ai/api/routes/assessment.py` (`_process_single_indicator`)
- Test: `apps/ai/tests/db/test_postgres_client.py` (integrasi, butuh `DATABASE_URL`), `apps/ai/tests/api/test_assessment_route.py`

**Interfaces:**
- Produces: `log_indicator_result(..., judge_evidence: Optional[str] = None)`. `get_judge_rows(tenant_id, session_id) -> list[dict]` dengan kunci `indicator_no:int, sub_no:str, score:float|None, justification:str|None, error:str|None, judge_evidence:str|None, judge_verdict:dict|None`, urut `indicator_no, sub_no`. `set_judge_verdict(tenant_id, session_id, indicator_no, sub_no, justification, verdict) -> bool` (`True` hanya bila tepat satu baris cocok, termasuk justifikasi yang sama).
- Consumes: `result.get("judge_evidence")` dari graph (Task 1/2).

> **Pemberitahuan SETOR_LED:** langkah 1 menyentuh `schema.prisma`, satu-satunya file bersama (sudah disetujui di spec §7). Ubah hanya model `IndicatorResult`; jangan sentuh enum `JobType`.

- [ ] **Step 1: Tulis tes integrasi DB yang gagal**

Tambahkan di akhir `apps/ai/tests/db/test_postgres_client.py`:

```python
def test_judge_columns_roundtrip_stale_guard_and_rescore_clears_verdict(fixture_ids, conn):
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    session_id = str(uuid.uuid4())
    pc.create_session(
        session_id,
        tenant_id=tenant_id,
        dokumen_id=fixture_ids["dokumen_id"],
        created_by_user_id=fixture_ids["user_id"],
        total_indicators=1,
    )

    def _kolom():
        return [
            (r["indicator_no"], r["sub_no"], r["justification"], r["judge_evidence"], r["judge_verdict"])
            for r in pc.get_judge_rows(tenant_id, session_id)
        ]

    try:
        pc.log_indicator_result(
            tenant_id, session_id, indicator_no=1, score=3.0, justification="klaim A", confidence=0.9,
            judge_evidence="bukti A",
        )
        assert _kolom() == [(1, "", "klaim A", "bukti A", None)]

        assert pc.set_judge_verdict(tenant_id, session_id, 1, "", "klaim A", {"grounded": True}) is True
        assert _kolom()[0][4] == {"grounded": True}

        # penilaian ulang terjadi saat judge berjalan: justifikasi sudah berganti -> verdict kedaluwarsa ditolak
        assert pc.set_judge_verdict(tenant_id, session_id, 1, "", "klaim LAIN", {"grounded": False}) is False
        assert _kolom()[0][4] == {"grounded": True}

        # penilaian ulang mengosongkan verdict dan mengganti bukti (bukti kosong "" tetap "", bukan NULL)
        pc.log_indicator_result(
            tenant_id, session_id, indicator_no=1, score=2.0, justification="klaim B", confidence=0.8,
            judge_evidence="",
        )
        assert _kolom() == [(1, "", "klaim B", "", None)]

        # jalur galat: tanpa bukti -> NULL
        pc.log_indicator_result(
            tenant_id, session_id, indicator_no=1, score=None, justification=None, confidence=None, error="gagal",
        )
        assert _kolom()[0][3] is None
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM assessment_sessions WHERE id = %s", (session_id,))
```

- [ ] **Step 2: Tulis tes route yang gagal (penerusan `judge_evidence`)**

Tambahkan di `apps/ai/tests/api/test_assessment_route.py` setelah `test_process_single_indicator_success`:

```python
@pytest.mark.asyncio
@pytest.mark.parametrize("graph_value, expected", [("bukti X", "bukti X"), ("", ""), (None, None)])
async def test_process_single_indicator_forwards_judge_evidence(fake_indicators, graph_value, expected):
    """"" (penilai tidak mengambil bukti) harus tetap "" sampai ke DB; hanya None yang tetap None."""
    from api.routes.assessment import _process_single_indicator

    fake_graph = MagicMock()
    result = {
        "final_score": 3.0,
        "justification": "Cukup baik.",
        "confidence": 0.85,
        "recommendation": None,
        "reasoning_steps": [],
        "error": None,
    }
    if graph_value is not None:
        result["judge_evidence"] = graph_value
    fake_graph.invoke.return_value = result

    with (
        patch("api.routes.assessment.log_reasoning_step"),
        patch("api.routes.assessment.log_indicator_result") as mock_log,
        patch("api.routes.assessment.create_ollama_client_from_env", return_value=MagicMock()),
        patch("api.routes.assessment.build_graph_auto", return_value=fake_graph),
    ):
        await _process_single_indicator(
            indicator=fake_indicators[0],
            session_id="test-session",
            semaphore=asyncio.Semaphore(5),
            tenant_id=TENANT_ID,
            dokumen_id=DOKUMEN_ID,
            accreditation_set_id=ACCREDITATION_SET_ID,
        )

    assert mock_log.call_args.kwargs["judge_evidence"] == expected
```

- [ ] **Step 3: Jalankan tes route, pastikan gagal**

Run: `cd apps/ai && pytest tests/api/test_assessment_route.py -k forwards_judge_evidence -v`
Expected: FAIL (`KeyError: 'judge_evidence'` pada `call_args.kwargs`).

- [ ] **Step 4: Ubah skema Prisma dan buat migrasi**

Di `packages/db/prisma/schema.prisma`, model `IndicatorResult`, setelah baris `sourcesUsed    Json?    @map("sources_used")`, tambahkan:

```prisma
  /// Cuplikan bukti (≤3000 karakter) yang dilihat penilai saat mencetak hasil ini — masukan judge on-demand.
  /// `null` = baris dari sebelum fitur ini atau baris galat (tidak bisa dijudge); `""` = penilai memang tidak mengambil bukti.
  judgeEvidence  String?  @map("judge_evidence") @db.Text
  /// Verdict judge on-demand (keluaran juri + judge_model + judged_at). `null` = belum dijudge.
  /// Dikosongkan tiap kali baris ini dinilai ulang. Tidak pernah mengubah `confidence`.
  judgeVerdict   Json?    @map("judge_verdict")
```

Buat `packages/db/prisma/migrations/20261013110000_assessment_judge_on_demand/migration.sql`:

```sql
-- Judge AMI kini dijalankan on-demand, bukan di tengah scoring.
--
-- judge_evidence: cuplikan bukti (<=3000 karakter) yang dilihat penilai, disimpan saat scoring sebagai masukan judge.
--   NULL = baris lama / baris galat; '' = penilai tidak mengambil bukti apa pun.
-- judge_verdict: hasil judge (JSON). NULL = belum dijudge; dikosongkan saat baris dinilai ulang.
ALTER TABLE "assessment_indicator_results" ADD COLUMN "judge_evidence" TEXT;
ALTER TABLE "assessment_indicator_results" ADD COLUMN "judge_verdict" JSONB;
```

- [ ] **Step 5: Validasi, generate, terapkan ke DB lokal**

Run: `cd packages/db && npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` lalu `Generated Prisma Client`.

Run (butuh infra: `docker compose -f docker-compose.mineru-gpu.yml up -d postgres redis` dari akar repo): `cd packages/db && DATABASE_URL='postgresql://postgres:postgres@localhost:5434/ai_led?schema=public' npx prisma migrate deploy`
Expected: `Applying migration 20261013110000_assessment_judge_on_demand`.

- [ ] **Step 6: Ubah `postgres_client.py`**

Di `log_indicator_result` (apps/ai/db/postgres_client.py) tambah parameter `judge_evidence: Optional[str] = None` (setelah `sub_no: str = ""`), dan ganti statement SQL beserta tuple parameternya dengan:

```python
            cur.execute(
                """
                INSERT INTO assessment_indicator_results
                    (id, session_id, indicator_no, sub_no, score, justification,
                     confidence, recommendation, error, model, sources_used, judge_evidence)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_id, indicator_no, sub_no) DO UPDATE SET
                    score = EXCLUDED.score,
                    justification = EXCLUDED.justification,
                    confidence = EXCLUDED.confidence,
                    recommendation = EXCLUDED.recommendation,
                    error = EXCLUDED.error,
                    model = EXCLUDED.model,
                    sources_used = EXCLUDED.sources_used,
                    judge_evidence = EXCLUDED.judge_evidence,
                    -- dinilai ulang = justifikasi baru; verdict lama tidak boleh menempel padanya
                    judge_verdict = NULL
                """,
                (
                    str(uuid.uuid4()),
                    session_id,
                    indicator_no,
                    sub_no or "",
                    score,
                    justification,
                    confidence,
                    recommendation,
                    error,
                    model,
                    psycopg2.extras.Json(sources_used) if sources_used is not None else None,
                    judge_evidence,
                ),
            )
```

Tambahkan dua fungsi tepat setelah `get_indicator_results`:

```python
def get_judge_rows(tenant_id: str, session_id: str) -> list[dict]:
    """Baris hasil satu sesi beserta masukan/keluaran judge on-demand, urut (indicator_no, sub_no).
    `judge_evidence` sengaja hanya dibaca di sini (apps/ai), tidak ikut `get_indicator_results`."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT indicator_no, sub_no, score, justification, error, judge_evidence, judge_verdict
            FROM assessment_indicator_results WHERE session_id = %s ORDER BY indicator_no, sub_no
            """,
            (session_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        if row["score"] is not None:
            row["score"] = float(row["score"])
    return rows


def set_judge_verdict(
    tenant_id: str,
    session_id: str,
    indicator_no: int,
    sub_no: str,
    justification: Optional[str],
    verdict: dict,
) -> bool:
    """Tulis verdict judge untuk satu baris -- hanya bila justifikasinya masih yang dinilai juri.
    Penilaian ulang yang terjadi saat judge berjalan mengganti justifikasi, sehingga verdict
    kedaluwarsa ditolak (return False) alih-alih menempel di teks baru."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            UPDATE assessment_indicator_results SET judge_verdict = %s
            WHERE session_id = %s AND indicator_no = %s AND sub_no = %s
              AND justification IS NOT DISTINCT FROM %s
            """,
            (psycopg2.extras.Json(verdict), session_id, indicator_no, sub_no or "", justification),
        )
        return cur.rowcount == 1
```

- [ ] **Step 7: Teruskan `judge_evidence` di pipeline**

Di `apps/ai/api/routes/assessment.py`, pada pemanggilan `log_indicator_result(...)` jalur sukses di `_process_single_indicator` (yang berisi `sources_used=result.get("sources_used"),`), tambahkan argumen:

```python
                judge_evidence=result.get("judge_evidence"),
```

Jalur `except` tidak diubah (bukti tetap `NULL`).

- [ ] **Step 8: Jalankan tes**

Run: `cd apps/ai && pytest tests/api/test_assessment_route.py -v`
Expected: PASS.

Run: `cd apps/ai && DATABASE_URL='postgresql://postgres:postgres@localhost:5434/ai_led?schema=public' pytest tests/db/test_postgres_client.py -v`
Expected: PASS, termasuk `test_judge_columns_roundtrip_stale_guard_and_rescore_clears_verdict`. **Bila dilaporkan `skipped`, tes DB belum terverifikasi** (DB tak terjangkau); jangan klaim lulus.

- [ ] **Step 9: Commit (hanya bila pengguna meminta)**

```bash
git add packages/db/prisma apps/ai/db/postgres_client.py apps/ai/api/routes/assessment.py apps/ai/tests
git commit -m "feat(ai): persist judge evidence and verdict columns for ami results"
```

---

### Task 4: Endpoint judge on-demand di apps/ai

**Files:**
- Create: `apps/ai/api/routes/assessment_judge.py`
- Modify: `apps/ai/main.py` (impor + `include_router`)
- Test: `apps/ai/tests/api/test_assessment_judge_route.py`

**Interfaces:**
- Consumes: `agent.graph.run_judge` (Task 1), `db.postgres_client.get_session/get_judge_rows/set_judge_verdict` (Task 3).
- Produces: `POST /assessment/{session_id}/judge` body `{"indicators": [{"indicator_no": int, "sub_no": str}] | null}` → `{judge_id, total, skipped}`. `GET /assessment/judge/{judge_id}` → `{judge_id, session_id, status: "pending"|"running"|"completed"|"failed", total, done, skipped, failed, error}`; 404 bila tak dikenal. Fungsi murni `plan_judge_rows(rows, wanted) -> (to_judge, skipped)`.

Aturan (spec §4.2): `skipped` = `score` NULL, atau ada `error`, atau `judge_evidence IS NULL`, atau indikator yang diminta tidak ada di sesi. Daftar kosong (`wanted=None`) tidak menghitung dan tidak menjalankan baris yang sudah punya verdict (bukan `total`, bukan `skipped`). Daftar eksplisit selalu menjalankan ulang. `done` bertambah untuk tiap baris yang diproses (termasuk gagal); `failed` = juri error atau tulis ditolak (kedaluwarsa).

- [ ] **Step 1: Tulis tes yang gagal**

Buat `apps/ai/tests/api/test_assessment_judge_route.py`:

```python
"""Tests for POST /assessment/{session_id}/judge and GET /assessment/judge/{judge_id}.

Semua I/O dipatch di tingkat fungsi (db.postgres_client.* sebagaimana diimpor ke
api.routes.assessment_judge, dan run_judge); TestClient menunggu BackgroundTasks selesai
sebelum mengembalikan respons, jadi status akhir bisa langsung dibaca.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

GROUNDED = {"grounded": True, "hallucinated_claims": [], "missing_facts": [], "notes": "ok"}


def _row(no, sub="", *, score=3.0, error=None, evidence="bukti", verdict=None):
    return {
        "indicator_no": no,
        "sub_no": sub,
        "score": score,
        "justification": f"klaim {no}",
        "error": error,
        "judge_evidence": evidence,
        "judge_verdict": verdict,
    }


@pytest.fixture()
def env():
    rows: list[dict] = []
    with (
        patch("api.routes.assessment_judge.get_session", return_value={"tenant_id": "t1", "session_id": "s1"}),
        patch("api.routes.assessment_judge.get_judge_rows", side_effect=lambda tenant_id, session_id: rows),
        patch("api.routes.assessment_judge._judge_model_name", return_value="judge-model"),
        patch("api.routes.assessment_judge.run_judge", return_value=dict(GROUNDED)) as run_judge,
        patch("api.routes.assessment_judge.set_judge_verdict", return_value=True) as set_verdict,
    ):
        yield SimpleNamespace(rows=rows, run_judge=run_judge, set_verdict=set_verdict)


def _post(body):
    from main import app

    with TestClient(app) as c:
        resp = c.post("/assessment/s1/judge", json=body)
        status = c.get(f"/assessment/judge/{resp.json()['judge_id']}").json() if resp.status_code == 200 else None
    return resp, status


def test_session_wide_skips_unjudgeable_and_already_judged_rows(env):
    env.rows.extend(
        [
            _row(1),
            _row(2, verdict={"grounded": True}),  # sudah dijudge: bukan total, bukan skipped
            _row(3, evidence=None),  # sesi lama
            _row(4, score=None),  # tidak ada skor
            _row(5, evidence=""),  # bukti kosong yang sah: HARUS dijudge
            _row(6, error="gagal"),
        ]
    )

    resp, status = _post({})

    assert resp.status_code == 200
    assert resp.json()["total"] == 2
    assert resp.json()["skipped"] == 3
    assert {c.args for c in env.run_judge.call_args_list} == {("klaim 1", "bukti"), ("klaim 5", "")}
    assert status["status"] == "completed"
    assert (status["done"], status["failed"], status["skipped"], status["total"]) == (2, 0, 3, 2)
    assert status["session_id"] == "s1"


def test_stored_verdict_carries_model_and_timestamp(env):
    env.rows.append(_row(1, "I"))

    _post({})

    (args,) = [c.args for c in env.set_verdict.call_args_list]
    assert args[:5] == ("t1", "s1", 1, "I", "klaim 1")
    stored = args[5]
    assert stored["grounded"] is True
    assert stored["judge_model"] == "judge-model"
    assert stored["judged_at"].endswith("+00:00")


def test_explicit_list_reruns_an_already_judged_row_and_ignores_the_rest(env):
    env.rows.extend([_row(1), _row(2, verdict={"grounded": False})])

    resp, status = _post({"indicators": [{"indicator_no": 2, "sub_no": ""}]})

    assert resp.json()["total"] == 1
    assert [c.args for c in env.run_judge.call_args_list] == [("klaim 2", "bukti")]
    assert status["done"] == 1


def test_explicit_list_counts_unknown_indicators_as_skipped(env):
    env.rows.append(_row(1))

    resp, _ = _post({"indicators": [{"indicator_no": 1}, {"indicator_no": 99, "sub_no": "II"}]})

    assert (resp.json()["total"], resp.json()["skipped"]) == (1, 1)


def test_judge_error_is_not_persisted_and_counts_as_failed(env):
    env.rows.append(_row(1))
    env.run_judge.return_value = {"error": "judge unreachable"}

    _, status = _post({})

    env.set_verdict.assert_not_called()
    assert (status["done"], status["failed"]) == (1, 1)
    assert status["status"] == "completed"


def test_stale_verdict_rejected_by_the_justification_guard_counts_as_failed(env):
    env.rows.append(_row(1))
    env.set_verdict.return_value = False  # dinilai ulang saat judge berjalan

    _, status = _post({})

    assert (status["done"], status["failed"]) == (1, 1)


def test_session_with_only_old_rows_completes_immediately_without_calling_the_judge(env):
    env.rows.extend([_row(1, evidence=None), _row(2, evidence=None)])

    resp, status = _post({})

    assert (resp.json()["total"], resp.json()["skipped"]) == (0, 2)
    env.run_judge.assert_not_called()
    assert status["status"] == "completed"


def test_unknown_session_returns_404():
    from main import app

    with patch("api.routes.assessment_judge.get_session", return_value=None):
        with TestClient(app) as c:
            resp = c.post("/assessment/nope/judge", json={})

    assert resp.status_code == 404


def test_unknown_judge_id_returns_404():
    from main import app

    with TestClient(app) as c:
        assert c.get("/assessment/judge/tidak-ada").status_code == 404
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd apps/ai && pytest tests/api/test_assessment_judge_route.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'api.routes.assessment_judge'` / 404 pada rute).

- [ ] **Step 3: Tulis modul endpoint**

Buat `apps/ai/api/routes/assessment_judge.py`:

```python
"""Judge grounding AMI on-demand.

Dulu `judge_node` berjalan di ujung tiap graph scoring dan menahan tiap indikator
selama satu panggilan model juri. Sekarang graph hanya menyimpan cuplikan bukti
(`judge_evidence`) dan judge dijalankan di sini, dipicu pengguna:

POST /assessment/{session_id}/judge
    Body {"indicators": [{"indicator_no": int, "sub_no": str}]} (opsional; kosong = seluruh sesi).
    Mengembalikan {judge_id, total, skipped} segera; pekerjaan jalan di BackgroundTasks.
GET /assessment/judge/{judge_id}
    Progres dari dict memori (hilang bila proses restart, seperti _eval_results di eval.py;
    verdict yang sudah ditulis tetap ada di Postgres).

Verdict tidak pernah mengubah `confidence` -- itu tetap laporan model penilai.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from agent.graph import run_judge
from db.postgres_client import get_judge_rows, get_session, set_judge_verdict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assessment", tags=["assessment"])

# judge_id -> {status, session_id, total, done, skipped, failed, error}
_judge_runs: dict[str, dict] = {}


class JudgeIndicatorRef(BaseModel):
    indicator_no: int
    sub_no: str = ""


class RunJudgeRequest(BaseModel):
    indicators: Optional[list[JudgeIndicatorRef]] = None


class RunJudgeResponse(BaseModel):
    judge_id: str
    total: int
    skipped: int


class JudgeStatusResponse(BaseModel):
    judge_id: str
    session_id: str
    status: str
    total: int
    done: int
    skipped: int
    failed: int
    error: Optional[str] = None


def plan_judge_rows(
    rows: list[dict], wanted: Optional[set[tuple[int, str]]]
) -> tuple[list[dict], int]:
    """Pisahkan baris sesi menjadi (yang dijudge, jumlah dilewati).

    - `wanted=None` (seluruh sesi): baris yang sudah punya verdict tidak dijalankan ulang dan
      tidak dihitung apa pun.
    - `wanted` berisi (daftar eksplisit): hanya baris itu, selalu dijalankan ulang; indikator
      yang diminta tetapi tidak ada di sesi dihitung dilewati.
    - Dilewati: tanpa skor, ada galat, atau `judge_evidence is None` (sesi lama). Bukti `""`
      sah dan tetap dijudge -- itu keadaan nyata "penilai tidak mengambil bukti".
    """
    to_judge: list[dict] = []
    skipped = 0
    present: set[tuple[int, str]] = set()
    for row in rows:
        key = (row["indicator_no"], row["sub_no"] or "")
        present.add(key)
        if wanted is not None and key not in wanted:
            continue
        if wanted is None and row["judge_verdict"] is not None:
            continue
        if row["score"] is None or row["error"] or row["judge_evidence"] is None:
            skipped += 1
            continue
        to_judge.append(row)
    if wanted is not None:
        skipped += len(wanted - present)
    return to_judge, skipped


def _judge_model_name() -> Optional[str]:
    try:
        from eval.ragas_eval import get_judge_llm_config

        return get_judge_llm_config()["model"]
    except Exception:
        logger.exception("Gagal membaca konfigurasi model juri")
        return None


async def _run_judge_background(
    judge_id: str, tenant_id: str, session_id: str, rows: list[dict], judge_model: Optional[str]
) -> None:
    run = _judge_runs[judge_id]
    run["status"] = "running"
    loop = asyncio.get_running_loop()
    semaphore = asyncio.Semaphore(int(os.environ.get("ASSESSMENT_MAX_PARALLEL", "5")))

    async def _judge_one(row: dict) -> None:
        async with semaphore:
            try:
                verdict = await loop.run_in_executor(
                    None, run_judge, row["justification"] or "", row["judge_evidence"]
                )
                if "error" in verdict:
                    run["failed"] += 1
                else:
                    stored = {
                        **verdict,
                        "judge_model": judge_model,
                        "judged_at": datetime.now(timezone.utc).isoformat(),
                    }
                    written = await loop.run_in_executor(
                        None,
                        set_judge_verdict,
                        tenant_id,
                        session_id,
                        row["indicator_no"],
                        row["sub_no"],
                        row["justification"],
                        stored,
                    )
                    if not written:  # dinilai ulang saat judge berjalan -> verdict kedaluwarsa
                        run["failed"] += 1
            except Exception:
                logger.exception(
                    "Judge indikator %s.%s sesi %s gagal", row["indicator_no"], row["sub_no"], session_id
                )
                run["failed"] += 1
            finally:
                run["done"] += 1

    try:
        await asyncio.gather(*(_judge_one(r) for r in rows))
        run["status"] = "completed"
    except Exception as exc:
        logger.exception("Judge run %s gagal", judge_id)
        run["status"] = "failed"
        run["error"] = str(exc) or type(exc).__name__


@router.post("/{session_id}/judge", response_model=RunJudgeResponse)
async def start_judge(
    session_id: str, body: RunJudgeRequest, background_tasks: BackgroundTasks
) -> RunJudgeResponse:
    sess = get_session(None, session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    tenant_id = sess["tenant_id"]
    wanted = (
        {(i.indicator_no, i.sub_no) for i in body.indicators} if body.indicators is not None else None
    )
    to_judge, skipped = plan_judge_rows(get_judge_rows(tenant_id, session_id), wanted)

    judge_id = str(uuid.uuid4())
    _judge_runs[judge_id] = {
        "status": "pending" if to_judge else "completed",
        "session_id": session_id,
        "total": len(to_judge),
        "done": 0,
        "skipped": skipped,
        "failed": 0,
        "error": None,
    }
    if to_judge:
        background_tasks.add_task(
            _run_judge_background, judge_id, tenant_id, session_id, to_judge, _judge_model_name()
        )
    return RunJudgeResponse(judge_id=judge_id, total=len(to_judge), skipped=skipped)


@router.get("/judge/{judge_id}", response_model=JudgeStatusResponse)
async def get_judge_status(judge_id: str) -> JudgeStatusResponse:
    run = _judge_runs.get(judge_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Judge run not found: {judge_id}")
    return JudgeStatusResponse(judge_id=judge_id, **run)
```

- [ ] **Step 4: Daftarkan router**

Di `apps/ai/main.py`: tambahkan di blok impor (urut abjad, setelah `assessment_router`)

```python
from api.routes.assessment_judge import router as assessment_judge_router
```

dan setelah `app.include_router(assessment_router)`:

```python
app.include_router(assessment_judge_router)
```

- [ ] **Step 5: Jalankan tes, pastikan lulus**

Run: `cd apps/ai && pytest tests/api/test_assessment_judge_route.py tests/api/test_assessment_route.py -v`
Expected: PASS.

- [ ] **Step 6: Commit (hanya bila pengguna meminta)**

```bash
git add apps/ai/api/routes/assessment_judge.py apps/ai/main.py apps/ai/tests/api/test_assessment_judge_route.py
git commit -m "feat(ai): add on-demand ami judge endpoints"
```

---

### Task 5: Proxy NestJS dan penyembunyian `judgeEvidence`

**Files:**
- Create: `apps/backend/src/assessment/dto/run-judge.dto.ts`
- Modify: `apps/backend/src/assessment/assessment.service.ts`, `apps/backend/src/assessment/assessment.controller.ts`
- Test: `apps/backend/src/assessment/assessment.service.spec.ts`

**Interfaces:**
- Consumes: `POST {AI_SERVICE_URL}/assessment/:id/judge`, `GET {AI_SERVICE_URL}/assessment/judge/:judgeId` (Task 4); kolom Prisma `judgeEvidence`/`judgeVerdict` (Task 3, `prisma generate` sudah dijalankan).
- Produces: `POST /assessment-sessions/:id/judge` (role `PENJAMIN_MUTU`, `PENYUSUN`) body `{indicators?: {indicatorNo:number, subNo?:string}[]}` → `{judge_id, total, skipped}`; `GET /assessment-judge/:judgeId` → status apps/ai; `findResults`/`findResultsForDocument` mengembalikan `judgeVerdict` tanpa `judgeEvidence`.

- [ ] **Step 1: Tulis tes yang gagal**

Di `assessment.service.spec.ts`: ubah impor baris pertama menjadi `import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';`, tambahkan `assessmentSessionFindFirst,` ke objek yang dikembalikan `makeService()` (daftar `return { service, findMany, ... }`), lalu tambahkan di akhir berkas:

```ts
describe('AssessmentService judge on-demand', () => {
  const originalEnv = process.env.AI_SERVICE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_SERVICE_URL = 'http://ai-service.test';
  });

  afterEach(() => {
    process.env.AI_SERVICE_URL = originalEnv;
    global.fetch = originalFetch;
  });

  it('runJudge returns 404 for a session outside the tenant/prodi scope and never calls apps/ai', async () => {
    const { service, assessmentSessionFindFirst } = makeService();
    assessmentSessionFindFirst.mockResolvedValue(null);
    global.fetch = jest.fn();

    await expect(service.runJudge('sess-lain', {})).rejects.toThrow(NotFoundException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('runJudge sends an empty object for a whole-session judge', async () => {
    const { service } = makeService();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ judge_id: 'j1', total: 2, skipped: 0 }) });

    const result = await service.runJudge('sess1', {});

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai-service.test/assessment/sess1/judge',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    );
    expect(result).toEqual({ judge_id: 'j1', total: 2, skipped: 0 });
  });

  it('runJudge maps the indicator list to apps/ai snake_case, defaulting subNo to empty', async () => {
    const { service } = makeService();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    await service.runJudge('sess1', { indicators: [{ indicatorNo: 7 }, { indicatorNo: 43, subNo: 'II' }] });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai-service.test/assessment/sess1/judge',
      expect.objectContaining({
        body: JSON.stringify({
          indicators: [
            { indicator_no: 7, sub_no: '' },
            { indicator_no: 43, sub_no: 'II' },
          ],
        }),
      }),
    );
  });

  it.each([
    [{ indicators: [{ indicatorNo: 0 }] }],
    [{ indicators: [{ indicatorNo: 1.5 }] }],
    [{ indicators: [{ indicatorNo: 3, subNo: 5 as unknown as string }] }],
    [{ indicators: [null as never] }],
  ])('runJudge rejects a malformed indicator list %j without calling apps/ai', async (dto) => {
    const { service } = makeService();
    global.fetch = jest.fn();

    await expect(service.runJudge('sess1', dto)).rejects.toThrow(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('runJudge raises a bad gateway when apps/ai is unreachable or refuses', async () => {
    const { service } = makeService();
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.runJudge('sess1', {})).rejects.toThrow(BadGatewayException);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(service.runJudge('sess1', {})).rejects.toThrow(BadGatewayException);
  });

  it('findJudgeStatus scopes the run through its own session id', async () => {
    const { service, assessmentSessionFindFirst } = makeService();
    const body = { judge_id: 'j1', session_id: 'sess1', status: 'running', total: 2, done: 1, skipped: 0, failed: 0 };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

    const result = await service.findJudgeStatus('j1');

    expect(global.fetch).toHaveBeenCalledWith('http://ai-service.test/assessment/judge/j1');
    expect(assessmentSessionFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'sess1' }) }));
    expect(result).toEqual(body);
  });

  it('findJudgeStatus maps an unknown run to 404 and rejects a run of a foreign session', async () => {
    const { service, assessmentSessionFindFirst } = makeService();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(service.findJudgeStatus('hilang')).rejects.toThrow(NotFoundException);

    assessmentSessionFindFirst.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ session_id: 'sess-lain' }) });
    await expect(service.findJudgeStatus('j2')).rejects.toThrow(NotFoundException);
  });
});

describe('AssessmentService never exposes judgeEvidence', () => {
  it('findResults omits judgeEvidence', async () => {
    const { service, findMany } = makeService();

    await service.findResults('sess1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ omit: { judgeEvidence: true } }));
  });

  it('findResultsForDocument omits judgeEvidence', async () => {
    const { service, findMany } = makeService();

    await service.findResultsForDocument('d1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ omit: { judgeEvidence: true } }));
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd apps/backend && npx jest src/assessment/assessment.service.spec.ts`
Expected: FAIL (`service.runJudge is not a function`, `omit` tidak ada).

- [ ] **Step 3: Buat DTO**

`apps/backend/src/assessment/dto/run-judge.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional } from 'class-validator';

export class RunJudgeDto {
  // Elemen divalidasi di AssessmentService.runJudge (bukan @ValidateNested): tidak ada DTO lain di
  // apps/backend yang memakai class bersarang, isinya cukup array polos (lihat upsert-criterion.dto.ts).
  @ApiPropertyOptional({
    example: [{ indicatorNo: 7, subNo: '' }],
    description: 'Indikator yang dijudge. Kosong = seluruh sesi (baris yang sudah dijudge dilewati); berisi = hanya itu, selalu dijalankan ulang.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  indicators?: { indicatorNo: number; subNo?: string }[];
}
```

- [ ] **Step 4: Ubah service**

Di `assessment.service.ts`: tambahkan `import { RunJudgeDto } from './dto/run-judge.dto';` di samping impor DTO lain. Pada `findResults`, tambahkan `omit: { judgeEvidence: true },` di objek argumen `findMany` (setelah `orderBy`); lakukan hal yang sama pada `findMany` di `findResultsForDocument`. Lalu tambahkan dua method tepat setelah `runEval`:

```ts
  /**
   * Proxy to apps/ai's `POST /assessment/:id/judge` -- judge grounding AMI on-demand (dulu node
   * terakhir di tiap graph scoring). `findSessionScoped` dulu, seperti `runEval`: apps/ai tidak
   * punya konsep tenant, jadi tanpa ini pengguna mana pun bisa memicu judge untuk sesi tenant lain.
   * Tidak ada job BullMQ; progres dipoll lewat `findJudgeStatus`.
   */
  async runJudge(id: string, dto: RunJudgeDto) {
    await this.findSessionScoped(id);

    const indicators = dto.indicators?.map((item) => {
      const subNoValid = item?.subNo === undefined || typeof item.subNo === 'string';
      if (!item || !Number.isInteger(item.indicatorNo) || item.indicatorNo < 1 || !subNoValid) {
        throw new BadRequestException('Daftar indikator judge tidak valid');
      }
      return { indicator_no: item.indicatorNo, sub_no: item.subNo ?? '' };
    });

    const aiServiceUrl = requireEnv('AI_SERVICE_URL');
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/assessment/${encodeURIComponent(id)}/judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(indicators ? { indicators } : {}),
      });
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }
    if (!upstream.ok) {
      throw new BadGatewayException('Gagal memulai judge');
    }
    return upstream.json();
  }

  /** Proxy to apps/ai's GET /assessment/judge/:judgeId, dibatasi lewat sesi milik run itu sendiri. */
  async findJudgeStatus(judgeId: string) {
    const aiServiceUrl = requireEnv('AI_SERVICE_URL');
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/assessment/judge/${encodeURIComponent(judgeId)}`);
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }
    if (upstream.status === 404) {
      throw new NotFoundException('Judge tidak ditemukan');
    }
    if (!upstream.ok) {
      throw new BadGatewayException('Gagal memuat status judge');
    }

    const result = (await upstream.json()) as { session_id?: string | null };
    if (!result.session_id) {
      throw new NotFoundException('Judge tidak ditemukan');
    }
    await this.findSessionScoped(result.session_id);
    return result;
  }
```

- [ ] **Step 5: Tambah endpoint di controller**

Di `assessment.controller.ts`: tambahkan `import { RunJudgeDto } from './dto/run-judge.dto';`, lalu setelah method `findEvalResult`:

```ts
  /** Proxy to apps/ai's POST /assessment/:id/judge -- judge grounding on-demand; tanpa job BullMQ. */
  @Post('assessment-sessions/:id/judge')
  @Protected(Role.PENJAMIN_MUTU, Role.PENYUSUN)
  runJudge(@Param('id') id: string, @Body() dto: RunJudgeDto) {
    return this.assessmentService.runJudge(id, dto);
  }

  /** Proxy to apps/ai's GET /assessment/judge/:judgeId -- poll progres judge. */
  @Get('assessment-judge/:judgeId')
  @Protected(...READ_ROLES)
  findJudgeStatus(@Param('judgeId') judgeId: string) {
    return this.assessmentService.findJudgeStatus(judgeId);
  }
```

- [ ] **Step 6: Jalankan tes dan lint tanpa menulis ulang berkas**

Run: `cd apps/backend && npx jest src/assessment`
Expected: PASS.

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json && npx eslint src/assessment` (tanpa `--fix`; skrip `npm run lint` memakai `--fix` dan menulis ulang berkas).
Expected: tanpa galat.

- [ ] **Step 7: Commit (hanya bila pengguna meminta)**

```bash
git add apps/backend/src/assessment
git commit -m "feat(backend): proxy on-demand ami judge and hide judge evidence"
```

---

### Task 6: Lapisan data web dan logika polling

**Files:**
- Modify: `apps/web/app/features/assessment/domain/entities/indicator-result.entity.ts`
- Modify: `apps/web/app/features/assessment/data/sources/remote/assessment.remote-source.ts`
- Modify: `apps/web/app/features/assessment/data/backend-mappers.ts`
- Modify: `apps/web/app/features/assessment/data/repositories/assessment-session.repository.ts`
- Create: `apps/web/app/features/assessment/presentation/utils/assessment-judge-poll.ts`
- Test: `apps/web/app/features/assessment/data/backend-mappers.test.ts` (baru), `apps/web/app/features/assessment/presentation/utils/assessment-judge-poll.test.ts` (baru)

**Interfaces:**
- Produces: `JudgeVerdictEntity` dan `IndicatorResultEntity.judge: JudgeVerdictEntity | null`; `mapJudgeVerdict(raw) -> JudgeVerdictEntity | null`; `assessmentSessionRepository.runJudge(sessionId, indikator?: {indikatorNo:number; subNo:string}[]) -> Promise<{judgeId:string; total:number; skipped:number}>`; `assessmentSessionRepository.findJudgeStatus(judgeId) -> Promise<JudgeStatusSnapshot | null>` (`null` bila 404); `pollJudge(...)`, `ringkasJudge(progres)`, tipe `JudgeProgress`, `JudgeStatusSnapshot`, `PollOutcome`.

- [ ] **Step 1: Tulis tes mapper yang gagal**

`apps/web/app/features/assessment/data/backend-mappers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { mapJudgeVerdict, mapResult } from './backend-mappers';

describe('mapJudgeVerdict', () => {
	it('memetakan verdict apps/ai ke bentuk entity', () => {
		expect(
			mapJudgeVerdict({
				grounded: false,
				hallucinated_claims: ['100 dosen tidak ada di bukti'],
				missing_facts: ['rapat pimpinan'],
				notes: 'Angka mengada-ada.',
				judge_model: 'gpt-oss:20b',
				judged_at: '2026-10-13T10:00:00+00:00',
			}),
		).toEqual({
			grounded: false,
			klaimTakTerdukung: ['100 dosen tidak ada di bukti'],
			faktaTerlewat: ['rapat pimpinan'],
			catatan: 'Angka mengada-ada.',
			model: 'gpt-oss:20b',
			dinilaiPada: '2026-10-13T10:00:00+00:00',
		});
	});

	it.each([[null], [undefined], [{}], [{ error: 'judge unreachable' }], [{ grounded: 'ya' }]])(
		'mengembalikan null untuk %j (belum dijudge atau bentuk rusak)',
		(raw) => {
			expect(mapJudgeVerdict(raw as never)).toBeNull();
		},
	);

	it('menoleransi field opsional yang hilang atau bertipe salah', () => {
		expect(
			mapJudgeVerdict({ grounded: true, hallucinated_claims: 'bukan array', missing_facts: [1, 'a'], notes: 5 }),
		).toEqual({
			grounded: true,
			klaimTakTerdukung: [],
			faktaTerlewat: ['a'],
			catatan: '',
			model: null,
			dinilaiPada: null,
		});
	});
});

describe('mapResult dengan judge', () => {
	const baris = (judgeVerdict: unknown) =>
		({
			id: 'r1',
			sessionId: 's1',
			indicatorNo: 7,
			subNo: '',
			score: '3.00',
			justification: 'j',
			confidence: '0.900',
			recommendation: null,
			error: null,
			createdAt: '2026-10-13T10:00:00Z',
			judgeVerdict,
		}) as never;

	it('mengisi judge dan tidak menyentuh confidence', () => {
		const hasil = mapResult(baris({ grounded: false, notes: 'x' }));
		expect(hasil.judge?.grounded).toBe(false);
		expect(hasil.confidence).toBe(0.9);
	});

	it('judge null bila belum pernah dijudge', () => {
		expect(mapResult(baris(null)).judge).toBeNull();
	});
});
```

- [ ] **Step 2: Tulis tes polling yang gagal**

`apps/web/app/features/assessment/presentation/utils/assessment-judge-poll.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
	pollJudge,
	ringkasJudge,
	type JudgeStatusSnapshot,
} from './assessment-judge-poll';

const snap = (over: Partial<JudgeStatusSnapshot> = {}): JudgeStatusSnapshot => ({
	status: 'running',
	total: 4,
	done: 1,
	skipped: 0,
	failed: 0,
	error: null,
	...over,
});

const alat = (urutan: (JudgeStatusSnapshot | null)[], masihBerlaku = () => true) => {
	const cek = vi.fn();
	for (const s of urutan) cek.mockResolvedValueOnce(s);
	return {
		cek,
		masihBerlaku: vi.fn(masihBerlaku),
		tidur: vi.fn().mockResolvedValue(undefined),
		jedaMs: 2000,
		onProgres: vi.fn(),
	};
};

describe('pollJudge', () => {
	it('berhenti saat completed dan melaporkan progres tiap putaran', async () => {
		const a = alat([snap(), snap({ done: 3 }), snap({ status: 'completed', done: 4 })]);

		const hasil = await pollJudge(a);

		expect(hasil).toEqual({ kind: 'selesai', progres: { total: 4, done: 4, skipped: 0, failed: 0 } });
		expect(a.onProgres).toHaveBeenCalledTimes(3);
		expect(a.tidur).toHaveBeenCalledTimes(2);
		expect(a.tidur).toHaveBeenCalledWith(2000);
	});

	it('melaporkan gagal beserta pesannya', async () => {
		const a = alat([snap({ status: 'failed', error: 'model juri mati' })]);
		expect(await pollJudge(a)).toEqual({ kind: 'gagal', pesan: 'model juri mati' });
	});

	it('memberi pesan bawaan bila gagal tanpa keterangan', async () => {
		const a = alat([snap({ status: 'failed', error: null })]);
		const hasil = await pollJudge(a);
		expect(hasil.kind).toBe('gagal');
	});

	it('apps/ai restart (cek -> null/404): berhenti sebagai "hilang" dengan progres terakhir, bukan galat', async () => {
		const a = alat([snap({ done: 2 }), null]);

		const hasil = await pollJudge(a);

		expect(hasil).toEqual({ kind: 'hilang', progres: { total: 4, done: 2, skipped: 0, failed: 0 } });
	});

	it('berhenti diam-diam bila sesi sudah berganti', async () => {
		let berlaku = true;
		const a = alat([snap(), snap()], () => berlaku);
		a.tidur.mockImplementation(async () => {
			berlaku = false;
		});

		expect(await pollJudge(a)).toEqual({ kind: 'dibatalkan' });
		expect(a.cek).toHaveBeenCalledTimes(1);
	});
});

describe('ringkasJudge', () => {
	it('merangkum dijudge, dilewati, dan gagal', () => {
		expect(ringkasJudge({ total: 60, done: 60, skipped: 6, failed: 2 })).toBe(
			'58 dijudge, 6 dilewati (bukti tidak tersimpan atau belum dinilai), 2 gagal',
		);
	});

	it('menyebut hanya yang relevan', () => {
		expect(ringkasJudge({ total: 3, done: 3, skipped: 0, failed: 0 })).toBe('3 dijudge');
	});

	it('menjelaskan bila tidak ada yang bisa dijudge', () => {
		expect(ringkasJudge({ total: 0, done: 0, skipped: 5, failed: 0 })).toBe(
			'0 dijudge, 5 dilewati (bukti tidak tersimpan atau belum dinilai)',
		);
	});
});
```

- [ ] **Step 3: Jalankan tes, pastikan gagal**

Run: `cd apps/web && npx vitest run app/features/assessment/data/backend-mappers.test.ts app/features/assessment/presentation/utils/assessment-judge-poll.test.ts`
Expected: FAIL (`mapJudgeVerdict` / modul `assessment-judge-poll` belum ada).

- [ ] **Step 4: Entity**

Di `indicator-result.entity.ts`, sebelum `indicatorResultSchema`, tambahkan:

```ts
/**
 * Hasil judge on-demand: pemeriksaan independen apakah klaim dalam justifikasi didukung bukti
 * yang diambil penilai. **Bukan ukuran ketepatan skor**, dan tidak pernah mengubah `confidence`.
 * `null` pada {@link IndicatorResultEntity.judge} = belum dijudge.
 */
export const judgeVerdictSchema = z.object({
	grounded: z.boolean(),
	/** Klaim dalam justifikasi yang tidak didukung bukti. */
	klaimTakTerdukung: z.array(z.string()),
	/** Hal relevan yang ada di bukti tetapi tidak disebut justifikasi. */
	faktaTerlewat: z.array(z.string()),
	catatan: z.string(),
	/** Model juri; `null` bila tidak tercatat. */
	model: z.string().nullable(),
	dinilaiPada: z.string().nullable(),
});

export type JudgeVerdictEntity = z.infer<typeof judgeVerdictSchema>;

/** Progres satu run judge (angka apa adanya dari apps/ai; `done` sudah termasuk yang gagal). */
export type JudgeProgress = {
	total: number;
	done: number;
	skipped: number;
	failed: number;
};

/** Satu pembacaan status run judge. Di domain (bukan di utils presentasi) karena repository mengembalikannya. */
export type JudgeStatusSnapshot = JudgeProgress & {
	status: 'pending' | 'running' | 'completed' | 'failed';
	error: string | null;
};
```

Di `indicatorResultSchema`, setelah field `error`, tambahkan:

```ts
	/** `null` = belum dijudge (juga untuk sesi lama, yang tidak bisa dijudge — lihat spec judge on-demand). */
	judge: judgeVerdictSchema.nullable(),
```

- [ ] **Step 5: Tipe backend dan remote source**

Di `assessment.remote-source.ts`, tambahkan ke `BackendIndicatorResult` (setelah field terakhir yang ada, mis. `createdAt`):

```ts
	/** JSON verdict judge (apps/ai); `null` = belum dijudge. `judgeEvidence` sengaja tidak dikirim backend. */
	judgeVerdict: Record<string, unknown> | null;
```

Tambahkan tipe dan dua method (di dekat `BackendRunEvalResponse` / method `findEvalResult`):

```ts
/** Respons `POST /assessment-sessions/:id/judge` (proxy apps/ai). */
export type BackendRunJudgeResponse = {
	judge_id: string;
	total: number;
	skipped: number;
};

/** Respons `GET /assessment-judge/:id` (proxy apps/ai). */
export type BackendJudgeStatus = {
	judge_id: string;
	session_id: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	total: number;
	done: number;
	skipped: number;
	failed: number;
	error: string | null;
};
```

```ts
	/** Mulai judge on-demand; `indicators` kosong/undefined = seluruh sesi. */
	runJudge(
		sessionId: string,
		indicators?: { indicatorNo: number; subNo: string }[],
	): Promise<BackendRunJudgeResponse> {
		return apiFetch<BackendRunJudgeResponse>(
			`/assessment-sessions/${sessionId}/judge`,
			{ method: 'POST', body: indicators ? { indicators } : {} },
		);
	},

	/** Poll progres satu judge. Melempar `ApiError` 404 bila apps/ai sudah melupakannya (restart). */
	findJudgeStatus(judgeId: string): Promise<BackendJudgeStatus> {
		return apiFetch<BackendJudgeStatus>(`/assessment-judge/${judgeId}`);
	},
```

- [ ] **Step 6: Mapper**

Di `backend-mappers.ts`: tambahkan `type JudgeVerdictEntity` ke impor dari `indicator-result.entity`, lalu sebelum `mapResult`:

```ts
function daftarString(nilai: unknown): string[] {
	return Array.isArray(nilai) ? nilai.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Verdict judge apps/ai (snake_case, JSON bebas) -> entity. `null` untuk "belum dijudge" maupun
 * bentuk yang tidak bisa dipercaya (mis. `{error: ...}`, `grounded` bukan boolean) — lebih baik
 * tampil "Belum dijudge" daripada memajang verdict rusak.
 */
export function mapJudgeVerdict(
	mentah: Record<string, unknown> | null | undefined,
): JudgeVerdictEntity | null {
	if (!mentah || typeof mentah.grounded !== 'boolean') return null;
	return {
		grounded: mentah.grounded,
		klaimTakTerdukung: daftarString(mentah.hallucinated_claims),
		faktaTerlewat: daftarString(mentah.missing_facts),
		catatan: typeof mentah.notes === 'string' ? mentah.notes : '',
		model: typeof mentah.judge_model === 'string' ? mentah.judge_model : null,
		dinilaiPada: typeof mentah.judged_at === 'string' ? mentah.judged_at : null,
	};
}
```

Dalam `mapResult`, tambahkan setelah `error: row.error,`:

```ts
		judge: mapJudgeVerdict(row.judgeVerdict),
```

- [ ] **Step 7: Logika polling**

Buat `presentation/utils/assessment-judge-poll.ts`:

```ts
/**
 * Logika polling judge on-demand, dipisah dari hook supaya bisa dites tanpa React.
 *
 * Status judge hidup di memori apps/ai (seperti RAGAS) dan hilang bila proses restart; verdict
 * yang sudah ditulis tetap ada di Postgres. Karena itu 404 pada polling BUKAN galat: hasilnya
 * "hilang" dan pemanggil cukup memuat ulang hasil yang sudah tersimpan.
 */

import {
	type JudgeProgress,
	type JudgeStatusSnapshot,
} from '../../domain/entities/indicator-result.entity';

export type { JudgeProgress, JudgeStatusSnapshot };

export type PollOutcome =
	| { kind: 'selesai'; progres: JudgeProgress }
	| { kind: 'gagal'; pesan: string }
	| { kind: 'hilang'; progres: JudgeProgress }
	| { kind: 'dibatalkan' };

export async function pollJudge({
	cek,
	masihBerlaku,
	tidur,
	jedaMs,
	onProgres,
}: {
	/** Satu kali baca status; `null` = apps/ai tidak mengenali judge ini (404). */
	cek: () => Promise<JudgeStatusSnapshot | null>;
	/** `false` bila pemicunya sudah tidak relevan (mis. sesi berganti). */
	masihBerlaku: () => boolean;
	tidur: (ms: number) => Promise<void>;
	jedaMs: number;
	onProgres: (progres: JudgeProgress) => void;
}): Promise<PollOutcome> {
	let terakhir: JudgeProgress = { total: 0, done: 0, skipped: 0, failed: 0 };

	for (;;) {
		if (!masihBerlaku()) return { kind: 'dibatalkan' };
		const snapshot = await cek();
		if (!masihBerlaku()) return { kind: 'dibatalkan' };
		if (snapshot === null) return { kind: 'hilang', progres: terakhir };

		terakhir = {
			total: snapshot.total,
			done: snapshot.done,
			skipped: snapshot.skipped,
			failed: snapshot.failed,
		};
		onProgres(terakhir);

		if (snapshot.status === 'completed') return { kind: 'selesai', progres: terakhir };
		if (snapshot.status === 'failed') {
			return { kind: 'gagal', pesan: snapshot.error ?? 'Judge gagal — coba jalankan ulang.' };
		}
		await tidur(jedaMs);
	}
}

/** Satu kalimat ringkasan akhir untuk pengguna. `done` sudah termasuk yang gagal. */
export function ringkasJudge(progres: JudgeProgress): string {
	const bagian = [`${progres.done - progres.failed} dijudge`];
	if (progres.skipped > 0) {
		bagian.push(`${progres.skipped} dilewati (bukti tidak tersimpan atau belum dinilai)`);
	}
	if (progres.failed > 0) bagian.push(`${progres.failed} gagal`);
	return bagian.join(', ');
}
```

- [ ] **Step 8: Repository**

Di `assessment-session.repository.ts`: tambahkan impor `import { ApiError } from '~/core/lib/api-client';` dan tambahkan `type JudgeStatusSnapshot` ke impor yang sudah ada dari `'../../domain/entities/indicator-result.entity'` (data layer tidak boleh mengimpor dari presentation), lalu tambahkan dua method di objek repository (setelah `findEvalResult`):

```ts
	/** Mulai judge on-demand; `indikator` kosong/undefined = seluruh sesi. */
	async runJudge(
		sessionId: string,
		indikator?: { indikatorNo: number; subNo: string }[],
	): Promise<{ judgeId: string; total: number; skipped: number }> {
		const res = await assessmentRemoteSource.runJudge(sessionId, indikator);
		return { judgeId: res.judge_id, total: res.total, skipped: res.skipped };
	},

	/** `null` bila apps/ai sudah melupakan judge ini (restart) — bukan galat, lihat assessment-judge-poll.ts. */
	async findJudgeStatus(judgeId: string): Promise<JudgeStatusSnapshot | null> {
		try {
			const row = await assessmentRemoteSource.findJudgeStatus(judgeId);
			return {
				status: row.status,
				total: row.total,
				done: row.done,
				skipped: row.skipped,
				failed: row.failed,
				error: row.error,
			};
		} catch (error) {
			if (error instanceof ApiError && error.status === 404) return null;
			throw error;
		}
	},
```

- [ ] **Step 9: Jalankan tes dan typecheck**

Run: `cd apps/web && npx vitest run app/features/assessment`
Expected: PASS (termasuk tes entity lama).

Run: `cd apps/web && npm run typecheck`
Expected: tanpa galat. Bila ada tempat lain yang membangun `IndicatorResultEntity` secara literal dan galat karena field `judge` wajib, tambahkan `judge: null` di sana (hanya itu).

- [ ] **Step 10: Commit (hanya bila pengguna meminta)**

```bash
git add apps/web/app/features/assessment
git commit -m "feat(web): add ami judge data layer and polling logic"
```

---

### Task 7: UI judge (detail sheet, "Judge semua", penanda di daftar)

**Files:**
- Create: `apps/web/app/features/assessment/presentation/hooks/use-assessment-judge.ts`
- Create: `apps/web/app/features/assessment/presentation/components/assessment-judge-panel.tsx`
- Create: `apps/web/app/features/assessment/presentation/components/assessment-judge-bar.tsx`
- Modify: `.../hooks/use-assessment-results.ts` (ekspos `muatUlang`), `.../components/assessment-detail-sheet.tsx`, `.../components/assessment-result-row.tsx`, `.../pages/led-project-assessment.tsx`

**Interfaces:**
- Consumes: `assessmentSessionRepository.runJudge/findJudgeStatus`, `pollJudge`, `ringkasJudge` (Task 6); `AssessmentPermission.canRun`; `AssessmentSessionEntity.status`; `PenilaianFinalRow.hasil?.judge`.
- Produces: `useAssessmentJudge({ sesi, izin, muatUlang }) -> { status: 'diam'|'berjalan'|'gagal'; progres: JudgeProgress|null; ringkasan: string|null; pesanGagal: string|null; bolehMenjalankan: boolean; jalankan(indikator?) }`; `useAssessmentResults` mengembalikan `muatUlang: () => Promise<void>`.

Komponen React tidak punya infrastruktur tes di proyek ini (hanya vitest murni); logika sudah dites di Task 6, jadi verifikasi task ini = `npm run typecheck` + pemeriksaan manual di bawah.

- [ ] **Step 1: Ekspos `muatUlang` dari `useAssessmentResults`**

Di `use-assessment-results.ts`, ubah baris return terakhir menjadi:

```ts
	return { baris, ringkasan, simpanKeputusan, cabutKeputusan, muatUlang: muat };
```

- [ ] **Step 2: Hook**

`presentation/hooks/use-assessment-judge.ts`:

```ts
import * as React from 'react';

import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import {
	pollJudge,
	ringkasJudge,
	type JudgeProgress,
} from '../utils/assessment-judge-poll';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusJudge = 'diam' | 'berjalan' | 'gagal';

/** Jarak antar-poll — judge jalan di BackgroundTasks apps/ai, tidak ada SSE (sama seperti RAGAS). */
const JEDA_POLL_MS = 2000;

/**
 * Judge grounding on-demand (apps/ai `POST /assessment/:id/judge`, lewat proxy NestJS).
 *
 * Dipicu manual: satu indikator (tombol di laci) atau seluruh sesi (`jalankan()` tanpa argumen).
 * Hasilnya ditulis server ke `IndicatorResult.judgeVerdict`, jadi setelah selesai cukup memuat
 * ulang hasil sesi (`muatUlang`). `confidence` tidak pernah diubah judge.
 *
 * Mengikuti `useAssessmentQuality`: hasil yang telat datang setelah sesi berganti tidak boleh
 * menimpa tampilan sesi yang sedang dilihat (`sesiIdBerjalanRef`).
 */
export function useAssessmentJudge({
	sesi,
	izin,
	muatUlang,
}: {
	sesi: AssessmentSessionEntity | undefined;
	izin: AssessmentPermission;
	muatUlang: () => Promise<void>;
}) {
	const [status, setStatus] = React.useState<StatusJudge>('diam');
	const [progres, setProgres] = React.useState<JudgeProgress | null>(null);
	const [ringkasan, setRingkasan] = React.useState<string | null>(null);
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);
	const sesiIdBerjalanRef = React.useRef<string | null>(null);

	const sesiId = sesi?.id;
	const bolehMenjalankan = izin.canRun && sesi?.status === 'COMPLETED';

	// Sesi berganti: bersihkan sisa tampilan sesi sebelumnya dan hentikan polling lamanya.
	React.useEffect(() => {
		sesiIdBerjalanRef.current = null;
		setStatus('diam');
		setProgres(null);
		setRingkasan(null);
		setPesanGagal(null);
	}, [sesiId]);

	const jalankan = React.useCallback(
		async (indikator?: { indikatorNo: number; subNo: string }[]) => {
			if (!bolehMenjalankan || !sesiId) return;

			sesiIdBerjalanRef.current = sesiId;
			setStatus('berjalan');
			setProgres(null);
			setRingkasan(null);
			setPesanGagal(null);
			const masihBerlaku = () => sesiIdBerjalanRef.current === sesiId;

			try {
				const { judgeId, total, skipped } = await assessmentSessionRepository.runJudge(
					sesiId,
					indikator,
				);

				if (total === 0) {
					// Tidak ada yang bisa dijudge (mis. sesi lama) — selesai seketika, tanpa polling.
					if (!masihBerlaku()) return;
					setRingkasan(ringkasJudge({ total: 0, done: 0, skipped, failed: 0 }));
					setStatus('diam');
					return;
				}

				const hasil = await pollJudge({
					cek: () => assessmentSessionRepository.findJudgeStatus(judgeId),
					masihBerlaku,
					tidur: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
					jedaMs: JEDA_POLL_MS,
					onProgres: (p) => {
						if (masihBerlaku()) setProgres(p);
					},
				});

				if (hasil.kind === 'dibatalkan' || !masihBerlaku()) return;

				if (hasil.kind === 'gagal') {
					setStatus('gagal');
					setPesanGagal(hasil.pesan);
					return;
				}

				// 'selesai' maupun 'hilang' (apps/ai restart): verdict yang sudah ditulis ada di Postgres.
				await muatUlang();
				if (!masihBerlaku()) return;
				setRingkasan(
					hasil.kind === 'selesai'
						? ringkasJudge(hasil.progres)
						: 'Layanan AI dimulai ulang saat judge berjalan; yang sudah selesai ditampilkan, ulangi untuk sisanya.',
				);
				setStatus('diam');
			} catch (error) {
				if (!masihBerlaku()) return;
				setStatus('gagal');
				setPesanGagal(error instanceof Error ? error.message : 'Gagal menjalankan judge.');
			}
		},
		[bolehMenjalankan, sesiId, muatUlang],
	);

	return { status, progres, ringkasan, pesanGagal, bolehMenjalankan, jalankan };
}
```

- [ ] **Step 3: Panel di laci (per indikator)**

`presentation/components/assessment-judge-panel.tsx`:

```tsx
import { CheckIcon, SpinnerGapIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { type JudgeVerdictEntity } from '../../domain/entities/indicator-result.entity';

/**
 * Hasil judge untuk satu indikator, di bawah "Justifikasi AI".
 *
 * **Bukan ukuran ketepatan skor.** Judge hanya memeriksa apakah klaim dalam justifikasi didukung
 * bukti yang diambil penilai; skor bisa tetap keliru walau "Didukung bukti". Kalimat bantuan di
 * bawah sengaja mengatakannya, sama alasannya dengan keterangan badge keyakinan.
 *
 * Tidak ada pembeda sesi lama: semua baris tanpa verdict tampil "Belum dijudge". Untuk sesi lama
 * (bukti tidak tersimpan) menekan tombol hanya menghasilkan ringkasan "dilewati".
 */
export function AssessmentJudgePanel({
	judge,
	bolehMenjalankan,
	sedangBerjalan,
	onJalankan,
}: {
	judge: JudgeVerdictEntity | null;
	bolehMenjalankan: boolean;
	/** Judge (indikator ini atau seluruh sesi) sedang berjalan; tombol dikunci. */
	sedangBerjalan: boolean;
	onJalankan: () => void;
}) {
	return (
		<div className="rounded-md border border-border p-2.5">
			<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
				<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					Dukungan bukti (Judge)
				</p>
				{bolehMenjalankan && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onJalankan}
						disabled={sedangBerjalan}
						className="cursor-pointer"
					>
						{sedangBerjalan && <SpinnerGapIcon className="animate-spin" />}
						{judge ? 'Jalankan ulang' : 'Jalankan Judge'}
					</Button>
				)}
			</div>

			{judge === null ? (
				<p className="mt-1 text-sm text-muted-foreground">Belum dijudge.</p>
			) : (
				<div className="mt-1 space-y-2 text-sm">
					<p className="flex items-center gap-1.5 font-medium">
						{judge.grounded ? (
							<>
								<CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
								Didukung bukti
							</>
						) : (
							<>
								<WarningCircleIcon className="size-4 text-amber-600 dark:text-amber-400" />
								Tidak sepenuhnya didukung bukti
							</>
						)}
					</p>

					{judge.klaimTakTerdukung.length > 0 && (
						<div>
							<p className="text-xs font-medium text-muted-foreground">Klaim yang tidak didukung bukti</p>
							<ul className="mt-0.5 list-disc pl-5">
								{judge.klaimTakTerdukung.map((klaim) => (
									<li key={klaim}>{klaim}</li>
								))}
							</ul>
						</div>
					)}

					{judge.faktaTerlewat.length > 0 && (
						<div>
							<p className="text-xs font-medium text-muted-foreground">Ada di bukti tetapi tidak disebut</p>
							<ul className="mt-0.5 list-disc pl-5">
								{judge.faktaTerlewat.map((fakta) => (
									<li key={fakta}>{fakta}</li>
								))}
							</ul>
						</div>
					)}

					{judge.catatan && <p className="leading-relaxed">{judge.catatan}</p>}

					<p className="text-xs text-muted-foreground">
						{[judge.model, judge.dinilaiPada ? formatRelativeTimeLong(judge.dinilaiPada) : null]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</div>
			)}

			<p className="mt-2 text-xs text-muted-foreground">
				Pemeriksaan independen apakah klaim dalam justifikasi didukung bukti yang diambil AI. Bukan
				ukuran ketepatan skor.
			</p>
		</div>
	);
}
```

Catatan: `formatRelativeTimeLong` dipakai di `assessment-detail-sheet.tsx` dengan argumen tanggal; bila signature-nya menerima `Date` bukan string, bungkus `new Date(judge.dinilaiPada)`. Typecheck di Step 8 akan menunjukkan.

- [ ] **Step 4: Bar "Judge semua"**

`presentation/components/assessment-judge-bar.tsx`:

```tsx
import { SpinnerGapIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type JudgeProgress } from '../utils/assessment-judge-poll';
import { type StatusJudge } from '../hooks/use-assessment-judge';

/**
 * Judge untuk seluruh sesi, di atas daftar hasil. Baris yang sudah dijudge dilewati (tidak
 * dibayar ulang); menjalankan ulang satu indikator dilakukan dari laci.
 */
export function AssessmentJudgeBar({
	status,
	progres,
	ringkasan,
	pesanGagal,
	onJalankan,
}: {
	status: StatusJudge;
	progres: JudgeProgress | null;
	ringkasan: string | null;
	pesanGagal: string | null;
	onJalankan: () => void;
}) {
	const berjalan = status === 'berjalan';

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border p-2.5">
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">Periksa dukungan bukti (Judge)</p>
				<p className="text-xs text-muted-foreground" aria-live="polite">
					{berjalan
						? progres
							? `Memeriksa… ${progres.done}/${progres.total}${progres.skipped > 0 ? ` · ${progres.skipped} dilewati` : ''}`
							: 'Memulai…'
						: (ringkasan ??
							'Memeriksa apakah klaim justifikasi didukung bukti yang diambil AI. Tidak mengubah skor maupun keyakinan.')}
				</p>
				{status === 'gagal' && pesanGagal && (
					<p className="mt-1 flex items-center gap-1 text-xs text-destructive">
						<WarningCircleIcon className="size-3.5" />
						{pesanGagal}
					</p>
				)}
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={onJalankan}
				disabled={berjalan}
				className="cursor-pointer"
			>
				{berjalan && <SpinnerGapIcon className="animate-spin" />}
				Judge semua
			</Button>
		</div>
	);
}
```

- [ ] **Step 5: Pasang di laci**

Di `assessment-detail-sheet.tsx`: tambah impor `import { AssessmentJudgePanel } from './assessment-judge-panel';`. Tambah tiga prop pada tanda tangan komponen (di samping `onCabut`):

```tsx
	judgeBolehMenjalankan,
	judgeBerjalan,
	onJalankanJudge,
```

dengan tipe `judgeBolehMenjalankan: boolean; judgeBerjalan: boolean; onJalankanJudge: () => void;`. Lalu, tepat setelah blok `{hasil?.justifikasi && ( ... )}` (blok "Justifikasi AI") dan sebelum blok `{hasil?.rekomendasi && (`, sisipkan:

```tsx
				{hasil?.justifikasi && (
					<AssessmentJudgePanel
						judge={hasil.judge}
						bolehMenjalankan={judgeBolehMenjalankan}
						sedangBerjalan={judgeBerjalan}
						onJalankan={onJalankanJudge}
					/>
				)}
```

- [ ] **Step 6: Penanda di baris daftar**

Di `assessment-result-row.tsx`: tambah `WarningCircleIcon` ke impor `@phosphor-icons/react`. Di dalam `<span className="flex flex-wrap items-center gap-x-3 gap-y-1">` yang berisi `<AssessmentConfidenceBadge .../>`, tepat setelah `<span className="text-xs text-muted-foreground">{rubricScoreTypeLabels[...]}</span>`, tambahkan:

```tsx
						{row.hasil?.judge?.grounded === false && (
							<span
								className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
								title="Judge: justifikasi tidak sepenuhnya didukung bukti yang diambil AI. Bukan ukuran ketepatan skor."
							>
								<WarningCircleIcon className="size-3.5" />
								Bukti kurang
							</span>
						)}
```

(`title`, bukan `Tooltip`: baris ini seluruhnya `<button>`; lihat catatan `render={<span />}` di `assessment-confidence-badge.tsx` tentang tombol bersarang.)

- [ ] **Step 7: Pasang di halaman**

Di `pages/led-project-assessment.tsx`: tambah impor

```tsx
import { AssessmentJudgeBar } from '../components/assessment-judge-bar';
import { useAssessmentJudge } from '../hooks/use-assessment-judge';
```

Ubah destructuring `useAssessmentResults` agar menyertakan `muatUlang`:

```tsx
	const { baris, ringkasan, simpanKeputusan, cabutKeputusan, muatUlang } =
		useAssessmentResults({
```

Tepat setelah `const kualitas = useAssessmentQuality({ sesi: sesiAktif, izin });`:

```tsx
	const judge = useAssessmentJudge({ sesi: sesiAktif, izin, muatUlang });
```

Tepat sebelum `<AssessmentResultList` di `TabsContent value="penilaian"`:

```tsx
					{judge.bolehMenjalankan && (
						<AssessmentJudgeBar
							status={judge.status}
							progres={judge.progres}
							ringkasan={judge.ringkasan}
							pesanGagal={judge.pesanGagal}
							onJalankan={() => void judge.jalankan()}
						/>
					)}

```

Pada `<AssessmentDetailSheet`, tambahkan prop (setelah `onCabut`):

```tsx
				judgeBolehMenjalankan={judge.bolehMenjalankan}
				judgeBerjalan={judge.status === 'berjalan'}
				onJalankanJudge={() => {
					if (!rowDibuka) return;
					void judge.jalankan([
						{ indikatorNo: rowDibuka.kriteria.no, subNo: rowDibuka.kriteria.subNo ?? '' },
					]);
				}}
```

- [ ] **Step 8: Typecheck dan seluruh tes web**

Run: `cd apps/web && npm run typecheck`
Expected: tanpa galat (perbaiki signature `formatRelativeTimeLong` bila perlu, lihat catatan Step 3).

Run: `cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 9: Verifikasi manual di browser (stack penuh)**

Jalankan stack (CLAUDE.md "Full stack"), nilai satu sesi hingga `COMPLETED`, lalu:
1. Buka laci satu indikator → panel tampil "Belum dijudge" dengan tombol "Jalankan Judge" (hanya untuk Penjamin Mutu/Penyusun; Pimpinan tidak melihat tombol).
2. Tekan → tombol terkunci dengan spinner, lalu panel menampilkan label hasil, klaim, catatan, model + waktu; badge keyakinan **tidak berubah**.
3. Tekan "Judge semua" → progres "Memeriksa… n/total", lalu ringkasan; indikator yang tidak didukung bukti punya penanda "Bukti kurang" di daftar.
4. Buka sesi lama (dibuat sebelum migrasi) → "Judge semua" menghasilkan ringkasan "0 dijudge, N dilewati…" tanpa galat.
5. Selama "Judge semua" berjalan, restart layanan `ai` → UI berhenti dengan pesan "Layanan AI dimulai ulang…" dan hasil yang sudah ditulis tetap tampil.

Bila stack tidak bisa dijalankan, katakan bahwa langkah ini **belum diverifikasi**; jangan klaim selesai.

- [ ] **Step 10: Commit (hanya bila pengguna meminta)**

```bash
git add apps/web/app/features/assessment
git commit -m "feat(web): add on-demand ami judge ui"
```

---

### Task 8: Verifikasi akhir dan pemeriksaan batasan

**Files:** tidak ada perubahan kode.

- [ ] **Step 1: Seluruh tes**

Run: `cd apps/ai && pytest -q` (tes DB harus tidak `skipped` bila `DATABASE_URL` diset; laporkan jumlah skipped apa adanya)
Run: `cd apps/backend && npx jest`
Run: `cd apps/web && npx vitest run && npm run typecheck`
Expected: semuanya PASS.

- [ ] **Step 2: Tidak ada sisa rujukan judge lama di jalur AMI**

Run: `grep -rn "judge_node\|\"judge\"\|state\[\"judge_verdict\"\]" apps/ai/agent apps/ai/api apps/ai/db`
Expected: tidak ada keluaran.

Run: `git diff dev-2 --stat -- apps/ai/llm/chat_model.py apps/ai/worker.py apps/backend/src/jobs apps/backend/src/dokumen-led`
Expected: tidak ada keluaran (file terlarang tidak berubah).

Run: `git diff dev-2 --stat -- packages/db`
Expected: hanya `schema.prisma` dan folder migrasi `20261013110000_assessment_judge_on_demand`.

- [ ] **Step 3: Pastikan perubahan skema hanya dua kolom di `IndicatorResult`**

Run: `git diff dev-2 -- packages/db/prisma/schema.prisma`
Expected: hanya dua baris properti (+ komentar) di model `IndicatorResult`; enum `JobType` tidak tersentuh.

- [ ] **Step 4: Laporkan ke pengguna**

Sampaikan: ringkasan perubahan, hasil tiap perintah di atas (termasuk tes yang `skipped` dan langkah manual yang belum dijalankan), dan bahwa tidak ada yang di-commit. Tawarkan membuat commit per task sesuai saran pesan, dan ingatkan urutan merge dengan `feat/setor-led` bebas (hanya `schema.prisma` yang dibagi).
