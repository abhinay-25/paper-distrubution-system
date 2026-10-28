# Step 3 — AI Generation Reliability, Timeout Alignment & Output Validation Report

## 1. Executive Summary

This report documents the root-cause findings, mathematical timeout/retry budget alignment, Gemini model configuration and fallback hardening, output-token budget expansion, complete-batch validation, and regression test verification implemented in **Step 3**.

---

## 2. Root Causes Identified

Empirical inspection of the source code and live service logs (`ai-service` Uvicorn telemetry) confirmed three compounding reliability defects in the AI Question Generator workflow:

1. **Node.js Proxy vs. Python AI Service Timeout Mismatch (`P0`)**:
   - [`AIClient`](file:///c:/paper-distribution-system/backend/src/services/aiClient.ts) enforced a single hardcoded `35,000 ms` (`35.0s`) `AbortSignal.timeout` across all endpoints (`/health`, `/ready`, `/api/v1/ai/analyze-text`, `/api/v1/ai/analyze-question`, and `/api/v1/ai/generate-questions`).
   - Meanwhile, the Python AI service ([`config.py`](file:///c:/paper-distribution-system/ai-service/app/core/config.py) and [`gemini.py`](file:///c:/paper-distribution-system/ai-service/app/providers/gemini.py)) used a per-attempt timeout of `30.0s + 2.0s = 32.0s`, up to `2` retries (`3` outer attempts), and an inner model fallback loop.
   - In live telemetry (request `1d53cdd6-2fca-4f0a-b07f-5c843411953a`), Attempt 1 timed out at `~30.5s`, retried after `503 ms`, and Attempt 2 completed successfully at `40,384 ms` (`40.4s`). Because the Node.js proxy aborted at `35.0s`, the user saw `"AI service request timed out"` 5.4 seconds before the Python service finished generating the batch.
2. **Insufficient Output Token Budget (`AI_MAX_OUTPUT_TOKENS = 2048`) & Missing Truncation Checks (`P0`)**:
   - [`config.py`](file:///c:/paper-distribution-system/ai-service/app/core/config.py) defaulted `ai_max_output_tokens` to `2048` (`le=8192`), which is easily exhausted when generating batches of up to 20 structured academic questions (each containing question text, 4 MCQ options, suggested answer, explanation, difficulty, Bloom's taxonomy level, and subject tags).
   - [`GeminiProvider.generate_structured`](file:///c:/paper-distribution-system/ai-service/app/providers/gemini.py) only checked whether `response.text` was non-empty and never inspected `response.candidates[0].finish_reason` for `MAX_TOKENS` or abnormal termination reasons.
   - Furthermore, neither [`AIService.generate_questions`](file:///c:/paper-distribution-system/ai-service/app/services/ai_service.py) nor [`createAndRunGenerationJob`](file:///c:/paper-distribution-system/backend/src/services/questionGenerationService.ts) verified that `len(questions) == requestedCount`, allowing partial batches to be accepted as `COMPLETED`.
3. **Default Model Configuration & Permanent `self.model` Mutation on Fallback (`P0`)**:
   - [`config.py`](file:///c:/paper-distribution-system/ai-service/app/core/config.py) and [`ai-service/.env.example`](file:///c:/paper-distribution-system/ai-service/.env.example) defaulted `GEMINI_MODEL` to `gemini-3.8-flash`, causing unconfigured setups to fail on the primary model before falling back.
   - When [`GeminiProvider.generate_structured`](file:///c:/paper-distribution-system/ai-service/app/providers/gemini.py) fell back on a transient `503 UNAVAILABLE` error, it permanently mutated `self.model = fallback_model` on the singleton provider instance and chained multiple fallback models inside each retry attempt.
4. **Collapsed Upstream Error Status Codes in `questionGenerationService.ts` (`P1`)**:
   - [`createAndRunGenerationJob`](file:///c:/paper-distribution-system/backend/src/services/questionGenerationService.ts) caught all `AIClientError` exceptions and unconditionally re-threw `AppError.serviceUnavailable(...)` (`503`), masking `504` gateway timeouts (`AI_CLIENT_TIMEOUT` / `PROVIDER_TIMEOUT`), `429` rate limits, and `502` invalid provider output errors.

---

## 3. Timeout, Retry, Model, and Token Policy Changes

### 3.1 End-to-End Timeout & Retry Budget Alignment

| Layer / Setting | Environment Variable | Previous Default | New Default | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Python Per-Attempt Provider Timeout** | `AI_REQUEST_TIMEOUT_SECONDS` | `30.0s` (`+2.0s` pad) | `25.0s` (exact) | Bounds any single Gemini API call to `25.0s` via `asyncio.wait_for`. |
| **Python Bounded Retries** | `AI_MAX_RETRIES` | `2` (`3` attempts) | `1` (`2` attempts) | Retries only transient errors (`TIMEOUT`, `RATE_LIMITED`, `UNAVAILABLE`); permanent errors (`AUTH`, `CONFIGURATION`, `BAD_REQUEST`, `INVALID_OUTPUT`) fail immediately on attempt 1. |
| **Python Retry Backoff Cap** | `AI_RETRY_MAX_DELAY_SECONDS` | `8.0s` | `4.0s` | Exponential backoff (`base=0.5s`) + jitter is capped at `4.0s`. |
| **Python Worst-Case Generation Budget** | *(Computed)* | `~98s–290s` | **`57.0s`** | $\text{Max Budget} = (1 + 1) \times 25.0\text{s} + 4.0\text{s backoff} + 3.0\text{s fallback/validation} = 57.0\text{s}$. |
| **Node.js Standard AI Timeout** | `AI_SERVICE_TIMEOUT_MS` | `35000` (`35s`, hardcoded) | `35000` (`35.0s`, configurable) | Used for single-item analysis (`/analyze-text`, `/analyze-question`) and health checks. |
| **Node.js Generation Timeout** | `AI_GENERATION_TIMEOUT_MS` | `35000` (`35s`, hardcoded) | **`70000` (`70.0s`, configurable)** | Provides a **`13.0s` safety margin** above Python's `57.0s` worst-case retry/fallback budget so Node.js never aborts while Python is within its normal retry window. |

### 3.2 Gemini Model Configuration & Fallback Policy

- **Primary Model Default**: Updated `gemini_model` default in [`ai-service/app/core/config.py`](file:///c:/paper-distribution-system/ai-service/app/core/config.py) and [`ai-service/.env.example`](file:///c:/paper-distribution-system/ai-service/.env.example) to `gemini-3.6-flash`.
- **Configurable Fallback Chain**: Added `gemini_fallback_models` (`("gemini-3.5-flash", "gemini-2.5-flash")`) to [`Settings`](file:///c:/paper-distribution-system/ai-service/app/core/config.py) and [`GeminiProvider`](file:///c:/paper-distribution-system/ai-service/app/providers/gemini.py).
- **Non-Mutating Per-Request Fallback**:
  - `GeminiProvider.generate_structured` tracks `active_model` per request and returns it on [`ProviderResult.model`](file:///c:/paper-distribution-system/ai-service/app/providers/base.py) without mutating `self.model`.
  - Fallback only triggers on `404 NOT_FOUND` (fast model-availability fallback) or `503 UNAVAILABLE` (bounded to at most 1 backup model so timeout budgets do not multiply).
  - Permanent errors (`400 BAD_REQUEST`, `401/403 AUTH`) never trigger fallback or retry.

### 3.3 Output Token Budget & Complete Batch Validation

- **Output Token Budget**: Increased `ai_max_output_tokens` default in [`ai-service/app/core/config.py`](file:///c:/paper-distribution-system/ai-service/app/core/config.py), [`ai-service/.env.example`](file:///c:/paper-distribution-system/ai-service/.env.example), and local `ai-service/.env` from `2048` to `8192` (with upper bound `le=32768`) to support batches up to `count = 20` without mid-JSON truncation.
- **Finish-Reason & Candidate Inspection**: [`GeminiProvider._validate_response_completeness`](file:///c:/paper-distribution-system/ai-service/app/providers/gemini.py) inspects `response.candidates` and rejects empty candidate lists, `MAX_TOKENS` truncation finish reasons, and any non-`STOP` finish reasons (`SAFETY`, `RECITATION`, `MALFORMED_FUNCTION_CALL`, etc.) as `ProviderError(ProviderErrorKind.INVALID_OUTPUT)`.
- **Strict Complete-Batch Enforcement**:
  - In Python ([`AIService.generate_questions`](file:///c:/paper-distribution-system/ai-service/app/services/ai_service.py) and [`GenerateQuestionsResult`](file:///c:/paper-distribution-system/ai-service/app/schemas/ai.py)), every question item must have at least 5 non-whitespace characters in `question_text`, and `len(result.questions)` must equal `payload.count`. Partial batches are rejected with `502 PROVIDER_INVALID_OUTPUT`.
  - In Node.js ([`createAndRunGenerationJob`](file:///c:/paper-distribution-system/backend/src/services/questionGenerationService.ts)), the response is verified for `generated.length === input.count` and valid `questionText` before `db.generatedQuestion.createMany` is called. Incomplete batches mark the job `FAILED` and return `502` without persisting partial candidate rows.
- **Duplicate Submission Guard**: Added a synchronous `isGeneratingRef` lock in [`QuestionGeneratorPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/QuestionGeneratorPage.tsx) and `AbortSignal` support in [`AIClient.generateQuestions`](file:///c:/paper-distribution-system/backend/src/services/aiClient.ts).

---

## 4. Files Modified

| File | Summary of Changes |
| :--- | :--- |
| [`ai-service/app/core/config.py`](file:///c:/paper-distribution-system/ai-service/app/core/config.py) | Updated defaults (`gemini_model="gemini-3.6-flash"`, `gemini_fallback_models=("gemini-3.5-flash", "gemini-2.5-flash")`, `ai_request_timeout_seconds=25.0`, `ai_max_retries=1`, `ai_retry_max_delay_seconds=4.0`, `ai_max_output_tokens=8192`). |
| [`ai-service/.env.example`](file:///c:/paper-distribution-system/ai-service/.env.example) | Updated default model, timeout, retry, and output token settings with timeout budget documentation. |
| [`ai-service/app/providers/base.py`](file:///c:/paper-distribution-system/ai-service/app/providers/base.py) | Added `model: str \| None = None` to `ProviderResult`. |
| [`ai-service/app/providers/__init__.py`](file:///c:/paper-distribution-system/ai-service/app/providers/__init__.py) | Passed `fallback_models=settings.gemini_fallback_models` into `GeminiProvider`. |
| [`ai-service/app/providers/gemini.py`](file:///c:/paper-distribution-system/ai-service/app/providers/gemini.py) | Added `_validate_response_completeness` (`MAX_TOKENS` / non-`STOP` finish reason detection), bounded non-mutating model fallback, exact `timeout_seconds` enforcement, and structured telemetry logging. |
| [`ai-service/app/schemas/ai.py`](file:///c:/paper-distribution-system/ai-service/app/schemas/ai.py) | Added non-whitespace `question_text` validation on `GeneratedQuestionItem` and `1..20` bounds on `GenerateQuestionsResult`. |
| [`ai-service/app/services/ai_service.py`](file:///c:/paper-distribution-system/ai-service/app/services/ai_service.py) | Enforced exact `len(result.questions) == payload.count` batch completeness, accurate `used_model` reporting, and per-attempt elapsed time logging. |
| [`ai-service/tests/test_config.py`](file:///c:/paper-distribution-system/ai-service/tests/test_config.py) | Updated default configuration assertions for `gemini-3.6-flash`, timeouts, retries, and `8192` output tokens. |
| [`ai-service/tests/test_question_generation.py`](file:///c:/paper-distribution-system/ai-service/tests/test_question_generation.py) | Added regression tests covering retries, model fallback, permanent failures, retry exhaustion, timeout enforcement, `MAX_TOKENS`/truncated JSON rejection, `max_output_tokens=8192` propagation, 20-question batches, partial batch rejection, and secret redaction. |
| [`backend/src/config/env.ts`](file:///c:/paper-distribution-system/backend/src/config/env.ts) | Added `AI_SERVICE_TIMEOUT_MS` (`35000`) and `AI_GENERATION_TIMEOUT_MS` (`70000`) environment variables. |
| [`backend/.env.example`](file:///c:/paper-distribution-system/backend/.env.example) | Documented `AI_SERVICE_TIMEOUT_MS=35000` and `AI_GENERATION_TIMEOUT_MS=70000`. |
| [`backend/src/services/aiClient.ts`](file:///c:/paper-distribution-system/backend/src/services/aiClient.ts) | Added `generationTimeoutMs` (`70000ms`), per-request `timeoutMs` override, and caller `AbortSignal` propagation (`AI_CLIENT_ABORTED` / `AI_CLIENT_TIMEOUT`). |
| [`backend/src/services/questionGenerationService.ts`](file:///c:/paper-distribution-system/backend/src/services/questionGenerationService.ts) | Preserved upstream `AIClientError` HTTP status codes (`504`, `502`, `429`, `503`) and rejected incomplete/malformed batches before persistence. |
| [`backend/src/__tests__/aiClient.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/aiClient.test.ts) | Added tests for `70000ms` generation timeout, slow responses completing within timeout, and caller abort signal handling. |
| [`backend/src/__tests__/questionGeneration.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/questionGeneration.test.ts) | Added tests for `504` timeout handling, `502` upstream error translation, and partial batch rejection without candidate persistence. |
| [`frontend/src/pages/QuestionGeneratorPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/QuestionGeneratorPage.tsx) | Added synchronous `isGeneratingRef` lock to prevent rapid double-click duplicate generation job submissions. |

---

## 5. Verification Commands and Results

| Suite | Command Executed | Result |
| :--- | :--- | :--- |
| **Python AI Service Unit & Regression Tests** | `cd ai-service; .\.venv\Scripts\pytest.exe -o pythonpath=. -v` | **PASSED** (`48 passed, 2 skipped in 10.07s`) |
| **Node.js Backend AI Client & Generation Tests** | `cd backend; npx vitest run src/__tests__/aiClient.test.ts src/__tests__/questionGeneration.test.ts` | **PASSED** (`2 test files passed, 23 passed`) |
| **Node.js Backend TypeScript Check & Build** | `cd backend; npm run typecheck; npm run build` | **PASSED** (`Exit 0`) |
| **Frontend ESLint & Production Build** | `cd frontend; npm run lint; npm run build` | **PASSED** (`0 errors`, `Exit 0`) |

---

## 6. Remaining Limitations & Recommended Next Step

- **Live Provider Quota / External Network Dependency**: Unit and integration tests deterministically verify retry, fallback, timeout, and truncation logic using mocked provider responses so CI/test runs do not consume paid Gemini quota. Live Gemini connectivity remains gated behind `RUN_REAL_GEMINI_TESTS=1` in [`test_real_provider.py`](file:///c:/paper-distribution-system/ai-service/tests/test_real_provider.py).
- **Recommended Next Step**: **Step 4 — Live Overview Dashboard & Navigation Polish** (replacing the static placeholder cards on [`OverviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/OverviewPage.tsx) with live institutional metrics and quick workflow actions).

