import fs from "node:fs";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { db } from "../lib/prisma.js";
import { aiClient } from "./aiClient.js";
import { AppError } from "../middleware/errorHandler.js";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedDocument {
  pages: ExtractedPage[];
  totalPages: number;
}

export interface TextChunk {
  chunkIndex: number;
  chunkText: string;
  pageNumber: number | null;
  tokenCount: number;
}

/**
 * Extract raw text and page information from supported document types.
 */
export async function extractText(filePath: string, mimeType: string): Promise<ExtractedDocument> {
  if (mimeType === "application/pdf") {
    const buffer = await fs.promises.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      const pages: ExtractedPage[] = (parsed.pages || []).map((p, idx) => ({
        pageNumber: p.num ?? idx + 1,
        text: p.text || "",
      }));
      return {
        pages,
        totalPages: parsed.total || pages.length,
      };
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value || "";
    return {
      pages: [{ pageNumber: 1, text }],
      totalPages: 1,
    };
  }

  if (mimeType === "text/plain") {
    const text = await fs.promises.readFile(filePath, "utf-8");
    return {
      pages: [{ pageNumber: 1, text }],
      totalPages: 1,
    };
  }

  throw new AppError(`Unsupported document format: ${mimeType}`, 400);
}

/**
 * Split document pages into chunks with configurable overlap and minimum size.
 */
export function chunkDocumentPages(
  pages: ExtractedPage[],
  chunkSize = 2000,
  chunkOverlap = 250,
  minChunkLength = 100,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const cleanText = (page.text || "").replace(/\r\n/g, "\n").trim();
    if (!cleanText) continue;

    if (cleanText.length <= chunkSize) {
      if (cleanText.length >= minChunkLength) {
        chunks.push({
          chunkIndex: chunkIndex++,
          chunkText: cleanText,
          pageNumber: page.pageNumber,
          tokenCount: Math.ceil(cleanText.length / 4),
        });
      }
      continue;
    }

    let start = 0;
    while (start < cleanText.length) {
      const end = start + chunkSize;
      if (end >= cleanText.length) {
        const remaining = cleanText.substring(start).trim();
        if (remaining.length >= minChunkLength) {
          chunks.push({
            chunkIndex: chunkIndex++,
            chunkText: remaining,
            pageNumber: page.pageNumber,
            tokenCount: Math.ceil(remaining.length / 4),
          });
        } else {
          const lastChunk = chunks[chunks.length - 1];
          if (lastChunk && lastChunk.pageNumber === page.pageNumber) {
            lastChunk.chunkText += "\n" + remaining;
            lastChunk.tokenCount = Math.ceil(lastChunk.chunkText.length / 4);
          }
        }
        break;
      }

      let splitAt = cleanText.lastIndexOf("\n\n", end);
      if (splitAt <= start + minChunkLength) {
        splitAt = cleanText.lastIndexOf("\n", end);
      }
      if (splitAt <= start + minChunkLength) {
        splitAt = cleanText.lastIndexOf(" ", end);
      }
      if (splitAt <= start + minChunkLength) {
        splitAt = end;
      }

      const piece = cleanText.substring(start, splitAt).trim();
      if (piece.length >= minChunkLength) {
        chunks.push({
          chunkIndex: chunkIndex++,
          chunkText: piece,
          pageNumber: page.pageNumber,
          tokenCount: Math.ceil(piece.length / 4),
        });
      }

      start = Math.max(start + 1, splitAt - chunkOverlap);
    }
  }

  return chunks;
}

/**
 * Orchestrates parsing, chunking, embedding generation, and DB storage for a source document.
 */
export async function processDocument(documentId: string): Promise<void> {
  const doc = await db.sourceDocument.findUnique({
    where: { id: documentId },
  });

  if (!doc) {
    return;
  }

  await db.sourceDocument.update({
    where: { id: documentId },
    data: {
      status: "PROCESSING",
      processingStartedAt: new Date(),
      errorMessage: null,
    },
  });

  try {
    // Delete any previous chunks if reprocessing
    await db.documentChunk.deleteMany({
      where: { documentId: documentId },
    });

    const { pages, totalPages } = await extractText(doc.storagePath, doc.mimeType);
    const chunks = chunkDocumentPages(pages);

    if (chunks.length === 0) {
      throw new Error("Document contains no extractable text or is shorter than minimum chunk size.");
    }

    const BATCH_SIZE = 32;
    const embeddings: number[][] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await aiClient.embed(batch.map((c) => c.chunkText));
      embeddings.push(...batchEmbeddings);
    }

    const chunksData = chunks.map((c, idx) => ({
      institutionId: doc.institutionId,
      documentId: doc.id,
      chunkIndex: c.chunkIndex,
      chunkText: c.chunkText,
      pageNumber: c.pageNumber,
      tokenCount: c.tokenCount,
      embeddingJson: JSON.stringify(embeddings[idx] || []),
    }));

    await db.documentChunk.createMany({
      data: chunksData,
    });

    await db.sourceDocument.update({
      where: { id: documentId },
      data: {
        status: "INDEXED",
        pageCount: totalPages,
        chunkCount: chunksData.length,
        processingCompletedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await db.sourceDocument.update({
      where: { id: documentId },
      data: {
        status: "FAILED",
        errorMessage: message,
        processingCompletedAt: new Date(),
      },
    });
  }
}
