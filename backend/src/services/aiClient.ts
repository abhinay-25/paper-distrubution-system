/**
 * Internal AI Service Client for Node.js backend.
 *
 * Communicates with the internal Python FastAPI microservice over HTTP.
 * Responsibilities:
 *  - Enforce finite timeout on all requests
 *  - Forward correlation X-Request-Id header
 *  - Send Authorization: Bearer <AI_SERVICE_TOKEN>
 *  - Validate HTTP status codes and structure
 *  - Normalize AI service errors into typed AIClientError
 *  - Never log credentials or sensitive text payloads
 */

import { env } from "../config/env.js";

export class AIClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly requestId?: string;

  constructor(message: string, code: string, statusCode: number, retryable = false, requestId?: string) {
    super(message);
    this.name = "AIClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.requestId = requestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface TextOverviewResult {
  summary: string;
  language: string;
  keyTerms: string[];
}

export interface AnalyzeTextInput {
  operation: "text_overview";
  text: string;
}

export interface AnalyzeTextRequest {
  contractVersion: "v1";
  operation: "text_overview";
  text: string;
}

export interface AnalyzeTextResponse {
  contractVersion: "v1";
  requestId: string;
  operation: "text_overview";
  result: TextOverviewResult;
  provider: {
    name: string;
    model: string;
  };
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  };
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Question Analysis types (Step 6)
// ---------------------------------------------------------------------------

export interface QuestionCandidate {
  candidateId: string;
  text: string;
}

export interface QuestionAnalysisInput {
  revisionId: string;
  questionText: string;
  candidates?: QuestionCandidate[];
}

export interface DuplicateCandidate {
  candidateId: string;
  similarityScore: number;
  isNearDuplicate: boolean;
  isPotentialDuplicate: boolean;
}

export interface ClassificationResult {
  bloomsLevel: string;
  bloomsConfidence: number;
  subjectTags: string[];
  questionTypeHint: string;
}

export interface DifficultyEstimationResult {
  suggestedDifficulty: string;
  confidence: number;
  rationale: string;
}

export interface QuestionAnalysisResult {
  revisionId: string;
  classification: ClassificationResult;
  difficultyEstimation: DifficultyEstimationResult;
  duplicateCandidates: DuplicateCandidate[];
  nearDuplicateThreshold: number;
  potentialDuplicateThreshold: number;
}

export interface QuestionAnalysisResponse {
  contractVersion: "v1";
  requestId: string;
  operation: "question_analysis";
  result: QuestionAnalysisResult;
  provider: {
    name: string;
    model: string;
  };
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  };
  durationMs: number;
}

export interface AIHealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface AIReadyResponse {
  status: "ready" | "degraded";
  service: string;
  environment: string;
  provider: string;
  model: string;
  providerConfigured: boolean;
  timestamp: string;
}

export class AIClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly generationTimeoutMs: number;

  constructor(
    baseUrl: string = env.AI_SERVICE_URL,
    token: string = env.AI_SERVICE_TOKEN,
    timeoutMs?: number,
    generationTimeoutMs?: number,
  ) {
    // Strip trailing slashes
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.timeoutMs = timeoutMs ?? env.AI_SERVICE_TIMEOUT_MS ?? 35_000;
    this.generationTimeoutMs =
      generationTimeoutMs ?? timeoutMs ?? env.AI_GENERATION_TIMEOUT_MS ?? 70_000;
  }

  /** Liveness check (unauthenticated). */
  async checkHealth(requestId?: string): Promise<AIHealthResponse> {
    return this.request<AIHealthResponse>("/health", {
      method: "GET",
      requestId,
      authenticated: false,
    });
  }

  /** Readiness check (unauthenticated). */
  async checkReady(requestId?: string): Promise<AIReadyResponse> {
    return this.request<AIReadyResponse>("/ready", {
      method: "GET",
      requestId,
      authenticated: false,
    });
  }

  /**
   * Smoke test operation: analyze text with the generative AI provider.
   * Internal service authentication is enforced.
   */
  async analyzeText(
    input: AnalyzeTextInput,
    options?: { requestId?: string },
  ): Promise<AnalyzeTextResponse> {
    const payload: AnalyzeTextRequest = {
      contractVersion: "v1",
      operation: input.operation,
      text: input.text,
    };

    return this.request<AnalyzeTextResponse>("/api/v1/ai/analyze-text", {
      method: "POST",
      body: JSON.stringify(payload),
      requestId: options?.requestId,
      authenticated: true,
    });
  }

  /**
   * Analyze a question revision for classification, difficulty estimation,
   * and semantic duplicate detection. Internal service authentication enforced.
   */
  async analyzeQuestion(
    input: QuestionAnalysisInput,
    options?: { requestId?: string },
  ): Promise<QuestionAnalysisResponse> {
    const payload = {
      contractVersion: "v1" as const,
      operation: "question_analysis" as const,
      questionText: input.questionText,
      revisionId: input.revisionId,
      candidates: input.candidates ?? [],
    };

    return this.request<QuestionAnalysisResponse>("/api/v1/ai/analyze-question", {
      method: "POST",
      body: JSON.stringify(payload),
      requestId: options?.requestId,
      authenticated: true,
    });
  }

  /**
   * Generate question candidates using the AI provider.
   * Returns structured question candidates for faculty review.
   * Internal service authentication enforced.
   */
  async generateQuestions(
    input: GenerateQuestionsInput,
    options?: { requestId?: string; timeoutMs?: number; signal?: AbortSignal },
  ): Promise<GenerateQuestionsResponse> {
    const payload = {
      contractVersion: "v1" as const,
      operation: "generate_questions" as const,
      subjectName: input.subjectName,
      subjectCode: input.subjectCode,
      topicName: input.topicName,
      questionType: input.questionType,
      difficulty: input.difficulty,
      count: input.count,
      language: input.language,
      contextHint: input.contextHint,
      groundingMode: input.groundingMode,
      sourceExcerpts: input.sourceExcerpts,
      sourceContext: input.sourceContext,
    };

    return this.request<GenerateQuestionsResponse>("/api/v1/ai/generate-questions", {
      method: "POST",
      body: JSON.stringify(payload),
      requestId: options?.requestId,
      authenticated: true,
      timeoutMs: options?.timeoutMs ?? this.generationTimeoutMs,
      signal: options?.signal,
    });
  }

  /**
   * Generate vector embeddings for text chunks using SentenceTransformers.
   * Internal service authentication enforced.
   */
  async embed(
    textOrTexts: string | string[],
    options?: { requestId?: string; signal?: AbortSignal },
  ): Promise<number[][]> {
    const texts = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];
    const payload = {
      contractVersion: "v1" as const,
      texts,
    };

    const res = await this.request<EmbedResponse>("/api/v1/ai/embed", {
      method: "POST",
      body: JSON.stringify(payload),
      requestId: options?.requestId,
      authenticated: true,
      signal: options?.signal,
    });
    return res.embeddings;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method: "GET" | "POST";
      body?: string;
      requestId?: string;
      authenticated?: boolean;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    if (options.requestId) {
      headers["X-Request-Id"] = options.requestId;
    }

    if (options.authenticated) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const effectiveTimeoutMs = options.timeoutMs ?? this.timeoutMs;
    const timeoutSignal = AbortSignal.timeout(effectiveTimeoutMs);
    const combinedSignal = options.signal
      ? AbortSignal.any([timeoutSignal, options.signal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
        signal: combinedSignal,
      });
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        throw new AIClientError(
          "AI service request was aborted by caller",
          "AI_CLIENT_ABORTED",
          499,
          false,
          options.requestId,
        );
      }
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new AIClientError(
          "AI service request timed out",
          "AI_CLIENT_TIMEOUT",
          504,
          true,
          options.requestId,
        );
      }
      throw new AIClientError(
        "AI service unreachable or network error",
        "AI_SERVICE_UNAVAILABLE",
        503,
        true,
        options.requestId,
      );
    }

    const responseRequestId = response.headers.get("x-request-id") ?? options.requestId;

    if (!response.ok) {
      let errorPayload: { error?: { code?: string; message?: string; retryable?: boolean } } | undefined;
      try {
        errorPayload = (await response.json()) as {
          error?: { code?: string; message?: string; retryable?: boolean };
        };
      } catch {
        // Non-JSON response body
      }

      const code = errorPayload?.error?.code ?? "AI_SERVICE_ERROR";
      const message = errorPayload?.error?.message ?? `AI service returned HTTP ${response.status}`;
      const retryable = errorPayload?.error?.retryable ?? (response.status === 429 || response.status >= 500);

      throw new AIClientError(message, code, response.status, retryable, responseRequestId);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AIClientError(
        "Invalid JSON response from AI service",
        "AI_SERVICE_INVALID_OUTPUT",
        502,
        false,
        responseRequestId,
      );
    }
  }
}

/** Singleton AI client instance for backend services. */
export const aiClient = new AIClient();

// ---------------------------------------------------------------------------
// Question Generation types (Step 7)
// ---------------------------------------------------------------------------

export interface GenerateQuestionsInput {
  subjectName: string;
  subjectCode: string;
  topicName?: string;
  questionType: string;        // MULTIPLE_CHOICE | SHORT_ANSWER | LONG_ANSWER | NUMERICAL
  difficulty?: string;         // EASY | MEDIUM | HARD
  count: number;               // 1–20
  language: string;            // BCP-47 tag
  contextHint?: string;        // Optional faculty hint (max 500 chars)
  groundingMode?: "general" | "document" | "strict";
  sourceExcerpts?: string[];
  sourceContext?: string;
}

export interface EmbedRequest {
  contractVersion: "v1";
  texts: string | string[];
}

export interface EmbedResponse {
  contractVersion: "v1";
  requestId: string;
  embeddings: number[][];
  count: number;
  dimension: number;
  durationMs: number;
}

export interface GeneratedQuestionItem {
  questionText: string;
  suggestedAnswer?: string;
  explanation?: string;
  difficulty?: string;         // EASY | MEDIUM | HARD | null
  bloomsLevel?: string;        // Bloom's level label or null
  subjectTags: string[];
}

export interface GenerateQuestionsResult {
  questions: GeneratedQuestionItem[];
  totalRequested: number;
  totalGenerated: number;
}

export interface GenerateQuestionsResponse {
  contractVersion: "v1";
  requestId: string;
  operation: "generate_questions";
  result: GenerateQuestionsResult;
  provider: {
    name: string;
    model: string;
  };
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  };
  durationMs: number;
}

