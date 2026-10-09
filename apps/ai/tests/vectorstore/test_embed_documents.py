"""embed_documents: dimas-style batching (small groups, long chunks isolated), normalised output."""

import numpy as np
import pytest

import vectorstore.pgvector_store as pv


class _RecordingModel:
    def __init__(self):
        self.groups: list[list[str]] = []
        self.kwargs: dict = {}

    def get_sentence_embedding_dimension(self):
        return 1024

    def encode(self, texts, **kwargs):
        self.groups.append(list(texts))
        self.kwargs = kwargs
        return np.ones((len(texts), 1024), dtype="float32")


@pytest.fixture()
def model(monkeypatch):
    m = _RecordingModel()
    monkeypatch.setattr(pv, "_get_model", lambda *_: m)
    return m


def test_short_texts_are_batched_by_eight(model):
    out = pv.embed_documents([f"t{i}" for i in range(10)])
    assert [len(g) for g in model.groups] == [8, 2]
    assert out.shape == (10, 1024)
    assert model.kwargs["normalize_embeddings"] is True


def test_long_chunk_is_embedded_alone(model):
    long = "x" * (pv._LONG_CHUNK_CHARS + 1)
    pv.embed_documents(["a", "b", long, "c"])
    assert [len(g) for g in model.groups] == [2, 1, 1]
    assert model.groups[1] == [long]


def test_empty_input_and_query(model):
    assert pv.embed_documents([]).shape == (0, 1024)
    assert pv.embed_query("halo").shape == (1024,)
