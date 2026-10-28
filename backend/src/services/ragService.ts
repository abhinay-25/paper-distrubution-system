import { db } from "../lib/prisma.js";
import { aiClient } from "./aiClient.js";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  originalFileName: string;
  pageNumber: number | null;
  chunkIndex: number;
  chunkText: string;
  similarityScore: number;
}

export interface RagContextResult {
  context: string;
  excerpts: string[];
  sources: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string;
    pageNumber: number | null;
    similarityScore: number;
  }>;
}

export interface RetrieveOptions {
  topK?: number;
  threshold?: number;
  subjectId?: string;
  sourceDocumentIds?: string[];
}

/**
 * Computes cosine similarity between two float vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retrieves the most relevant document chunks for a query within a tenant's documents.
 * Strict institution isolation is enforced.
 */
export async function retrieveRelevantChunks(
  institutionId: string,
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const topK = Math.min(Math.max(options.topK ?? 5, 1), 20);
  const threshold = options.threshold ?? 0.3;

  // 1. Embed query text
  const [queryEmbedding] = await aiClient.embed(query);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return [];
  }

  // 2. Fetch indexed chunks scoped strictly to institutionId and optional filters
  const chunks = await db.documentChunk.findMany({
    where: {
      institutionId,
      document: {
        institutionId,
        status: "INDEXED",
        ...(options.subjectId ? { subjectId: options.subjectId } : {}),
        ...(options.sourceDocumentIds && options.sourceDocumentIds.length > 0
          ? { id: { in: options.sourceDocumentIds } }
          : {}),
      },
    },
    select: {
      id: true,
      documentId: true,
      chunkIndex: true,
      chunkText: true,
      pageNumber: true,
      embeddingJson: true,
      document: {
        select: {
          id: true,
          title: true,
          originalFilename: true,
        },
      },
    },
  });

  if (chunks.length === 0) {
    return [];
  }

  // 3. Score chunks
  const scoredChunks: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    let embedding: number[] = [];
    try {
      embedding = JSON.parse(chunk.embeddingJson) as number[];
    } catch {
      continue;
    }

    const similarityScore = cosineSimilarity(queryEmbedding, embedding);
    if (similarityScore >= threshold) {
      scoredChunks.push({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        originalFileName: chunk.document.originalFilename,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        chunkText: chunk.chunkText,
        similarityScore: Math.round(similarityScore * 10000) / 10000,
      });
    }
  }

  // 4. Sort descending by score and pick top K
  scoredChunks.sort((a, b) => b.similarityScore - a.similarityScore);
  return scoredChunks.slice(0, topK);
}

/**
 * Formats retrieved chunks into prompt-ready context and structured source citations.
 */
export function buildRagContext(chunks: RetrievedChunk[]): RagContextResult {
  if (chunks.length === 0) {
    return {
      context: "",
      excerpts: [],
      sources: [],
    };
  }

  const excerpts: string[] = [];
  const sources = chunks.map((c) => ({
    chunkId: c.chunkId,
    documentId: c.documentId,
    documentTitle: c.documentTitle,
    pageNumber: c.pageNumber,
    similarityScore: c.similarityScore,
  }));

  const contextBlocks = chunks.map((c, idx) => {
    const pageLabel = c.pageNumber ? `Page ${c.pageNumber}` : "General";
    const header = `[Source ${idx + 1}: ${c.documentTitle} | ${pageLabel} | Relevance: ${(c.similarityScore * 100).toFixed(1)}%]`;
    excerpts.push(c.chunkText);
    return `${header}\n${c.chunkText}`;
  });

  const context = contextBlocks.join("\n\n---\n\n");

  return {
    context,
    excerpts,
    sources,
  };
}
