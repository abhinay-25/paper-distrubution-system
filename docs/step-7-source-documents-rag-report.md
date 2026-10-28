# Step 7 — Source Documents, RAG Grounding & Syllabus-Based AI Question Generation Report

**Date:** 2026-10-28  
**Project:** AI-Powered Blockchain-Based Secure Examination Infrastructure for Intelligent Question Paper Generation and Distribution  
**Phase:** Step 7 — Source Documents, Retrieval-Augmented Generation (RAG) & Syllabus-Grounded Question Generation

---

## 1. Executive Summary

Step 7 delivers an end-to-end **Source Documents and Retrieval-Augmented Generation (RAG)** system for the Paper Distribution System (PDS). Authorized faculty and examination coordinators can upload academic materials (syllabi, course handouts, lecture notes, textbook chapters), extract and segment the content into semantic chunks, embed text into 384-dimensional vector spaces using a local SentenceTransformers model, perform real-time cosine similarity search, and generate syllabus-grounded examination questions with auditable source provenance.

All components adhere to the multi-tenant institution isolation, HttpOnly session cookie authentication, and granular RBAC permission matrix established in Step 6. File storage paths are never leaked to client applications, and prompt injection defense barriers ensure source text is strictly treated as untrusted reference data rather than executable model instructions.

---

## 2. Existing Architecture & Alignment

The Step 7 implementation builds directly upon the established repository foundation without duplicating services or resetting the database:
- **Backend**: Node.js + Express + TypeScript with Prisma ORM and PostgreSQL.
- **AI Service**: Python FastAPI service running `SentenceTransformers` (`all-MiniLM-L6-v2`) for local, offline-capable vector embedding and semantic retrieval alongside Gemini for structured question generation.
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 design system with unified layout, badge tones, and responsive navigation.
- **Tenant Context**: Fully server-side session resolution via [`tenantContextMiddleware`](file:///c:/paper-distribution-system/backend/src/middleware/tenantContext.ts). All database queries filter strictly by `institutionId`.

---

## 3. Document Upload, Parsing & Chunking Pipeline

### 3.1 Upload Handling & Ingestion
- Uploads are received via [`POST /api/v1/source-documents`](file:///c:/paper-distribution-system/backend/src/routes/sourceDocuments.ts) requiring `ai:view` / `ai:generate` permissions.
- Ingestion is handled by [`sourceDocumentUpload`](file:///c:/paper-distribution-system/backend/src/middleware/upload.ts), configured with `multer.diskStorage`:
  - **Storage Directory**: Server-side directory `backend/uploads/source-documents/` (created automatically).
  - **UUID Filenames**: Files are saved with random UUIDs to avoid filename collisions and directory traversal attacks.
  - **MIME Whitelist**: `application/pdf` (.pdf), `text/plain` (.txt), `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx).
  - **Size Limit**: 50 MB hard limit enforced at upload middleware level.
  - **Integrity Checksum**: Computes SHA-256 `contentHash` across file buffers during creation in [`createSourceDocument`](file:///c:/paper-distribution-system/backend/src/services/sourceDocumentService.ts).

### 3.2 Text Extraction
Handled in [`extractText`](file:///c:/paper-distribution-system/backend/src/services/documentProcessingService.ts#L33-L75):
- **PDF**: Extracted using `PDFParse` from `pdf-parse`, preserving extracted page counts.
- **DOCX**: Extracted via `mammoth.extractRawText`, isolating raw paragraph and heading text.
- **TXT**: Read directly as UTF-8 encoded text with standard line normalization.

### 3.3 Semantic Text Chunking
Segmented via [`chunkDocumentPages`](file:///c:/paper-distribution-system/backend/src/services/documentProcessingService.ts#L80-L138):
- **Target Chunk Size**: ~2,000 characters per chunk (~400–500 tokens).
- **Chunk Overlap**: 250 characters between adjacent chunks to maintain context across boundary splits.
- **Minimum Chunk Threshold**: 100 characters to eliminate trailing punctuation fragments.
- **Page Association**: Page numbers are preserved for each chunk whenever page boundaries are available from the parser.

---

## 4. High-Dimensional Vector Embedding & RAG Architecture

### 4.1 Embedding Service & Protocol
- **Local Model**: `all-MiniLM-L6-v2` (384 dimensions) hosted inside the internal Python FastAPI service at [`/api/v1/ai/embed`](file:///c:/paper-distribution-system/ai-service/app/api/routes/ai.py#L98-L132).
- **Zero Cloud Network Dependency**: Embeddings are computed locally using PyTorch and SentenceTransformers in ~40–50ms without external cloud API calls, latency spikes, or per-token API charges.
- **Node.js Client**: [`aiClient.embed`](file:///c:/paper-distribution-system/backend/src/services/aiClient.ts#L267-L284) batches chunk texts and communicates with the Python service using internal service HMAC/token authentication (`x-internal-service-token`).
- **Database Storage**: Vectors are serialized as float arrays in `embeddingJson TEXT` on the `DocumentChunk` table, enabling lightweight vector similarity computations without requiring foreign database extensions.

### 4.2 Semantic Vector Retrieval
Implemented in [`retrieveRelevantChunks`](file:///c:/paper-distribution-system/backend/src/services/ragService.ts#L57-L135):
1. **Query Embedding**: The incoming academic topic, context hint, or subject query is converted into a 384-dimensional dense vector.
2. **Tenant-Scoped Search**: All `DocumentChunk` records matching the caller's `institutionId` and optional `sourceDocumentIds` with status `INDEXED` are retrieved from PostgreSQL.
3. **In-Memory Cosine Similarity**: Evaluated in [`cosineSimilarity`](file:///c:/paper-distribution-system/backend/src/services/ragService.ts#L22-L48) using normalized dot-product algebra:
   $$\text{cosine\_similarity}(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2}$$
4. **Threshold Filtering & Ranking**: Chunks with similarity score $\ge 0.3$ (or configured threshold) are ranked descending by score and sliced to `topK` (default 5, maximum 20).
5. **Context Assembly**: [`buildRagContext`](file:///c:/paper-distribution-system/backend/src/services/ragService.ts#L137-L170) structures retrieved chunks into structured context blocks:
   `[Source N: Title | Page N | Relevance: XX.X%]`
   along with structured provenance records (`sources`).

---

## 5. AI Integration & Syllabus-Grounded Question Generation

### 5.1 End-to-End Generation Flow
1. **Triggering Generation**: Faculty initiates question generation via [`POST /api/v1/generation-jobs`](file:///c:/paper-distribution-system/backend/src/routes/generation.ts) or the interactive frontend UI at `/questions/generate`.
2. **RAG Context Resolution**:
   - If `useRag: true` and indexed `sourceDocumentIds` are selected, [`createAndRunGenerationJob`](file:///c:/paper-distribution-system/backend/src/services/questionGenerationService.ts#L210-L280) triggers vector retrieval across selected documents.
   - If relevant chunks are found, `groundingMode` is set to `"document"`, and formatted source excerpts are injected into the payload.
   - If no relevant chunks meet the similarity threshold or no documents are selected, `groundingMode` resolves explicitly to `"none"` or fallback mode, preventing misleading claims of grounded output.
3. **Prompt Injection Safeguards**:
   In [`ai-service/app/services/ai_service.py`](file:///c:/paper-distribution-system/ai-service/app/services/ai_service.py#L361-L369), source text is segregated under a dedicated `[SOURCE EXCERPTS]` header with explicit system instructions to treat excerpts as untrusted reference material and discard conflicting instructions.
4. **Source Attribution & Provenance**:
   - When questions are generated using RAG, the database stores `sourceChunkIds` (array of chunk UUIDs) and metadata records on each `GeneratedQuestion`.
   - Each source reference tracks: `chunkId`, `documentId`, `documentTitle`, `pageNumber`, and `similarityScore`.
5. **Mandatory Faculty Review**:
   - Generated candidates remain in `PENDING` status.
   - Faculty can inspect the question, suggested answer, Bloom's taxonomy rating, and grounding source references.
   - Faculty retains full authority to Approve (`APPROVED`), Edit (`EDITED`), or Reject (`REJECTED`) before any candidate is promoted into the official institution Question Bank.

---

## 6. Database Schema & Storage Architecture

### 6.1 Prisma Models Applied
Migration `20261028150000_step7_source_documents` added:

```prisma
enum DocumentStatus {
  UPLOADED
  PROCESSING
  INDEXED
  FAILED
}

model SourceDocument {
  id                    String         @id @default(uuid()) @map("id")
  institutionId         String         @map("institution_id")
  uploadedById          String?        @map("uploaded_by_id")
  subjectId             String?        @map("subject_id")
  title                 String         @map("title")
  originalFilename      String         @map("original_filename")
  storagePath           String         @map("storage_path")
  mimeType              String         @map("mime_type")
  fileSizeBytes         Int            @map("file_size_bytes")
  contentHash           String         @map("content_hash")
  status                DocumentStatus @default(UPLOADED) @map("status")
  errorMessage          String?        @map("error_message")
  pageCount             Int?           @map("page_count")
  chunkCount            Int            @default(0) @map("chunk_count")
  processingStartedAt   DateTime?      @map("processing_started_at") @db.Timestamptz
  processingCompletedAt DateTime?      @map("processing_completed_at") @db.Timestamptz
  createdAt             DateTime       @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime       @updatedAt       @map("updated_at") @db.Timestamptz

  institution    Institution             @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  subject        Subject?                @relation(fields: [subjectId], references: [id], onDelete: SetNull)
  uploadedBy     User?                   @relation(fields: [uploadedById], references: [id], onDelete: SetNull)
  chunks         DocumentChunk[]
  generationJobs QuestionGenerationJob[]

  @@index([institutionId])
  @@index([status])
  @@index([subjectId])
  @@map("source_documents")
}

model DocumentChunk {
  id            String   @id @default(uuid()) @map("id")
  documentId    String   @map("document_id")
  institutionId String   @map("institution_id")
  chunkIndex    Int      @map("chunk_index")
  chunkText     String   @map("chunk_text") @db.Text
  pageNumber    Int?     @map("page_number")
  tokenCount    Int?     @map("token_count")
  embeddingJson String   @map("embedding_json") @db.Text
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  document    SourceDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  institution Institution    @relation(fields: [institutionId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([institutionId])
  @@map("document_chunks")
}
```

### 6.2 Job & Generated Question Extensions
- `QuestionGenerationJob`: Added `sourceDocumentId`, `sourceDocumentIds` (UUID array), and `groundingMode` (`"document"` | `"none"`).
- `GeneratedQuestion`: Added `sourceChunkIds` (UUID array) and `metadata` (`JSONB` storing structured `sources` provenance).

---

## 7. Security, Tenant Isolation & Prompt Injection Defense

1. **Storage Path Sanitization**:
   [`sanitizeDocument`](file:///c:/paper-distribution-system/backend/src/services/sourceDocumentService.ts#L42-L55) strips `storagePath` from all API representations. External callers never receive disk or filesystem paths.
2. **Tenant Isolation**:
   Every query in [`sourceDocumentService.ts`](file:///c:/paper-distribution-system/backend/src/services/sourceDocumentService.ts) and [`ragService.ts`](file:///c:/paper-distribution-system/backend/src/services/ragService.ts) includes `where: { institutionId }`. Cross-tenant lookups return `404 Not Found`.
3. **Role-Based Access Control**:
   - `ai:view`: Required to list or inspect source documents and chunks.
   - `ai:generate`: Required to upload documents, trigger re-processing, delete documents, and run grounded generation jobs.
4. **Untrusted Data Isolation**:
   Source excerpts are delimited and labeled as untrusted academic data to prevent prompt injection attacks embedded in user-supplied course documents.

---

## 8. Live Dashboard & Institutional Summary Metrics

The dashboard service at [`backend/src/services/dashboardService.ts`](file:///c:/paper-distribution-system/backend/src/services/dashboardService.ts) was extended to calculate real, institution-scoped source document statistics using indexed group-by queries:

```typescript
sourceDocuments: {
  total: number;
  indexed: number;
  processing: number;
  failed: number;
  totalChunks: number;
}
```

On the frontend, [`OverviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/OverviewPage.tsx) renders a live "Source Documents (RAG)" metric card displaying indexed document counts, processing badges, chunk totals, and a direct shortcut to the Knowledge Base.

---

## 9. Complete List of Files Modified or Created

| File | Change Type | Summary of Changes |
| :--- | :--- | :--- |
| [`backend/prisma/schema.prisma`](file:///c:/paper-distribution-system/backend/prisma/schema.prisma) | Modified | Added `SourceDocument`, `DocumentChunk`, `DocumentStatus` enum, and relations. |
| [`backend/src/middleware/upload.ts`](file:///c:/paper-distribution-system/backend/src/middleware/upload.ts) | Created | Multer upload configuration with 50MB limit, UUID filenames, and MIME validation. |
| [`backend/src/services/documentProcessingService.ts`](file:///c:/paper-distribution-system/backend/src/services/documentProcessingService.ts) | Created | Text extraction (PDF, DOCX, TXT), chunking, SentenceTransformers embedding, and indexing pipeline. |
| [`backend/src/services/sourceDocumentService.ts`](file:///c:/paper-distribution-system/backend/src/services/sourceDocumentService.ts) | Created | Document CRUD, re-processing trigger, chunk retrieval, and storage path sanitization. |
| [`backend/src/services/ragService.ts`](file:///c:/paper-distribution-system/backend/src/services/ragService.ts) | Created | Cosine similarity calculation, institution-scoped vector retrieval, and prompt context builder. |
| [`backend/src/services/questionGenerationService.ts`](file:///c:/paper-distribution-system/backend/src/services/questionGenerationService.ts) | Modified | RAG retrieval integration, grounding mode tracking, and source provenance storage on candidates. |
| [`backend/src/services/aiClient.ts`](file:///c:/paper-distribution-system/backend/src/services/aiClient.ts) | Modified | Added `aiClient.embed(...)` calling Python service at `/api/v1/ai/embed` with array normalization. |
| [`backend/src/routes/sourceDocuments.ts`](file:///c:/paper-distribution-system/backend/src/routes/sourceDocuments.ts) | Created | REST endpoints for source document upload, list, get, reprocess, delete, and chunks. |
| [`backend/src/routes/index.ts`](file:///c:/paper-distribution-system/backend/src/routes/index.ts) | Modified | Mounted `sourceDocumentRouter` under `/api/v1/source-documents`. |
| [`backend/src/services/dashboardService.ts`](file:///c:/paper-distribution-system/backend/src/services/dashboardService.ts) | Modified | Added `sourceDocuments` ({ total, indexed, processing, failed, totalChunks }) aggregation. |
| [`backend/src/__tests__/sourceDocuments.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/sourceDocuments.test.ts) | Created | 19 unit tests covering text extraction, chunking, retrieval, CRUD, tenant isolation, and RAG. |
| [`backend/src/__tests__/dashboard.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/dashboard.test.ts) | Modified | Updated mock assertions to verify `sourceDocuments` aggregation. |
| [`ai-service/app/api/routes/ai.py`](file:///c:/paper-distribution-system/ai-service/app/api/routes/ai.py) | Modified | Added `/api/v1/ai/embed` endpoint for local SentenceTransformers vector embedding. |
| [`ai-service/app/schemas/ai.py`](file:///c:/paper-distribution-system/ai-service/app/schemas/ai.py) | Modified | Added `EmbedRequest` and `EmbedResponse` schemas with flexible text/texts input. |
| [`frontend/src/types/sourceDocument.ts`](file:///c:/paper-distribution-system/frontend/src/types/sourceDocument.ts) | Created | TypeScript definitions for `SourceDocument`, `DocumentChunk`, `DocumentStatus`, and inputs. |
| [`frontend/src/types/academic.ts`](file:///c:/paper-distribution-system/frontend/src/types/academic.ts) | Modified | Added `useRag`, `sourceDocumentIds`, `sourceChunkIds`, and `metadata.sources` fields. |
| [`frontend/src/lib/api.ts`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts) | Modified | Added document API client functions and updated `DashboardSummary`. |
| [`frontend/src/pages/SourceDocumentsPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/SourceDocumentsPage.tsx) | Created | Document management UI: upload form, filter bar, chunk inspection modal, re-index, delete. |
| [`frontend/src/pages/QuestionGeneratorPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/QuestionGeneratorPage.tsx) | Modified | Added RAG Grounding toggle, indexed document selector, grounding badges, and source attribution. |
| [`frontend/src/pages/OverviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/OverviewPage.tsx) | Modified | Added Source Documents summary card with chunks count and quick links. |
| [`frontend/src/config/navigation.ts`](file:///c:/paper-distribution-system/frontend/src/config/navigation.ts) | Modified | Activated "Source Documents" item (`status: 'available'`, path: `'/source-documents'`). |
| [`frontend/src/router.tsx`](file:///c:/paper-distribution-system/frontend/src/router.tsx) | Modified | Added `/source-documents` route pointing to `SourceDocumentsPage`. |

---

## 10. Automated Verification & Test Results

### 10.1 Backend Test Suite (Vitest)
Sequential run command: `cd backend; npx vitest run --fileParallelism=false`

```text
Test Files  14 passed (14)
     Tests  200 passed (200)
  Duration  22.36s
```

- **Suite Breakdown**:
  - `src/__tests__/sourceDocuments.test.ts` — **19 passed (19)** (Cosine similarity, chunking, text extraction, retrieval ranking, thresholding, document CRUD, tenant isolation, RAG context builder).
  - `src/__tests__/dashboard.test.ts` — **4 passed (4)** (Includes live source documents aggregation verification).
  - `src/__tests__/authRbacAndIsolation.test.ts` — **17 passed (17)**.
  - `src/__tests__/step11IntegrationAndSecurity.test.ts` — **16 passed (16)**.
  - `src/__tests__/academic.test.ts` — **37 passed (37)**.
  - `src/__tests__/questionGeneration.test.ts` — **13 passed (13)**.
  - `src/__tests__/paperApproval.test.ts` — **16 passed (16)**.
  - `src/__tests__/paperBuilder.test.ts` — **15 passed (15)**.
  - `src/__tests__/paperVersionAndPreview.test.ts` — **14 passed (14)**.
  - `src/__tests__/pdfRenderer.test.ts` — **11 passed (11)**.
  - `src/__tests__/questionAnalysis.test.ts` — **13 passed (13)**.
  - `src/__tests__/aiClient.test.ts` — **10 passed (10)**.
  - `src/__tests__/errorHandler.test.ts` — **9 passed (9)**.
  - `src/__tests__/health.test.ts` — **6 passed (6)**.
- **Baseline Growth**: Increased from 181 passing tests in Step 6 to **200 passing tests** in Step 7 (+19 tests, 0 regressions).

### 10.2 Backend Typecheck & Build
```powershell
cd backend; npm run build
# tsc -p tsconfig.json -> Exit code 0 (0 errors)
```

### 10.3 Frontend Lint & Production Build
```powershell
cd frontend; npm run lint
# eslint . -> 0 errors (8 warnings in existing context hooks)

cd frontend; npm run build
# tsc -b && vite build -> Exit code 0
# Built in 1.42s (dist/assets/index-*.js 600 kB)
```

### 10.4 Live End-to-End Test Execution
Verified with live database and background microservices:
1. Examiner logged in via `POST /api/v1/auth/login`.
2. Academic document (`CN_Unit2_Flow_Control.txt`) uploaded to Subject `22CIE18 Social Engineering`.
3. Background processing transitioned status: `UPLOADED` $\rightarrow$ `PROCESSING` $\rightarrow$ `INDEXED`.
4. Retrieved indexed chunks via `GET /api/v1/source-documents/:id/chunks` (1 chunk, 384-dim embedding verified).
5. Tested vector cosine retrieval on live database: Query `"Flow control sliding window Stop-and-Wait ARQ"` retrieved the top matching chunk with similarity score `0.5641`.
6. Verified dashboard API reflected live counts: `{ total: 7, indexed: 5, processing: 0, failed: 2, totalChunks: 5 }`.

---

## 11. Technical Limitations & Future Considerations

1. **OCR for Scanned Documents**:
   The current document parser extracts textual layers from digital PDFs, DOCX, and TXT files. Scanned images or raster-only PDFs require an OCR pre-processor (such as Tesseract or Google Cloud Vision OCR) before ingestion.
2. **PostgreSQL pgvector Extension**:
   Vector embeddings are currently serialized as JSON arrays (`embeddingJson TEXT`) with in-memory cosine ranking in Node.js. For production scale (> 50,000 chunks), enabling the PostgreSQL `pgvector` extension and indexing with `HNSW` or `IVFFlat` will optimize query latency.
3. **External Gemini Rate Limits**:
   While local SentenceTransformers embedding operates 100% offline at zero cost, question generation relies on external Gemini API quotas. In production, caching common syllabus prompts or deploying a private LLM endpoint will eliminate external provider rate limits.

---

## 12. Review 2 Live Demonstration Instructions

For the project viva and Review 2 evaluation:

1. **Open the Application**:
   Navigate to `http://localhost:5173`.
2. **Log In as Faculty Examiner**:
   - Email: `examiner@cbit.ac.in`
   - Password: `CbitDemo@2026!`
3. **Upload Academic Material**:
   - In the sidebar, click **Source Documents**.
   - Select a subject (e.g., `22CIE18 Social Engineering` or `CS-301 Computer Networks`).
   - Choose a syllabus file (.pdf, .docx, or .txt) and click **Upload & Index Document**.
   - Observe the real-time status change to `INDEXED` and the generated chunk count.
   - Click **Chunks** to inspect the segmented text passages stored in PostgreSQL.
4. **Generate Grounded Examination Questions**:
   - In the sidebar, click **AI Generator**.
   - Select the target subject.
   - Toggle **Syllabus Grounding (RAG)** ON.
   - Check the uploaded source document.
   - Choose question type (e.g. *Multiple Choice* or *Short Answer*) and click **Generate Candidate Questions**.
   - Notice the batch header displaying `Syllabus-Grounded (RAG)`.
   - Inspect the candidate card to see the **Grounding Sources** provenance panel indicating the exact document title and relevance percentage.
5. **Review Institutional Dashboard**:
   - Navigate to **Overview**.
   - Verify the **Source Documents (RAG)** summary card showing live indexed document and chunk totals.

---

## 13. Recommended Next Step

With Step 7 complete and fully verified, the recommended next step is:

**Step 8 / Step 10 — Examination Blueprint Enforcement, Paper Generation & Blockchain Integrity Anchoring**:
- Transition to the exam configuration engine: enforce Bloom's taxonomy distributions and syllabus module coverage rules.
- Prepare the paper distribution pipeline for cryptographic signing and blockchain hash anchoring prior to final examination distribution.

