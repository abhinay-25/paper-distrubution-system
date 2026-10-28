"""Semantic embedding service using sentence-transformers.

Uses the lightweight ``all-MiniLM-L6-v2`` model (22 MB) which runs fully
locally — no external API calls are made for embedding computation.

Design decisions:
- The model is loaded lazily and cached for the lifetime of the process.
- Cosine similarity is computed in pure numpy; no GPU is required.
- Thresholds are provisional and must be reviewed with domain experts.
  They are documented in ``SIMILARITY_THRESHOLDS`` and echoed back in every
  ``QuestionAnalysisResult`` so that the frontend can display them to faculty.
"""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

import numpy as np

from app.core.logging import get_logger

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer  # noqa: F401

logger = get_logger()

# ---------------------------------------------------------------------------
# Similarity thresholds (provisional — must be reviewed with domain experts)
# ---------------------------------------------------------------------------

#: Questions with cosine similarity >= this value are flagged as near-duplicates.
#: Provisional: very high confidence of substantial overlap.
NEAR_DUPLICATE_THRESHOLD: float = 0.90

#: Questions with cosine similarity >= this value are flagged as potential duplicates.
#: Provisional: moderate to high confidence of topical overlap.
POTENTIAL_DUPLICATE_THRESHOLD: float = 0.75

# ---------------------------------------------------------------------------
# Model selection
# ---------------------------------------------------------------------------

_DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"


class EmbeddingService:
    """Thread-safe, lazily-initialized sentence embedding service.

    Parameters
    ----------
    model_name:
        Sentence Transformers model identifier. Defaults to ``all-MiniLM-L6-v2``.
        The model is downloaded once to the HuggingFace cache directory.
    """

    def __init__(self, model_name: str = _DEFAULT_MODEL_NAME) -> None:
        self._model_name = model_name
        self._model: "SentenceTransformer | None" = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def model_name(self) -> str:
        return self._model_name

    def encode(self, texts: list[str]) -> np.ndarray:
        """Return an (N, D) float32 matrix of normalized embeddings.

        Embeddings are L2-normalized so that dot product == cosine similarity.
        """
        model = self._get_model()
        embeddings = model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embeddings.astype(np.float32)

    def cosine_similarities(self, query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
        """Return cosine similarities between a single query vector and a matrix.

        Since both inputs are L2-normalized, this is just the dot product.
        Output shape: (len(matrix),).
        """
        # query: (D,)  matrix: (N, D) → scores: (N,)
        return (matrix @ query).clip(-1.0, 1.0)

    def warm_up(self) -> None:
        """Force model load; call once at startup to avoid cold-start latency."""
        self._get_model()
        logger.info(
            "Embedding model loaded",
            extra={"event": "embedding_model_loaded", "model": self._model_name},
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_model(self) -> "SentenceTransformer":
        if self._model is not None:
            return self._model
        with self._lock:
            # Double-checked locking
            if self._model is None:
                from sentence_transformers import SentenceTransformer  # noqa: PLC0415

                self._model = SentenceTransformer(self._model_name)
        return self._model  # type: ignore[return-value]


# Process-level singleton — shared across requests.
embedding_service = EmbeddingService()
