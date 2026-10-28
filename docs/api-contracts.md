# API Contracts — Step 5 & Step 6

This document specifies the internal and external API contracts for the Paper Distribution System.

---

## 1. Node.js Authoritative Backend (`/api/v1`)

All versioned academic endpoints require tenant context headers in local development:
- `x-institution-id`: UUIDv4 of the active tenant institution.
- `x-user-id` (optional): UUIDv4 of the acting user.

### 1.1 Trigger AI Question Analysis
- **Method & Path**: `POST /api/v1/questions/:questionId/analyses`
- **Request Headers**: `Content-Type: application/json`, `x-institution-id: <uuid>`
- **Request Body**:
```json
{
  "revisionId": "a0000000-0000-4000-8000-000000000003",
  "skipDuplicateDetection": false
}
```
- **Response** (`202 Accepted`):
```json
{
  "id": "a0000000-0000-4000-8000-000000000004",
  "revisionId": "a0000000-0000-4000-8000-000000000003",
  "questionId": "a0000000-0000-4000-8000-000000000002",
  "aiBloomsLevel": "UNDERSTAND",
  "aiBloomsConfidence": 0.88,
  "aiSubjectTags": ["algorithms", "sorting"],
  "aiQuestionTypeHint": "conceptual",
  "aiSuggestedDifficulty": "MEDIUM",
  "aiDifficultyConfidence": 0.85,
  "aiDifficultyRationale": "Requires analyzing algorithm time complexity.",
  "hasPotentialDuplicates": true,
  "hasNearDuplicates": false,
  "duplicateCandidates": [
    {
      "candidateId": "cand-rev-uuid",
      "similarityScore": 0.78,
      "isNearDuplicate": false,
      "isPotentialDuplicate": true
    }
  ],
  "nearDuplicateThreshold": 0.90,
  "potentialDuplicateThreshold": 0.75,
  "reviewStatus": "PENDING",
  "reviewedAt": null,
  "reviewedBy": null,
  "facultyBloomsLevel": null,
  "facultyDifficulty": null,
  "facultyNotes": null,
  "aiProvider": "gemini",
  "aiModel": "gemini-3.8-flash",
  "durationMs": 320,
  "createdAt": "2026-10-26T12:00:00.000Z"
}
```

### 1.2 List Question Analyses
- **Method & Path**: `GET /api/v1/questions/:questionId/analyses`
- **Response** (`200 OK`):
```json
{
  "data": [ /* Array of QuestionAnalysisSummary, sorted newest first */ ]
}
```

### 1.3 Get Single Analysis
- **Method & Path**: `GET /api/v1/questions/:questionId/analyses/:analysisId`
- **Response** (`200 OK`): `QuestionAnalysisSummary`

### 1.4 Faculty Review & Override
- **Method & Path**: `PATCH /api/v1/questions/:questionId/analyses/:analysisId/review`
- **Request Body (Accept)**:
```json
{
  "reviewAction": "ACCEPTED"
}
```
- **Request Body (Override)**:
```json
{
  "reviewAction": "OVERRIDDEN",
  "facultyBloomsLevel": "APPLY",
  "facultyDifficulty": "HARD",
  "facultyNotes": "Students struggle with the recursive proof."
}
```
- **Request Body (Dismiss)**:
```json
{
  "reviewAction": "DISMISSED"
}
```
- **Response** (`200 OK`): Updated `QuestionAnalysisSummary`
- **Errors**:
  - `400 Bad Request`: `OVERRIDDEN` without `facultyBloomsLevel` or `facultyDifficulty`.
  - `409 Conflict`: Analysis has already been reviewed (`reviewStatus !== PENDING`).

### 1.5 Question Intelligence Convenience Endpoints
- `GET /api/v1/questions/:questionId/analysis`: Returns the latest analysis record or `404`.
- `POST /api/v1/questions/:questionId/classify`: Resolves revision, runs classification, returns `202 Accepted` with suggested Bloom's level and subject tags.
- `POST /api/v1/questions/:questionId/estimate-difficulty`: Resolves revision, runs difficulty estimation, returns `202 Accepted` with suggested difficulty, confidence, and rationale.
- `POST /api/v1/questions/:questionId/detect-duplicates`: Resolves revision, runs semantic duplicate detection against same-subject candidates, returns `202 Accepted` with duplicate candidates and thresholds.

---

## 2. Python AI Microservice (`/api/v1/ai`)

Protected by internal-service Bearer token:
`Authorization: Bearer <INTERNAL_SERVICE_TOKEN>` (min 32 characters).

### 2.1 Analyze Question (Step 6)
- **Method & Path**: `POST /api/v1/ai/analyze-question`
- **Request Body**:
```json
{
  "contractVersion": "v1",
  "operation": "question_analysis",
  "revisionId": "rev-123",
  "questionText": "What is the time complexity of quicksort in the worst case?",
  "candidates": [
    {
      "candidateId": "cand-456",
      "text": "Explain the worst-case runtime performance of the quicksort algorithm."
    }
  ]
}
```
- **Response** (`200 OK`):
```json
{
  "contractVersion": "v1",
  "requestId": "req-789",
  "operation": "question_analysis",
  "result": {
    "revisionId": "rev-123",
    "classification": {
      "bloomsLevel": "understand",
      "bloomsConfidence": 0.90,
      "subjectTags": ["algorithms", "sorting"],
      "questionTypeHint": "conceptual"
    },
    "difficultyEstimation": {
      "suggestedDifficulty": "medium",
      "confidence": 0.85,
      "rationale": "Requires understanding worst-case partition imbalance."
    },
    "duplicateCandidates": [
      {
        "candidateId": "cand-456",
        "similarityScore": 0.88,
        "isNearDuplicate": false,
        "isPotentialDuplicate": true
      }
    ],
    "nearDuplicateThreshold": 0.90,
    "potentialDuplicateThreshold": 0.75
  },
  "provider": {
    "name": "gemini",
    "model": "gemini-3.8-flash"
  },
  "durationMs": 310
}
```

### 2.2 Standard Error Response Envelope
```json
{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "AI provider request timed out."
  },
  "requestId": "req-789"
}
```
