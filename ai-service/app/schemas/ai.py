"""Versioned internal contract between the Node.js backend and the AI service.

Contract version: ``v1``. JSON uses camelCase to match the backend's conventions.

Design rules:
- Requests are strict: unknown fields (for example ``systemInstruction``, ``model``,
  ``temperature``) are rejected, so callers cannot override server policy.
- Operations are an explicit allow-list. Trusted instructions live on the server.
- Provider output is validated against the result model before it is returned.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

CONTRACT_VERSION = "v1"

# Absolute ceiling enforced by the schema; the configured MAX_INPUT_CHARS
# (lower by default) is enforced by the service layer.
HARD_MAX_INPUT_CHARS = 100_000


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

AnalyzeTextOperation = Literal["text_overview"]
QuestionAnalysisOperation = Literal["question_analysis"]
GenerateQuestionsOperation = Literal["generate_questions"]
AnyOperation = Literal["text_overview", "question_analysis", "generate_questions"]


class AnalyzeTextRequest(_CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True
    )

    contract_version: Literal["v1"]
    operation: AnalyzeTextOperation
    text: str = Field(min_length=1, max_length=HARD_MAX_INPUT_CHARS)


# ---------------------------------------------------------------------------
# Question Analysis Request — Step 6
#
# The Node.js backend supplies the question text and, optionally, a list of
# existing question texts from the same bank (for duplicate detection).
# It never sends question IDs; the caller supplies opaque ``candidateId``
# tokens that the service echoes back without inspecting them.
# ---------------------------------------------------------------------------

class QuestionCandidate(_CamelModel):
    """A question from the existing bank to compare against for duplicate detection."""
    candidate_id: str = Field(
        min_length=1,
        max_length=128,
        description="Opaque ID supplied and consumed by the Node.js backend.",
    )
    text: str = Field(min_length=1, max_length=HARD_MAX_INPUT_CHARS)


class QuestionAnalysisRequest(_CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True
    )

    contract_version: Literal["v1"]
    operation: QuestionAnalysisOperation
    question_text: str = Field(min_length=1, max_length=HARD_MAX_INPUT_CHARS)
    # The caller supplies their question's revision ID so the service echoes it
    # back and the backend can associate the result with the right revision.
    revision_id: str = Field(min_length=1, max_length=128)
    # Optional pool of existing questions for semantic duplicate detection.
    # Limited to 200 to bound embedding computation time.
    candidates: list[QuestionCandidate] = Field(
        default_factory=list,
        max_length=200,
        description="Existing question bank entries to compare for semantic similarity.",
    )


# ---------------------------------------------------------------------------
# Question Generation Request — Step 7
# ---------------------------------------------------------------------------

class GenerateQuestionsRequest(_CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True
    )

    contract_version: Literal["v1"]
    operation: GenerateQuestionsOperation
    subject_name: str = Field(min_length=1, max_length=200)
    subject_code: str = Field(min_length=1, max_length=50)
    topic_name: str | None = Field(default=None, max_length=200)
    question_type: str = Field(pattern=r"^(MULTIPLE_CHOICE|SHORT_ANSWER|LONG_ANSWER|NUMERICAL)$")
    difficulty: str | None = Field(default=None, pattern=r"^(EASY|MEDIUM|HARD)$")
    count: int = Field(ge=1, le=20)
    language: str = Field(default="en", max_length=10)
    context_hint: str | None = Field(default=None, max_length=500)
    grounding_mode: str | None = Field(default=None, max_length=50)
    source_excerpts: list[str] | None = Field(default=None, max_length=50)
    source_context: str | None = Field(default=None, max_length=50000)


# ---------------------------------------------------------------------------
# Embed Request & Response — Step 7 Source Documents & RAG
# ---------------------------------------------------------------------------

class EmbedRequest(_CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="ignore", str_strip_whitespace=True
    )

    text: str | None = None
    texts: list[str] | str | None = None


class EmbedResponse(_CamelModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    embedding: list[float]
    embeddings: list[list[float]]
    dimensions: int = 384


# ---------------------------------------------------------------------------
# Operation results (also used as the provider's response JSON schema)
# ---------------------------------------------------------------------------


class TextOverviewResult(_CamelModel):
    """Small, deterministic structure used to smoke-test the provider integration."""

    summary: str = Field(min_length=1, max_length=600, description="One or two sentence neutral summary.")
    language: str = Field(
        min_length=2,
        max_length=8,
        pattern=r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$",
        description="Primary language as a BCP-47 style code, e.g. 'en'.",
    )
    key_terms: list[str] = Field(
        max_length=8,
        description="Up to 8 short key terms that appear in the text.",
    )

    def model_post_init(self, __context: object) -> None:
        for term in self.key_terms:
            if not term.strip() or len(term) > 60:
                raise ValueError("each key term must be 1-60 characters")


# Bloom's Taxonomy cognitive levels (simplified six-level classification).
BloomsLevel = Literal[
    "remember", "understand", "apply", "analyze", "evaluate", "create", "undetermined"
]

# Difficulty suggestion from the AI model.
# "undetermined" is returned when the model cannot make a confident assessment.
DifficultySuggestion = Literal["easy", "medium", "hard", "undetermined"]


class ClassificationResult(_CamelModel):
    """AI-suggested taxonomy classification. Always a suggestion — never authoritative."""

    blooms_level: BloomsLevel = Field(description="Estimated Bloom's taxonomy cognitive level.")
    blooms_confidence: Annotated[float, Field(ge=0.0, le=1.0)] = Field(
        description="Model's self-reported confidence in the Bloom's level (0–1)."
    )
    subject_tags: list[str] = Field(
        max_length=10,
        description="Up to 10 broad subject-area tags inferred from the question text.",
    )
    question_type_hint: Literal[
        "factual", "conceptual", "procedural", "analytical", "evaluative", "creative", "unknown"
    ] = Field(description="High-level question type inferred from the question text.")


class DifficultyEstimationResult(_CamelModel):
    """AI-suggested difficulty. Faculty-assigned difficulty must never be overwritten."""

    suggested_difficulty: DifficultySuggestion = Field(
        description="AI-suggested difficulty level. Treat as a suggestion only."
    )
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = Field(
        description="Model's self-reported confidence (0–1)."
    )
    rationale: str = Field(
        min_length=1,
        max_length=500,
        description="Brief, human-readable rationale for the suggestion.",
    )


class AIProviderClassification(_CamelModel):
    """Raw AI classification used in the structured output schema enforced on the provider."""

    blooms_level: BloomsLevel
    blooms_confidence: float
    subject_tags: list[str]
    question_type_hint: Literal[
        "factual", "conceptual", "procedural", "analytical", "evaluative", "creative", "unknown"
    ]
    suggested_difficulty: DifficultySuggestion
    difficulty_confidence: float
    difficulty_rationale: str


class DuplicateCandidate(_CamelModel):
    """A potential duplicate identified by semantic similarity."""

    candidate_id: str = Field(description="Echoed from the request; opaque to this service.")
    similarity_score: Annotated[float, Field(ge=0.0, le=1.0)] = Field(
        description="Cosine similarity between the two question embeddings (0–1)."
    )
    is_near_duplicate: bool = Field(
        description=(
            "True when similarity_score >= the near-duplicate threshold "
            "(currently 0.90 — provisional). Faculty must review."
        )
    )
    is_potential_duplicate: bool = Field(
        description=(
            "True when similarity_score >= the potential-duplicate threshold "
            "(currently 0.75 — provisional). Faculty may wish to review."
        )
    )


class QuestionAnalysisResult(_CamelModel):
    """
    Aggregated AI analysis for a single question revision.

    All fields are advisory. They MUST NOT be applied automatically to
    persistent records without explicit faculty review and approval.
    """

    revision_id: str = Field(description="Echoed from the request.")
    classification: ClassificationResult
    difficulty_estimation: DifficultyEstimationResult
    duplicate_candidates: list[DuplicateCandidate] = Field(
        description=(
            "Questions above the potential-duplicate threshold, ordered by "
            "descending similarity_score."
        )
    )
    # Thresholds documented here so consumers can display them to faculty.
    near_duplicate_threshold: float = Field(
        description="Similarity threshold used to flag near-duplicates (provisional)."
    )
    potential_duplicate_threshold: float = Field(
        description="Similarity threshold used to flag potential duplicates (provisional)."
    )


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------


class ProviderInfo(_CamelModel):
    name: str
    model: str


class Usage(_CamelModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class AnalyzeTextResponse(_CamelModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    request_id: str
    operation: AnalyzeTextOperation
    result: TextOverviewResult
    provider: ProviderInfo
    usage: Usage | None = None
    duration_ms: int


class QuestionAnalysisResponse(_CamelModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    request_id: str
    operation: QuestionAnalysisOperation
    result: QuestionAnalysisResult
    provider: ProviderInfo
    usage: Usage | None = None
    duration_ms: int


# ---------------------------------------------------------------------------
# Question Generation Result & Response — Step 7
# ---------------------------------------------------------------------------

class GeneratedQuestionItem(_CamelModel):
    question_text: str = Field(min_length=5, max_length=10000)
    suggested_answer: str | None = Field(default=None, max_length=5000)
    explanation: str | None = Field(default=None, max_length=2000)
    difficulty: Literal["EASY", "MEDIUM", "HARD"] | None = None
    blooms_level: str | None = None
    subject_tags: list[str] = Field(default_factory=list, max_length=10)

    def model_post_init(self, __context: object) -> None:
        if len(self.question_text.strip()) < 5:
            raise ValueError("question_text must contain at least 5 non-whitespace characters")


class GenerateQuestionsResult(_CamelModel):
    questions: list[GeneratedQuestionItem] = Field(min_length=1, max_length=20)
    total_requested: int = Field(ge=1, le=20)
    total_generated: int = Field(ge=1, le=20)


class GenerateQuestionsResponse(_CamelModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    request_id: str
    operation: GenerateQuestionsOperation
    result: GenerateQuestionsResult
    provider: ProviderInfo
    usage: Usage | None = None
    duration_ms: int


class ErrorDetail(BaseModel):

    code: str
    message: str
    retryable: bool


class ErrorResponse(BaseModel):
    error: ErrorDetail
    requestId: str | None = None
