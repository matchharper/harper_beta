import {
  MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES,
  MAX_TALENT_DOCUMENT_FILE_SIZE_LABEL,
} from "@/lib/talentOnboarding/documentUploadLimits";

type AuthenticatedFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

type DocumentUploadPayload = {
  [key: string]: unknown;
  code?: unknown;
  document?: ({ id?: unknown } & Record<string, unknown>) | null;
  requestCompleted?: unknown;
  resumeDownloadUrl?: unknown;
  resumeFileName?: unknown;
  resumeStoragePath?: unknown;
  resumeText?: unknown;
};

export const TALENT_DOCUMENT_UPLOAD_ERROR_CODES = [
  "empty_file",
  "file_too_large",
  "invalid_file_content",
  "invalid_resume_request",
  "missing_file",
  "request_inactive",
  "unsupported_file_type",
] as const;

export type TalentDocumentUploadErrorCode =
  (typeof TALENT_DOCUMENT_UPLOAD_ERROR_CODES)[number];

const TALENT_DOCUMENT_UPLOAD_ERROR_CODE_SET = new Set<string>(
  TALENT_DOCUMENT_UPLOAD_ERROR_CODES
);

function parseTalentDocumentUploadErrorCode(
  value: unknown
): TalentDocumentUploadErrorCode | null {
  if (typeof value !== "string") return null;
  return TALENT_DOCUMENT_UPLOAD_ERROR_CODE_SET.has(value)
    ? (value as TalentDocumentUploadErrorCode)
    : null;
}

export class TalentDocumentUploadError extends Error {
  readonly code: TalentDocumentUploadErrorCode | null;

  constructor(message: string, code: TalentDocumentUploadErrorCode | null) {
    super(message);
    this.name = "TalentDocumentUploadError";
    this.code = code;
  }
}

function payloadError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return fallback;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The upload was aborted", "AbortError");
  }
}

export async function uploadTalentDocument(args: {
  fetchWithAuth: AuthenticatedFetch;
  file: File;
  kind?: "document" | "resume";
  resumeRequestToken?: string | null;
  signal?: AbortSignal;
  source?: "chat" | "profile";
}): Promise<DocumentUploadPayload> {
  if (args.file.size <= 0) {
    throw new TalentDocumentUploadError(
      "The selected file is empty.",
      "empty_file"
    );
  }
  if (args.file.size > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) {
    throw new TalentDocumentUploadError(
      `File size must not exceed ${MAX_TALENT_DOCUMENT_FILE_SIZE_LABEL}`,
      "file_too_large"
    );
  }
  throwIfAborted(args.signal);

  const metadata = {
    fileName: args.file.name,
    kind: args.kind ?? "resume",
    source: args.source ?? "profile",
    resumeRequestToken: args.resumeRequestToken,
    size: args.file.size,
  };
  async function request(action: "prepare" | "complete", uploadId?: string) {
    const response = await args.fetchWithAuth("/api/talent/documents/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...metadata, action, uploadId }),
      signal: args.signal,
    });
    const payload: DocumentUploadPayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new TalentDocumentUploadError(payloadError(payload, "Failed to upload document"),
        parseTalentDocumentUploadErrorCode(payload.code));
    }
    return payload;
  }
  const target = await request("prepare");
  if (typeof target.uploadUrl !== "string" || typeof target.uploadId !== "string" ||
      typeof target.contentType !== "string") throw new Error("Invalid document upload target");
  const stored = await fetch(target.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": target.contentType },
    body: args.file,
    signal: args.signal,
  });
  if (!stored.ok) throw new Error("Failed to upload file to storage");
  return request("complete", target.uploadId);
}
