import type { SourceStatus } from "@/src/domain/contracts";

export interface GoogleFileReference {
  readonly fileId: string;
  readonly tabOrRange: string | null;
}

export interface GoogleFileReadResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly modifiedAt: string | null;
  readonly sourceStatus: SourceStatus;
}

export interface GoogleFilesPort {
  readFile(reference: GoogleFileReference): Promise<GoogleFileReadResult>;
}
