export type DocumentStatus = "UPLOADED" | "PROCESSING" | "INDEXED" | "FAILED";

export interface SourceDocument {
  id: string;
  institutionId: string;
  subjectId: string | null;
  uploadedById: string | null;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string;
  status: DocumentStatus;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subject?: {
    id: string;
    code: string;
    name: string;
  } | null;
  uploadedBy?: {
    id: string;
    displayName: string;
    email: string;
  } | null;
}

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  chunkText: string;
  pageNumber: number | null;
  tokenCount: number | null;
  createdAt: string;
}

export interface CreateSourceDocumentInput {
  file: File;
  title?: string;
  subjectId?: string;
}

export interface ListSourceDocumentsParams {
  subjectId?: string;
  status?: DocumentStatus;
}
