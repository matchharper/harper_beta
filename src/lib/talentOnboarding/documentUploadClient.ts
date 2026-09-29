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

  const formData = new FormData();
  formData.append("file", args.file);
  formData.append("kind", args.kind ?? "resume");
  formData.append("source", args.source ?? "profile");
  if (args.resumeRequestToken) {
    formData.append("resumeRequestToken", args.resumeRequestToken);
  }

  const response = await args.fetchWithAuth("/api/talent/documents/upload", {
    method: "POST",
    body: formData,
    signal: args.signal,
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as DocumentUploadPayload;
  if (!response.ok) {
    throw new TalentDocumentUploadError(
      payloadError(payload, "Failed to upload document"),
      parseTalentDocumentUploadErrorCode(payload.code)
    );
  }
  return payload;
}
