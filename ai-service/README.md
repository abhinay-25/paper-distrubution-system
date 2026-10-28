# Paper Distribution System — AI Service

The Python AI service is an internal microservice responsible for AI-specific processing (generative analysis, structured outputs, and future classification/difficulty estimation).

## Architectural Boundary

- **Internal Only**: The service is not exposed to browsers or public networks. Only the Node.js backend communicates with it over internal HTTP.
- **No Database Access**: The AI service **never connects directly to PostgreSQL** or any application database. The Node.js backend handles all business data authorization, queries, and persistence.
- **Stateless & Data-Minimized**: Only the minimal bounded text needed for analysis is transmitted. Prompts, question text, and credentials are never permanently persisted or emitted in server logs.

---

## Prerequisites & Environment Setup

- Python 3.12+ (tested with Python 3.12.0)
- Virtual environment at `ai-service/.venv`

### Virtual Environment Activation

```powershell
# In Windows PowerShell:
cd ai-service
.\.venv\Scripts\Activate.ps1

# On Linux/macOS:
source .venv/bin/activate
```

### Dependency Installation

```powershell
pip install -r requirements-dev.txt
```

---

## Configuration

Settings are validated at startup via Pydantic (`app/core/config.py`). Secrets use `SecretStr` and are never exposed in logs or string representations.

Copy the example file to `.env`:
```powershell
Copy-Item .env.example .env
```

Key environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_ENV` | No | `development` | `development`, `test`, or `production`. |
| `HOST` | No | `127.0.0.1` | Bind host. |
| `PORT` | No | `8000` | Bind port. |
| `LOG_LEVEL` | No | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `INTERNAL_SERVICE_TOKEN` | **Yes** | — | Shared secret token (min. 32 chars). Must match backend `AI_SERVICE_TOKEN`. |
| `AI_PROVIDER` | No | `gemini` | Configured AI provider adapter. |
| `GEMINI_API_KEY` | Dev: Optional / Prod: **Yes** | `None` | Google Gemini API key from [Google AI Studio](https://aistudio.google.com/). |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | Selected stable Gemini model. |
| `AI_REQUEST_TIMEOUT_SECONDS` | No | `30.0` | Timeout per provider request. |
| `AI_MAX_RETRIES` | No | `2` | Bounded retries for transient errors (rate limit / 5xx). |
| `AI_RETRY_BASE_DELAY_SECONDS` | No | `0.5` | Exponential backoff base delay with jitter. |
| `MAX_REQUEST_BYTES` | No | `65536` | Maximum allowed HTTP request body size (64 KB). |
| `MAX_INPUT_CHARS` | No | `8000` | Maximum character length of input text. |

---

## Running the Service

```powershell
# From the ai-service directory:
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

---

## Internal API Contract (`v1`)

All endpoints return JSON. Protected endpoints require the `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>` header.

### 1. `GET /health` (Unauthenticated)
Liveness probe.
```json
{
  "status": "ok",
  "service": "pds-ai-service",
  "timestamp": "2026-10-26T16:00:00Z"
}
```

### 2. `GET /ready` (Unauthenticated)
Readiness probe. Checks if the provider is configured without making external API calls.
```json
{
  "status": "ready",
  "service": "pds-ai-service",
  "environment": "development",
  "provider": "gemini",
  "model": "gemini-3.8-flash",
  "providerConfigured": true,
  "timestamp": "2026-10-26T16:00:00Z"
}
```

### 3. `POST /api/v1/ai/analyze-text` (Protected)
Smoke-test text analysis operation with structured output.

**Request:**
```json
{
  "contractVersion": "v1",
  "operation": "text_overview",
  "text": "Operating systems manage hardware resources and provide process scheduling."
}
```

**Response:**
```json
{
  "contractVersion": "v1",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "operation": "text_overview",
  "result": {
    "summary": "Operating systems manage physical hardware and schedule computational processes.",
    "language": "en",
    "keyTerms": ["operating systems", "hardware resources", "process scheduling"]
  },
  "provider": {
    "name": "gemini",
    "model": "gemini-3.8-flash"
  },
  "usage": {
    "inputTokens": 28,
    "outputTokens": 25,
    "totalTokens": 53
  },
  "durationMs": 420
}
```

### Error Response Format
All errors follow a unified structure:
```json
{
  "error": {
    "code": "PROVIDER_RATE_LIMITED",
    "message": "The AI provider rate limit or quota was exceeded.",
    "retryable": true
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Testing

### Unit and Mocked Integration Tests
All regular unit tests run completely offline using mocked provider adapters. No API credits are consumed:

```powershell
# From the ai-service directory:
.\.venv\Scripts\python.exe -m pytest -v
```

### Optional Live Provider Smoke Test
To test against the real Google Gemini API (consumes credits/quota):

```powershell
$env:GEMINI_API_KEY="your-real-gemini-api-key"
.\.venv\Scripts\python.exe -m pytest -v tests/test_real_provider.py
```
*(Automatically skipped when `GEMINI_API_KEY` is not present).*

---

## Privacy, Safety, and Observability

1. **Data Minimization**: Only the `text` field is sent to Gemini.
2. **Sanitized Logs**: Structured JSON logging explicitly filters allowed keys (`ALLOWED_FIELDS`). Prompts, question text, tokens, and raw provider payloads are never logged.
3. **No Caller Overrides**: Callers cannot inject system prompts, select arbitrary models, or override temperature/safety parameters.
4. **Structured Output Validation**: Model outputs are strictly validated against Pydantic schemas before returning to caller.
