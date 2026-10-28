declare module "pdf-parse" {
  export interface PDFParsePage {
    text: string;
    num: number;
  }

  export interface PDFParseTextResult {
    total: number;
    pages: PDFParsePage[];
    text: string;
  }

  export class PDFParse {
    constructor(options: { data: Buffer | Uint8Array; verbosity?: number });
    load(): Promise<unknown>;
    getText(options?: unknown): Promise<PDFParseTextResult>;
    destroy(): Promise<void>;
  }

  export default function pdfParse(dataBuffer: Buffer, options?: unknown): Promise<{
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  }>;
}
