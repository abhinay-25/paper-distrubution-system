"""Duplicate detection evaluation and threshold benchmark.

Fulfills Step 6 Requirements:
- Section 7.1: Local embedding model (all-MiniLM-L6-v2) evaluation
- Section 7.2: Similarity scoring & evaluation dataset containing:
    * True semantic duplicates (paraphrased questions)
    * Related but non-duplicate questions (same domain/topic)
    * Lexically similar but conceptually different questions
    * Questions from different topics/domains
- Computes Precision, Recall, False Positives, False Negatives at provisional
  thresholds (0.75 for potential duplicates, 0.90 for near duplicates).
"""

from __future__ import annotations

import numpy as np
import pytest

from app.services.embedding_service import (
    NEAR_DUPLICATE_THRESHOLD,
    POTENTIAL_DUPLICATE_THRESHOLD,
    EmbeddingService,
)

# ---------------------------------------------------------------------------
# Benchmark evaluation dataset
# (question_a, question_b, is_true_duplicate, category)
# ---------------------------------------------------------------------------

BENCHMARK_DATASET = [
    # 1. True semantic duplicates (paraphrased, testing same concept)
    (
        "What is the time complexity of binary search on a sorted array of size n?",
        "Find the asymptotic worst-case runtime of searching an element in a sorted list using binary search.",
        True,
        "paraphrased_duplicate",
    ),
    (
        "Explain the difference between a process and a thread in modern operating systems.",
        "How does an operating system process differ from a thread of execution?",
        True,
        "paraphrased_duplicate",
    ),
    (
        "State and prove Bayes' theorem for conditional probability.",
        "Derive the mathematical formulation of Bayes' rule in probability theory.",
        True,
        "paraphrased_duplicate",
    ),
    (
        "Define ACID properties in database management systems.",
        "What are the four ACID properties required for reliable database transactions?",
        True,
        "paraphrased_duplicate",
    ),
    # 2. Related but non-duplicate questions (same subject/topic, different questions)
    (
        "Explain the difference between a process and a thread in operating systems.",
        "What are the common CPU scheduling algorithms in modern operating systems?",
        False,
        "related_non_duplicate",
    ),
    (
        "What is the time complexity of binary search?",
        "How does an AVL tree maintain its balance during insertions?",
        False,
        "related_non_duplicate",
    ),
    (
        "Define ACID properties in database management systems.",
        "Explain the difference between B-tree and B+ tree index structures.",
        False,
        "related_non_duplicate",
    ),
    # 3. Lexically similar but conceptually different questions
    (
        "Explain depth-first search (DFS) traversal in a graph.",
        "Explain breadth-first search (BFS) traversal in a graph.",
        False,
        "lexical_contrast",
    ),
    (
        "What is compile-time (static) polymorphism in C++?",
        "What is runtime (dynamic) polymorphism in C++?",
        False,
        "lexical_contrast",
    ),
    (
        "Describe symmetric key encryption and its primary advantages.",
        "Describe asymmetric key encryption and its primary advantages.",
        False,
        "lexical_contrast",
    ),
    # 4. Completely different topics
    (
        "Explain normal forms (1NF, 2NF, 3NF) in relational databases.",
        "Describe the light-dependent reactions of photosynthesis in plant chloroplasts.",
        False,
        "different_domain",
    ),
    (
        "Calculate the eigenvalues and eigenvectors of a 2x2 real matrix.",
        "What is the difference between TCP and UDP transport layer protocols?",
        False,
        "different_domain",
    ),
]


def test_embedding_service_cosine_similarity_math() -> None:
    """Verify that cosine_similarities calculates normalized dot product correctly."""
    emb_service = EmbeddingService()

    # Query vector: [1, 0, 0]
    query = np.array([1.0, 0.0, 0.0], dtype=np.float32)

    # Matrix:
    # row 0: [1, 0, 0] -> identical -> 1.0
    # row 1: [0, 1, 0] -> orthogonal -> 0.0
    # row 2: [-1, 0, 0] -> opposite -> -1.0
    # row 3: [0.7071, 0.7071, 0] -> 45 deg -> ~0.7071
    matrix = np.array(
        [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [-1.0, 0.0, 0.0],
            [0.70710678, 0.70710678, 0.0],
        ],
        dtype=np.float32,
    )

    scores = emb_service.cosine_similarities(query, matrix)

    assert scores.shape == (4,)
    assert scores[0] == pytest.approx(1.0, abs=1e-5)
    assert scores[1] == pytest.approx(0.0, abs=1e-5)
    assert scores[2] == pytest.approx(-1.0, abs=1e-5)
    assert scores[3] == pytest.approx(0.7071, abs=1e-3)


def test_threshold_constants() -> None:
    """Verify that thresholds match documented provisional values."""
    assert POTENTIAL_DUPLICATE_THRESHOLD == 0.75
    assert NEAR_DUPLICATE_THRESHOLD == 0.90
    assert POTENTIAL_DUPLICATE_THRESHOLD < NEAR_DUPLICATE_THRESHOLD


def evaluate_pairs(
    similarity_fn, dataset: list[tuple[str, str, bool, str]], threshold: float
) -> dict[str, float | int]:
    """Compute precision, recall, TP, FP, TN, FN for a given similarity threshold."""
    tp = fp = tn = fn = 0

    for q_a, q_b, is_true_dup, _ in dataset:
        score = similarity_fn(q_a, q_b)
        predicted_dup = score >= threshold

        if predicted_dup and is_true_dup:
            tp += 1
        elif predicted_dup and not is_true_dup:
            fp += 1
        elif not predicted_dup and is_true_dup:
            fn += 1
        else:
            tn += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    accuracy = (tp + tn) / len(dataset) if len(dataset) > 0 else 0.0

    return {
        "threshold": threshold,
        "total": len(dataset),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "accuracy": accuracy,
    }


def test_benchmark_metrics_computation() -> None:
    """Tests the benchmark evaluation framework with simulated ground truth scores."""

    def mock_similarity_fn(qa: str, qb: str) -> float:
        # Check against ground truth in benchmark dataset
        for q1, q2, is_dup, cat in BENCHMARK_DATASET:
            if (qa == q1 and qb == q2) or (qa == q2 and qb == q1):
                if is_dup:
                    return 0.88  # True duplicate gets high score
                elif cat == "lexical_contrast":
                    return 0.65  # Lexically similar but different gets medium score
                elif cat == "related_non_duplicate":
                    return 0.50  # Same topic gets moderate score
                else:
                    return 0.15  # Unrelated gets low score
        return 0.10

    # At 0.75 threshold:
    # - True duplicates (0.88 >= 0.75) -> TP = 4
    # - Lexical contrasts (0.65 < 0.75) -> TN
    # - Related non-duplicates (0.50 < 0.75) -> TN
    # - Different domain (0.15 < 0.75) -> TN
    metrics = evaluate_pairs(mock_similarity_fn, BENCHMARK_DATASET, threshold=0.75)

    assert metrics["tp"] == 4
    assert metrics["fp"] == 0
    assert metrics["fn"] == 0
    assert metrics["tn"] == 8
    assert metrics["precision"] == 1.0
    assert metrics["recall"] == 1.0
    assert metrics["accuracy"] == 1.0


@pytest.mark.skipif(
    True,  # Skipped during regular unit test runs to prevent network downloading of HF model
    reason="Enable when running full model benchmark with pre-downloaded sentence-transformers weights",
)
def test_live_sentence_transformer_benchmark() -> None:
    """Live benchmark on the real all-MiniLM-L6-v2 model."""
    emb_service = EmbeddingService()

    def live_similarity(qa: str, qb: str) -> float:
        embs = emb_service.encode([qa, qb])
        return float(emb_service.cosine_similarities(embs[0], embs[1:])[0])

    metrics_potential = evaluate_pairs(live_similarity, BENCHMARK_DATASET, threshold=0.75)
    metrics_near = evaluate_pairs(live_similarity, BENCHMARK_DATASET, threshold=0.90)

    # Print evaluation results for documentation
    print(f"\n--- Benchmark Results at Threshold 0.75 ---")
    print(metrics_potential)
    print(f"--- Benchmark Results at Threshold 0.90 ---")
    print(metrics_near)

    assert metrics_potential["total"] == len(BENCHMARK_DATASET)
