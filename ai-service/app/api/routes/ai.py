"""Internal AI operation endpoints.

Protected by internal-service authentication (Node.js -> AI service).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.security import require_internal_service
from app.schemas.ai import (
    CONTRACT_VERSION,
    AnalyzeTextRequest,
    AnalyzeTextResponse,
    EmbedRequest,
    EmbedResponse,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
    QuestionAnalysisRequest,
    QuestionAnalysisResponse,
)
from app.services.ai_service import AIService

router = APIRouter(prefix="/api/v1/ai", tags=["AI Operations"])


@router.post(
    "/analyze-text",
    response_model=AnalyzeTextResponse,
    dependencies=[Depends(require_internal_service)],
)
async def analyze_text(
    payload: AnalyzeTextRequest,
    request: Request,
) -> AnalyzeTextResponse:
    """Smoke-test AI operation: validates provider integration and structured output.

    Accepts bounded text and an explicitly supported operation ('text_overview').
    Requires internal service credentials via 'Authorization: Bearer <token>'.
    """
    ai_service: AIService = request.app.state.ai_service
    request_id: str = getattr(request.state, "request_id", "unknown")

    return await ai_service.analyze_text(payload, request_id=request_id)


@router.post(
    "/analyze-question",
    response_model=QuestionAnalysisResponse,
    dependencies=[Depends(require_internal_service)],
)
async def analyze_question(
    payload: QuestionAnalysisRequest,
    request: Request,
) -> QuestionAnalysisResponse:
    """Question intelligence: classification, difficulty estimation, and duplicate detection.

    Accepts a question revision text, its revision ID, and an optional list of
    existing question texts for semantic similarity comparison.

    All results are advisory — they MUST NOT be applied automatically without
    explicit faculty review. The Node.js backend is the authoritative data store.

    Requires internal service credentials via 'Authorization: Bearer <token>'.

    Duplicate detection thresholds (provisional, documented in result):
    - near_duplicate_threshold: 0.90 (cosine similarity)
    - potential_duplicate_threshold: 0.75 (cosine similarity)
    """
    ai_service: AIService = request.app.state.ai_service
    request_id: str = getattr(request.state, "request_id", "unknown")

    return await ai_service.analyze_question(payload, request_id=request_id)


@router.post(
    "/generate-questions",
    response_model=GenerateQuestionsResponse,
    dependencies=[Depends(require_internal_service)],
)
async def generate_questions(
    payload: GenerateQuestionsRequest,
    request: Request,
) -> GenerateQuestionsResponse:
    """AI-powered question generation: generate question candidates from academic syllabus context.

    Returns structured question candidates for faculty review.
    All generated questions are suggestions; none are persistent or approved without review.

    Requires internal service credentials via 'Authorization: Bearer <token>'.
    """
    ai_service: AIService = request.app.state.ai_service
    request_id: str = getattr(request.state, "request_id", "unknown")

    return await ai_service.generate_questions(payload, request_id=request_id)


@router.post(
    "/embed",
    response_model=EmbedResponse,
    dependencies=[Depends(require_internal_service)],
)
async def embed_endpoint(
    payload: EmbedRequest,
    request: Request,
) -> EmbedResponse:
    """Generate semantic embeddings using the local SentenceTransformers model."""
    texts: list[str] = []
    if isinstance(payload.texts, str) and payload.texts.strip():
        texts = [payload.texts.strip()]
    elif payload.texts is not None and len(payload.texts) > 0:
        texts = [t for t in payload.texts if t]
    elif payload.text is not None and len(payload.text.strip()) > 0:
        texts = [payload.text.strip()]

    if not texts:
        return EmbedResponse(
            contract_version=CONTRACT_VERSION,
            embedding=[],
            embeddings=[],
            dimensions=384,
        )

    ai_service: AIService = request.app.state.ai_service
    embeddings_arr = ai_service._emb.encode(texts)
    embeddings = [row.tolist() for row in embeddings_arr]
    single = embeddings[0] if embeddings else []

    return EmbedResponse(
        contract_version=CONTRACT_VERSION,
        embedding=single,
        embeddings=embeddings,
        dimensions=len(single) if single else 384,
    )

