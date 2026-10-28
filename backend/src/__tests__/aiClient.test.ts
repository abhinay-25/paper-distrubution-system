/**
 * Unit tests for backend AIClient.
 *
 * Uses mock global.fetch to verify:
 *  - URL, method, headers, body formatting
 *  - Bearer token transmission on protected endpoints
 *  - X-Request-Id forwarding and propagation
 *  - Timeout error handling
 *  - Network failure handling
 *  - Error envelope parsing and typed AIClientError creation
 *  - Credential privacy (tokens never leaked in errors)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock env before importing AIClient
vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    CORS_ORIGIN: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/pds_test",
    AI_SERVICE_URL: "http://127.0.0.1:8000",
    AI_SERVICE_TOKEN: "mock_test_token_at_least_32_characters_long",
  },
}));

import { AIClient, AIClientError } from "../services/aiClient.js";

describe("AIClient", () => {
  let client: AIClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new AIClient(
      "http://127.0.0.1:8000",
      "mock_test_token_at_least_32_characters_long",
      5000,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends unauthenticated GET to /health", async () => {
    const mockResponse = { status: "ok", service: "pds-ai-service", timestamp: "2026-10-25T00:00:00Z" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "req-1" }),
      json: async () => mockResponse,
    });

    const result = await client.checkHealth("req-1");
    expect(result).toEqual(mockResponse);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/health",
      expect.objectContaining({
        method: "GET",
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    );
  });

  it("sends Bearer token and X-Request-Id to /api/v1/ai/analyze-text", async () => {
    const mockOutput = {
      contractVersion: "v1",
      requestId: "corr-123",
      operation: "text_overview",
      result: {
        summary: "This is a test summary.",
        language: "en",
        keyTerms: ["test", "ai"],
      },
      provider: { name: "gemini", model: "gemini-3.8-flash" },
      durationMs: 120,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "corr-123" }),
      json: async () => mockOutput,
    });

    const res = await client.analyzeText(
      { operation: "text_overview", text: "Sample text" },
      { requestId: "corr-123" },
    );

    expect(res).toEqual(mockOutput);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/ai/analyze-text",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": "Bearer mock_test_token_at_least_32_characters_long",
          "X-Request-Id": "corr-123",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          contractVersion: "v1",
          operation: "text_overview",
          text: "Sample text",
        }),
      }),
    );
  });

  it("normalizes 401 Unauthorized without leaking credentials", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ "x-request-id": "req-unauth" }),
      json: async () => ({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid internal service credentials.", retryable: false },
        requestId: "req-unauth",
      }),
    });

    try {
      await client.analyzeText({ operation: "text_overview", text: "Hello" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      const clientErr = err as AIClientError;
      expect(clientErr.statusCode).toBe(401);
      expect(clientErr.code).toBe("UNAUTHORIZED");
      expect(clientErr.retryable).toBe(false);
      expect(clientErr.message).not.toContain("mock_test_token");
    }
  });

  it("normalizes 429 Provider Rate Limited as retryable error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "x-request-id": "req-429" }),
      json: async () => ({
        error: { code: "PROVIDER_RATE_LIMITED", message: "Rate limit exceeded.", retryable: true },
        requestId: "req-429",
      }),
    });

    try {
      await client.analyzeText({ operation: "text_overview", text: "Hello" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      const clientErr = err as AIClientError;
      expect(clientErr.statusCode).toBe(429);
      expect(clientErr.code).toBe("PROVIDER_RATE_LIMITED");
      expect(clientErr.retryable).toBe(true);
    }
  });

  it("handles timeout correctly", async () => {
    const timeoutErr = new Error("The operation was aborted");
    timeoutErr.name = "TimeoutError";
    global.fetch = vi.fn().mockRejectedValue(timeoutErr);

    try {
      await client.analyzeText({ operation: "text_overview", text: "Hello" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      const clientErr = err as AIClientError;
      expect(clientErr.statusCode).toBe(504);
      expect(clientErr.code).toBe("AI_CLIENT_TIMEOUT");
      expect(clientErr.retryable).toBe(true);
    }
  });

  it("handles network failure (service unreachable)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));

    try {
      await client.analyzeText({ operation: "text_overview", text: "Hello" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      const clientErr = err as AIClientError;
      expect(clientErr.statusCode).toBe(503);
      expect(clientErr.code).toBe("AI_SERVICE_UNAVAILABLE");
      expect(clientErr.retryable).toBe(true);
    }
  });

  it("handles malformed JSON body from service", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        throw new Error("Unexpected end of JSON input");
      },
    });

    try {
      await client.analyzeText({ operation: "text_overview", text: "Hello" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      const clientErr = err as AIClientError;
      expect(clientErr.statusCode).toBe(502);
      expect(clientErr.code).toBe("AI_SERVICE_INVALID_OUTPUT");
    }
  });

  it("applies configured generation timeout (70000ms default) to generateQuestions", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const defaultClient = new AIClient(
      "http://127.0.0.1:8000",
      "mock_test_token_at_least_32_characters_long",
    );

    const mockGenOutput = {
      contractVersion: "v1" as const,
      requestId: "gen-req-1",
      operation: "generate_questions" as const,
      result: {
        questions: [
          {
            questionText: "What is the role of ARP in IPv4 local networks?",
            suggestedAnswer: "Maps IPv4 addresses to MAC addresses.",
            difficulty: "EASY",
            bloomsLevel: "remember",
            subjectTags: ["arp", "ipv4"],
          },
        ],
        totalRequested: 1,
        totalGenerated: 1,
      },
      provider: { name: "gemini", model: "gemini-3.6-flash" },
      durationMs: 1200,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "gen-req-1" }),
      json: async () => mockGenOutput,
    });

    const result = await defaultClient.generateQuestions(
      {
        subjectName: "Computer Networks",
        subjectCode: "CS401",
        questionType: "SHORT_ANSWER",
        count: 1,
        language: "en",
      },
      { requestId: "gen-req-1" },
    );

    expect(result).toEqual(mockGenOutput);
    expect(timeoutSpy).toHaveBeenCalledWith(70_000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("completes slow valid Python AI generation response within the configured timeout", async () => {
    const customClient = new AIClient(
      "http://127.0.0.1:8000",
      "mock_test_token_at_least_32_characters_long",
      50,
      500,
    );

    const mockGenOutput = {
      contractVersion: "v1" as const,
      requestId: "slow-req-1",
      operation: "generate_questions" as const,
      result: {
        questions: [
          {
            questionText: "Explain TCP slow start and congestion avoidance.",
            suggestedAnswer: "Exponential growth until ssthresh, then linear additive increase.",
            difficulty: "MEDIUM",
            bloomsLevel: "understand",
            subjectTags: ["tcp", "congestion"],
          },
        ],
        totalRequested: 1,
        totalGenerated: 1,
      },
      provider: { name: "gemini", model: "gemini-3.6-flash" },
      durationMs: 120,
    };

    global.fetch = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 90));
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "slow-req-1" }),
        json: async () => mockGenOutput,
      };
    });

    const res = await customClient.generateQuestions({
      subjectName: "Computer Networks",
      subjectCode: "CS401",
      questionType: "SHORT_ANSWER",
      count: 1,
      language: "en",
    });

    expect(res.result.questions).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts cleanly without duplicate submissions when caller signal is aborted", async () => {
    const controller = new AbortController();
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortErr = new Error("Aborted");
          abortErr.name = "AbortError";
          reject(abortErr);
        });
      });
    });

    const promise = client.generateQuestions(
      {
        subjectName: "Computer Networks",
        subjectCode: "CS401",
        questionType: "SHORT_ANSWER",
        count: 1,
        language: "en",
      },
      { requestId: "abort-req-1", signal: controller.signal },
    );

    controller.abort();

    await expect(promise).rejects.toMatchObject({
      code: "AI_CLIENT_ABORTED",
      statusCode: 499,
      retryable: false,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
