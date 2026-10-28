import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock env
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

const { mockPrisma, mockAiEmbed, mockAiGenerate } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    subject: {
      findFirst: vi.fn(),
    },
    topic: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    sourceDocument: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    documentChunk: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    questionGenerationJob: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    generatedQuestion: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  mockAiEmbed: vi.fn(),
  mockAiGenerate: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  db: mockPrisma,
  closePrisma: vi.fn(),
}));

vi.mock("../services/aiClient.js", () => ({
  aiClient: {
    embed: (...args: unknown[]) => mockAiEmbed(...args),
    generateQuestions: (...args: unknown[]) => mockAiGenerate(...args),
  },
  AIClient: vi.fn(),
  AIClientError: class AIClientError extends Error {
    public readonly statusCode: number;
    constructor(message: string, public code = "AI_ERROR", public status = 502) {
      super(message);
      this.statusCode = status;
    }
  },
}));

import { createApp } from "../app.js";
import {
  cosineSimilarity,
  retrieveRelevantChunks,
  buildRagContext,
} from "../services/ragService.js";
import {
  chunkDocumentPages,
  extractText,
} from "../services/documentProcessingService.js";
import {
  createSourceDocument,
  listSourceDocuments,
  getSourceDocument,
  deleteSourceDocument,
  reprocessSourceDocument,
  getDocumentChunks,
} from "../services/sourceDocumentService.js";
import { createAndRunGenerationJob } from "../services/questionGenerationService.js";

const app = createApp();

const INSTITUTION_A = "a0000000-0000-4000-8000-000000000001";
const INSTITUTION_B = "b0000000-0000-4000-8000-000000000001";
const USER_ID = "u0000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "s0000000-0000-4000-8000-000000000001";
const DOC_A_ID = "d0000000-0000-4000-8000-000000000001";
const DOC_B_ID = "d0000000-0000-4000-8000-000000000002";

const AUTH_HEADERS = {
  "x-institution-id": INSTITUTION_A,
  "x-user-id": USER_ID,
  "x-user-role": "EXAMINER",
};

describe("Step 7 — Source Documents & RAG Grounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Math & Similarity Algorithms
  // -------------------------------------------------------------------------
  describe("cosineSimilarity algorithm", () => {
    it("returns 1 for identical unit vectors", () => {
      const v = [0.6, 0.8];
      const score = cosineSimilarity(v, v);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it("returns 0 for orthogonal vectors", () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const score = cosineSimilarity(a, b);
      expect(score).toBeCloseTo(0.0, 5);
    });

    it("returns 0 for mismatched length or empty vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Chunking & Text Extraction
  // -------------------------------------------------------------------------
  describe("chunkDocumentPages", () => {
    it("preserves single page text when within chunk size", () => {
      const pages = [{ pageNumber: 1, text: "A".repeat(500) }];
      const chunks = chunkDocumentPages(pages, 2000, 250, 100);
      expect(chunks.length).toBe(1);
      expect(chunks[0]!.chunkIndex).toBe(0);
      expect(chunks[0]!.pageNumber).toBe(1);
      expect(chunks[0]!.chunkText.length).toBe(500);
    });

    it("splits large text into multiple chunks with overlap", () => {
      const paragraph = "Sentence one about secure exam paper systems. ".repeat(60);
      const pages = [{ pageNumber: 1, text: paragraph }];
      const chunks = chunkDocumentPages(pages, 1000, 200, 100);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]!.chunkIndex).toBe(0);
      expect(chunks[1]!.chunkIndex).toBe(1);
    });

    it("discards chunks smaller than minChunkLength", () => {
      const pages = [{ pageNumber: 1, text: "Too short" }];
      const chunks = chunkDocumentPages(pages, 2000, 250, 100);
      expect(chunks.length).toBe(0);
    });
  });

  describe("extractText", () => {
    it("extracts text from plain text files", async () => {
      const tempPath = path.join(os.tmpdir(), `test-${Date.now()}.txt`);
      fs.writeFileSync(tempPath, "Sample syllabus contents for Computer Networks.", "utf-8");
      try {
        const result = await extractText(tempPath, "text/plain");
        expect(result.totalPages).toBe(1);
        expect(result.pages[0]!.text).toContain("Sample syllabus contents");
      } finally {
        fs.unlinkSync(tempPath);
      }
    });

    it("rejects unsupported MIME types", async () => {
      await expect(extractText("dummy.exe", "application/x-msdownload")).rejects.toThrow(
        "Unsupported document format",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. RAG Retrieval & Context Building
  // -------------------------------------------------------------------------
  describe("retrieveRelevantChunks & buildRagContext", () => {
    it("retrieves chunks and sorts by cosine similarity descending", async () => {
      mockAiEmbed.mockResolvedValueOnce([[1, 0, 0]]); // query embedding

      mockPrisma.documentChunk.findMany.mockResolvedValueOnce([
        {
          id: "chunk-1",
          documentId: DOC_A_ID,
          chunkIndex: 0,
          chunkText: "High relevance content on sliding window protocol.",
          pageNumber: 2,
          embeddingJson: JSON.stringify([0.9, 0.1, 0]),
          document: { id: DOC_A_ID, title: "Computer Networks Syllabus", originalFilename: "cn.pdf" },
        },
        {
          id: "chunk-2",
          documentId: DOC_A_ID,
          chunkIndex: 1,
          chunkText: "Low relevance content on unrelated topic.",
          pageNumber: 3,
          embeddingJson: JSON.stringify([0.1, 0.9, 0]),
          document: { id: DOC_A_ID, title: "Computer Networks Syllabus", originalFilename: "cn.pdf" },
        },
      ]);

      const results = await retrieveRelevantChunks(INSTITUTION_A, "sliding window", {
        threshold: 0.3,
        topK: 5,
      });

      expect(results.length).toBe(1);
      expect(results[0]!.chunkId).toBe("chunk-1");
      expect(results[0]!.similarityScore).toBeGreaterThan(0.8);
    });

    it("enforces tenant isolation by passing institutionId to DB query", async () => {
      mockAiEmbed.mockResolvedValueOnce([[0.5, 0.5]]);
      mockPrisma.documentChunk.findMany.mockResolvedValueOnce([]);

      await retrieveRelevantChunks(INSTITUTION_A, "test query");

      expect(mockPrisma.documentChunk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            institutionId: INSTITUTION_A,
          }),
        }),
      );
    });

    it("builds formatted prompt context and structured source metadata", () => {
      const chunks = [
        {
          chunkId: "c1",
          documentId: DOC_A_ID,
          documentTitle: "Network Security Guide",
          originalFileName: "nsg.pdf",
          pageNumber: 4,
          chunkIndex: 0,
          chunkText: "Public key cryptography principles.",
          similarityScore: 0.88,
        },
      ];

      const rag = buildRagContext(chunks);
      expect(rag.context).toContain("[Source 1: Network Security Guide | Page 4 | Relevance: 88.0%]");
      expect(rag.context).toContain("Public key cryptography principles.");
      expect(rag.sources.length).toBe(1);
      expect(rag.sources[0]!.chunkId).toBe("c1");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Source Document Service (Tenant Scoping, File Sanitation)
  // -------------------------------------------------------------------------
  describe("SourceDocumentService", () => {
    it("createSourceDocument calculates SHA-256 and omits storagePath from return", async () => {
      const tempPath = path.join(os.tmpdir(), `test-doc-${Date.now()}.txt`);
      fs.writeFileSync(tempPath, "Content to be hashed.", "utf-8");

      const mockCreated = {
        id: DOC_A_ID,
        institutionId: INSTITUTION_A,
        uploadedById: USER_ID,
        subjectId: null,
        title: "Test Doc",
        originalFilename: "test.txt",
        mimeType: "text/plain",
        fileSizeBytes: 21,
        contentHash: "hash123",
        storagePath: tempPath,
        status: "UPLOADED",
        errorMessage: null,
        pageCount: null,
        chunkCount: 0,
        processingStartedAt: null,
        processingCompletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        subject: null,
        uploadedBy: { id: USER_ID, displayName: "Faculty User", email: "faculty@cbit.ac.in" },
      };

      mockPrisma.sourceDocument.create.mockResolvedValueOnce(mockCreated);
      mockPrisma.sourceDocument.findUnique.mockResolvedValueOnce(mockCreated);
      mockAiEmbed.mockResolvedValueOnce([[0.1, 0.2]]);

      const file = {
        originalname: "test.txt",
        mimetype: "text/plain",
        size: 21,
        path: tempPath,
      } as Express.Multer.File;

      const result = await createSourceDocument(INSTITUTION_A, USER_ID, { title: "Test Doc" }, file);

      expect(result.id).toBe(DOC_A_ID);
      expect((result as unknown as Record<string, unknown>).storagePath).toBeUndefined();
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });

    it("rejects cross-tenant document access with 404", async () => {
      mockPrisma.sourceDocument.findUnique.mockResolvedValueOnce({
        id: DOC_B_ID,
        institutionId: INSTITUTION_B, // Belongs to B
        title: "Institution B Secret Doc",
      });

      await expect(getSourceDocument(INSTITUTION_A, DOC_B_ID)).rejects.toThrow(
        "Source document not found",
      );
    });

    it("deleteSourceDocument unlinks disk file and deletes DB record", async () => {
      const tempPath = path.join(os.tmpdir(), `test-del-${Date.now()}.txt`);
      fs.writeFileSync(tempPath, "To delete", "utf-8");

      mockPrisma.sourceDocument.findUnique.mockResolvedValueOnce({
        id: DOC_A_ID,
        institutionId: INSTITUTION_A,
        storagePath: tempPath,
      });
      mockPrisma.sourceDocument.delete.mockResolvedValueOnce({ id: DOC_A_ID });

      const res = await deleteSourceDocument(INSTITUTION_A, DOC_A_ID);
      expect(res.success).toBe(true);
      expect(fs.existsSync(tempPath)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. HTTP Endpoints via Supertest
  // -------------------------------------------------------------------------
  describe("HTTP Routes /api/v1/source-documents", () => {
    it("GET /api/v1/source-documents lists documents for tenant", async () => {
      mockPrisma.sourceDocument.findMany.mockResolvedValueOnce([
        {
          id: DOC_A_ID,
          institutionId: INSTITUTION_A,
          title: "Syllabus 2026",
          originalFilename: "syllabus.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1024,
          contentHash: "hash",
          status: "INDEXED",
          chunkCount: 12,
          createdAt: new Date(),
          updatedAt: new Date(),
          storagePath: "/secret/path/syllabus.pdf",
        },
      ]);

      const res = await request(app)
        .get("/api/v1/source-documents")
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].title).toBe("Syllabus 2026");
      expect(res.body[0].storagePath).toBeUndefined();
    });

    it("POST /api/v1/source-documents rejects missing file with 400", async () => {
      const res = await request(app)
        .post("/api/v1/source-documents")
        .set(AUTH_HEADERS)
        .field("title", "Missing File Doc");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No file uploaded");
    });

    it("POST /api/v1/source-documents rejects unsupported mime/ext with 400", async () => {
      const res = await request(app)
        .post("/api/v1/source-documents")
        .set(AUTH_HEADERS)
        .attach("file", Buffer.from("malicious executable"), "malicious.exe");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Unsupported file type");
    });

    it("GET /api/v1/source-documents/:id/chunks returns chunk breakdown", async () => {
      mockPrisma.sourceDocument.findUnique.mockResolvedValueOnce({
        id: DOC_A_ID,
        institutionId: INSTITUTION_A,
      });

      mockPrisma.documentChunk.findMany.mockResolvedValueOnce([
        {
          id: "chunk-101",
          chunkIndex: 0,
          chunkText: "Section 1: Distributed Ledger Protocols",
          pageNumber: 1,
          tokenCount: 45,
          createdAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get(`/api/v1/source-documents/${DOC_A_ID}/chunks`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].chunkText).toContain("Distributed Ledger Protocols");
    });
  });

  // -------------------------------------------------------------------------
  // 6. RAG Integration in Question Generation
  // -------------------------------------------------------------------------
  describe("RAG Grounded Question Generation Service Integration", () => {
    it("executes RAG retrieval and attaches grounding context and sources to candidates", async () => {
      mockPrisma.subject.findFirst.mockResolvedValueOnce({
        id: SUBJECT_ID,
        institutionId: INSTITUTION_A,
        name: "Cloud Computing",
        code: "CS502",
        status: "ACTIVE",
      });

      // Embed query
      mockAiEmbed.mockResolvedValueOnce([[0.8, 0.6]]);

      // Find relevant chunks
      mockPrisma.documentChunk.findMany.mockResolvedValueOnce([
        {
          id: "c-ground-1",
          documentId: DOC_A_ID,
          chunkIndex: 0,
          chunkText: "Serverless architectures utilize ephemeral compute containers.",
          pageNumber: 5,
          embeddingJson: JSON.stringify([0.8, 0.6]),
          document: { id: DOC_A_ID, title: "Cloud Textbook", originalFilename: "cloud.pdf" },
        },
      ]);

      // Job creation & update
      mockPrisma.questionGenerationJob.create.mockResolvedValueOnce({
        id: "job-rag-1",
        institutionId: INSTITUTION_A,
        subjectId: SUBJECT_ID,
        topicId: null,
        requestedBy: USER_ID,
        questionType: "MULTIPLE_CHOICE",
        difficulty: "MEDIUM",
        count: 1,
        language: "en",
        contextHint: "Serverless",
        sourceDocumentIds: [DOC_A_ID],
        groundingMode: "document",
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
        subject: { id: SUBJECT_ID, name: "Cloud Computing", code: "CS502" },
        _count: { generatedQuestions: 0 },
      });

      mockPrisma.questionGenerationJob.update.mockResolvedValue({
        id: "job-rag-1",
        institutionId: INSTITUTION_A,
        subjectId: SUBJECT_ID,
        topicId: null,
        requestedBy: USER_ID,
        questionType: "MULTIPLE_CHOICE",
        difficulty: "MEDIUM",
        count: 1,
        language: "en",
        contextHint: "Serverless",
        sourceDocumentIds: [DOC_A_ID],
        groundingMode: "document",
        status: "COMPLETED",
        aiProvider: "gemini",
        aiModel: "gemini-3.8-flash",
        durationMs: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
        subject: { id: SUBJECT_ID, name: "Cloud Computing", code: "CS502" },
        _count: { generatedQuestions: 1 },
      });

      mockAiGenerate.mockResolvedValueOnce({
        contractVersion: "v1",
        requestId: "req-1",
        operation: "generate_questions",
        provider: { name: "gemini", model: "gemini-3.8-flash" },
        durationMs: 300,
        result: {
          questions: [
            {
              questionText: "What is an ephemeral compute container in serverless computing?",
              suggestedAnswer: "A temporary container spun up on demand.",
              explanation: "Grounded directly in Section 5 of Cloud Textbook.",
              difficulty: "MEDIUM",
              bloomsLevel: "Understand",
              subjectTags: ["Cloud", "Serverless"],
            },
          ],
          totalRequested: 1,
          totalGenerated: 1,
        },
      });

      mockPrisma.generatedQuestion.createMany.mockResolvedValueOnce({ count: 1 });

      const job = await createAndRunGenerationJob(
        INSTITUTION_A,
        {
          subjectId: SUBJECT_ID,
          questionType: "MULTIPLE_CHOICE",
          difficulty: "MEDIUM",
          count: 1,
          language: "en",
          contextHint: "Serverless",
          useRag: true,
          sourceDocumentIds: [DOC_A_ID],
        },
        "req-1",
        USER_ID,
      );

      expect(job.status).toBe("COMPLETED");

      // Verify aiClient.generateQuestions received groundingMode and source context
      expect(mockAiGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          groundingMode: "document",
          sourceContext: expect.stringContaining("Serverless architectures utilize ephemeral compute containers"),
        }),
        expect.anything(),
      );

      // Verify generated questions were persisted with sourceChunkIds and metadata
      expect(mockPrisma.generatedQuestion.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            sourceChunkIds: ["c-ground-1"],
            metadata: expect.objectContaining({
              groundingMode: "document",
              sources: expect.arrayContaining([
                expect.objectContaining({ chunkId: "c-ground-1" }),
              ]),
            }),
          }),
        ]),
      });
    });
  });
});
